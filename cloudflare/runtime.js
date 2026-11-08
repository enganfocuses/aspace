import {createLiveBoard,outage} from './live-board.js';
import {createCloudflareFallback} from './adapter.js';
import {createAspaceGuestStandby} from './guest-standby.js';
import {createIndexedDBStandbyQueue} from './queue.js';
export {mergeBoard,same} from './merge-board.js';

export function createBoardRuntime({databaseURL,baseUrl,getOwner,local,onStatus,fetchImpl=fetch}){
 const providers=new Map(),metadata=new Map();
 const ownerToken=async()=>getOwner()?.getIdToken()||null;
 const ownerCloud=createCloudflareFallback({baseUrl,getIdToken:ownerToken,fetchImpl});
 const guestCloud=createAspaceGuestStandby({baseUrl,fetchImpl});
 const queues=new Map();
 let tabScope='';
 if(!globalThis.navigator?.locks){
  tabScope=sessionStorage.getItem('aspace-sync-tab')||crypto.randomUUID().replaceAll('-','');
  sessionStorage.setItem('aspace-sync-tab',tabScope);
 }
 const digest=async token=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
 async function queueFor(token){
  const owner=getOwner();
  const scope=(owner?owner.uid:'guest_'+(await digest(token)).slice(0,32))+'_live'+(tabScope?'_'+tabScope:'');
  if(!queues.has(scope))queues.set(scope,createIndexedDBStandbyQueue({scope}));
  return {queue:queues.get(scope),scope};
 }
 async function shareMeta(token){
  if(!/^[a-f0-9]{48}$/.test(token))throw Object.assign(Error('Invalid share'),{status:404});
  const control=new AbortController(),timer=setTimeout(()=>control.abort(),8000);
  let info;
  try{
   const idToken=await ownerToken();
   const r=await fetchImpl(databaseURL.replace(/\/+$/,'')+'/shares/'+token+'/meta.json'+
    (idToken?'?auth='+encodeURIComponent(idToken):''),{cache:'no-store',referrerPolicy:'no-referrer',signal:control.signal});
   const raw=await r.text();
   if(!r.ok)throw Object.assign(Error('Firebase share HTTP '+r.status),{
    status:r.status,quota:/quota[ _-]?(?:exceeded|exhausted|limit)|resource_exhausted/i.test(raw)});
   try{info=JSON.parse(raw)}catch{throw Object.assign(Error('Invalid share metadata'),{status:422})}
   if(!info||!['editor','viewer'].includes(info.role)||!/^[A-Za-z0-9_-]{1,120}$/.test(info.boardId))
    throw Object.assign(Error('Share revoked'),{status:404});
  }catch(e){
   if(e.status!==undefined&&!outage(e))throw e;
   const snap=await guestCloud.read(token);
   info={boardId:snap.boardId,name:snap.name,role:snap.role};
  }finally{clearTimeout(timer)}
  metadata.set(token,info);return info;
 }
 async function provider(id,token=null){
  if(!/^[A-Za-z0-9_-]{1,120}$/.test(id))throw Error('Invalid board ID');
  const actor=getOwner()?.uid||'guest',cacheKey=actor+':'+(token||id);
  if(providers.has(cacheKey))return providers.get(cacheKey);
  if(!getOwner()&&!token)throw Object.assign(Error('Owner sign-in required'),{status:401});
  const {queue,scope}=await queueFor(token),key='boards/'+id;
  const own=!!getOwner();
  const cloud=own?ownerCloud:{
   async getDoc(){const snap=await guestCloud.read(token);
    if(snap.boardId!==id)throw Object.assign(Error('Share points to a different board'),{status:409});
    metadata.set(token,{...metadata.get(token),role:snap.role});
    return {value:snap.board,revision:snap.revision};
   },
   async putDoc(_,value,revision){
    if(guestCloud.current(token)?.revision!==revision)throw Object.assign(Error('Reserve changed'),{status:409});
    return guestCloud.write(token,value);
   }
  };
  const lock=fn=>globalThis.navigator?.locks
   ?navigator.locks.request('aspace-live:'+scope+':'+key,fn):fn();
  const board=createLiveBoard({key,firebaseDatabaseURL:databaseURL,
   primaryPath:token?'/shares/'+token+'/board':'/docs/'+key,wrapPrimary:!token,
   getIdToken:ownerToken,requireToken:own,cloudflare:cloud,queue,fetchImpl,
   canWrite:()=>own?!!getOwner():metadata.get(token)?.role==='editor',
   onStatus,withLock:lock});
  // Migrate the existing draft, retaining its known ancestor. An unknown legacy
  // base stays a conflict; it must never be blindly uploaded by the old queue.
  if(!await queue.get(key)){
   const legacy=token?await local.get('guestDrafts',token):null;
   const pending=own?await local.get('pending',key):null;
   const old=legacy||(pending?await local.get('docs',key):null);
   if(old?.value){
    await queue.put(key,{id:crypto.randomUUID(),value:old.value,base:old.base??null,
     cloudValue:old.cloudValue??null,cloudRevision:old.cloudRevision??null,createdAt:Date.now()});
   }
   if(legacy)await local.remove('guestDrafts',token);
   if(pending)await local.remove('pending',key);
  }
  providers.set(cacheKey,board);return board;
 }
 return {provider,shareMeta,
  async readIndex(){
   if(!getOwner())throw Object.assign(Error('Owner sign-in required'),{status:401});
   return (await ownerCloud.getDoc('meta/boards'))?.value;
  },
  async mirrorIndex(index){
   if(!getOwner()||!Array.isArray(index?.items))return;
   const value={items:index.items.map(x=>({id:x.id,name:x.name}))};
   let before;try{before=await ownerCloud.getDoc('meta/boards')}catch(e){if(e.status!==404)throw e}
   if(JSON.stringify(before?.value)===JSON.stringify(value))return;
   await ownerCloud.putDoc('meta/boards',value,before?.revision||0);
  },
  async shared(token){const info=metadata.get(token)||await shareMeta(token);return provider(info.boardId,token)},
  close(){for(const board of providers.values())board.close();providers.clear();metadata.clear()}
 };
}
