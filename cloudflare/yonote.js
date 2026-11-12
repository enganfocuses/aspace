// Read-only Yonote bridge. The provider key is a Worker secret, never a board field.
const API='https://app.yonote.ru/api/';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function isYonoteUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['yonote.ru','yonote.site','yonote.dev'].some(host=>u.hostname===host||u.hostname.endsWith('.'+host))}catch{return false}}
export async function handleYonote(request,env,{requireOwner,shareTokenHash,json,fetchImpl=fetch}){
 const url=new URL(request.url);
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 if(!['/v1/yonote/documents','/v1/yonote/document'].includes(url.pathname))return json({error:'not_found'},404);
 const owner=await requireOwner(request,env);let boardUrl='';
 if(!owner){
  const hash=await shareTokenHash(request.headers.get('X-Aspace-Share-Token')||'');
  if(!hash)return json({error:'unauthorized'},401);
  const row=await env.DB.prepare('SELECT d.payload FROM shares s JOIN docs d ON d.owner_uid = s.owner_uid AND d.doc_key = s.doc_key WHERE s.token_hash = ? AND s.revoked = 0 AND s.owner_uid = ? AND s.doc_key LIKE ?').bind(hash,env.OWNER_UID,'boards/%').first();
  if(!row)return json({error:'unauthorized'},403);
  try{boardUrl=JSON.parse(row.payload).siteUrl||''}catch{}
  if(!isYonoteUrl(boardUrl))return json({error:'yonote_not_shared_on_board'},403);
 }
 if(!env.YONOTE_API_TOKEN)return json({error:'yonote_not_configured'},503);
 const api=async(method,body={})=>{
  const response=await fetchImpl(API+method,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+env.YONOTE_API_TOKEN,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Object.assign(Error('provider_error'),{status:response.status});
  const value=await response.json();if(value.ok===false)throw Error('provider_error');return value;
 };
 try{
  const auth=await api('auth.info');const workspace=auth.data?.team?.url;
  if(!isYonoteUrl(workspace))return json({error:'yonote_workspace_invalid'},502);
  if(!owner&&new URL(boardUrl).hostname!==new URL(workspace).hostname)return json({error:'yonote_not_shared_on_board'},403);
  if(url.pathname==='/v1/yonote/documents'){
   const offset=Number(url.searchParams.get('offset')||0);
   if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return json({error:'invalid_offset'},400);
   const result=await api('documents.list',{limit:100,offset,sort:'title',direction:'ASC'});
   if(!Array.isArray(result.data))return json({error:'yonote_response_invalid'},502);
   const documents=result.data.filter(d=>UUID.test(d.id||'')).map(d=>({id:d.id,title:String(d.title||'Без названия').slice(0,500),parentId:d.parentDocumentId||null,url:documentUrl(d.url,workspace)}));
   return json({documents,workspace,nextOffset:result.pagination?.nextPath&&result.data.length?offset+result.data.length:null});
  }
  const id=url.searchParams.get('id')||'';if(!UUID.test(id))return json({error:'invalid_document_id'},400);
  const result=await api('documents.info',{id});const d=result.data;
  if(!d||d.id!==id)return json({error:'yonote_response_invalid'},502);
  return json({document:{id:d.id,title:String(d.title||'Без названия').slice(0,500),text:String(d.text||''),url:documentUrl(d.url,workspace)}});
 }catch(error){return json({error:error.status===401||error.status===403?'yonote_access_denied':'yonote_unavailable'},error.status===401||error.status===403?502:503)}
}
function documentUrl(path,workspace){try{const url=new URL(path,workspace);return url.origin===new URL(workspace).origin&&isYonoteUrl(url.href)?url.href:''}catch{return ''}}
