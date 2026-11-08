// Conservative three-way merge of the real Aspace format. No prototype wrapper.
export const cleanBoard=value=>{
 if(value===null)return null;
 const out=structuredClone(value);delete out._aspaceSync;
 if(!Array.isArray(out.items)&&Array.isArray(out.notes)){
  out.items=out.notes.map((n,i)=>({...n,id:n.id||'legacy_note_'+i,k:'note',x:n.x||0,y:n.y||0,w:n.w||170,h:n.h||110}));
  delete out.notes;
 }
 return out;
};
export function stable(value){
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort()
  .filter(k=>value[k]!==undefined).map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export const same=(a,b)=>stable(a)===stable(b);
export function mergeBoard(base,local,remote){
 if(!base||!local||!remote)return {ok:false,conflicts:['unknown base']};
 const conflicts=[],out=Object.create(null);
 const field=(b,l,r,key)=>{
  if(same(l,r)||same(b,r))return structuredClone(l);
  if(same(b,l))return structuredClone(r);
  conflicts.push(key);return structuredClone(l);
 };
 const collection=(b,l,r,key)=>{
  if(![b,l,r].every(Array.isArray)){conflicts.push(key);return l||[]}
  const map=a=>new Map(a.map(x=>[x?.id,x]));
  const [bm,lm,rm]=[b,l,r].map(map);
  if([bm,lm,rm].some((m,i)=>m.has(undefined)||m.size!==[b,l,r][i].length)){
   conflicts.push(key+': ids');return l;
  }
  const result=[];
  for(const id of new Set([...rm.keys(),...lm.keys(),...bm.keys()])){
   const chosen=field(bm.get(id),lm.get(id),rm.get(id),key+':'+id);
   if(chosen!==undefined)result.push(chosen);
  }
  return result;
 };
 for(const key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
  if(key==='_aspaceSync'||key==='upd')continue;
  const chosen=['items','strokes'].includes(key)
   ?collection(base[key]||[],local[key]||[],remote[key]||[],key)
   :field(base[key],local[key],remote[key],key);
  if(chosen!==undefined)out[key]=chosen;
 }
 // upd is display metadata, not an object edit.
 out.upd=Math.max(Number(base.upd)||0,Number(local.upd)||0,Number(remote.upd)||0);
 return {ok:!conflicts.length,value:out,conflicts};
}
export async function boardHash(value){
 const logical=cleanBoard(value);if(logical)delete logical.upd;
 const bytes=new TextEncoder().encode(stable(logical));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
}
