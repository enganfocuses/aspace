import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {LESSONS,SOURCES,VYGOTSKY} from '../psychology/course-data.mjs';
import {WORKSHEETS,CASES} from '../psychology/worksheets.mjs';
import {JournalVault,VAULT_KEY,validateEnvelope} from '../psychology/vault.mjs';
const memory=()=>{const values=new Map();return{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),values}};
const pass='fixture-only-passphrase-123';
const record=(id,secret)=>({id,type:'thought',title:'Учебная запись',fields:{situation:secret,before:'70',after:'60'},createdAt:'2026-11-09T12:00:00Z'});

test('the full course has substantial original theory, worked cases, practice and answer explanations',()=>{
 assert.equal(LESSONS.length,24);assert.equal(new Set(LESSONS.map(l=>l.id)).size,24);
 for(const l of LESSONS){assert.equal(l.sections.length,4);assert.ok(l.sections.map(x=>x[1]).join('').length>1100,l.id);assert.equal(l.example.length,4);assert.equal(l.practice.length,3);assert.equal(l.questions.length,2);for(const q of l.questions){assert.equal(q.options.length,3);assert.ok(q.answer>=0&&q.answer<3);assert.ok(q.why.length>35)}}
 assert.equal(WORKSHEETS.length,16);assert.equal(CASES.length,12);assert.equal(SOURCES.length,3);assert.equal(VYGOTSKY.chapters.length,7);
 assert.match(VYGOTSKY.reader,/^https:\/\/psychlib\.ru\//);
});
test('worksheet field identifiers are unique and personal ratings are bounded inputs rather than diagnosis scores',()=>{
 for(const w of WORKSHEETS){assert.equal(new Set(w.fields.map(f=>f.id)).size,w.fields.length);assert.ok(w.fields.length>=6);assert.ok(w.fields.every(f=>f.label))}
 const app=readFileSync(new URL('../psychology/app.mjs',import.meta.url),'utf8');assert.match(app,/type:'number',min:0,max:100/);assert.doesNotMatch(app,/innerHTML|insertAdjacentHTML|fetch\(/);
});
test('journal plaintext is encrypted at rest, credentials are absent, and reload requires the passphrase',async()=>{
 const store=memory(),vault=new JournalVault(store);await vault.create(pass);await vault.mutate(d=>d.entries.push(record('a','PRIVATE_MENTAL_HEALTH_TEXT')));
 const raw=store.getItem(VAULT_KEY);assert.ok(!raw.includes('PRIVATE_MENTAL_HEALTH_TEXT'));assert.ok(!raw.includes(pass));assert.equal(validateEnvelope(JSON.parse(raw)).v,1);
 await vault.lock();assert.equal(vault.data,null);assert.equal(vault.key,null);
 const fresh=new JournalVault(store);await assert.rejects(()=>fresh.unlock('wrong-password-123'),/Не удалось открыть/);assert.equal(fresh.open,false);await fresh.unlock(pass);assert.equal(fresh.data.entries[0].fields.situation,'PRIVATE_MENTAL_HEALTH_TEXT');
});
test('each encrypted write receives a new nonce and concurrent edits remain serialized',async()=>{
 const store=memory(),vault=new JournalVault(store);await vault.create(pass);const initial=JSON.parse(store.getItem(VAULT_KEY));
 await Promise.all([vault.mutate(d=>d.entries.push(record('a','one'))),vault.mutate(d=>d.entries.push(record('b','two')))]);
 const current=JSON.parse(store.getItem(VAULT_KEY));assert.notEqual(initial.iv,current.iv);assert.equal(vault.data.entries.length,2);
});
test('failed local writes retain the previous durable data and do not claim that a new entry saved',async()=>{
 const store=memory(),vault=new JournalVault(store);await vault.create(pass);const raw=store.getItem(VAULT_KEY);store.setItem=()=>{throw Error('QuotaExceeded')};
 await assert.rejects(()=>vault.mutate(d=>d.entries.push(record('a','not-yet-saved'))),/Не удалось сохранить/);assert.equal(store.getItem(VAULT_KEY),raw);assert.equal(vault.data.entries.length,0);
 // Recovery export must still work when localStorage is full and include the current unsaved draft.
 const backup=await vault.backup(d=>{d.drafts.thought={type:'thought',fields:{situation:'UNSAVED_RECOVERY'}}});
 const restored=new JournalVault(memory());await restored.restore(backup,pass);assert.equal(restored.data.drafts.thought.fields.situation,'UNSAVED_RECOVERY');
});
test('tampered backups and unsupported formats cannot replace an existing vault',async()=>{
 const store=memory(),vault=new JournalVault(store);await vault.create(pass);const prior=store.getItem(VAULT_KEY),backup=await vault.backup();
 const corrupted={...backup,data:(backup.data[0]==='A'?'B':'A')+backup.data.slice(1)};
 await assert.rejects(()=>vault.restore(corrupted,pass),/Не удалось открыть/);assert.equal(store.getItem(VAULT_KEY),prior);
 assert.throws(()=>validateEnvelope({...backup,iterations:1}));assert.throws(()=>validateEnvelope({...backup,iv:'a'}));
});
test('locked backup export needs no key and restores readable records only after decryption',async()=>{
 const source=new JournalVault(memory());await source.create(pass);await source.mutate(d=>d.entries.push(record('a','hello')));await source.lock();const backup=await source.backup();assert.equal(source.data,null);
 const dest=new JournalVault(memory());await dest.restore(JSON.stringify(backup),pass);assert.equal(dest.data.entries[0].fields.situation,'hello');
});
test('invalid imported field types are rejected and a too-short passphrase creates no vault',async()=>{
 const store=memory(),vault=new JournalVault(store);await assert.rejects(()=>vault.create('short'),/10 символов/);assert.equal(store.getItem(VAULT_KEY),null);
 await vault.create(pass);await assert.rejects(()=>vault.mutate(d=>d.entries.push({type:'thought',fields:{bad:{html:'x'}}})),/Некорректное поле/);assert.equal(vault.data.entries.length,0);
});
test('owner route and navigation are present while psychology records never enter board persistence',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/h==='#psychology'&&currentUser\?\.uid===CFG\.ownerUid/);
 const view=html.slice(html.indexOf('async function psychologyView('),html.indexOf('/* ---------- звонок'));
 assert.match(view,/currentUser\?\.uid!==CFG\.ownerUid/);assert.match(view,/psychology\/index.html/);assert.doesNotMatch(view,/\bload\(|\bsave\(|fetch\(/);
 const source=readFileSync(new URL('../psychology/vault.mjs',import.meta.url),'utf8');assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|firebase|sendBeacon/);
});
test('offline shell includes every psychology module and local source PDFs are not public assets',()=>{
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');for(const name of ['index.html','style.css','app.mjs','course-data.mjs','worksheets.mjs','vault.mjs']){assert.ok(sw.includes('./psychology/'+name));assert.ok(existsSync(new URL('../psychology/'+name,import.meta.url)))}
 assert.ok(!existsSync(new URL('../psychology/book-3.pdf',import.meta.url)));
});
