/* Local, owner-scoped observations. No request URLs, bodies, tokens or lesson text are retained. */
(function(root){
 'use strict';
 const LIMITS=Object.freeze({uploadBytes:6*1024*1024,boardBytes:700000,
  firebaseStorage:1e9,firebaseDownloads:10e9,firebaseConnections:100,
  workerRequests:100000,d1Database:500e6,d1Account:5e9,d1Reads:5e6,d1Writes:100000});
 const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
 const utcDay=date=>new Date(date).toISOString().slice(0,10);
 // Compact URL-fragment import. Only these three numeric Firebase readings are allowed.
 // A screenshot has no verified measurement timestamp: retain it as a historical snapshot.
 function parseSnapshot(raw){
  if(typeof raw!=='string'||raw.length>160)return null;
  const match=raw.match(/^(\d{4}-(?:0[1-9]|1[0-2])),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+)$/);
  if(!match)return null;
  const storage=Number(match[2])*1e6,downloads=Number(match[3])*1e6,connections=Number(match[4]);
  if(![storage,downloads,connections].every(n=>Number.isFinite(n)&&n>=0&&n<=Number.MAX_SAFE_INTEGER))return null;
  return {month:match[1],storage,downloads,connections};
 }
 function boardSummary(value){
  const copy={...value};delete copy._aspaceSync;
  const j=JSON.stringify(copy),size=new TextEncoder().encode(j).byteLength;
  const embedded=/data:(?:image|audio|video)\/|data:application\/pdf/i.test(j);
  return {bytes:size,embedded,eligible:size<=LIMITS.boardBytes&&!embedded,
   items:Array.isArray(value?.items)?value.items.length:0,strokes:Array.isArray(value?.strokes)?value.strokes.length:0};
 }
 function quotaStatus(used,limit){
  if(!Number.isFinite(used)||used<0||!Number.isFinite(limit)||limit<=0)
   return {known:false,remaining:null,percent:null,level:'unknown'};
  const percent=used/limit*100;
  return {known:true,remaining:Math.max(0,limit-used),percent,level:percent>=100?'full':percent>=80?'warning':'ok'};
 }
 const meter=()=>({requests:0,failed:0,uploadBytes:0,knownResponseBytes:0,unknownResponses:0,writes:0,savedBoards:0,sseBytes:0,sseEvents:0});
 const validBoard=key=>/^boards\/[A-Za-z0-9_-]{1,120}$/.test(key);
 function receivedInMonth(state,month){
  let bytes=0,unknown=0;
  for(const [day,data] of Object.entries(state.days))if(day.startsWith(month)){
   bytes+=(data.firebase?.knownResponseBytes||0)+(data.firebase?.sseBytes||0);unknown+=data.firebase?.unknownResponses||0;
  }
  return {bytes,unknown};
 }
 function downloadEstimate(state,time=Date.now()){
  const month=utcDay(time).slice(0,7),reading=state.manual.firebaseDownloads;
  if(!reading||reading.period!==month||reading.baseline?.month!==month)return null;
  const current=receivedInMonth(state,month),extra=Math.max(0,current.bytes-reading.baseline.bytes);
  return {base:reading.value,extra,value:reading.value+extra,since:reading.updatedAt,
   unknownResponses:Math.max(0,current.unknown-reading.baseline.unknown)};
 }
 function create({scope,storage,now=()=>Date.now(),enabled=()=>true,
  firebaseURL,cloudflareURL}={}){
  if(!storage)try{storage=root.localStorage}catch{storage=null}
  storage??={getItem:()=>null,setItem:()=>{}};
  const storageKey='aspace-usage-v1:'+scope;
  let fallback=null;
  const boardPaths=new Map(),actionBursts=new Map(),streamPending=new Map();let activeBoard=null,streamTimer=null;
  const empty=()=>({version:1,startedAt:null,days:{},boards:{},manual:{}});
  function load(){try{const value=JSON.parse(storage.getItem(storageKey));return value?.version===1&&[value.days,value.boards,value.manual].every(x=>x&&typeof x==='object'&&!Array.isArray(x))?value:(fallback||empty())}catch{return fallback||empty()}}
  function persist(value){fallback=value;try{storage.setItem(storageKey,JSON.stringify(value))}catch{/* observations never break saves */}}
  function change(fn){if(!enabled())return;const value=load();value.startedAt??=now();fn(value);
   const days=Object.keys(value.days).sort();for(const day of days.slice(0,-62))delete value.days[day];persist(value)}
  const classify=input=>{
   try{const url=new URL(typeof input==='string'?input:input.url);
    if(firebaseURL&&url.origin===new URL(firebaseURL).origin)return 'firebase';
    if(cloudflareURL&&url.origin===new URL(cloudflareURL).origin)return 'cloudflare';
   }catch{}return null;
  };
  function activity(row,key){
   const boards=row.boardActivity??={};return boards[key]??={changes:0,firebase:meter(),cloudflare:meter()};
  }
  function counter(provider,context,fn){change(value=>{
   const day=utcDay(now()),row=value.days[day]??={};
   fn(row[provider]??=meter());
   if(context)fn(activity(row,context.key)[provider]);
  })}
  function requestContext(input,provider){
   try{
    const url=new URL(typeof input==='string'?input:input.url),path=decodeURIComponent(url.pathname);
    if(provider==='firebase'){
     const own=path.match(/^\/docs\/(boards\/[A-Za-z0-9_-]{1,120})\.json$/);
     if(own)return {key:own[1],kind:'board'};
     const registered=boardPaths.get(path);if(registered)return registered.context;
     if(activeBoard&&(/^\/img\/[^/]+\.json$/.test(path)||activeBoard.assets&&path.startsWith(activeBoard.assets)&&path.endsWith('.json')))
      return {key:activeBoard.key,kind:'media'};
    }else if(provider==='cloudflare'){
     const doc=path.match(/^\/v1\/docs\/(boards\/[A-Za-z0-9_-]{1,120})$/);
     if(doc)return {key:doc[1],kind:'board'};
    }
   }catch{}return null;
  }
  function trackBoard(key,shareToken=null){
   if(!validBoard(key)||!enabled())return ()=>{};
   const paths=[['/rooms/b-'+key.slice(7)+'.json','signals']];
   if(/^[a-f0-9]{48}$/.test(shareToken||''))paths.push(['/shares/'+shareToken+'/board.json','board'],['/shares/'+shareToken+'/room.json','signals']);
   const handle={};activeBoard={handle,key,assets:shareToken?'/shares/'+shareToken+'/assets/':null};
   for(const [path,kind] of paths)boardPaths.set(path,{handle,context:{key,kind}});
   return ()=>{flushStreams();for(const [path] of paths)if(boardPaths.get(path)?.handle===handle)boardPaths.delete(path);if(activeBoard?.handle===handle)activeBoard=null;actionBursts.delete(key)};
  }
  function recordAction(key){
   if(!enabled()||!validBoard(key))return;
   const time=now(),prior=actionBursts.get(key);actionBursts.set(key,time);
   if(prior!==undefined&&time-prior>=0&&time-prior<1200&&utcDay(prior)===utcDay(time))return;
   change(state=>{const row=state.days[utcDay(time)]??={};activity(row,key).changes++});
  }
  function recordStream(key,data){
   if(!enabled()||!validBoard(key)||typeof data!=='string')return;
   const size=new TextEncoder().encode(data).byteLength;
   const day=utcDay(now()),id=day+'|'+key,entry=streamPending.get(id)||{day,key,bytes:0,events:0};
   entry.bytes+=size;entry.events++;streamPending.set(id,entry);
   if(streamTimer===null)streamTimer=setTimeout(flushStreams,1000);
  }
  function flushStreams(){
   clearTimeout(streamTimer);streamTimer=null;if(!streamPending.size)return;
   const entries=[...streamPending.values()];streamPending.clear();
   change(state=>{for(const entry of entries){const row=state.days[entry.day]??={};
    for(const m of [row.firebase??=meter(),activity(row,entry.key).firebase]){
     m.sseBytes=(m.sseBytes||0)+entry.bytes;m.sseEvents=(m.sseEvents||0)+entry.events;
    }
   }});
  }
  function bodySize(body){
   if(body==null)return 0;if(typeof body==='string')return new TextEncoder().encode(body).byteLength;
   if(Number.isFinite(body.size))return body.size;if(Number.isFinite(body.byteLength))return body.byteLength;
   return 0;
  }
  async function observe(fetchImpl,input,init){
   const provider=enabled()?classify(input):null;
   if(!provider)return fetchImpl(input,init);
   const context=requestContext(input,provider),method=String(init?.method||input?.method||'GET').toUpperCase();
   const write=['POST','PUT','PATCH','DELETE'].includes(method);
   counter(provider,context,m=>{m.requests++;m.uploadBytes+=bodySize(init?.body);if(write)m.writes=(m.writes||0)+1});
   try{
    const response=await fetchImpl(input,init);
    counter(provider,context,m=>{
     if(!response.ok)m.failed++;
     if(response.ok&&context?.kind==='board'&&['PUT','PATCH'].includes(method))m.savedBoards=(m.savedBoards||0)+1;
     const raw=response.headers?.get('content-length');
     const length=raw!==null&&raw!==undefined&&raw!==''?Number(raw):NaN;
     if(Number.isFinite(length)&&length>=0)m.knownResponseBytes+=length;else m.unknownResponses++;
    });return response;
   }catch(error){counter(provider,context,m=>{m.failed++;m.unknownResponses++});throw error}
  }
  function recordBoard(key,value,extra={}){
   if(!/^boards\/[A-Za-z0-9_-]{1,120}$/.test(key)||!value)return;
   change(state=>{state.boards[key]={...boardSummary(value),source:extra.source||'unknown',
    pending:!!extra.pending,conflict:!!extra.conflict,mirrored:extra.mirrored===true,updatedAt:now()}});
  }
  function recordSummary(key,info){
   if(!/^boards\/[A-Za-z0-9_-]{1,120}$/.test(key)||!Number.isFinite(info.bytes)||info.bytes<0)return;
   change(state=>{state.boards[key]={bytes:info.bytes,embedded:!!info.embedded,
    eligible:info.bytes<=LIMITS.boardBytes&&!info.embedded,source:info.source,
    pending:!!info.pending,conflict:!!info.conflict,mirrored:info.mirrored===true,updatedAt:now()}});
  }
  function setManual(id,value,period){
   if(!/^[a-zA-Z][a-zA-Z0-9]*$/.test(id)||!Number.isFinite(value)||value<0)throw Error('Введите неотрицательное число');
   flushStreams();change(state=>{state.manual[id]={value,period,updatedAt:now()};
    if(id==='firebaseDownloads')state.manual[id].baseline={month:period,...receivedInMonth(state,period)};
   });
  }
  function snapshot(){flushStreams();return JSON.parse(JSON.stringify(load()))}
  function importSnapshot(raw){
   const reading=parseSnapshot(raw);if(!reading)throw Error('Некорректные показания');
   flushStreams();change(state=>{
    for(const [id,value,period] of [['firebaseStorage',reading.storage,'current'],
     ['firebaseDownloads',reading.downloads,reading.month],['firebaseConnections',reading.connections,'instant']])
     state.manual[id]={value,period,updatedAt:now(),source:'screenshot',snapshot:true};
    state.manual.firebaseDownloads.baseline={month:reading.month,...receivedInMonth(state,reading.month)};
   });
  }
  return {observe,recordBoard,recordSummary,setManual,snapshot,classify,importSnapshot,trackBoard,recordAction,recordStream,flush:flushStreams,
   clearManual:id=>change(state=>{delete state.manual[id]}),
   reset:()=>{if(enabled()){clearTimeout(streamTimer);streamTimer=null;streamPending.clear();actionBursts.clear();persist(empty())}}};
 }
 const api={LIMITS,boardSummary,quotaStatus,utcDay,bytes,create,parseSnapshot,downloadEstimate};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.AspaceUsage=api;
})(typeof window==='object'?window:globalThis);
