import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveBoard} from '../cloudflare/live-board.js';
import {mergeBoard,boardHash,cleanBoard} from '../cloudflare/merge-board.js';
const sample=()=>({name:'Lesson',bg:'dots',siteUrl:'',items:[
 {id:'a',k:'note',x:1,y:1,w:100,h:100,t:'A'},
 {id:'b',k:'note',x:120,y:1,w:100,h:100,t:'B'}],strokes:[]});
const edit=(b,id,text)=>({...structuredClone(b),items:b.items.map(i=>({...i,...(i.id===id?{t:text}:{})}))});
function setup({shared=true}={}){
 let live=sample(),revision=1,backup=null,offline=false,status=0,readOnly=false,lostCloud=false,lostPrimary=false;
 const writes=[],queues=[];
 const cloud={
  async getDoc(){if(!backup)throw Object.assign(Error('missing'),{status:404});return structuredClone(backup)},
  async putDoc(key,value,expected){
   if(expected!==(backup?.revision||0))throw Object.assign(Error('CAS'),{status:409});
   backup={value:structuredClone(value),revision:expected+1};
   if(lostCloud){lostCloud=false;throw new TypeError('response lost')}
   return {revision:backup.revision};
  }
 };
 const fetchImpl=async(url,init)=>{
  if(offline)throw new TypeError('offline');
  if(status)return new Response(JSON.stringify({error:status===429?'Quota exceeded':'Permission denied'}),{status});
  if(init.method==='PUT'){
   if(readOnly)return new Response('permission denied',{status:403});
   if(init.headers['if-match']!=='"'+revision+'"')return new Response('conflict',{status:412});
   const value=JSON.parse(init.body);live=shared?value:JSON.parse(value.j);revision++;
   writes.push(structuredClone(live));
   if(lostPrimary){lostPrimary=false;throw new TypeError('response lost')}
  }
  return new Response(JSON.stringify(shared?live:{j:JSON.stringify(live)}),{headers:{etag:'"'+revision+'"'}});
 };
 const create=()=>{
  const records=new Map();queues.push(records);
  const queue={get:async k=>structuredClone(records.get(k)||null),put:async(k,v)=>records.set(k,structuredClone(v)),remove:async k=>records.delete(k)};
  return createLiveBoard({key:'boards/lesson',firebaseDatabaseURL:'https://firebase.example',
   primaryPath:shared?'/shares/'+'a'.repeat(48)+'/board':'/docs/boards/lesson',wrapPrimary:!shared,
   getIdToken:async()=>shared?null:'owner-id-token',requireToken:!shared,
   cloudflare:cloud,queue,fetchImpl,canWrite:()=>!readOnly});
 };
 return {create,queues,writes,live:()=>live,backup:()=>backup,offline:x=>{offline=x},deny:x=>{status=x},
  viewer:x=>{readOnly=x},loseCloud:()=>{lostCloud=true},losePrimary:()=>{lostPrimary=true},
  changePrimary:value=>{live=structuredClone(value);revision++}};
}

