import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {loadPolicy,run,fail} from './preflight.mjs';
import {findGitBash} from './git-discovery.mjs';
import {powershell,psEnv} from './host.mjs';

export function installGitOfficial({env=process.env,execute=run,exists=fs.existsSync,
  read=fs.readFileSync,remove=fs.rmSync,discover=findGitBash,root,
  signatureCommand=powershell,beforeAttempt=()=>{},asset=loadPolicy('Git Bash').git}={}) {
  if(!root || !env.LOCALAPPDATA || !path.win32.isAbsolute(env.LOCALAPPDATA) ||
      !/^https:\/\/github\.com\/git-for-windows\/git\/releases\/download\/v[0-9.]+\.windows\.[0-9]+\/Git-[0-9.]+-64-bit\.exe$/u.test(asset.url) ||
      !/^[a-f0-9]{64}$/u.test(asset.sha256)) fail('GIT_ASSET_INVALID','Git Bash');
  const temporary=path.join(root,'git-'+crypto.randomUUID()+'.exe');
  const curl=path.join(env.SystemRoot||'C:/Windows','System32/curl.exe');
  const destination=path.win32.join(env.LOCALAPPDATA,'Programs','Git-Aipay-'+asset.version);
  if(!exists(curl)) fail('DEPENDENCY_MISSING','curl');
  const ps=signatureCommand();
  const scope=execute(ps,['-NoProfile','-NonInteractive','-Command',
    '$ErrorActionPreference="Stop"; try { $p=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()); if($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){exit 2}; exit 0 } catch { exit 3 }'],
    {env:psEnv(env),timeout:15000});
  if(scope.status!==0) fail('USER_SCOPE_REQUIRED','Git Bash');
  beforeAttempt();
  try {
    const downloaded=execute(curl,['--compressed','--fail','--silent','--show-error','--location','--proto','=https',
      '--proto-redir','=https','--connect-timeout','10','--max-time','90','--output',temporary,asset.url],{env,timeout:95000});
    if(downloaded.status!==0) fail('DOWNLOAD_FAILED','Git Bash');
    if(crypto.createHash('sha256').update(read(temporary)).digest('hex')!==asset.sha256) fail('INTEGRITY_FAILED','Git Bash');
    const checked=execute(ps,['-NoProfile','-NonInteractive','-Command',
      '$ErrorActionPreference="Stop"; try { $s=Get-AuthenticodeSignature -LiteralPath $env:ALIPAY_WINDOWS_GIT_INSTALLER; if($s.Status -ne "Valid"){exit 2}; exit 0 } catch { exit 3 }'],
      {env:{...psEnv(env),ALIPAY_WINDOWS_GIT_INSTALLER:temporary},timeout:15000});
    if(checked.status!==0) fail('SIGNATURE_FAILED','Git Bash');
    const installed=execute(temporary,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-',
      '/o:PathOption=BashOnly',`/DIR=${destination}`],{env,timeout:120000});
    if(installed.status!==0) fail('GIT_INSTALL_FAILED','Git Bash');
    const preparedEnv={...env,ALIPAY_GIT_BASH:path.win32.join(destination,'bin','bash.exe')};
    if(!discover({env:preparedEnv})) fail('GIT_VERIFY_FAILED','Git Bash');
  } finally {
    if(exists(temporary)) remove(temporary,{force:true});
  }
}
