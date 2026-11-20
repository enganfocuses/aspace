/*
 * Conflict-safe three-way merge for the isolated Aspace Cloudflare prototype.
 * Deliberately conservative: edits to the same field or object are not auto-merged.
 * This is not a CRDT and cannot replace real-time collaborative editing.
 */
(function(root){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const has=(x,k)=>Object.prototype.hasOwnProperty.call(x||{},k);
 function mergeField(base,local,remote,label,conflicts){
  if(equal(local,remote))return clone(local);
  if(equal(local,base))return clone(remote);
  if(equal(remote,base))return clone(local);
  conflicts.push(label);
  return clone(local);
 }
 function mergeCollection(base,local,remote,label,conflicts){
  if(!Array.isArray(base)||!Array.isArray(local)||!Array.isArray(remote)){
   conflicts.push(label+': invalid collection');return clone(local||[]);
  }
  const toMap=(arr,name)=>{
   const result=new Map();
   for(const object of arr){
    if(!object||typeof object.id!=='string'||!object.id||result.has(object.id)){
     conflicts.push(label+': '+name+' has duplicate or missing id');
     continue;
    }
    result.set(object.id,object);
   }
   return result;
  };
  const b=toMap(base,'base'),l=toMap(local,'local'),r=toMap(remote,'remote');
  const merged=[];
  const ids=new Set([...b.keys(),...r.keys(),...l.keys()]);
  for(const id of ids){
   const be=b.has(id),le=l.has(id),re=r.has(id);
   const before=be?b.get(id):null,ours=le?l.get(id):null,theirs=re?r.get(id):null;
   const ourChange=le!==be||(le&&be&&!equal(ours,before));
   const theirChange=re!==be||(re&&be&&!equal(theirs,before));
   if(ourChange&&theirChange){
    if(le===re&&(!le||equal(ours,theirs))){
     if(le)merged.push(clone(ours));
    }else{
     conflicts.push(label+': '+id);
     if(le)merged.push(clone(ours));
    }
   }else if(ourChange){
    if(le)merged.push(clone(ours));
   }else if(re){
    merged.push(clone(theirs));
   }
  }
  return merged;
 }
 function mergeBoard(base,local,remote){
  if(!base||!local||!remote||[base,local,remote].some(x=>x.kind!=='aspace-prototype'||x.schema!==1)){
   return {ok:false,conflicts:['incompatible board schema'],value:null};
  }
  const conflicts=[];
  const value={...clone(remote),
   title:mergeField(base.title||'',local.title||'',remote.title||'','title',conflicts),
   text:mergeField(base.text||'',local.text||'',remote.text||'','text',conflicts),
   items:mergeCollection(base.items||[],local.items||[],remote.items||[],'items',conflicts),
   strokes:mergeCollection(base.strokes||[],local.strokes||[],remote.strokes||[],'strokes',conflicts)
  };
  return {ok:conflicts.length===0,conflicts,value:conflicts.length?null:value};
 }
 root.AspaceMerge=Object.freeze({mergeBoard});
})(typeof window!=='undefined'?window:globalThis);
