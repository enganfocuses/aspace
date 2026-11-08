/* Local, owner-scoped observations. No request URLs, bodies, tokens or lesson text are retained. */
(function(root){
 'use strict';
 const LIMITS=Object.freeze({uploadBytes:6*1024*1024,boardBytes:700000,
  firebaseStorage:1e9,firebaseDownloads:10e9,firebaseConnections:100,
  workerRequests:100000,d1Database:500e6,d1Account:5e9,d1Reads:5e6,d1Writes:100000});
 const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).byteLength;
 const utcDay=date=>new Date(date).toISOString().slice(0,10);
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
 function create({scope,storage,now=()=>Date.now(),enabled=()=>true,
  firebaseURL,cloudflareURL}={}){
  if(!storage)try{storage=root.localStorage}catch{storage=null}
  storage??={getItem:()=>null,setItem:()=>{}};
  const storageKey='aspace-usage-v1:'+scope;
  let fallback=null;
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
  function counter(provider,fn){change(value=>{
   const day=utcDay(now()),row=value.days[day]??={};
   const meter=row[provider]??={requests:0,failed:0,uploadBytes:0,knownResponseBytes:0,unknownResponses:0};fn(meter);
  })}
  function bodySize(body){
   if(body==null)return 0;if(typeof body==='string')return new TextEncoder().encode(body).byteLength;
   if(Number.isFinite(body.size))return body.size;if(Number.isFinite(body.byteLength))return body.byteLength;
   return 0;
  }
  async function observe(fetchImpl,input,init){
   const provider=enabled()?classify(input):null;
   if(!provider)return fetchImpl(input,init);
   counter(provider,m=>{m.requests++;m.uploadBytes+=bodySize(init?.body)});
   try{
    const response=await fetchImpl(input,init);
    counter(provider,m=>{
     if(!response.ok)m.failed++;
     const raw=response.headers?.get('content-length');
     const length=raw!==null&&raw!==undefined&&raw!==''?Number(raw):NaN;
     if(Number.isFinite(length)&&length>=0)m.knownResponseBytes+=length;else m.unknownResponses++;
    });return response;
   }catch(error){counter(provider,m=>{m.failed++;m.unknownResponses++});throw error}
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
   change(state=>{state.manual[id]={value,period,updatedAt:now()}});
  }
  function snapshot(){return JSON.parse(JSON.stringify(load()))}
  return {observe,recordBoard,recordSummary,setManual,snapshot,classify,
   clearManual:id=>change(state=>{delete state.manual[id]}),
   reset:()=>{if(enabled())persist(empty())}};
 }
 const api={LIMITS,boardSummary,quotaStatus,utcDay,bytes,create};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.AspaceUsage=api;
})(typeof window==='object'?window:globalThis);
