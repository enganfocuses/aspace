import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('  const saveSharedDraft=async(data,epoch=editEpoch)=>{');
const end=html.indexOf('  const queueSharedDraft=',start);
assert.ok(start>0&&end>start);
const definition=html.slice(start,end);
const base={name:'Lesson',items:[],strokes:[]};
const next={...base,name:'Updated'};
function setup(result){
 const writes=[],applied=[],messages=[];
 const transport={write:async(value,options)=>{writes.push({value,options});return result}};
 const save=new Function('boardTransport','displayedBase','cloneBoard','applySnapshot','say',
  'let disposed=false,guest=false,editEpoch=1,savedEpoch=0,unsyncedShareDraft=false,roomWarning="";\n'+definition+'\nreturn saveSharedDraft;')(
   transport,base,structuredClone,x=>applied.push(x),x=>messages.push(x));
 return {save,writes,applied,messages};
}
test('UI submits the displayed ancestor to the canonical shared transport',async()=>{
 const s=setup({value:next,source:'firebase',pending:false});await s.save(next);
 assert.deepEqual(s.writes[0].options.base,base);assert.deepEqual(s.applied[0],next);
});
test('UI keeps a conflict draft visible instead of replacing it with another version',async()=>{
 const s=setup({value:base,source:'local',pending:true,conflict:true});await s.save(next);
 assert.equal(s.applied.length,0);assert.match(s.messages.at(-1),/Конфликт/);
});
test('UI distinguishes a reserve save from a confirmed Firebase save',async()=>{
 const s=setup({value:next,source:'cloudflare',pending:true});await s.save(next);
 assert.match(s.messages.at(-1),/резерве/);
});
