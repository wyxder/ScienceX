import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {refreshWindowsCli} from './cli-install.mjs';
import {findGitBash} from './git-discovery.mjs';
import {findWinget} from './winget.mjs';
import {installGitOfficial} from './git-install.mjs';
import {powershell} from './host.mjs';
import {loadPolicy,run,stateRoot,readState,saveState,withLock,ensureReady,locateJq,fail,report} from './preflight.mjs';

export function claimPreparation(state,stage,{source='official',repair=false,authorized=false}={}) {
  if(!authorized) fail('PREPARATION_AUTHORIZATION_REQUIRED');
  if(!['git','jq','cli'].includes(stage) || !['official','winget'].includes(source) ||
      (source==='winget' && stage!=='git')) fail('ENVIRONMENT_ARGUMENT_INVALID');
  state.attempts ||= {git:0,jq:0,cli:0};
  state.repairs ||= {git:0,jq:0,cli:0};
  state.sources ||= {};
  state.sources[stage] ||= {};
  const used=Number(state.sources[stage][source] || 0);
  if(used>=2 || (used>=1 && !repair)) fail('RETRY_BUDGET_EXHAUSTED',stage);
  state.sources[stage][source]=used+1;
  state.attempts[stage]=(state.attempts[stage]||0)+1;
  if(used>=1) state.repairs[stage]++;
  state.blocked=true;state.reason='PREPARATION_INCOMPLETE';
  return state;
}
export function installGitWithWinget({env=process.env,execute=run,discover=findGitBash,beforeAttempt=()=>{}}={}) {
  const command=findWinget({env,execute});
  if(!command)fail('WINGET_UNAVAILABLE','Git Bash');
  beforeAttempt();
  const result=execute(command,['install','--id','Git.Git','--exact','--source','winget','--scope','user',
    '--silent','--disable-interactivity','--accept-package-agreements','--accept-source-agreements'],{env,timeout:120000});
  if(result.error||result.status!==0||!discover({env}))fail('GIT_INSTALL_FAILED','Git Bash');
}
export function installAsset(name,asset,{bin=path.join(os.homedir(),'.local/bin'),
  curl=path.join(process.env.SystemRoot||'C:/Windows','System32/curl.exe'),execute=run}={}) {
  fs.mkdirSync(bin,{recursive:true});
  const target=path.join(bin,name+'.exe');
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  const temporary=path.join(bin,name+'-'+crypto.randomUUID()+'.download');
  const backup=path.join(bin,name+'-'+crypto.randomUUID()+'.backup');
  let moved=false,committed=false;
  try {
    const r=execute(curl,['--compressed','--fail','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--connect-timeout','10','--max-time','60','--output',temporary,asset.url],{timeout:65000});
    if(r.status!==0)fail('DOWNLOAD_FAILED',name);
    if(hash(fs.readFileSync(temporary))!==asset.sha256)fail('INTEGRITY_FAILED',name);
    if(fs.existsSync(target)){fs.renameSync(target,backup);moved=true;}
    fs.renameSync(temporary,target);
    if(execute(target,name==='jq'?['--version']:['version']).status!==0)fail('EXECUTION_FAILED',name);
    committed=true;
  }catch(error){
    if(moved&&!committed){
      try {if(fs.existsSync(target))fs.unlinkSync(target);fs.renameSync(backup,target);moved=false;}
      catch {fail('INSTALL_ROLLBACK_FAILED',name);}
    }
    throw error;
  }finally{
    if(fs.existsSync(temporary))fs.unlinkSync(temporary);
    if(committed&&moved&&fs.existsSync(backup))fs.unlinkSync(backup);
  }
}
// Keep installation budgets independent: a failed Git stage cannot consume jq/CLI.
export function prepareDependencies(state,{authorized=false,repair=false,save=()=>{},root,
  gitReady=()=>findGitBash(),jqReady=()=>locateJq(),
  cliReady=()=>{const cli=path.join(os.homedir(),'.local/bin/alipay-cli.exe');return fs.existsSync(cli)&&run(cli,['version']).status===0;},
  installWinget=installGitWithWinget,installOfficial=installGitOfficial,
  prepareJq=(beforeAttempt)=>{const asset=loadPolicy('jq').jq;requireAssetDownloader();beforeAttempt();installAsset('jq',asset);},
  prepareCli=(beforeAttempt)=>{powershell();beforeAttempt();if(refreshWindowsCli()!=='READY')fail('CLI_INSTALL_FAILED','alipay-cli');}
}={}) {
  if(!authorized) fail('PREPARATION_AUTHORIZATION_REQUIRED');
  state.results ||= {};
  const attempt=(stage,source,action)=>{
    let started=false;
    const beforeAttempt=()=>{
      claimPreparation(state,stage,{source,authorized,repair});
      state.results[stage]={source,status:'RUNNING'};save(state);started=true;
    };
    try {action(beforeAttempt);state.results[stage]={source,status:'READY'};save(state);}
    catch(error){
      if(started){state.results[stage]={source,status:'FAILED',reason:error.reason||'INSTALL_FAILED'};save(state);}
      throw error;
    }
  };
  try {
    const missing=[];
    if(!gitReady())missing.push('Git Bash');
    if(!jqReady())missing.push('jq');
    if(!cliReady())missing.push('alipay-cli');
    process.stderr.write('ALIPAY_AIPAY_INTERNAL:WINDOWS_ENV_MISSING='+JSON.stringify(missing)+'\n');
    if(missing.includes('Git Bash')) {
      try {
        if(state.sources?.git?.winget && !repair) fail('WINGET_ALREADY_ATTEMPTED','Git Bash');
        attempt('git','winget',beforeAttempt=>installWinget({beforeAttempt}));
      } catch(error) {
        if(!['WINGET_UNAVAILABLE','WINGET_ALREADY_ATTEMPTED','GIT_INSTALL_FAILED','RETRY_BUDGET_EXHAUSTED'].includes(error.reason)) throw error;
        if(!gitReady()) attempt('git','official',beforeAttempt=>installOfficial({root,beforeAttempt}));
      }
      if(!gitReady()){
        state.results.git={...state.results.git,status:'FAILED',reason:'GIT_VERIFY_FAILED'};
        fail('GIT_VERIFY_FAILED','Git Bash');
      }
    }
    if(missing.includes('jq')) {
      attempt('jq','official',beforeAttempt=>{prepareJq(beforeAttempt);if(!jqReady())fail('EXECUTION_FAILED','jq');});
    }
    if(missing.includes('alipay-cli')) {
      attempt('cli','official',beforeAttempt=>{prepareCli(beforeAttempt);if(!cliReady())fail('CLI_INSTALL_FAILED','alipay-cli');});
    }
    for(const stage of ['git','jq','cli'])state.results[stage]={source:state.results[stage]?.source||'existing',status:'READY'};
    state.blocked=false;state.reason='';save(state);
  }catch(e){state.blocked=true;state.reason=e.reason||'INSTALL_FAILED';save(state);throw e;}
}
function requireAssetDownloader() {
  const curl=path.join(process.env.SystemRoot||'C:/Windows','System32/curl.exe');
  if(!fs.existsSync(curl))fail('DEPENDENCY_MISSING','curl');
}
export function prepare({authorized=false,repair=false}={}) {
  if(!authorized) fail('PREPARATION_AUTHORIZATION_REQUIRED');
  const root=stateRoot();
  withLock(root,()=>prepareDependencies(readState(root),{authorized,repair,root,save:state=>saveState(root,state)}));
  return ensureReady();
}
export function parseEnvironmentRequest(args, route=process.env.ALIPAY_AIPAY_WINDOWS_ROUTE) {
  const [mode,...rest]=args;
  const options={};
  for(let i=0;i<rest.length;i+=2) {
    if(!['--product-type','--authorized','--repair-confirmed','--root-intent'].includes(rest[i])||rest[i+1]===undefined||Object.hasOwn(options,rest[i]))fail('ENVIRONMENT_ARGUMENT_INVALID');
    options[rest[i]]=rest[i+1];
  }
  if(options['--product-type']&&!['aipay','webpay','apppay'].includes(options['--product-type']))fail('ENVIRONMENT_ARGUMENT_INVALID');
  for (const key of ['--authorized','--repair-confirmed']) {
    if (options[key] !== undefined && !['true','false'].includes(options[key])) fail('ENVIRONMENT_ARGUMENT_INVALID');
  }
  if (mode === 'retry' && options['--repair-confirmed'] !== 'true') fail('PREPARATION_AUTHORIZATION_REQUIRED');
  const recovering = mode === 'retry' || (mode === 'prepare' && (route==='BLOCKED' || options['--repair-confirmed'] === 'true'));
  if (recovering && (!['integration_only','onboarding_only','full_process'].includes(options['--root-intent']) ||
      route !== 'BLOCKED')) fail('ENVIRONMENT_ARGUMENT_INVALID');
  if (!recovering && options['--root-intent'] !== undefined) fail('ENVIRONMENT_ARGUMENT_INVALID');
  return {mode,options,recovering};
}
export function runEnvironment(args) {
  const {mode,options,recovering}=parseEnvironmentRequest(args);
  try {
    if(['prepare','prepare-jq'].includes(mode))prepare({authorized:options['--authorized']==='true',repair:options['--repair-confirmed']==='true'});
    else if(['check','integration-check','retry'].includes(mode))ensureReady({retry:mode==='retry'&&options['--repair-confirmed']==='true'});
    else fail('ENVIRONMENT_ARGUMENT_INVALID');
    console.log('CLI_ENV:READY');
    if (recovering) process.stderr.write('ALIPAY_AIPAY_INTERNAL:WINDOWS_ROUTE=' +
      JSON.stringify({schemaVersion:1,rootIntent:options['--root-intent'],route:'READY'}) + '\n');
    return 0;
  }catch(e){report(e);return 78;}
}
