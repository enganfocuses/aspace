import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('queued saves retain the ancestor shown when each edit was captured',async()=>{
 const start=html.indexOf('  const queueSharedDraft=data=>{'),end=html.indexOf('  const retrySharedDraft=',start);
 const calls=[],context=vm.createContext({calls});
 vm.runInContext(`let shareSyncChain=Promise.resolve(),editEpoch=1,displayedBase={items:[{id:'a',t:'before'}]};const cloneBoard=x=>JSON.parse(JSON.stringify(x));const say=()=>{};const saveSharedDraft=async(data,epoch,base)=>calls.push({data,epoch,base});`+html.slice(start,end)+`queueSharedDraft({items:[{id:'a',t:'edit'}]});displayedBase.items[0].t='new remote revision';globalThis.done=shareSyncChain;`,context);
 await context.done;assert.equal(calls[0].base.items[0].t,'before');assert.equal(calls[0].data.items[0].t,'edit');
});
function boardstate({guest=false,pending=false,dirty=false}={}){
 const apply=[],context=vm.createContext({guest,disposed:false,unsyncedShareDraft:pending,editEpoch:dirty?1:0,savedEpoch:0,applySnapshot:state=>apply.push(state),displayedBase:{name:'confirmed'},cloneBoard:structuredClone,r:{on:(event,fn)=>{context.handler=fn}}});
 const start=html.indexOf("  r.on('boardstate',"),end=html.indexOf("\n  r.on('sp',",start);vm.runInContext(html.slice(start,end),context);context.handler({data:{state:{name:'incoming'}}});return {apply,context};
}
test('read-only students receive full realtime updates',()=>assert.equal(boardstate({guest:true}).apply.length,1));
test('broadcasts cannot replace unsaved edits or the confirmed save ancestor',()=>{
 assert.equal(boardstate({dirty:true}).apply.length,0);assert.equal(boardstate({pending:true}).apply.length,0);const clean=boardstate();assert.equal(clean.apply.length,1);assert.equal(clean.context.displayedBase.name,'confirmed');
});
