import test from 'node:test';
import assert from 'node:assert/strict';
import {handleYonote,isYonoteUrl} from '../yonote.js';
const id='11111111-2222-3333-4444-555555555555';
function setup({owner=true,shared=false,revoked=false,workspace='https://school.yonote.ru/home',secret=true}={}){
 const calls=[];let failure=false;
 const env={OWNER_UID:'owner',YONOTE_API_TOKEN:secret?'private-test-token':undefined,DB:{prepare(){return {bind(){return this},async first(){return shared&&!revoked?{payload:JSON.stringify({siteUrl:workspace})}:null}}}}};
 const deps={requireOwner:async()=>owner?'owner':null,shareTokenHash:async token=>token==='capability'?'hashed':null,json:(value,status=200)=>new Response(JSON.stringify(value),{status}),fetchImpl:async(url,init)=>{
  calls.push({url,init});if(failure)return new Response('private-test-token',{status:401});
  const method=url.split('/').at(-1);return Response.json(method==='auth.info'?{data:{team:{url:'https://school.yonote.ru'}}}:method==='documents.list'?{data:[{id,title:'Lesson',text:'Not sent in listing',url:'/doc/lesson',parentDocumentId:null}],pagination:{nextPath:'https://evil.example/never-follow'}}:{data:{id,title:'Lesson',text:'# Hello',url:'/doc/lesson'}});
 }};
 return {calls,fail(){failure=true},async request(path='/v1/yonote/documents',options={}){return handleYonote(new Request('https://bridge.test'+path,{headers:shared?{'X-Aspace-Share-Token':'capability'}:{},...options}),env,deps)}};
}
test('Yonote list is read-only, paginated and never exposes provider credentials or page bodies',async()=>{
 const s=setup(),r=await s.request('/v1/yonote/documents?offset=100'),body=await r.text();assert.equal(r.status,200);assert.ok(!body.includes('private-test-token'));assert.ok(!body.includes('Not sent in listing'));assert.equal(JSON.parse(body).nextOffset,101);
 assert.deepEqual(JSON.parse(s.calls[1].init.body),{limit:100,offset:100,sort:'title',direction:'ASC'});
 for(const call of s.calls){assert.ok(call.url.startsWith('https://app.yonote.ru/api/'));assert.equal(call.init.redirect,'error');assert.equal(call.init.headers.Authorization,'Bearer private-test-token')}
 assert.equal((await s.request('/v1/yonote/documents',{method:'POST'})).status,405);
});
test('unauthenticated and revoked students cannot read the library or call provider',async()=>{
 for(const options of [{owner:false},{owner:false,shared:true,revoked:true}]){const s=setup(options);assert.ok([401,403].includes((await s.request()).status));assert.equal(s.calls.length,0)}
});
test('student access requires this workspace on the shared board',async()=>{
 const valid=setup({owner:false,shared:true});assert.equal((await valid.request()).status,200);
 const absent=setup({owner:false,shared:true,workspace:''});assert.equal((await absent.request()).status,403);assert.equal(absent.calls.length,0);
 const wrong=setup({owner:false,shared:true,workspace:'https://other.yonote.ru'});assert.equal((await wrong.request()).status,403);assert.equal(wrong.calls.length,1);
});
test('missing key and provider errors fail without leaking secrets',async()=>{
 const s=setup({secret:false});assert.equal((await s.request()).status,503);assert.equal(s.calls.length,0);
 const fail=setup();fail.fail();const r=await fail.request();assert.equal(r.status,502);assert.ok(!(await r.text()).includes('private-test-token'));
});
test('document IDs, page offsets and URLs are bounded',async()=>{
 const s=setup();assert.equal((await s.request('/v1/yonote/documents?offset=-1')).status,400);assert.equal((await s.request('/v1/yonote/document?id=bad')).status,400);
 const r=await s.request('/v1/yonote/document?id='+id);assert.equal(r.status,200);assert.equal((await r.json()).document.text,'# Hello');
 for(const url of ['http://school.yonote.ru','https://school.yonote.ru.evil.test','https://school.yonote.ru@evil.test','javascript:alert(1)'])assert.equal(isYonoteUrl(url),false);
});
