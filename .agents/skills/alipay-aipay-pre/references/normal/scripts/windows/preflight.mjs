import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const directory = path.dirname(fileURLToPath(import.meta.url));
export function loadPolicy(dependency, read = fs.readFileSync) {
  try {
    const policy = JSON.parse(read(path.join(directory,'policy.json'),'utf8'));
    const asset = dependency === 'Git Bash' ? policy?.git : policy?.jq;
    if (!asset || typeof asset !== 'object' || typeof asset.url !== 'string' ||
      typeof asset.sha256 !== 'string' || (dependency === 'Git Bash' && typeof asset.version !== 'string')) {
      throw new Error('incomplete policy');
    }
    return policy;
  }
  catch { fail('POLICY_UNAVAILABLE',dependency); }
}
const slash = p => p.replaceAll('\\','/');
let invocationContext;
import {fail, run, checkWritable} from './host.mjs';
export {fail, run, checkWritable} from './host.mjs';
import {telemetryStoragePaths} from '../telemetry.mjs';
import {findGitBash} from './git-discovery.mjs';
import {requireWindowsX64Node} from './architecture.mjs';

export function stateRoot() {
  const root=path.join(process.env.LOCALAPPDATA || path.join(os.homedir(),'AppData/Local'),'alipay-aipay-pre/windows');
  if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink()) fail('STORAGE_FAILED');
  fs.mkdirSync(root,{recursive:true}); return root;
}
export function readState(root) {
  const file=path.join(root,'environment.json');
  if(!fs.existsSync(file)) return {schemaVersion:2,attempts:{git:0,jq:0,cli:0},repairs:{git:0,jq:0,cli:0},sources:{}};
  try {
    const s=JSON.parse(fs.readFileSync(file,'utf8'));
    if(s.schemaVersion===1 && Number.isInteger(s.prepareAttempts) && s.prepareAttempts>=0 && Number.isInteger(s.repairAttempts) && s.repairAttempts>=0) {
      // Old global counts could be spent before finding any installer and
      // cannot be attributed to a dependency. New per-stage budgets stay bounded.
      return {schemaVersion:2,attempts:{git:0,jq:0,cli:0},repairs:{git:0,jq:0,cli:0},
        sources:{},blocked:s.blocked,reason:s.reason};
    }
    if(s.schemaVersion!==2 || !s.sources || typeof s.sources!=='object' || !['attempts','repairs'].every(key =>
      ['git','jq','cli'].every(name => Number.isInteger(s[key]?.[name]) && s[key][name]>=0)) ||
      Object.entries(s.sources).some(([stage,sources])=> !['git','jq','cli'].includes(stage) ||
        !sources || typeof sources!=='object' || Object.entries(sources).some(([source,count])=>
          !['official',...(stage==='git'?['winget']:[])].includes(source) || !Number.isInteger(count) || count<0 || count>2))) throw new Error();
    return s;
  } catch { fail('ENVIRONMENT_STATE_INVALID'); }
}
export function saveState(root,s) {
  const temporary=path.join(root,'environment-'+crypto.randomUUID()+'.tmp');
  fs.writeFileSync(temporary,JSON.stringify(s),{flag:'wx'});
  fs.renameSync(temporary,path.join(root,'environment.json'));
}
export function withLock(root,fn) {
  const lock=path.join(root,'environment.lock'); let fd;
  // Concurrent discovery children briefly update the same state. Wait for that
  // short critical section, never replay a check/install/business operation.
  const deadline=Date.now()+2000;
  while(fd===undefined) {
    try { fd=fs.openSync(lock,'wx'); }
    catch(e) {
      if(e.code!=='EEXIST'||Date.now()>=deadline)fail('ENVIRONMENT_BUSY');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);
    }
  }
  try { return fn(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
// Match the existing environment policy: reuse a working jq; the managed
// installer is version-pinned only when jq is absent or unusable.
export function locateJq() {
  const systemPath=Object.entries(process.env).find(([k])=>k.toLowerCase()==='path')?.[1]||'';
  const candidates=[path.join(os.homedir(),'.local/bin/jq.exe'),
    ...systemPath.split(path.delimiter).filter(p=>path.isAbsolute(p)).map(p=>path.join(p,'jq.exe'))];
  return candidates.find(file=>fs.existsSync(file) &&
    run(file,['--version']).status===0 &&
    run(file,['-n','-e','--arg','value','ok','$value == "ok"']).status===0);
}
export function locate() {
  if(process.platform!=='win32') fail('WINDOWS_ADAPTER_REQUIRES_WINDOWS');
  if(Number(process.versions.node.split('.')[0])<18) fail('DEPENDENCY_VERSION','Node');
  requireWindowsX64Node();
  const foundGit=findGitBash();
  if(!foundGit) fail('DEPENDENCY_MISSING','Git Bash');
  const {bash,git}=foundGit;
  const bin=path.join(os.homedir(),'.local/bin');
  const cli=path.join(bin,'alipay-cli.exe'),jq=locateJq();
  if(!jq) fail('DEPENDENCY_MISSING','jq');
  if(!fs.existsSync(cli)) fail('DEPENDENCY_MISSING','alipay-cli');
  const env={...process.env};
  const oldPath=Object.entries(env).find(([k])=>k.toLowerCase()==='path')?.[1]||'';
  for(const k of Object.keys(env)) if(k.toLowerCase()==='path') delete env[k];
  env.PATH=[path.join(directory,'bin'),path.dirname(bash),path.join(git,'usr/bin'),path.dirname(process.execPath),bin,oldPath].join(path.delimiter);
  delete env.ALIPAY_AIPAY_TEST_PLATFORM; delete env.ALIPAY_AIPAY_TEST_MODE;
  delete env.BASH_ENV; delete env.ENV; delete env.SHELLOPTS;
  env.MSYS_NO_PATHCONV='1';env.MSYS2_ARG_CONV_EXCL='*';
  env.ALIPAY_WINDOWS_CLI_RUNNER=slash(path.join(directory,'cli-process.mjs'));
  env.ALIPAY_WINDOWS_NODE=slash(process.execPath);
  env.ALIPAY_WINDOWS_JQ=slash(jq);
  env.ALIPAY_WINDOWS_CLI=slash(cli);
  env.ALIPAY_WINDOWS_CREDENTIALS_DIR=slash(path.join(os.homedir(),'.alipay-cli/credentials'));
  env.ALIPAY_WINDOWS_LOGS_DIR=slash(path.join(process.env.APPDATA||path.join(os.homedir(),'AppData/Roaming'),'alipay-cli/data/logs'));
  env.ALIPAY_WINDOWS_CLI_ENTRY=slash(path.join(directory,'bin/alipay-cli'));
  env.ALIPAY_WINDOWS_ACCESS_SCRIPT=slash(path.join(directory,'access-native.mjs'));
  env.NODE_BINARY='node';
  return {bash,git,cli,jq,env};
}
function writable(directoryPath) {
  if(!fs.existsSync(directoryPath)) fs.mkdirSync(directoryPath,{recursive:true});
  if(fs.lstatSync(directoryPath).isSymbolicLink()) fail('STORAGE_FAILED');
  const p=path.join(directoryPath,'.aipay-probe-'+crypto.randomUUID());
  try { fs.writeFileSync(p,'probe',{flag:'wx'});fs.renameSync(p,p+'.moved');fs.unlinkSync(p+'.moved'); }
  catch { fail('STORAGE_FAILED'); }
}
// Pin the existing telemetry location before changing Bash scratch paths. This
// never changes the gateway environment, consent, session, run or override files.
export function privateChildEnvironment(env, temporary) {
  return {...env, ALIPAY_AIPAY_TELEMETRY_DIR: telemetryStoragePaths(env).state_dir,
    TEMP: temporary, TMP: temporary, TMPDIR: slash(temporary)};
}

export function inspectLocal(root) {
  const context=locate();
  const temporary=path.join(root,'tmp');fs.mkdirSync(temporary,{recursive:true});
  context.env = privateChildEnvironment(context.env, temporary);
  for(const [exe,args,name] of [[context.cli,['version'],'alipay-cli'],[context.jq,['-n','-e','--arg','v','猫 $HOME "x"','$v == "猫 $HOME \\"x\\""'],'jq']]) {
    // jq round-trip is checked in the Bash probe below; this native check verifies launch/version.
    const r=run(exe,name==='jq'?['--version']:args,{env:context.env});
    if(r.status!==0||!r.stdout.trim()) fail('EXECUTION_FAILED',name);
  }
  const r=run(context.bash,['--noprofile','--norc',slash(path.join(directory,'probe.sh'))],{env:context.env});
  if(r.status!==0||r.stdout.trim()!=='WINDOWS_PROBE:READY') fail('SHELL_TRANSPORT_FAILED');
  writable(temporary);
  return context;
}
export function checkCredentialsWritable() {
  const target=path.join(os.homedir(),'.alipay-cli/credentials');
  fs.mkdirSync(target,{recursive:true});
  checkWritable(target);
}
export function ensureReady({retry=false}={}) {
  // Reuse only within this Node invocation. Each new process performs full checks;
  // persisted failures never prevent a read-only check after the user fixes a dependency.
  if(!retry&&invocationContext) {
    locate();return invocationContext.context;
  }
  const root=stateRoot();
  try {
    const context=inspectLocal(root);
    // Diagnostic state is optional after a complete capability check. An
    // abandoned lock must not add two seconds to every subsequent CLI call.
    if (!fs.existsSync(path.join(root,'environment.lock'))) {
      try {
        withLock(root,()=>{
          const state=readState(root);
          if(state.blocked){state.blocked=false;state.reason='';saveState(root,state);}
        });
      } catch (error) {
        if (!['ENVIRONMENT_BUSY','ENVIRONMENT_STATE_INVALID'].includes(error.reason)) throw error;
      }
    }
    invocationContext={root,context};return context;
  } catch(e) {
    if (!fs.existsSync(path.join(root,'environment.lock'))) {
      try {
        withLock(root,()=>{const state=readState(root);state.blocked=true;state.reason=e.reason||'CHECK_FAILED';saveState(root,state);});
      } catch (error) {
        if (!['ENVIRONMENT_BUSY','ENVIRONMENT_STATE_INVALID'].includes(error.reason)) throw error;
      }
    }
    throw e;
  }
}
export function applyReady(options) {
  // Do not change the gateway's TEMP, telemetry switches or business context.
  return ensureReady(options);
}
export function resultError(error) {
  const needsSetup = error.reason === 'DEPENDENCY_MISSING' ||
    (error.reason === 'EXECUTION_FAILED' && error.dependency === 'alipay-cli');
  const reason=error.reason || error.code || 'CHECK_FAILED';
  const recovery=reason==='NO_COMPATIBLE_EXECUTION_MAPPING'?'USE_SUPPORTED_PLATFORM_OR_SITE':
    (reason==='DEPENDENCY_MISSING' && error.dependency==='curl')?'RESTORE_WINDOWS_CURL_THEN_RECHECK':
    needsSetup?'PREPARE_MISSING_DEPENDENCIES':
    reason==='DOWNLOAD_FAILED'?'RESTORE_NETWORK_THEN_REPAIR':
    ['INTEGRITY_FAILED','SIGNATURE_FAILED'].includes(reason)?'VERIFY_OFFICIAL_ASSET_BEFORE_REPAIR':
    reason==='RETRY_BUDGET_EXHAUSTED'?'MANUAL_REPAIR_THEN_RECHECK':
    reason==='USER_SCOPE_REQUIRED'?'USE_NON_ELEVATED_SESSION':
    ['STORAGE_FAILED','ENVIRONMENT_BUSY','ENVIRONMENT_STATE_INVALID'].includes(reason)?'REPAIR_LOCAL_ENVIRONMENT_THEN_RECHECK':
    'INSPECT_FAILURE_THEN_RECHECK';
  return {schemaVersion:1,status:needsSetup?'NEEDS_SETUP':'BLOCKED',reason,dependency:error.dependency||'',recovery,validationCoverage:'NOT_VERIFIED'};
}
export function report(error) {
  const r=resultError(error);
  process.stderr.write('ALIPAY_AIPAY_INTERNAL:WINDOWS_ENV_RESULT='+JSON.stringify(r)+'\n');

}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const c=ensureReady();
    if(process.argv[2]==='shell-env') {
      const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
      // Only explicit adapter-owned values. Business context and credentials never appear here.
      for(const k of ['PATH','TEMP','TMP','TMPDIR','ALIPAY_AIPAY_TELEMETRY_DIR','ALIPAY_WINDOWS_NODE','ALIPAY_WINDOWS_JQ','ALIPAY_WINDOWS_CLI','ALIPAY_WINDOWS_CREDENTIALS_DIR','ALIPAY_WINDOWS_LOGS_DIR','ALIPAY_WINDOWS_CLI_ENTRY','ALIPAY_WINDOWS_CLI_RUNNER','ALIPAY_WINDOWS_ACCESS_SCRIPT','NODE_BINARY','MSYS_NO_PATHCONV','MSYS2_ARG_CONV_EXCL']) {
        const v=k==='PATH'?c.env[k].split(';').map(p=>slash(p).replace(/^([a-zA-Z]):/,(_,d)=>'/'+d.toLowerCase())).join(':'):c.env[k];
        console.log('export '+k+'='+quote(v));
      }
    } else console.error('ALIPAY_AIPAY_INTERNAL:WINDOWS_ENV_RESULT='+JSON.stringify({schemaVersion:1,status:'READY',validationCoverage:'NOT_VERIFIED'}));
  }catch(e){report(e);process.exitCode=78;}
}
