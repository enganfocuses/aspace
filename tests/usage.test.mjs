import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{create,LIMITS,boardSummary,quotaStatus,utcDay}=require('../usage-tracker.js');
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),data}};
const cfg={scope:'owner',firebaseURL:'https://db.example',cloudflareURL:'https://worker.example'};

test('unknown account usage never becomes zero remaining or a reassuring percentage',()=>{
 for(const value of [null,undefined,NaN,-1,Infinity]){
  const state=quotaStatus(value,100);assert.equal(state.known,false);assert.equal(state.remaining,null);assert.equal(state.percent,null);
 }
 assert.equal(quotaStatus(0,100).known,true);
 assert.equal(quotaStatus(0,100).remaining,100);
});
test('warnings and remaining values respect actual limits including overages',()=>{
 assert.equal(quotaStatus(79,100).level,'ok');assert.equal(quotaStatus(80,100).level,'warning');
 assert.equal(quotaStatus(100,100).level,'full');assert.equal(quotaStatus(110,100).remaining,0);
});
test('byte size uses UTF-8 and flags embedded media separately from external references',()=>{
 const plain={name:'Урок',items:[],strokes:[]};
 assert.equal(boardSummary(plain).bytes,new TextEncoder().encode(JSON.stringify(plain)).length);
 assert.equal(boardSummary({...plain,items:[{u:'img:file-id'}]}).eligible,true);
 assert.equal(boardSummary({...plain,items:[{u:'data:audio/mp3;base64,abcd'}]}).eligible,false);
 assert.equal(boardSummary({...plain,items:[{u:'https://example.com/a.mp3'}]}).eligible,true);
 assert.equal(boardSummary({...plain,name:'x'.repeat(LIMITS.boardBytes)}).eligible,false);
});
test('observations count own service requests without persisting any token, URL or lesson content',async()=>{
 const storage=memory(),tracker=create({...cfg,storage,now:()=>Date.parse('2026-11-08T20:30:00Z')});
 const response=new Response('{}',{headers:{'Content-Length':'2'}});
 const result=await tracker.observe(async()=>response,'https://db.example/docs/boards/secret-board.json?auth=SECRET_TOKEN',
  {method:'PUT',body:'{"j":"PRIVATE_LESSON_TEXT"}'});
 assert.equal(result,response);
 const state=tracker.snapshot(),row=state.days['2026-11-08'].firebase;
 assert.equal(row.requests,1);assert.equal(row.knownResponseBytes,2);
 assert.equal(row.uploadBytes,new TextEncoder().encode('{"j":"PRIVATE_LESSON_TEXT"}').length);
 const stored=[...storage.data.values()].join();
 for(const secret of ['SECRET_TOKEN','secret-board','PRIVATE_LESSON_TEXT','https://db.example'])assert.equal(stored.includes(secret),false);
});
test('unknown response length stays explicitly unmeasured instead of zero download claims',async()=>{
 const tracker=create({...cfg,storage:memory()});
 await tracker.observe(async()=>new Response('{}'),'https://worker.example/v1/docs/a');
 const row=tracker.snapshot().days[utcDay(Date.now())].cloudflare;
 assert.equal(row.unknownResponses,1);assert.equal(row.knownResponseBytes,0);
});
test('telemetry preserves failed fetch behavior and records only an aggregate failure',async()=>{
 const tracker=create({...cfg,storage:memory()}),error=new TypeError('secret network detail');
 await assert.rejects(()=>tracker.observe(async()=>{throw error},'https://worker.example/v1/docs/a'),e=>e===error);
 const row=tracker.snapshot().days[utcDay(Date.now())].cloudflare;
 assert.equal(row.requests,1);assert.equal(row.failed,1);
 assert.equal(JSON.stringify(tracker.snapshot()).includes('secret network detail'),false);
});
test('a denied request is counted, while unrelated origins and guest sessions are not observed',async()=>{
 const storage=memory(),tracker=create({...cfg,storage});
 await tracker.observe(async()=>new Response('denied',{status:403}),'https://db.example/docs/a');
 await tracker.observe(async()=>new Response('ok'),'https://unrelated.example/docs/a');
 assert.equal(tracker.snapshot().days[utcDay(Date.now())].firebase.requests,1);
 const guest=create({...cfg,scope:'guest',storage,enabled:()=>false});
 await guest.observe(async()=>new Response('ok'),'https://db.example/docs/a');
 assert.equal(guest.snapshot().startedAt,null);
});
test('storage denial never breaks saving and in-memory observations remain available',async()=>{
 const tracker=create({...cfg,storage:{getItem(){throw Error('disabled')},setItem(){throw Error('full')}}});
 await tracker.observe(async()=>new Response('ok'),'https://db.example/docs/a');
 assert.equal(tracker.snapshot().days[utcDay(Date.now())].firebase.requests,1);
});
test('daily counters use UTC boundaries and manual observations retain their period',async()=>{
 let clock=Date.parse('2026-11-08T23:59:59Z');
 const tracker=create({...cfg,storage:memory(),now:()=>clock});
 await tracker.observe(async()=>new Response('ok'),'https://worker.example/a');clock+=2000;
 await tracker.observe(async()=>new Response('ok'),'https://worker.example/b');
 const state=tracker.snapshot();assert.equal(state.days['2026-11-08'].cloudflare.requests,1);
 assert.equal(state.days['2026-11-09'].cloudflare.requests,1);
 tracker.setManual('workerRequests',0,'2026-11-09');assert.equal(tracker.snapshot().manual.workerRequests.value,0);
 assert.equal(tracker.snapshot().manual.workerRequests.period,'2026-11-09');
 assert.throws(()=>tracker.setManual('workerRequests',-1,'2026-11-09'));
});
test('owner usage screen is guarded and file picker matches the actual six-MiB upload limit',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/const MAX_UPLOAD_BYTES=6\*1024\*1024/);assert.match(html,/const FREE_MEDIA_LIMIT=MAX_UPLOAD_BYTES/);
 const view=html.slice(html.indexOf('async function usageView('),html.indexOf('/* ---------- звонок'));
 assert.match(view,/currentUser\?\.uid!==CFG\.ownerUid/);
 assert.match(html,/h==='#usage'&&currentUser\?\.uid===CFG\.ownerUid/);
 assert.doesNotMatch(html,/больше 300 МБ/);
});
