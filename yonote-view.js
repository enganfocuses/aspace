// Yonote is read through Aspace's authenticated server; no API key is accepted here.
export function isYonoteUrl(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&['yonote.ru','yonote.site','yonote.dev'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))}catch{return false}}
export async function renderYonote(host,{baseUrl,getIdToken,shareToken='',sourceUrl,E}){
 const stop=new AbortController();let disposed=false,documentRequest=0,documents=[];
 const sidebar=E('div',{className:'yonote-sidebar'}),search=E('input',{type:'search',placeholder:'Найти страницу…',ariaLabel:'Поиск страниц Yonote'}),list=E('div',{className:'yonote-pages'}),article=E('article',{className:'yonote-document'}),status=E('p',{className:'yonote-status',role:'status',textContent:'Загружаем страницы Yonote…'});
 sidebar.append(search,list);host.classList.add('yonote-reader');host.replaceChildren(status,sidebar,article);
 const request=async path=>{
  const headers={Accept:'application/json'};const token=await getIdToken();if(token)headers.Authorization='Bearer '+token;else if(shareToken)headers['X-Aspace-Share-Token']=shareToken;
  const response=await fetch(baseUrl.replace(/\/$/,'')+'/v1/yonote/'+path,{headers,signal:stop.signal,cache:'no-store'});let data;try{data=await response.json()}catch{throw Error('Не удалось получить материалы Yonote.')}
  if(!response.ok){const messages={yonote_not_configured:'Yonote ещё не подключён к Aspace. Подключение настраивает владелец пространства.',unauthorized:'Войди в Aspace или открой доску по действующей ссылке.',yonote_not_shared_on_board:'Материалы Yonote пока не открыты для этой доски.',yonote_access_denied:'Yonote отклонил доступ. Владельцу нужно проверить подключение.'};throw Error(messages[data.error]||'Не удалось загрузить Yonote. Попробуй ещё раз.')}
  return data;
 };
 const showError=error=>{if(!disposed&&error.name!=='AbortError')status.textContent=error.message};
 const open=async id=>{const epoch=++documentRequest;try{
  status.textContent='Открываем страницу…';const {document:d}=await request('document?id='+encodeURIComponent(id));if(disposed||epoch!==documentRequest)return;
  article.replaceChildren(E('h2',{textContent:d.title}));renderText(article,d.text,E);
  if(d.url)article.append(E('a',{href:d.url,target:'_blank',rel:'noopener noreferrer',textContent:'Открыть оригинал в Yonote'}));
  article.scrollTop=0;status.textContent='';for(const button of list.children)button.setAttribute('aria-current',button.dataset.id===id?'page':'false');
 }catch(error){if(epoch===documentRequest)showError(error)}};
 const draw=()=>{const query=search.value.trim().toLocaleLowerCase();list.replaceChildren(...documents.filter(d=>d.title.toLocaleLowerCase().includes(query)).map(d=>{const b=E('button',{textContent:d.title,onclick:()=>open(d.id),className:'yonote-page'});b.dataset.id=d.id;return b}));};
 search.oninput=draw;
 (async()=>{try{let offset=0;const seen=new Set();do{const data=await request('documents?offset='+offset);if(disposed)return;for(const d of data.documents||[])if(!seen.has(d.id)){seen.add(d.id);documents.push(d)}draw();const next=data.nextOffset;if(next===null||next===undefined)break;if(!Number.isSafeInteger(next)||next<=offset)throw Error('Yonote вернул некорректный список страниц.');offset=next;}while(true);
  status.textContent=documents.length?'':'В Yonote пока нет доступных страниц.';
  if(documents.length){const selected=documents.find(d=>{try{return new URL(d.url).pathname===new URL(sourceUrl).pathname}catch{return false}})||documents[0];await open(selected.id)}
 }catch(error){showError(error)}})();
 return ()=>{disposed=true;stop.abort()};
}
function renderText(article,text,E){
 // Raw HTML is always displayed as text, never executed.
 let code=null;
 for(const line of text.split('\n')){
  if(line.startsWith('```')){if(code){article.append(E('pre',{},E('code',{textContent:code.join('\n')})));code=null}else code=[];continue}
  if(code){code.push(line);continue}if(!line.trim())continue;
  const heading=line.match(/^(#{1,6})\s+(.+)$/);if(heading){article.append(E('h'+Math.min(6,heading[1].length+1),{textContent:heading[2]}));continue}
  const img=line.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/);if(img){try{const url=new URL(img[2]);if(url.protocol==='https:'&&!url.username&&!url.password)article.append(E('img',{src:url.href,alt:img[1],loading:'lazy',referrerPolicy:'no-referrer'}))}catch{}continue}
  article.append(E('p',{textContent:line.replace(/^[-*]\s+/,'• ')}));
 }
 if(code)article.append(E('pre',{},E('code',{textContent:code.join('\n')})));
 if(!text.trim())article.append(E('p',{textContent:'У этой страницы нет текстового содержимого. Открой оригинал для таблиц и интерактивных блоков.'}));
}
