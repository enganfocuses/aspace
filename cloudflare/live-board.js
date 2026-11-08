import {cleanBoard,same,mergeBoard,boardHash} from './merge-board.js';

const failure=(message,status=409)=>Object.assign(new Error(message),{status});
export const outage=e=>!!e&&(e.quota||e.status===0||e.status===429||(e.status>=500&&e.status<=599));
const clone=x=>structuredClone(x);

/** One logical board, one primary path, one durable draft and a versioned reserve. */
export function createLiveBoard({key,firebaseDatabaseURL,primaryPath='/docs/'+key,
 wrapPrimary=true,getIdToken=async()=>null,requireToken=true,cloudflare,queue,
 fetchImpl=fetch,timeoutMs=8000,canWrite=()=>true,onStatus=()=>{},withLock=fn=>fn()}){
 if(!/^boards\/[A-Za-z0-9_-]{1,120}$/.test(key)||
    !/^\/(docs\/boards\/[A-Za-z0-9_-]+|shares\/[a-f0-9]{48}\/board)$/.test(primaryPath))
  throw Error('Invalid canonical board path');
 const base=String(firebaseDatabaseURL).replace(/\/+$/,'');
 if(!base.startsWith('https://'))throw Error('HTTPS Firebase required');
 let chain=Promise.resolve(),last=null,closed=false;
 const notify=(source,phase,extra={})=>{if(!closed)onStatus({key,source,phase,...extra})};
 const serial=fn=>{const work=chain.then(()=>withLock(fn));chain=work.catch(()=>{});return work};
 async function primary(method,value,etag){
  const token=await getIdToken();
  if(requireToken&&!token)throw failure('Owner authentication unavailable',401);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  const headers={'X-Firebase-ETag':'true'};
  if(method==='PUT'){
   if(!etag)throw failure('Firebase did not expose the document version',428);
   headers['if-match']=etag;headers['Content-Type']='application/json';
  }
  try{
   const r=await fetchImpl(base+primaryPath+'.json'+(token?'?auth='+encodeURIComponent(token):''),{
    method,headers,signal:controller.signal,cache:'no-store',referrerPolicy:'no-referrer',
    body:method==='PUT'?JSON.stringify(wrapPrimary?{j:JSON.stringify(value)}:value):undefined});
   const text=await r.text();
   if(!r.ok){
    const quota=/quota[ _-]?(?:exceeded|exhausted|limit)|resource_exhausted|bandwidth[ _-]?quota/i.test(text);
    throw Object.assign(failure('Firebase HTTP '+r.status,r.status),{quota});
   }
   let raw;try{raw=JSON.parse(text)}catch{throw failure('Invalid Firebase JSON',422)}
   if(wrapPrimary&&raw&&typeof raw.j==='string')try{raw=JSON.parse(raw.j)}catch{throw failure('Invalid board JSON',422)}
   return {value:cleanBoard(raw),etag:r.headers.get('etag')};
  }catch(e){
   if(e.status!==undefined)throw e;
   throw failure('Firebase network unavailable',0);
  }finally{clearTimeout(timer)}
 }
 async function cloudRead(){
  const record=await cloudflare.getDoc(key);
  if(!record||!Number.isSafeInteger(record.revision)||record.revision<1)throw failure('No reserve snapshot',404);
  const meta=record.value?._aspaceSync;
  return {...record,value:cleanBoard(record.value),meta:meta?.v===1?meta:null};
 }
 function permitted(value){
  const j=JSON.stringify(value);
  return new TextEncoder().encode(j).length<=700000&&
   !/data:(?:image|audio|video|application\/pdf)\//i.test(j)&&!j.includes('data:application/pdf');
 }
 async function cloudPut(value,expected,mode,baseHash,ancestors=[]){
  if(!permitted(value))throw failure('Board media or size exceeds reserve limits',413);
  const result=await cloudflare.putDoc(key,{...clone(value),_aspaceSync:{v:1,mode,baseHash,ancestors}},expected);
  if(!Number.isSafeInteger(result?.revision)||result.revision<=expected)throw failure('Unconfirmed reserve version',502);
  return {...result,value:clone(value),meta:{v:1,mode,baseHash,ancestors}};
 }
 async function mirror(value,snapshot){
  if(!permitted(value)){notify('firebase','media_not_mirrored');return false}
  let current=snapshot;
  if(current===undefined)try{current=await cloudRead()}catch(e){if(e.status!==404)throw e;current=null}
  if(current?.meta?.mode==='standby'){
   if(!same(current.value,value))throw failure('Pending reserve edits must be recovered first');
  }else if(current&&!current.meta&&current.revision>1&&!same(current.value,value)){
   throw failure('Legacy reserve divergence requires review');
  }
  const hash=await boardHash(value);
  if(current&&same(current.value,value)&&current.meta?.mode==='mirror'&&current.meta.baseHash===hash)return true;
  // Revision 1 is the owner's untouched preparation snapshot. CAS prevents
  // replacing a guest update arriving after this read.
  await cloudPut(value,current?.revision||0,'mirror',hash);return true;
 }
 async function recoverReserve(live){
  let backup;
  try{backup=await cloudRead()}catch(e){if(e.status===404)return {live,backup:null};throw e}
  if(backup.meta?.mode!=='standby')return {live,backup};
  const hash=await boardHash(live.value),desiredHash=await boardHash(backup.value);
  if(hash!==desiredHash){
   if(hash!==backup.meta.baseHash&&!backup.meta.ancestors?.includes(hash))throw failure('Firebase and reserve changed from the same base');
   if(!canWrite())return {live:{value:backup.value,etag:null},backup,reserveOnly:true};
   live=await primary('PUT',backup.value,live.etag);
  }
  // The reserve CAS in mirror must still match this exact snapshot. A later
  // guest update cannot be overwritten by an older recovery response.
  return {live,backup};
 }
 async function removeDraft(id){
  const current=await queue.get(key);
  if(current?.id===id)await queue.remove(key);
 }
 async function remember(value,source,meta={}){
  last={value:clone(value),source,...meta};
  if(value){const raw=JSON.stringify(value);notify(source,meta.conflict?'conflict':'snapshot',{...meta,
   bytes:new TextEncoder().encode(raw).byteLength,embedded:/data:(?:image|audio|video)\/|data:application\/pdf/i.test(raw)})}
  return {value:clone(value),source,...meta};
 }
 async function save(value,existing,options={}){
  if(!canWrite())throw failure('View-only access',403);
  const previous=existing||await queue.get(key);
  const record={...previous,id:crypto.randomUUID(),value:cleanBoard(value),
   base:previous?.base??options.base??last?.value??null,
   primaryHash:previous?.primaryHash??last?.primaryHash??null,
   mirrorKnown:previous?.mirrorKnown??Boolean(last?.mirrored||last?.source==='cloudflare'),createdAt:previous?.createdAt||Date.now()};
  await queue.put(key,record);notify('local','queued');
  let live;
  try{live=await primary('GET')}
  catch(e){
   if(!outage(e))throw e;
   let backup;
   try{
    backup=await cloudRead();
    const before=record.cloudValue||record.base;
    if(!before)throw failure('No confirmed base for offline editing');
    let desired=record.value;
    if(!same(backup.value,before)){
     if(backup.meta?.mode!=='standby'&&record.primaryHash&&backup.meta?.baseHash!==record.primaryHash&&!record.mirrorKnown)
      throw failure('Reserve ancestry is unknown; local draft retained');
     const merged=mergeBoard(before,desired,backup.value);
     if(!merged.ok)throw failure('Concurrent reserve edits: '+merged.conflicts.join(', '));
     desired=merged.value;
    }
    const primaryHash=backup.meta?.mode==='standby'?backup.meta.baseHash:
      record.primaryHash||await boardHash(before);
    if(!primaryHash)throw failure('Missing primary ancestor');
    const ancestors=[...new Set([...(backup.meta?.ancestors||[]),await boardHash(backup.value)])].slice(-64);
    const receipt=same(desired,backup.value)&&backup.meta?.mode==='standby'&&backup.meta.baseHash===primaryHash
     ?backup:await cloudPut(desired,backup.revision,'standby',primaryHash,ancestors);
    await queue.put(key,{...record,value:desired,cloudValue:desired,cloudRevision:receipt.revision,primaryHash});
    notify('cloudflare','pending_recovery');
    return remember(desired,'cloudflare',{pending:true,primaryHash});
   }catch(backupError){
    if(backupError.status===401||backupError.status===403||backupError.status===404)throw backupError;
    notify('local',backupError.status===409?'conflict':'queued',{error:backupError.message});
    return remember(record.value,'local',{pending:true,conflict:backupError.status===409,error:backupError.message,primaryHash:record.primaryHash});
   }
  }
  let recovered;
  try{recovered=await recoverReserve(live)}catch(e){
   // A backup transport failure must not block normal Firebase use unless a
   // confirmed reserve receipt is waiting for reconciliation.
   if(e.status===409||record.cloudRevision){notify('local','conflict',{error:e.message});return remember(record.value,'local',{pending:true,conflict:true,error:e.message})}
   recovered={live,backup:undefined};
  }
  live=recovered.live;
  let desired=record.value;
  if(!same(live.value,desired)){
   if(live.value!==null){
    if(!record.base)throw failure('Unknown draft base; automatic overwrite blocked');
    const merged=mergeBoard(record.cloudValue||record.base,desired,live.value);
    if(!merged.ok){notify('local','conflict',{conflicts:merged.conflicts});return remember(desired,'local',{pending:true,conflict:true,conflicts:merged.conflicts})}
    desired=merged.value;
   }
   if(!same(desired,live.value))live=await primary('PUT',desired,live.etag);
  }
  // Firebase succeeded. Keep any newer tab's draft; own draft can be removed.
  await removeDraft(record.id);
  const primaryHash=await boardHash(live.value);
  let mirrored=false;
  try{mirrored=await mirror(live.value,recovered.backup)}catch(e){notify('firebase','mirror_pending',{error:e.message})}
  notify('firebase',mirrored?'saved':'saved_without_mirror');
  return remember(live.value,'firebase',{pending:false,mirrored,primaryHash});
 }
 async function readInternal(){
  const queued=await queue.get(key);
  if(queued&&canWrite()){
   try{return await save(queued.value,queued)}catch(e){
    if(e.status===401||e.status===403||e.status===404)throw e;
    notify('local','conflict',{error:e.message});
    return remember(queued.value,'local',{pending:true,conflict:true,error:e.message});
   }
  }
  let live;
  try{live=await primary('GET')}
  catch(e){
   if(!outage(e))throw e;
   const backup=await cloudRead();
   notify('cloudflare','read');
   return remember(backup.value,'cloudflare',{primaryHash:backup.meta?.baseHash||await boardHash(backup.value),pending:backup.meta?.mode==='standby'});
  }
  if(!live.value)return remember(null,'firebase');
  let recovered;
  try{recovered=await recoverReserve(live)}catch(e){
   if(e.status===409){notify('firebase','conflict',{error:e.message});return remember(live.value,'firebase',{conflict:true,error:e.message,primaryHash:await boardHash(live.value)})}
   recovered={live,backup:undefined};
  }
  if(recovered.reserveOnly){notify('cloudflare','awaiting_owner');return remember(recovered.live.value,'cloudflare',{pending:true,primaryHash:recovered.backup.meta.baseHash})}
  live=recovered.live;
  let mirrored=false;
  if(canWrite())try{mirrored=await mirror(live.value,recovered.backup)}catch(e){notify('firebase','mirror_pending',{error:e.message})}
  notify('firebase',mirrored?'ready':'ready_without_mirror');
  return remember(live.value,'firebase',{pending:false,mirrored,primaryHash:await boardHash(live.value)});
 }
 async function inspect(){
  const draft=await queue.get(key);
  let live=null,backup=null;
  try{live=await primary('GET')}catch(e){if(!outage(e))throw e}
  try{backup=await cloudRead()}catch(e){if(e.status!==404&&!outage(e))throw e}
  return {draft:draft?.value||null,primary:live,reserve:backup?{value:backup.value,revision:backup.revision}:null};
 }
 async function resolve(choice,reviewed){
  if(!canWrite())throw failure('View-only access',403);
  const selected=choice==='local'?reviewed?.draft:choice==='primary'?reviewed?.primary?.value:
   choice==='reserve'?reviewed?.reserve?.value:null;
  if(!selected)throw failure('Selected version is unavailable',400);
  const live=await primary('GET');
  let backup=null;try{backup=await cloudRead()}catch(e){if(e.status!==404)throw e}
  if(live.etag!==reviewed.primary?.etag||!same(live.value,reviewed.primary?.value)||
    (backup?.revision||0)!==(reviewed.reserve?.revision||0))
   throw failure('A version changed after review; inspect again');
  const current=await queue.get(key);
  if(!same(current?.value||null,reviewed.draft))throw failure('A newer local draft exists');
  const record={id:crypto.randomUUID(),value:clone(selected),base:clone(live.value),createdAt:Date.now()};
  await queue.put(key,record);
  const confirmed=same(live.value,selected)?live:await primary('PUT',selected,live.etag);
  const primaryHash=await boardHash(confirmed.value);
  await cloudPut(confirmed.value,backup?.revision||0,'mirror',primaryHash);
  await removeDraft(record.id);notify('firebase','saved');
  return remember(confirmed.value,'firebase',{pending:false,mirrored:true,primaryHash});
 }
 return {read:()=>serial(readInternal),write:(value,options)=>serial(()=>save(value,null,options)),
  inspect:()=>serial(inspect),resolve:(choice,reviewed)=>serial(()=>resolve(choice,reviewed)),
  pending:()=>queue.get(key),draft:()=>queue.get(key),close:()=>{closed=true}};
}
