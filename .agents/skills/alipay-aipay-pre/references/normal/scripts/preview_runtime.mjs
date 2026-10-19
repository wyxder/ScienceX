import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { renderMessage } from './render_customer_message.mjs';
import { runtimePlatform } from './platform_compat.mjs';
import { setConversationConsent } from './telemetry.mjs';

const pagePath = fileURLToPath(new URL('../../onboarding/assets/keygen.html', import.meta.url));
const internalPrefix = 'ALIPAY_AIPAY_INTERNAL:';
const inheritedEnvironmentKeys = Object.freeze([
  'HOME',
  'USERPROFILE',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'DBUS_SESSION_BUS_ADDRESS',
  'XDG_CURRENT_DESKTOP',
  'XDG_SESSION_TYPE',
  'XDG_RUNTIME_DIR'
]);

function deliver(messageId, variant = 'DEFAULT') {
  const body = renderMessage(messageId, variant, {});
  if (!body.trim()) throw new Error('预发版消息正文为空');
  process.stdout.write(`${body}\n`);
  process.stderr.write(`${internalPrefix}CUSTOMER_MESSAGE_DELIVERY_REQUIRED=${messageId}\n`);
}

function safeEnvironmentValue(value) {
  return typeof value === 'string' && !value.includes('\0') ? value : undefined;
}

function openerEnvironment(platform, source) {
  const env = {};
  for (const key of inheritedEnvironmentKeys) {
    const value = safeEnvironmentValue(source[key]);
    if (value !== undefined) env[key] = value;
  }
  if (platform === 'darwin') env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
  if (platform === 'linux') env.PATH = '/usr/bin:/bin';
  return env;
}

function windowsPowerShell(source) {
  const candidate = safeEnvironmentValue(source.SystemRoot) || safeEnvironmentValue(source.WINDIR) || 'C:\\Windows';
  const root = path.win32.normalize(candidate).replace(/[\\/]+$/u, '');
  if (!/^[A-Za-z]:\\Windows$/iu.test(root)) return null;
  return {
    command: path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    root
  };
}

// This helper opens only the bundled, static page. It never generates or reads keys.
export function openLocalKeygen({ platform = runtimePlatform(), env = process.env, spawn = spawnSync } = {}) {
  try {
    if (!fs.lstatSync(pagePath).isFile() || fs.realpathSync(pagePath) !== path.resolve(pagePath)) return 'OPEN_FAILED';
    if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) return 'GUI_UNAVAILABLE';
    const url = pathToFileURL(pagePath).href;
    let command;
    let args;
    if (platform === 'darwin') {
      command = '/usr/bin/open';
      args = [url];
    } else if (platform === 'linux') {
      command = '/usr/bin/xdg-open';
      args = [url];
    } else if (platform === 'win32') {
      const powershell = windowsPowerShell(env);
      if (!powershell) return 'OPEN_FAILED';
      command = powershell.command;
      // Pass the URL as data through the child's environment, never as shell code.
      args = ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Start-Process -FilePath $env:ALIPAY_AIPAY_PRE_KEYGEN_URL"];
      const childEnv = openerEnvironment(platform, env);
      childEnv.SystemRoot = powershell.root;
      childEnv.WINDIR = powershell.root;
      childEnv.PATH = `${powershell.root}\\System32;${powershell.root}\\System32\\WindowsPowerShell\\v1.0`;
      childEnv.ALIPAY_AIPAY_PRE_KEYGEN_URL = url;
      const result = spawn(command, args, {
        env: childEnv,
        shell: false,
        stdio: 'ignore',
        timeout: 10000,
        windowsHide: true
      });
      return result.status === 0 && !result.error ? 'OPEN_REQUESTED' : 'OPEN_FAILED';
    } else {
      return 'GUI_UNAVAILABLE';
    }
    const childEnv = openerEnvironment(platform, env);
    childEnv.ALIPAY_AIPAY_PRE_KEYGEN_URL = url;
    const result = spawn(command, args, {
      env: childEnv,
      shell: false,
      stdio: 'ignore',
      timeout: 10000,
      windowsHide: true
    });
    return result.status === 0 && !result.error ? 'OPEN_REQUESTED' : 'OPEN_FAILED';
  } catch {
    return 'OPEN_FAILED';
  }
}

