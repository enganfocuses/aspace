import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const view=html.slice(html.indexOf('async function trainerView(m){'),html.indexOf('async function psychologyView(m){'));
function setup(user){
 function E(tag,props={},...children){return {tag,...props,children,dataset:{},attributes:{},append(...items){this.children.push(...items)},setAttribute(k,v){this.attributes[k]=v},querySelectorAll(){return this.children.filter(x=>x.dataset?.tool)}}}
 const history={replaceState(...args){this.url=args[2]}};
 const context=vm.createContext({currentUser:user,CFG:{ownerUid:'owner'},history,location:{pathname:'/aspace/',search:''},E,B:(text,onclick)=>E('button',{textContent:text,onclick})});
 vm.runInContext(view,context);return {context,history,root:E('main')};
}
test('trainer refuses anonymous and non-owner users before creating frames',async()=>{
 for(const user of [null,{uid:'guest'}]){
  const {context,root,history}=setup(user);await context.trainerView(root);
  assert.equal(root.children.length,1);assert.equal(root.children[0].tag,'p');assert.equal(history.url,undefined);
 }
});
test('trainer keeps both tool frames and entered values when switching',async()=>{
 const {context,root,history}=setup({uid:'owner'});await context.trainerView(root);
 assert.equal(history.url,'/aspace/#trainer');
 const buttons=root.children.find(x=>x.className==='row'),host=root.children.at(-1);
 assert.equal(host.children.length,1);const first=host.children[0];first.entered='unsaved';
 const tabs=buttons.querySelectorAll();tabs[1].onclick();assert.equal(host.children.length,2);assert.equal(first.hidden,true);
 assert.equal(host.children[1].src,'./trainer/issue-code.html');
 tabs[0].onclick();assert.equal(first.hidden,false);assert.equal(first.entered,'unsaved');assert.equal(host.children.length,2);
 for(const frame of host.children){assert.equal(frame.referrerPolicy,'no-referrer');assert.match(frame.attributes.sandbox,/allow-downloads/)}
});
test('standalone trainer tools have valid JavaScript',()=>{
 for(const file of ['panel.html','issue-code.html']){
  const text=fs.readFileSync(new URL('../trainer/'+file,import.meta.url),'utf8');
  for(const [,attrs,code] of text.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi))if(!attrs.includes('text/plain'))new vm.Script(code);
 }
});
