import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run, fail, checkWritable} from './host.mjs';
import {findWinget} from './winget.mjs';

const script = fileURLToPath(new URL('../../../integration/modules/scripts/local_402_sandbox_pay.py', import.meta.url));
const probe = 'import json, os, runpy, sys; assert sys.version_info.major == 3 and sys.platform == "win32"; sys.path.insert(0, os.path.dirname(sys.argv[1])); runpy.run_path(sys.argv[1], run_name="__alipay_probe__"); print(json.dumps({"executable":sys.executable,"version":list(sys.version_info[:3])}))';

export function findWindowsPython({env = process.env, execute = run, exists = fs.existsSync, list = fs.readdirSync} = {}) {
  const probeEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
    !['PYTHON_MANAGER_AUTOMATIC_INSTALL', 'PYLAUNCHER_ALLOW_INSTALL', 'PYLAUNCHER_ALWAYS_INSTALL'].includes(key.toUpperCase())));
  probeEnv.PYTHON_MANAGER_AUTOMATIC_INSTALL = '0';
  const candidates = [{command: 'py', prefix: ['-3']}, {command: 'python', prefix: []}, {command: 'python3', prefix: []}];
  const roots = [env.LOCALAPPDATA && path.win32.join(env.LOCALAPPDATA, 'Programs/Python'), env.ProgramFiles && path.win32.join(env.ProgramFiles, 'Python')].filter(Boolean);
  for (const root of roots) {
    let names = [];
    try { names = list(root).filter(name => /^Python3\d+$/i.test(name)).sort().reverse(); } catch {}
    for (const name of names) candidates.push({command: path.win32.join(root, name, 'python.exe'), prefix: []});
  }
  for (const candidate of candidates) {
    const result = execute(candidate.command, [...candidate.prefix, '-c', probe, script], {env: probeEnv, timeout: 10000});
    if (result.status !== 0) continue;
    try {
      const value = JSON.parse(result.stdout);
      if (value.version?.[0] === 3 && path.win32.isAbsolute(value.executable) && exists(value.executable)) {
        return {command: value.executable, prefix: []};
      }
    } catch {}
  }
  return null;
}

// A separate budget: preparing Python for A2M never consumes or resets the
// Git/jq/CLI environment repair state, or any business/telemetry state.
export function prepareWindowsPython({authorized = false, repair = false, find = findWindowsPython,
  execute = run, env = process.env, root, checkRoot = checkWritable, lock, exists = fs.existsSync} = {}) {
  const existing = find({env});
  if (existing) return existing;
  if (!authorized) fail('DEPENDENCY_MISSING', 'Python 3');
  checkRoot(root);
  return lock(root, () => {
    const file = path.join(root, 'python-environment.json');
    let state = {prepareAttempts: 0, repairAttempts: 0};
    if (fs.existsSync(file)) {
      try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail('ENVIRONMENT_STATE_INVALID'); }
    }
    if (!Number.isInteger(state.prepareAttempts) || state.prepareAttempts < 0 ||
        !Number.isInteger(state.repairAttempts) || state.repairAttempts < 0) fail('ENVIRONMENT_STATE_INVALID');
    if (repair ? state.repairAttempts >= 1 : state.prepareAttempts >= 1 || state.repairAttempts >= 1) fail('RETRY_BUDGET_EXHAUSTED');
    const winget = findWinget({env,execute});
    if (!winget) fail('MANUAL_PYTHON_INSTALL_REQUIRED', 'Python 3');
    state.prepareAttempts++; if (repair) state.repairAttempts++;
    fs.writeFileSync(file, JSON.stringify(state));
    const result = execute(winget, ['install', '--id', 'Python.Python.3.14', '--exact', '--source', 'winget',
      '--scope', 'user', '--architecture', 'x64', '--silent', '--disable-interactivity',
      '--accept-package-agreements', '--accept-source-agreements'], {env, timeout: 180000});
    if (result.status !== 0) fail('PYTHON_INSTALL_FAILED', 'Python 3');
    const python = find({env});
    if (!python) fail('PYTHON_VERIFY_FAILED', 'Python 3');
    return python;
  });
}

export async function runPythonEnvironment(args) {
  const [mode, ...rest] = args;
  const options = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!['--authorized', '--repair-confirmed'].includes(rest[i]) ||
        !['true', 'false'].includes(rest[i + 1]) || options[rest[i]] !== undefined) fail('ENVIRONMENT_ARGUMENT_INVALID');
    options[rest[i]] = rest[i + 1];
  }
  if (!['check-python', 'prepare-python'].includes(mode) || (mode === 'check-python' && rest.length)) fail('ENVIRONMENT_ARGUMENT_INVALID');
  const {stateRoot, withLock, report} = await import('./preflight.mjs');
  try {
    // Delay all filesystem state until installation is actually necessary.
    const found = findWindowsPython();
    if (!found) {
      if (mode === 'check-python' || options['--authorized'] !== 'true') fail('DEPENDENCY_MISSING', 'Python 3');
      prepareWindowsPython({authorized: true, repair: options['--repair-confirmed'] === 'true',
        root: stateRoot(), checkRoot: checkWritable, lock: withLock});
    }
    process.stderr.write('ALIPAY_AIPAY_INTERNAL:PYTHON_ENV=READY\n');
    return 0;
  } catch (error) { report(error); return 78; }
}