// Match complete declarations, never an affirmative substring inside a denial,
// question, condition, quotation, or a description of somebody else's choice.
export function parsePreviewConsent(value) {
  if (typeof value !== 'string') return null;
  let text = value.normalize('NFKC').trim();
  text = text.replace(/^【([^【】]+)】([。.!！;；]*)$/u, '$1$2');
  if (!text || /[?？]|吗|么|嘛|是否|能否|可否|如果|假如|除非|前提|只要|也许|可能|不确定|考虑|再说|行吧|随便|或者|还是|先.*再/u.test(text)) return null;
  const clauses = text.split(/[,，。.!！;；\n]|但是|不过|但/u).map(part => part.replace(/\s+/gu, '')).filter(Boolean);
  const subject = '(?:我(?:们)?(?:明确)?|本人)?';
  const actor = '(?:你们|你|支付宝|本Skill|Skill)?';
  const action = '(?:采集|收集|记录)(?:(?:并|和|及)(?:上报|上传|使用))?';
  const object = '(?:(?:我的|我们的|本次|当前)?(?:会话|对话|聊天)(?:信息|内容|记录|数据)?)?';
  const allow = new RegExp(`^${subject}(?:确认|同意|允许|授权|接受|可以)${actor}${action}${object}$`, 'u');
  const deny = new RegExp(`^${subject}(?:不同意|不允许|不授权|不接受|不希望|不想|不愿意|不需要|不要|不用|无需|拒绝|禁止|停止|别|不)${actor}${action}${object}$`, 'u');
  let grant = false;
  let refusal = false;
  let confirm = false;
  for (const clause of clauses) {
    const part = clause.replace(/^请/u, '');
    if (deny.test(part) || /^(?:我)?(?:仅|只)(?:使用|用)(?:内测版Skill|内测版|服务)$/u.test(part)) refusal = true;
    else if (allow.test(part)) grant = true;
    // Short replies refer only to the delivered preview notice, never business approval.
    else if (/^(?:我)?(?:确认|同意)$/u.test(part)) confirm = true;
    else if (/^(?:我)?(?:希望)?继续使用(?:内测版Skill|内测版|服务)$/u.test(part)) continue;
    else return null;
  }
  if (grant && refusal) return null;
  if (refusal) return 'DENIED';
  return grant || confirm ? 'GRANTED' : null;
}

export function runPreviewCli(argv = process.argv) {
  const action = argv[2];
  if (action === 'consent') {
    const args = new Map();
    for (let i = 3; i < argv.length; i += 2) {
      if (!['--reply', '--input-id'].includes(argv[i]) || args.has(argv[i]) || typeof argv[i + 1] !== 'string') {
        throw new Error('preview consent 只接受 --reply 与 --input-id');
      }
      args.set(argv[i], argv[i + 1]);
    }
    if (!args.get('--input-id')) throw new Error('preview consent 缺少 --input-id');
    // A generic business confirmation (1/OK/继续) is not consent to collection.
    const decision = parsePreviewConsent(args.get('--reply'));
    if (!decision) {
      process.stderr.write(`${internalPrefix}PREVIEW_DECISION=UNCONFIRMED\n`);
      deliver('preview.consent.clarify');
      return;
    }
    const saved = setConversationConsent({ decision, inputId: args.get('--input-id') });
    // Respect the current persisted choice on retries of an earlier reply.
    const effective = saved?.decision || 'UNAVAILABLE';
    const serviceOnly = effective === 'DENIED' || (effective !== 'GRANTED' && decision === 'DENIED');
    process.stderr.write(`${internalPrefix}PREVIEW_DECISION=${serviceOnly ? 'SERVICE_ONLY' : 'CONFIRMED'}\n`);
    process.stderr.write(`${internalPrefix}CONVERSATION_CONSENT=${effective}\n`);
    return;
  }
  if (argv.length !== 3 || !['notice', 'key-options', 'open-keygen', 'key-tool-fallback'].includes(action)) {
    throw new Error('用法: runtime.mjs preview <notice|key-options|open-keygen|key-tool-fallback>');
  }
  if (action === 'notice') return deliver('preview.notice');
  if (action === 'key-options') return deliver('application.key.methods');
  if (action === 'key-tool-fallback') return deliver('application.key.local.fallback');
  const outcome = openLocalKeygen();
  process.stderr.write(`${internalPrefix}LOCAL_KEYGEN_OPEN=${outcome}\n`);
  deliver(outcome === 'OPEN_REQUESTED' ? 'application.key.local.opened' : 'application.key.local.fallback');
}

export function runManualKeyToolCli(argv = process.argv) {
  if (argv.length !== 2) throw new Error('预发版 key-tool 仅提供手动下载安装引导，不接受下载目录');
  deliver('application.key.tool.manual');
}
