import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const from=html.indexOf('const room0=');
const to=html.indexOf('const isLocal=false;',from);
assert.ok(from>0&&to>from,'Signaling function should be in index');
const definition=html.slice(from,to);
let counter=0;
function createHarness({readStatus=200,writeStatus=200,open=true}={}){
  const sent=[],streams=[];
  class EventStream{
    constructor(url){this.url=url;this.listeners=new Map();this.closed=false;streams.push(this);
      queueMicrotask(()=>this.dispatch(open?'open':'error',{type:open?'open':'error'}));
    }
    addEventListener(type,listener){const list=this.listeners.get(type)||[];list.push(listener);this.listeners.set(type,list)}
    removeEventListener(type,listener){this.listeners.set(type,(this.listeners.get(type)||[]).filter(x=>x!==listener))}
    dispatch(type,data){for(const fn of this.listeners.get(type)||[])fn(data)}
    close(){this.closed=true}
  }
  const fetchStub=async(url,options={})=>{
    if(options.method==='POST'){
      const data=JSON.parse(options.body);sent.push(data);
      return {ok:writeStatus===200,status:writeStatus,json:async()=>({name:'k'+sent.length})};
    }
    if(options.method==='PATCH')return{ok:true,status:200};
    return {ok:readStatus===200,status:readStatus};
  };
  const listeners=new Map();
  const addEventListener=(name,fn)=>listeners.set(name,fn);
  const removeEventListener=name=>listeners.delete(name);
  const uid=()=>String(++counter);
  const room0=new Function('DB','uid','fetch','EventSource','eventUrl','addEventListener','removeEventListener','console',
      definition+'\nreturn room0;')(
        ()=> 'https://fake.firebaseio.test',uid,fetchStub,EventStream,async x=>x,
        addEventListener,removeEventListener,console);
  return {room0,sent,streams,listeners};
}

test('signaling refuses Firebase read permissions failures',async()=>{
  const app=createHarness({readStatus:403});
  await assert.rejects(()=>app.room0.join('c-test'),/доступ|403/i);
  assert.equal(app.streams.length,0);
});
test('signaling does not announce connected when write is forbidden',async()=>{
  const app=createHarness({writeStatus:403});
  await assert.rejects(()=>app.room0.join('c-test'),/права|403/i);
  assert.equal(app.streams[0]?.closed,true);
});
test('signaling enters only after stream opens and writes a readiness probe',async()=>{
  const app=createHarness();
  const room=await app.room0.join('c-test');
  assert.equal(app.sent.length,1);
  assert.equal(app.sent[0].t,'ready');
  assert.equal(await room.emit('boardnav',{boardId:'test',token:'abc'}),true);
  assert.equal(app.sent.at(-1).t,'boardnav');
  room.close();
  assert.equal(app.streams[0].closed,true);
});
test('room navigation handler can receive peer messages',async()=>{
  const app=createHarness();
  const room=await app.room0.join('c-test');
  let result=null;
  room.on('boardnav',message=>{result=message.data});
  app.streams[0].dispatch('put',{data:JSON.stringify({path:'/k3',data:{
    t:'boardnav',s:'peer',d:JSON.stringify({boardId:'demo',token:'123'})
  }})});
  assert.deepEqual(result,{boardId:'demo',token:'123'});
  room.close();
});
test('no local join-call variable shadows the global navigation function',()=>{
  const start=html.indexOf('async function roomUI(');
  const end=html.indexOf('async function callView(',start);
  const code=html.slice(start,end);
  assert.doesNotMatch(code,/const go=B\('Включить камеру/);
  assert.match(code,/const enterCall=B\('Включить камеру/);
  assert.match(code,/void \(isOwner\s*\?/);
});
test('shared drafts persist without replacing pending local edits',()=>{
  assert.match(html,/indexedDB.open\(LOCAL_DB,2\)/);
  assert.match(html,/createObjectStore\('guestDrafts'/);
  assert.match(html,/if\(got\|\|!x.data\|\|unsyncedShareDraft\)return/);
  assert.match(html,/shareSyncChain=shareSyncChain.then/);
  assert.match(html,/const boardShareToken=activeShareToken/);
});
