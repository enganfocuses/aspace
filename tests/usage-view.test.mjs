import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),api=require('../usage-tracker.js');
const source=readFileSync(new URL('../usage-view.js',import.meta.url),'utf8').replace('export async function renderUsage','async function renderUsage');

// Small DOM model for form/state regressions; no browser or network is involved.
class Element{
 constructor(tag,props={},...children){this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.isConnected=true;Object.assign(this,props);this.append(...children)}
 append(...children){this.children.push(...children)}
 replaceChildren(...children){this.children=[];this.append(...children)}
 contains(node){return this===node||this.children.some(child=>child instanceof Element&&child.contains(node))}
 addEventListener(type,handler){this.listeners[type]=handler}
}
function all(root,predicate){return [root,...root.children.filter(x=>x instanceof Element).flatMap(x=>all(x,()=>true))].filter(predicate)}
async function harness(t,{owner=true,importReading=null}={}){
 const root=new Element('main'),E=(...args)=>new Element(...args),B=(textContent,onclick)=>E('button',{textContent,onclick});
 const storage=new Map(),tracker=api.create({scope:'fixture',storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}});
 const render=new Function('window','document','navigator','location',source+'\nreturn renderUsage;')({AspaceUsage:api},{activeElement:null},{storage:{estimate:async()=>({usage:0,quota:1000})}},{origin:'https://example.test'});
 const stop=await render(root,{getOwner:()=>owner?{uid:'fixture'}:null,tracker,loadIndex:async()=>({items:[]}),cfg:{firebase:{projectId:'fixture'}},E,B,importReading});
 t.after(stop);
 return {root,tracker,form:all(root,e=>e.tagName==='FORM')[0],input:label=>all(root,e=>e.ariaLabel===label)[0]};
}
test('ordinary owner usage route exposes the import form without a special link and accepts decimal commas',async t=>{
 const h=await harness(t);assert.ok(h.form);
 assert.equal(all(h.form,e=>e.type==='submit')[0].textContent,'Импортировать 3 показания');
 h.input('Месяц скачиваний').value='2026-11';h.input('Хранение, МБ').value='2,17';
 h.input('Скачивания за месяц, МБ').value='34.56';h.input('Соединения').value='4';
 h.form.listeners.submit({preventDefault(){}});
 const saved=h.tracker.snapshot().manual;
 assert.equal(saved.firebaseStorage.value,2170000);assert.equal(saved.firebaseDownloads.value,34560000);assert.equal(saved.firebaseConnections.value,4);
 assert.match(all(h.form,e=>e.role==='status')[0].textContent,/Сохранено: 3/);
});
test('invalid or blank inputs never overwrite existing readings and refresh preserves an unfinished draft',async t=>{
 const h=await harness(t);h.tracker.setManual('firebaseDownloads',123,'2026-11');
 h.form.listeners.submit({preventDefault(){}});assert.equal(h.tracker.snapshot().manual.firebaseDownloads.value,123);
 assert.match(all(h.form,e=>e.role==='status')[0].textContent,/Заполни/);
 const input=h.input('Хранение, МБ');input.value='7,89';
 await all(h.root,e=>e.textContent==='Обновить')[0].onclick();
 assert.equal(all(h.root,e=>e.tagName==='FORM')[0],h.form);assert.equal(h.input('Хранение, МБ'),input);assert.equal(input.value,'7,89');
});
test('the import form is absent for guests and a valid import link only prefills fields until submission',async t=>{
 const guest=await harness(t,{owner:false});assert.equal(guest.form,undefined);
 const owner=await harness(t,{importReading:'2026-11,2.17,34.56,4'});
 assert.equal(owner.input('Хранение, МБ').value,'2.17');assert.equal(owner.input('Соединения').value,'4');
 assert.deepEqual(owner.tracker.snapshot().manual,{});
});
