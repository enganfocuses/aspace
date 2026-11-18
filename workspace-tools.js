// Owner workspace views share the shell's local database and theme.
function linkedWorkspacePanel(kind){
  const calendar=kind==='calendar', key='aspace:'+currentUser.uid+':'+kind;
  const input=E('input',{type:'url',placeholder:calendar?'Ссылка для встраивания Яндекс Календаря':'Ссылка на Google Документ',ariaLabel:calendar?'Адрес календаря':'Адрес документа'});
  const preview=E('div'),status=E('small',{role:'status'});
  function display(raw){
    preview.replaceChildren();if(!raw)return;
    const url=new URL(raw);
    if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('Нужна ссылка HTTPS.');
    let src;
    if(calendar&&['calendar.yandex.ru','calendar.yandex.com','calendar.yandex.by'].includes(url.hostname))src=url.href;
    if(!calendar&&url.hostname==='docs.google.com'){
      const match=url.pathname.match(/^\/document\/d\/(e\/)?([\w-]+)(?:\/|$)/);
      if(match){url.pathname='/document/d/'+(match[1]||'')+match[2]+'/'+(match[1]?'pub':'preview');src=url.href}
    }
    if(!src)throw Error(calendar?'Вставь ссылку из настроек доступа Яндекс Календаря.':'Вставь ссылку на документ из docs.google.com.');
    preview.append(E('a',{href:raw,target:'_blank',rel:'noopener noreferrer',textContent:calendar?'Открыть календарь ↗':'Редактировать в Google Документах ↗'}),E('iframe',{className:'workspace-preview',src,title:calendar?'Мой календарь':'Google Документ',referrerPolicy:'no-referrer',loading:'lazy'}));
    if(!calendar){
      const docUrl=new URL(src);
      const localKey=key+':text:'+docUrl.pathname;
      const offline=E('details',{},E('summary',{textContent:'Копия текста на устройстве'})),text=E('pre',{style:'white-space:pre-wrap;overflow-wrap:anywhere'});
      offline.append(text);preview.append(offline);
      async function refresh(){
        try{
          const published=docUrl.pathname.endsWith('/pub');
          const exportUrl=new URL(docUrl);
          if(!published){exportUrl.pathname=docUrl.pathname.replace(/preview$/,'export');exportUrl.searchParams.set('format','txt')}
          const response=await fetch(exportUrl.href,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
          if(!response.ok||!response.url.startsWith('https://docs.google.com/')&& !response.headers.get('content-type')?.includes('text/plain'))throw Error();
          const type=response.headers.get('content-type')||'';
          if(!published&&!type.includes('text/plain'))throw Error();
          let value=await response.text();
          if(published){
            const doc=new DOMParser().parseFromString(value,'text/html'),body=doc.querySelector('#contents,.doc-content');
            if(!body)throw Error();
            value=[...body.querySelectorAll('p,h1,h2,h3,li')].map(el=>el.textContent).join('\n')||body.textContent;
          }
          await localPut('docs',{key:localKey,value});text.textContent=value;status.textContent='Копия документа обновлена на устройстве';
        }catch{status.textContent='Для обновления копии нужен интернет и доступ к тексту по ссылке. Личные черновики сохраняются отдельно.'}
      }
      const refreshButton=B('Обновить копию из Google',refresh);offline.append(refreshButton);
      localGet('docs',localKey).then(saved=>{text.textContent=saved?.value||'Копии на этом устройстве пока нет.'}).catch(()=>{text.textContent='Хранилище недоступно.'});
    }
  }
  input.value=localStorage.getItem(key)||'';
  try{display(input.value)}catch(error){status.textContent=error.message}
  return E('section',{className:'card'},E('h3',{textContent:calendar?'Мой календарь':'Google Документ'}),E('div',{className:'row'},input,B('Сохранить ссылку',()=>{
    try{const raw=input.value.trim();display(raw);localStorage.setItem(key,raw);status.textContent=raw?'Ссылка сохранена':'Ссылка удалена'}catch(error){status.textContent=error.message}
  })),status,preview);
}
function contentView(m){
  history.replaceState(null,'',location.pathname+location.search+'#content');
  const prefix='aspace:content:'+currentUser.uid+':';
  const platforms=['YouTube','RuTube','Instagram','Telegram','ВКонтакте','MAX'];
  const section=E('section',{className:'content-studio'}),list=E('div',{className:'content-plan'}),editor=E('div',{className:'card content-editor'}),status=E('small',{role:'status'});
  let entry=null,photoUrl='';
  const records=new Map();
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key?.startsWith(prefix)){const record=JSON.parse(localStorage.getItem(key));records.set(record.id,record)}
  }
  function release(){if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=''}
  cleanup=release;
  function listPlan(){
    list.replaceChildren();
    for(const item of [...records.values()].sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||b.created-a.created)){
      const button=E('button',{className:'content-entry',onclick:()=>edit(item)},E('strong',{textContent:item.title||'Без названия'}),E('small',{textContent:[item.kind,item.date,...item.platforms].filter(Boolean).join(' · ')}));
      button.setAttribute('aria-pressed',String(entry===item));list.append(button);
    }
  }
  function store(){
    try{localStorage.setItem(prefix+entry.id,JSON.stringify(entry));records.set(entry.id,entry);status.textContent='Сохранено на устройстве';listPlan()}
    catch(error){status.textContent='Ошибка записи на устройстве: '+error.message}
  }
  function edit(item){
    release();entry=item;listPlan();editor.replaceChildren();
    function field(label,key,node){
      node.value=item[key]||'';node.oninput=()=>{item[key]=node.value;store()};return E('label',{},label,node);
    }
    const kind=E('select',{},...['Идея','Пост','Видео'].map(textContent=>E('option',{textContent})));
    const targets=E('fieldset',{},E('legend',{textContent:'Куда опубликовать'}));
    for(const name of platforms){
      const box=E('input',{type:'checkbox',checked:item.platforms.includes(name),onchange:()=>{
        item.platforms=box.checked?[...item.platforms,name]:item.platforms.filter(p=>p!==name);store()
      }});targets.append(E('label',{},box,name));
    }
    const photo=E('img',{alt:'Скрин видео',hidden:true}),file=E('input',{type:'file',accept:'image/*'});
    const assetKey=prefix+item.id+':photo';
    function show(blob){if(entry!==item||!photo.isConnected)return;release();photoUrl=URL.createObjectURL(blob);photo.src=photoUrl;photo.hidden=false}
    file.onchange=async()=>{const blob=file.files[0];if(!blob)return;try{await localPut('assets',{key:assetKey,value:blob});show(blob);status.textContent='Скрин сохранён на устройстве'}catch(error){status.textContent=error.message}};
    editor.append(field('Название','title',E('input')),field('Формат','kind',kind),field('Дата публикации','date',E('input',{type:'date'})),field('Идея или текст','text',E('textarea',{rows:9})),targets,E('label',{},'Скрин видео',file),photo,status);
    localGet('assets',assetKey).then(saved=>{if(saved?.value)show(saved.value)}).catch(error=>status.textContent=error.message);
  }
  function create(){const item={id:uid(),created:Date.now(),title:'',kind:'Идея',text:'',date:'',platforms:[]};edit(item);store();editor.querySelector('input').focus()}
  section.append(E('aside',{},E('h3',{textContent:'Контент-план'}),B('＋ Новая запись',create),list),editor);
  m.append(E('h2',{textContent:'Контент'}),section,linkedWorkspacePanel('document'));
  if(records.size)edit(records.values().next().value);else create();
}