test('two participants edit the same shared board through outage and safe recovery',async()=>{
 const s=setup(),owner=s.create(),guest=s.create();
 const initial=(await owner.read()).value;await guest.read();
 s.offline(true);
 assert.equal((await owner.write(edit(initial,'a','Teacher'))).source,'cloudflare');
 assert.equal((await guest.write(edit(initial,'b','Student'))).source,'cloudflare');
 assert.deepEqual(cleanBoard(s.backup().value).items.map(x=>x.t),['Teacher','Student']);
 s.offline(false);
 const restored=await owner.read();
 assert.equal(restored.source,'firebase');
 assert.deepEqual(s.live().items.map(x=>x.t),['Teacher','Student']);
 assert.equal((await guest.read()).pending,false);
 assert.equal(s.queues.every(q=>q.size===0),true);
});
test('a new participant recovers somebody else\'s reserve edits after Firebase returns',async()=>{
 const s=setup(),a=s.create();const initial=(await a.read()).value;
 s.offline(true);await a.write(edit(initial,'a','Offline teacher'));
 s.offline(false);const newcomer=s.create();
 assert.equal((await newcomer.read()).value.items[0].t,'Offline teacher');
 assert.equal(s.live().items[0].t,'Offline teacher');
});
test('same object edited by both participants remains an explicit durable conflict',async()=>{
 const s=setup(),a=s.create(),b=s.create();const base=(await a.read()).value;await b.read();
 s.offline(true);await a.write(edit(base,'a','Teacher'));
 const conflict=await b.write(edit(base,'a','Student'));
 assert.equal(conflict.conflict,true);
 assert.equal(cleanBoard(s.backup().value).items[0].t,'Teacher');
 assert.equal((await b.draft()).value.items[0].t,'Student');
});
test('repeated offline edits to the same object can recover without self-conflict',async()=>{
 const s=setup(),a=s.create();const base=(await a.read()).value;
 s.offline(true);await a.write(edit(base,'a','First'));await a.write(edit(base,'a','Second'));
 s.offline(false);assert.equal((await a.read()).value.items[0].t,'Second');
 assert.equal(s.live().items[0].t,'Second');
});
test('permission denial never switches to Cloudflare',async()=>{
 const s=setup(),a=s.create();const base=(await a.read()).value;const version=s.backup().revision;
 s.deny(403);
 await assert.rejects(()=>a.write(edit(base,'a','Denied')),e=>e.status===403);
 await assert.rejects(()=>a.read(),e=>e.status===403);
 assert.equal(s.backup().revision,version);
});
test('quota exhaustion uses the same reserve without changing the shared board path',async()=>{
 const s=setup(),a=s.create();await a.read();s.deny(429);
 assert.equal((await a.read()).source,'cloudflare');
});
test('an acknowledged-by-server but lost Cloudflare response retains a recoverable draft',async()=>{
 const s=setup(),a=s.create();const base=(await a.read()).value;
 s.offline(true);s.loseCloud();const result=await a.write(edit(base,'a','Lost receipt'));
 assert.equal(result.pending,true);assert.ok(await a.draft());
 s.offline(false);await a.read();assert.equal(s.live().items[0].t,'Lost receipt');
 assert.equal(await a.draft(),null);
});
test('a lost Firebase save response does not cause a second unconditional write',async()=>{
 const s=setup(),a=s.create();const base=(await a.read()).value;s.losePrimary();
 await assert.rejects(()=>a.write(edit(base,'a','Once')));
 assert.ok(await a.draft());await a.read();
 assert.equal(s.writes.length,1);assert.equal(await a.draft(),null);
});
test('private owner documents keep the Firebase wrapper and require an owner token',async()=>{
 const s=setup({shared:false}),a=s.create();const base=(await a.read()).value;
 const saved=await a.write(edit(base,'b','Private'));
 assert.equal(saved.source,'firebase');assert.equal(s.live().items[1].t,'Private');
});
test('a view-only participant can display reserve updates but never restore them by writing',async()=>{
 const s=setup(),a=s.create();const base=(await a.read()).value;s.offline(true);
 await a.write(edit(base,'a','Teacher'));s.offline(false);s.viewer(true);
 const viewer=s.create(),before=s.writes.length;
 assert.equal((await viewer.read()).source,'cloudflare');assert.equal(s.writes.length,before);
 await assert.rejects(()=>viewer.write(base),e=>e.status===403);
});
test('reserve metadata hashing is independent of property order and display timestamps',async()=>{
 const a=sample(),b={...a,upd:99};assert.equal(await boardHash(a),await boardHash(b));
 assert.equal(mergeBoard(a,edit(a,'a','X'),edit(a,'b','Y')).ok,true);
});
test('a partly recovered Firebase snapshot can advance to a newer descendant reserve version',async()=>{
 const s=setup(),a=s.create();const base=(await a.read()).value;
 s.offline(true);await a.write(edit(base,'a','First saved version'));
 const checkpoint=cleanBoard(s.backup().value);
 await a.write(edit(checkpoint,'b','Later student version'));
 // Firebase accepted the first recovery while a later guest edit was in flight.
 s.changePrimary(checkpoint);s.offline(false);
 const observer=s.create(),result=await observer.read();
 assert.equal(result.conflict,undefined);
 assert.deepEqual(s.live().items.map(x=>x.t),['First saved version','Later student version']);
});
test('legacy notes migrate to stable IDs in the canonical real board format',()=>{
 const raw={name:'Legacy',notes:[{x:1,y:2,t:'Old note'}],strokes:[]};
 assert.deepEqual(cleanBoard(raw),cleanBoard(raw));
 assert.equal(cleanBoard(raw).items[0].id,'legacy_note_0');
 assert.equal(cleanBoard(raw).items[0].w,170);
 assert.equal('notes' in cleanBoard(raw),false);
});
test('an explicit reviewed conflict choice resolves both services without discarding a newer draft',async()=>{
 const s=setup(),a=s.create(),b=s.create();const base=(await a.read()).value;await b.read();
 s.offline(true);await a.write(edit(base,'a','Teacher'));await b.write(edit(base,'a','Student'));
 s.offline(false);const versions=await b.inspect();
 assert.equal(versions.draft.items[0].t,'Student');assert.equal(versions.reserve.value.items[0].t,'Teacher');
 await b.resolve('local',versions);
 assert.equal(s.live().items[0].t,'Student');assert.equal(cleanBoard(s.backup().value).items[0].t,'Student');
 assert.equal(await b.draft(),null);
});
test('conflict resolution refuses a provider that changed after the user inspected it',async()=>{
 const s=setup(),a=s.create();await a.read();const versions=await a.inspect();
 s.changePrimary(edit(s.live(),'b','Newer change'));
 await assert.rejects(()=>a.resolve('reserve',versions),e=>e.status===409);
 assert.equal(s.live().items[1].t,'Newer change');
});


test('concurrent edits to different fields of one board object merge without conflict',()=>{
 const base=sample();
 const local={...structuredClone(base),items:base.items.map(x=>x.id==='a'?{...x,x:45,y:60}:x)};
 const remote={...structuredClone(base),items:base.items.map(x=>x.id==='a'?{...x,t:'Edited text',c:'#71384f'}:x)};
 const merged=mergeBoard(base,local,remote);
 assert.equal(merged.ok,true);
 assert.deepEqual(merged.value.items[0],{...base.items[0],x:45,y:60,t:'Edited text',c:'#71384f'});
});

test('concurrent edits to the same object position remain an explicit conflict',()=>{
 const base=sample();
 const local={...structuredClone(base),items:base.items.map(x=>x.id==='a'?{...x,x:45,y:60}:x)};
 const remote={...structuredClone(base),items:base.items.map(x=>x.id==='a'?{...x,x:90,y:110}:x)};
 const merged=mergeBoard(base,local,remote);
 assert.equal(merged.ok,false);
 assert.ok(merged.conflicts.some(x=>x.includes('items:a.x')||x.includes('items:a.y')));
});
