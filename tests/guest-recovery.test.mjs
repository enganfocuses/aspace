import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('  const saveSharedDraft=async(data)=>{');
const end=html.indexOf('  const queueSharedDraft=',start);
assert.ok(start>0&&end>start);
const definition=html.slice(start,end);
const base={name:'Original',items:[],strokes:[]};
const first={...base,name:'First offline edit'};
const second={...base,name:'Second offline edit'};

function setup({etag='"1"',status=200,concurrent=false,receipt=false}={}){
 let draft={key:'token',value:first,base,pending:true,
   ...(receipt?{cloudRevision:2,cloudValue:first}:{})};
 let cloudValue=first,cloudRevision=2,cloudFail=false;
 const writes=[],messages=[];
 const localGet=async()=>structuredClone(draft);
 const localPut=async(_,v)=>{draft=structuredClone(v)};
 const localDelete=async()=>{draft=null};
 const fetch=async()=>new Response(JSON.stringify(status===200?base:{error:'Permission denied'}),
   {status,headers:etag?{etag}:{}});
 const shareWrite=async(token,part,value,method,expected)=>{
   writes.push({value,method,expected});
   if(cloudFail)throw Error('Cloudflare network unavailable');
   if(status!==200){cloudValue=structuredClone(value);return {source:'cloudflare',revision:++cloudRevision}}
   if(concurrent&&expected!==undefined)throw Error('Firebase HTTP 412');
   return {source:'firebase'};
 };
 const getGuestStandby=async()=>({read:async()=>({board:cloudValue,revision:cloudRevision})});
 const save=new Function('boardShareToken','localGet','localPut','localDelete','cloneBoard',
   'lastConfirmedShared','fetch','shareURL','guestStandbyEnabled','shareWrite','getGuestStandby','say',
   'let unsyncedShareDraft=true;\n'+definition+'\nreturn saveSharedDraft;')(
     'token',localGet,localPut,localDelete,structuredClone,base,fetch,()=>'/share',()=>true,
     shareWrite,getGuestStandby,t=>messages.push(t));
 return {save,writes,messages,draft:()=>draft,failCloud:()=>{cloudFail=true}};
}

test('guest recovery uses the ETag from the exact Firebase base read',async()=>{
 const app=setup();await app.save(second);
 assert.equal(app.writes[0].expected,'"1"');
 assert.equal(app.writes[0].method,'PUT');
 assert.equal(app.draft(),null);
});
test('an edit between Firebase read and replay retains the guest draft',async()=>{
 const app=setup({concurrent:true});await app.save(second);
 assert.deepEqual(app.draft().value,second);
 assert.equal(app.draft().pending,true);
 assert.match(app.messages.at(-1),/412/);
});
test('missing Firebase ETag blocks automatic guest replay',async()=>{
 const app=setup({etag:null});await app.save(second);
 assert.equal(app.writes.length,0);
 assert.deepEqual(app.draft().value,second);
});
test('guest replay verifies the last D1 receipt rather than a newer unsent local edit',async()=>{
 const app=setup({receipt:true});
 app.failCloud();await app.save(second);
 assert.deepEqual(app.draft().cloudValue,first);
 assert.equal(app.draft().cloudRevision,2);
 assert.deepEqual(app.draft().value,second);
});
test('explicit Firebase denial never attempts a guest standby write',async()=>{
 const app=setup({status:403});await app.save(second);
 assert.equal(app.writes.length,0);
 assert.deepEqual(app.draft().value,second);
});
