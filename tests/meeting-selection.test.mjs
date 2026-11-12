import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('  const meetingServices='),html.indexOf("  const videoOptions=E('div'"));
function setup(board={}){
 const d={entryCall:'aspace',...board},answers=[],messages=[];let saves=0,prompts=0;
 const context=vm.createContext({URL,d,isOwner:true,prompt:()=>{prompts++;return answers.shift()??null},say:s=>messages.push(s),persist:()=>saves++,updateEmptyVideo:()=>{},
 E:(tag,props={})=>({...props,style:{},replaceChildren(...options){this.options=options}}),B:()=>({style:{}})});
 vm.runInContext(source+';refreshMeetings();globalThis.selector=defaultCall;globalThis.selected=()=>entryService()?.field;',context);
 return {d,answers,messages,selector:context.selector,select(value){context.selector.value=value;context.selector.onchange()},get saves(){return saves},get prompts(){return prompts},selected:context.selected};
}
test('all video providers are offered before links are configured',()=>{
 const s=setup();assert.deepEqual(Array.from(s.selector.options,o=>o.value),['aspace','jazzUrl','telemostUrl']);
 assert.match(s.selector.options[1].textContent,/SaluteJazz.*добавить ссылку/);assert.equal(s.selector.value,'aspace');
});
test('selecting SaluteJazz asks for invitation, stores it and selects Jazz for student video',()=>{
 const s=setup();s.answers.push('https://salutejazz.ru/abcdef123?psw=test');s.select('jazzUrl');
 assert.equal(s.d.jazzUrl,'https://salutejazz.ru/abcdef123?psw=test');assert.equal(s.d.entryCall,'jazzUrl');assert.equal(s.selected(),'jazzUrl');assert.ok(s.saves>0);assert.equal(s.selector.options[1].textContent,'SaluteJazz');
});
test('cancelled or invalid invitation leaves previous student channel intact',()=>{
 for(const answer of [null,'https://example.com/abcdef123','https://salutejazz.ru/settings']){
  const s=setup({entryCall:'telemostUrl',telemostUrl:'https://telemost.yandex.ru/j/123456789'});s.answers.push(answer);s.select('jazzUrl');
  assert.equal(s.d.entryCall,'telemostUrl');assert.equal(s.selector.value,'telemostUrl');assert.equal(s.saves,0);assert.equal(s.d.jazzUrl,undefined);
 }
});
test('configured providers and Aspace can be switched without prompting again',()=>{
 const s=setup({jazzUrl:'https://salutejazz.ru/abcdef123'});s.select('jazzUrl');assert.equal(s.prompts,0);assert.equal(s.selected(),'jazzUrl');s.select('aspace');assert.equal(s.d.entryCall,'aspace');assert.equal(s.selected(),undefined);
});
