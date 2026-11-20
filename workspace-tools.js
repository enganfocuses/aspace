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
  m.classList.add('content-workspace');
  const prefix='aspace:content:'+currentUser.uid+':';
  if(!document.getElementById('vintage-content-calendar-style')){
    const css=E('style',{id:'vintage-content-calendar-style'});
    css.textContent=`
      .vintage-content-planner{--v-wine:#642b38;--v-wine2:#7b3b49;--v-cream:#f5ecdc;--v-paper:#fbf6eb;--v-ink:#342a2a;--v-gold:#b18a55;color:var(--v-ink)}
      .vintage-content-planner{width:100%;max-width:none}
      .vintage-content-planner .content-studio{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;width:100%;max-width:none}
      .vintage-content-planner .planner-index{width:100%;min-width:0;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
      .vintage-content-planner .vintage-month-grid{width:100%;grid-template-columns:repeat(7,minmax(0,1fr));gap:0;border-top:1px solid #e4d6c9;border-left:1px solid #e4d6c9;border-radius:10px;overflow:hidden}
      .vintage-content-planner .vintage-weekday{background:#f7eee8;border-right:1px solid #e4d6c9;border-bottom:1px solid #e4d6c9;padding:11px 4px;font-size:13px}
      .vintage-content-planner .vintage-day{min-height:150px;border:0;border-right:1px solid #e4d6c9;border-bottom:1px solid #e4d6c9;border-radius:0;padding:8px;background:#fffdfa}
      .vintage-content-planner .vintage-day:nth-child(7n){border-right:0}
      .vintage-content-planner .vintage-day.outside-month{background:#f8f2ed}
      .vintage-content-planner .vintage-day-top{font-size:15px;color:#291c28}
      .vintage-content-planner .planner-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .vintage-content-planner .planner-view-tabs{display:flex;gap:4px;padding:4px;background:#f7eee8;border:1px solid #eadbd4;border-radius:12px}
      .vintage-content-planner .planner-view-tabs button{background:transparent;color:#3c2430;border:0;border-radius:9px;padding:9px 14px}
      .vintage-content-planner .planner-view-tabs button[aria-pressed=true]{background:#762d49;color:#fff}
      .vintage-content-planner .planner-utility{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .vintage-content-planner .planner-utility input{min-width:190px}
      .vintage-content-planner .planner-lower{display:grid;grid-template-columns:1.35fr 1fr 1.1fr;gap:10px;margin-top:10px}
      .vintage-content-planner .planner-lower-card{min-width:0;background:linear-gradient(145deg,#fffdfa,#fbf4ef);border:1px solid #eadbd4;border-radius:16px;padding:16px;box-shadow:0 4px 16px #4b29300a}
      .vintage-content-planner .planner-lower-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;color:#762d49;font:600 18px Georgia,serif}
      .vintage-content-planner .planner-lower-head button{background:transparent;color:#762d49;border:0;padding:3px}
      .vintage-content-planner .planner-anna-preview{display:grid;grid-template-columns:42% 1fr;gap:12px;align-items:center}
      .vintage-content-planner .planner-anna-preview img{width:100%;height:150px;object-fit:cover;border-radius:10px}
      .vintage-content-planner .planner-anna-photo{height:150px;border-radius:10px;background:linear-gradient(145deg,#ead8c8,#f7eee8);display:grid;place-items:center;color:#762d49;font:italic 17px Georgia,serif}

      .vintage-content-planner .planner-anna-preview p{margin:5px 0;color:#4a3440}
      .vintage-content-planner .planner-idea-list{list-style:none;margin:0;padding:0}
      .vintage-content-planner .planner-idea-list li{padding:7px 0;border-bottom:1px solid #eee2dc}
      .vintage-content-planner .planner-idea-list li:before{content:'•';color:#9b3156;margin-right:10px}
      .vintage-content-planner .planner-stat-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
      .vintage-content-planner .planner-stat strong{display:block;font:700 25px Georgia,serif;color:#2e2030}
      .vintage-content-planner .planner-stat small{font-size:11px;color:#75636b}
      .vintage-content-planner .planner-stat-growth{color:#178348!important}
      .vintage-content-planner .planner-mini-chart{width:100%;height:82px;margin-top:12px}
      .vintage-content-planner .planner-month-nav{border:0;margin:0;padding:0 6px}
      .vintage-content-planner .planner-index .planner-actions{display:flex;flex-wrap:wrap}
      .vintage-content-planner .content-editor{width:100%;box-sizing:border-box}
      @media(max-width:900px){.vintage-content-planner .planner-lower{grid-template-columns:1fr 1fr}.vintage-content-planner .planner-lower-card:first-child{grid-column:1/-1}}
      @media(max-width:620px){.vintage-content-planner .planner-lower{grid-template-columns:1fr}.vintage-content-planner .planner-lower-card:first-child{grid-column:auto}.vintage-content-planner .vintage-day{min-height:88px;padding:4px}.vintage-content-planner .planner-anna-preview{grid-template-columns:1fr 1.2fr}.vintage-content-planner .planner-anna-preview img{height:110px}}

      .vintage-content-planner .planner-actions{gap:8px;align-items:center}
      .vintage-content-planner .planner-actions button,.vintage-content-planner .planner-index>button{background:var(--v-wine);color:#fff;border:1px solid #4e202d;border-radius:8px}
      .vintage-content-planner .planner-actions button:hover,.vintage-content-planner .planner-index>button:hover{background:var(--v-wine2);color:#fff}
      .vintage-content-planner .planner-index{background:linear-gradient(145deg,#fffaf1,#f7efe3);border:1px solid #dfcfb8;border-radius:16px;padding:16px;box-shadow:0 7px 22px #4b29300d}
      .vintage-content-planner .planner-index input,.vintage-content-planner .planner-index select{background:#fffaf2;border-color:#d9c6a8;color:var(--v-ink);border-radius:8px}
      .planner-month-nav{display:flex;align-items:center;justify-content:center;gap:18px;padding:10px;margin:8px 0 12px;border-bottom:1px solid #ddcbb3}
      .planner-month-nav button{width:34px;height:34px;padding:0;border-radius:50%;background:#eadcc8;color:var(--v-wine);font-size:23px;line-height:1}
      .planner-month-label{text-transform:capitalize;font:600 21px Georgia,serif;color:var(--v-wine);min-width:190px;text-align:center}
      .vintage-month-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;min-width:0}
      .vintage-weekday{text-align:center;padding:8px 3px;color:#795a50;font:600 12px Georgia,serif;letter-spacing:.06em}
      .vintage-day{min-height:118px;min-width:0;padding:7px;background:linear-gradient(145deg,#fffdf7,#f7efe3);border:1px solid #e3d4c1;border-radius:9px;box-shadow:inset 0 1px 0 #fff;overflow:hidden}
      .vintage-day.outside-month{opacity:.45;background:#f1e9de}
      .vintage-day.today{border:1.5px solid #9b6b57;box-shadow:inset 0 0 0 2px #f1e2d0}
      .vintage-day-top{display:flex;justify-content:space-between;align-items:center;color:#63483f;font:600 13px Georgia,serif;margin-bottom:5px}
      .vintage-day-add{width:22px;height:22px;padding:0;border-radius:50%;background:#ead9c3;color:#693443;font-size:16px;line-height:1}
      .vintage-event{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:6px 7px;margin:4px 0;text-align:left;white-space:normal;overflow-wrap:anywhere;background:#eadfe0;color:#482d32;border:1px solid #d8c1bd;border-radius:6px;box-shadow:none;font-weight:400}
      .vintage-event:hover{background:#e4d0d0;color:#482d32}
      .vintage-event.is-scheduled{background:#e9e0cc;border-color:#d8c29a}.vintage-event.is-published{background:#dce5d9;border-color:#b6c7ad}
      .vintage-content-planner .vintage-event[data-format]{border:0;border-radius:8px;background:#f5dce2;color:#382733;padding:8px}
      .vintage-content-planner .vintage-event:is([data-format="Карусель"],[data-format="Яппинг"]){background:#e6e1f5}
      .vintage-content-planner .vintage-event:is([data-format="Видео"],[data-format="Ролик"]){background:#fae8ca}
      .vintage-event-kind{font-size:10px;color:#8a6249}.vintage-event strong{font:600 11px/1.25 Georgia,serif}.vintage-event small{font-size:9px;color:#77665b}
      .vintage-empty-mark{display:block;text-align:center;color:#cbb89e;font-size:10px;margin-top:18px}
      .vintage-empty-note{text-align:center;color:#806d5d;font:14px Georgia,serif;padding:10px}
      .vintage-content-planner .content-editor{background:#fffaf1;border-color:#dfcfb8}
      @media(max-width:760px){.vintage-planner-heading{padding:16px}.vintage-heading-art{font-size:23px;padding:0}.vintage-month-grid{gap:2px}.vintage-day{min-height:90px;padding:4px;border-radius:6px}.vintage-weekday{font-size:10px;padding:5px 0}.vintage-event{padding:4px;margin:3px 0}.vintage-event strong{font-size:10px}.vintage-event small{font-size:8px}.planner-month-label{font-size:18px;min-width:160px}}
      @media(max-width:480px){.vintage-heading-art{display:none}.vintage-day{min-height:72px}.vintage-event-kind{display:none}.vintage-event strong{font-size:9px}.vintage-day-top{font-size:11px}}

      #main.content-workspace{padding:12px clamp(8px,2vw,24px)}
      .content-workspace .anna-edition{max-width:none}
      .content-workspace .builder-tabs{padding-bottom:10px;border-bottom:2px solid #b291a1}
      .content-workspace :is(select,input[type="search"]){min-height:42px;border:2px solid #ad8396;border-radius:10px;padding:8px 10px;max-width:100%;font-size:1rem}
      .content-workspace select{padding-right:14px}
      .content-workspace .planner-filter{display:flex;gap:5px;flex-direction:column;font-size:.8rem;min-width:0}
      .content-workspace .planner-utility{flex:1;justify-content:flex-end}
      .content-workspace .planner-utility input{width:min(100%,245px);min-width:0}
      .content-workspace .planner-view-tabs{flex-wrap:wrap}
      .content-workspace .vintage-day,.content-workspace .vintage-weekday,.content-workspace .planner-lower-card,.content-workspace .anna-details{border-width:2px;border-color:#baa0a8}
      .content-workspace .vintage-day{min-height:84px}
      .content-workspace .planner-lower-head{flex-wrap:wrap}
      .content-workspace .planner-idea-list li{display:flex;border-bottom:2px solid #e0c9ce}
      .content-workspace .planner-idea-list li:before{content:none}
      .planner-idea-list button{flex:1;text-align:left;white-space:normal;overflow-wrap:anywhere}
      .content-workspace .quick-idea{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
      .content-workspace .quick-idea input{flex:1;min-width:100px}
      .content-workspace .planner-anna-photo{background:#592a40 url('./assets/home/anna-studio.webp') center/cover}
      .content-workspace .content-dialog{max-width:min(560px,calc(100vw - 20px));max-height:calc(100dvh - 28px);width:100%;box-sizing:border-box;border:2px solid #ad8396;border-radius:16px;background:var(--card,#fff9ef);color:var(--text,#342331);padding:12px}
      .content-dialog::backdrop{background:#2613248c}
      .content-dialog .content-editor{width:100%;box-sizing:border-box}
      .season-fields{display:grid;gap:8px;margin:8px 0}
      .season-fields label{display:grid;gap:4px}
      .season-fields .season-platform{display:inline-flex;align-items:center;gap:5px;margin:3px 8px 3px 0}
      .content-workspace .planner-index select{border-color:#ad8396;max-width:min(240px,100%)}
      .content-workspace .planner-utility>button,.content-workspace .quick-idea>button{background:#642b38;color:#fff;border:2px solid #642b38}
      .content-workspace .planner-lower-head,.content-workspace .planner-stat small{overflow-wrap:anywhere}
      .season-fields textarea{width:100%;box-sizing:border-box}
      @media(max-width:620px){.content-workspace .planner-utility{justify-content:flex-start}.content-workspace .vintage-day{min-height:64px}.content-workspace .vintage-event{padding:4px}}

      #main.content-workspace{--planner-wine:#642b38;--planner-beige:#f4e7d5;--planner-ink:#3f2630}
      #main.content-workspace button{background:var(--planner-beige)!important;color:var(--planner-ink)!important;border-color:#bd9fa4;box-shadow:none;transition:none}
      :root #main.workspace-view.content-workspace :is(button[aria-pressed=true],button.planner-primary,.builder-tabs button[aria-pressed=true]):not(.sw):not(.vbar button),#main.content-workspace .planner-disclosure[open]>summary{background:var(--planner-wine)!important;color:#fff!important;border-color:var(--planner-wine)}
      #main.content-workspace button small{color:inherit}
      #main.content-workspace button:focus-visible,#main.content-workspace summary:focus-visible{outline:2px solid currentColor;outline-offset:2px}
      #main.content-workspace .planner-index{background:#fffaf5;box-shadow:none;border-color:#d3bdba}
      #main.content-workspace .planner-view-tabs{background:none;border:0;padding:0}
      #main.content-workspace .planner-disclosure>summary{display:inline-block;cursor:pointer;background:var(--planner-beige);color:var(--planner-ink);border:1px solid #bd9fa4;border-radius:8px;padding:7px 10px}
      #main.content-workspace .planner-disclosure>summary::after{content:' ▾'}
      #main.content-workspace .planner-week{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:0;margin:0;border:0}
      #main.content-workspace .planner-week[hidden]{display:none}
      .planner-week>strong{font:600 20px Georgia,serif}
      .planner-agenda{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:14px;color:#3f2630}
      .planner-days,.planner-preview{min-width:0;background:#fffdf9;border:1px solid #d3bdba;border-radius:12px}
      .planner-agenda-day{padding:8px 10px;border-bottom:1px solid #e5d5cf;display:grid;grid-template-columns:minmax(64px,96px) minmax(0,1fr) auto;gap:8px;align-items:start}
      .planner-agenda-day:last-child{border-bottom:0}
      .planner-agenda-day.is-today{background:#f9f0e8}
      .planner-agenda-day>strong{padding-top:6px;text-transform:capitalize}
      .planner-agenda-day .agenda-row{display:flex;flex-direction:column;gap:5px;min-width:0}
      .planner-agenda-day .agenda-task{text-align:left;white-space:normal;overflow-wrap:anywhere;padding:6px 9px}
      .agenda-task small{display:block;margin-top:2px}
      .planner-preview{padding:16px;align-self:start}
      .planner-preview h3{color:#642b38;font:600 22px Georgia,serif;margin:4px 0 8px;overflow-wrap:anywhere}
      .planner-preview p{white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 12px}
      .planner-preview .preview-text{max-height:13rem;overflow:auto}
      .planner-move-status:empty{display:none}
      .planner-move{margin-top:12px;padding-top:12px;border-top:1px solid #e5d5cf}
      .planner-move input,.planner-move select{max-width:100%;min-width:0}
      .planner-move .planner-filter{flex:1 1 125px}
      .planner-drop-target{outline:2px dashed #642b38;outline-offset:-3px}
      .content-workspace .planner-lower .planner-disclosure>summary{margin-bottom:10px}
      @media(max-width:680px){.planner-agenda{grid-template-columns:1fr}.planner-agenda-day{grid-template-columns:64px minmax(0,1fr) auto}}
    `;
    document.head.append(css);
  }

  const platforms=['YouTube','RuTube','Instagram','Telegram','ВКонтакте','MAX'];
  const section=E('section',{className:'content-studio'}),list=E('div',{className:'content-plan'}),editor=E('div',{className:'card content-editor'}),status=E('small',{role:'status'});
  const dialog=E('dialog',{className:'content-dialog',ariaLabel:'Редактор записи'});
  dialog.append(B('Закрыть',()=>dialog.close()),editor);
  let entry=null,photoUrl='';
  const records=new Map();
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key?.startsWith(prefix)){const record=JSON.parse(localStorage.getItem(key));records.set(record.id,record)}
  }
  function release(){if(photoUrl)URL.revokeObjectURL(photoUrl);photoUrl=''}
  cleanup=release;
  const planKey='aspace:plans:'+currentUser.uid;
  const plans=JSON.parse(localStorage.getItem(planKey)||'null')||[{id:'default',name:'Мой план'}];
  const stages=['Идея','В работе','На проверке','Запланировано','Опубликовано'];
  const planSelect=E('select',{ariaLabel:'Контент-план'}),search=E('input',{type:'search',placeholder:'Найти идею или текст',ariaLabel:'Поиск записей'});
  const channel=E('select',{ariaLabel:'Площадка'},E('option',{value:'',textContent:'Все площадки'}),...platforms.map(textContent=>E('option',{textContent})));
  const stageFilter=E('select',{ariaLabel:'Статус'},E('option',{value:'',textContent:'Все статусы'}),...stages.map(textContent=>E('option',{textContent})));
  let mode='Неделя';
  const monthCursor=new Date();monthCursor.setDate(1);monthCursor.setHours(12,0,0,0);
  const monthLabel=E('strong',{className:'planner-month-label'});
  function shiftMonth(delta){monthCursor.setMonth(monthCursor.getMonth()+delta);listPlan()}
  const monthNav=E('div',{className:'planner-month-nav'},B('‹',()=>shiftMonth(-1)),monthLabel,B('›',()=>shiftMonth(1)));
  let currentPlan=plans.find(p=>p.id===localStorage.getItem(planKey+':selected'))?.id||plans[0]?.id;
  const dateString=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const monday=new Date();monday.setHours(12,0,0,0);monday.setDate(monday.getDate()-(monday.getDay()+6)%7);

  let selectedTaskId='';
  const moveStatus=E('small',{className:'planner-move-status',role:'status'});
  const weekRange=E('strong');
  function shiftWeek(days){monday.setDate(monday.getDate()+days);listPlan()}
  const weekNav=E('div',{className:'planner-week',hidden:true},B('←',()=>shiftWeek(-7)),weekRange,B('→',()=>shiftWeek(7)),B('Сегодня',()=>{monday.setTime(Date.now());monday.setDate(monday.getDate()-(monday.getDay()+6)%7);listPlan()}));
  weekNav.firstChild.title='Предыдущая неделя';weekNav.lastChild.title='Следующая неделя';
  const inPlan=()=>[...records.values()].filter(item=>(item.plan||'default')===currentPlan);
  function refreshPlans(){
    planSelect.replaceChildren(...plans.map(plan=>E('option',{value:plan.id,textContent:plan.name})));planSelect.value=currentPlan||'';
  }
  function changePlan(){
    localStorage.setItem(planKey+':selected',currentPlan||'');
    if(dialog.open)dialog.close();
    entry=null;selectedTaskId='';moveStatus.textContent='';release();editor.replaceChildren();listPlan();refreshIdeas();refreshStats();
  }
  function newPlan(){
    const name=prompt('Название контент-плана')?.trim();if(!name)return false;
    const plan={id:uid(),name};plans.push(plan);localStorage.setItem(planKey,JSON.stringify(plans));currentPlan=plan.id;refreshPlans();changePlan();return true;
  }
  function moveTask(item,patch){
    const updated={...item,...patch};
    try{
      localStorage.setItem(prefix+item.id,JSON.stringify(updated));
    }catch(error){moveStatus.textContent='Не удалось переместить запись: '+error.message;return}
    Object.assign(item,patch);
    selectedTaskId=item.id;
    moveStatus.textContent=patch.date?'Новая дата: '+new Date(patch.date+'T12:00:00').toLocaleDateString('ru')+'.':'Запись перемещена.';
    listPlan();refreshIdeas();refreshStats();
  }
  let draggingTask=null;
  function draggable(button,item){
    button.draggable=true;
    button.ondragstart=event=>{
      draggingTask=item;
      event.dataTransfer.effectAllowed='move';
      event.dataTransfer.setData('text/plain',item.title||'Запись');
    };
    button.ondragend=()=>{draggingTask=null};
    return button;
  }
  function dropTarget(node,key,value){
    node.ondragover=event=>{
      if(!draggingTask||draggingTask[key]===value)return;
      event.preventDefault();
      event.dataTransfer.dropEffect='move';
      node.classList.add('planner-drop-target');
    };
    node.ondragleave=event=>{if(!node.contains(event.relatedTarget))node.classList.remove('planner-drop-target')};
    node.ondrop=event=>{
      if(!draggingTask)return;
      event.preventDefault();
      node.classList.remove('planner-drop-target');
      const item=draggingTask;
      draggingTask=null;
      if(item[key]!==value)moveTask(item,{[key]:value});
    };
    return node;
  }
  function renderWeek(visible){
    const days=Array.from({length:7},(_,i)=>{const day=new Date(monday);day.setDate(day.getDate()+i);return dateString(day)});
    weekRange.textContent=days[0].slice(8)+'.'+days[0].slice(5,7)+' — '+days[6].slice(8)+'.'+days[6].slice(5,7);
    const weekItems=visible.filter(item=>days.includes(item.date)||!item.date);
    const selected=weekItems.find(item=>item.id===selectedTaskId)||weekItems.find(item=>item.date>=dateString(new Date()))||weekItems[0];
    const agenda=E('div',{className:'planner-days'});
    const preview=E('aside',{className:'planner-preview',ariaLabel:'Просмотр записи'});
    function show(item){
      selectedTaskId=item?.id||'';
      for(const button of agenda.querySelectorAll('.agenda-task'))button.setAttribute('aria-pressed',String(button.dataset.id===selectedTaskId));
      if(!item){preview.replaceChildren(E('p',{textContent:'Выбери запись, чтобы открыть её текст.'}));return}
      const date=E('input',{type:'date',value:item.date||''});
      const stage=E('select',{},...stages.map(textContent=>E('option',{textContent})));
      stage.value=item.stage||stages[0];
      const move=E('form',{className:'planner-actions planner-move',onsubmit:event=>{
        event.preventDefault();
        if(date.value!==item.date||stage.value!==item.stage)moveTask(item,{date:date.value,stage:stage.value});
      }},filter('Перенести на дату',date),filter('Этап',stage),E('button',{type:'submit',textContent:'Переместить'}));
      preview.replaceChildren(E('small',{textContent:[item.storyFormat||item.kind,item.stage,...item.platforms].filter(Boolean).join(' · ')}),
        E('h3',{textContent:item.title||'Без названия'}),
        E('p',{className:'preview-text',textContent:item.text||item.explanation||'Текст пока не добавлен.'}),
        B('Редактировать',()=>edit(item)),move);
    }
    for(const date of [...days,...(weekItems.some(item=>!item.date)?['']:[])]){
      const dayTasks=weekItems.filter(item=>(item.date||'')===date);
      const label=date?new Date(date+'T12:00:00').toLocaleDateString('ru',{weekday:'short',day:'numeric'}):'Без даты';
      const add=B('＋',()=>create(date));add.setAttribute('aria-label','Добавить запись: '+label);
      const rows=E('div',{className:'agenda-row'});
      for(const item of dayTasks){
        const button=draggable(B(item.title||'Без названия',()=>{
          show(item);
          if(matchMedia('(max-width:680px)').matches)preview.scrollIntoView({block:'nearest'});
        },'agenda-task'),item);
        button.dataset.id=item.id;
        const meta=[item.time,...item.platforms].filter(Boolean).join(' · ');
        if(meta)button.append(E('small',{textContent:meta}));
        rows.append(button);
      }
      const day=E('div',{className:'planner-agenda-day'+(date===dateString(new Date())?' is-today':'')},
        E('strong',{textContent:label}),rows,add);
      agenda.append(dropTarget(day,'date',date));
    }
    show(selected);
    list.append(E('div',{className:'planner-agenda'},agenda,preview));
  }
  function listPlan(){
    list.replaceChildren();
    const query=search.value.trim().toLocaleLowerCase();
    const visible=inPlan().filter(item=>(!channel.value||item.platforms.includes(channel.value))&&(!stageFilter.value||item.stage===stageFilter.value)&&[item.title,item.text].join(' ').toLocaleLowerCase().includes(query));
    const calendarMode=mode==='Календарь';
    visible.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'').localeCompare(b.time||'')||b.created-a.created);
    const gridMode=mode==='Блоки';
    section.classList.toggle('plan-wide',gridMode);
    if(gridMode){
      weekNav.hidden=monthNav.hidden=true;
      const card=item=>{
        const b=draggable(B(item.title||'Без названия',()=>edit(item),'plan-tile'),item);
        b.append(E('small',{textContent:[item.date,item.time,item.kind].filter(Boolean).join(' · ')}));b.setAttribute('aria-pressed',String(entry===item));return b;
      };
        const blocks=E('div',{className:'plan-blocks'});
        for(const stage of stages){
          const rows=visible.filter(item=>(item.stage||stages[0])===stage);
          blocks.append(dropTarget(E('section',{},E('h4',{textContent:stage+' · '+rows.length}),...rows.map(card)),'stage',stage));
        }
        list.append(blocks);
      return;
    }
    const groupName=item=>item.date||'Без даты';
    const week=mode==='Неделя';weekNav.hidden=!week;monthNav.hidden=!calendarMode;
    if(week){renderWeek(visible);return}
    if(calendarMode){
      monthLabel.textContent=monthCursor.toLocaleDateString('ru',{month:'long',year:'numeric'});
      const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
      const grid=E('div',{className:'vintage-month-grid'});
      for(const name of weekdays)grid.append(E('div',{className:'vintage-weekday',textContent:name}));
      const first=new Date(monthCursor);first.setDate(1);
      const offset=(first.getDay()+6)%7;
      const start=new Date(first);start.setDate(first.getDate()-offset);
      const daysInMonth=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
      const gridDays=Math.ceil((offset+daysInMonth)/7)*7;
      for(let i=0;i<gridDays;i++){
        const day=new Date(start);day.setDate(start.getDate()+i);
        const key=dateString(day),sameMonth=day.getMonth()===monthCursor.getMonth();
        const cell=E('div',{className:'vintage-day'+(sameMonth?'':' outside-month')+(key===dateString(new Date())?' today':'')});
        const top=E('div',{className:'vintage-day-top'},E('span',{textContent:String(day.getDate())}));
        const add=B('+',()=>create(key));add.className='vintage-day-add';add.title='Добавить публикацию';top.append(add);cell.append(top);
        const entries=visible.filter(item=>item.date===key);
        for(const item of entries){
          const chip=draggable(B(item.title||'Без названия',()=>edit(item),'vintage-event'),item);
          chip.title=[item.storyFormat||item.kind,item.time,item.stage].filter(Boolean).join(' · ');
          cell.append(chip);
        }
        grid.append(dropTarget(cell,'date',key));
      }
      list.append(grid);
      if(!visible.length)list.append(E('p',{className:'vintage-empty-note',textContent:'Пока нет публикаций. Нажми «+» в нужной дате, чтобы добавить первую.'}));
      return;
    }
    const groups=[...new Set(visible.map(groupName))];
    for(const name of groups){
      const members=visible.filter(item=>groupName(item)===name);
      const label=name!=='Без даты'?new Date(name+'T12:00:00').toLocaleDateString('ru',{weekday:'short',day:'numeric',month:'long'}):name;
      list.append(E('h4',{textContent:label+' · '+members.length}));
      for(const item of members){
        const button=E('button',{className:'content-entry',onclick:()=>edit(item)},E('strong',{textContent:item.title||'Без названия'}),E('small',{textContent:[item.kind,item.date,item.time,...item.platforms].filter(Boolean).join(' · ')}));
        button.setAttribute('aria-pressed',String(entry===item));list.append(button);
      }
    }
    if(!visible.length)list.append(E('p',{textContent:query||channel.value?'По этим условиям записей нет.':'В этом плане пока нет записей.'}));
  }
  async function exportRecords(items,name){
    try{
      const output=[];
      for(const item of items){
        const asset=await localGet('assets',prefix+item.id+':photo');
        output.push({...item,screenshot:asset?.value?await blobDataUrl(asset.value):null});
      }
      const data=new Blob([JSON.stringify({plan:name,entries:output},null,2)],{type:'application/json;charset=utf-8'});
      const url=URL.createObjectURL(data);E('a',{href:url,download:(name||'Контент-план')+'.json'}).click();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(error){alert('Не удалось скачать: '+error.message)}
  }
  async function removeItems(items){
    for(const item of items){
      await localDelete('assets',prefix+item.id+':photo');localStorage.removeItem(prefix+item.id);records.delete(item.id);
    }
  }
  async function removePlan(){
    const plan=plans.find(p=>p.id===currentPlan);if(!plan)return;
    const items=inPlan();
    if(!confirm('Удалить план «'+plan.name+'» и все его записи ('+items.length+') с устройства?'))return;
    await removeItems(items);plans.splice(plans.indexOf(plan),1);localStorage.setItem(planKey,JSON.stringify(plans));
    currentPlan=plans[0]?.id;refreshPlans();changePlan();
  }
  planSelect.onchange=()=>{currentPlan=planSelect.value;changePlan()};search.oninput=channel.onchange=stageFilter.onchange=listPlan;refreshPlans();
  function store(){
    try{localStorage.setItem(prefix+entry.id,JSON.stringify(entry));records.set(entry.id,entry);status.textContent='Сохранено на устройстве';listPlan()}
    catch(error){status.textContent='Ошибка записи на устройстве: '+error.message}
  }
  function edit(item){
    release();entry=item;selectedTaskId=item.id;listPlan();editor.replaceChildren();
    if(!dialog.open)dialog.showModal();
    function field(label,key,node){
      node.value=item[key]||(key==='stage'?stages[0]:'');node.oninput=()=>{item[key]=node.value;store()};return E('label',{},label,node);
    }
    const kind=E('select',{},...['Идея','Пост','Видео'].map(textContent=>E('option',{textContent})));
    const destination=E('select',{ariaLabel:'Перенести в план'},...plans.map(p=>E('option',{value:p.id,textContent:p.name})));
    destination.value=currentPlan;destination.onchange=()=>{item.plan=destination.value;store();currentPlan=destination.value;refreshPlans();changePlan();edit(item)};
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
    editor.append(field('Название','title',E('input')),field('Формат','kind',kind),E('div',{className:'planner-schedule'},field('Этап','stage',E('select',{},...stages.map(textContent=>E('option',{textContent})))),field('Дата публикации','date',E('input',{type:'date'})),field('Время','time',E('input',{type:'time'}))),field('Идея или текст','text',E('textarea',{rows:9})),targets,E('label',{},'Скрин видео',file),photo,...(plans.length>1?[E('label',{},'План публикации',destination)]:[]),status,E('div',{className:'planner-actions'},B('Скачать запись',()=>exportRecords([item],item.title||item.kind)),B('Удалить запись',async()=>{if(confirm('Удалить запись «'+(item.title||item.kind)+'» с устройства?')){await removeItems([item]);changePlan()}})));
    editor.append(bufferScheduler(item,prefix));
    if(item.explanation)editor.prepend(E('p',{textContent:item.explanation}));
    if(item.storyFormat)editor.append(E('details',{},E('summary',{textContent:item.storyFormat+' · '+item.rubric}),field('Съёмка','shoot',E('textarea',{rows:3})),field('Что измерить','measure',E('textarea',{rows:2})),field('Результат и следующий тест','result',E('textarea',{rows:2}))));
    localGet('assets',assetKey).then(saved=>{if(saved?.value)show(saved.value)}).catch(error=>status.textContent=error.message);
  }
  function create(date=''){if(!currentPlan&&!newPlan())return;const item={id:uid(),plan:currentPlan,stage:stages[0],created:Date.now(),title:'',kind:'Идея',text:'',date:typeof date==='string'?date:'',platforms:[]};edit(item);store();editor.querySelector('input').focus()}
  const viewTabs=E('div',{className:'planner-view-tabs'},...['Неделя','Месяц','Список','Блоки'].map((label,i)=>{const b=B(label,()=>{mode=['Неделя','Календарь','По датам','Блоки'][i];listPlan();[...viewTabs.children].forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});b.setAttribute('aria-pressed',String(i===0));return b}));
  const exportButton=B('↓ Экспорт',()=>{const plan=plans.find(p=>p.id===currentPlan);if(plan)exportRecords(inPlan(),plan.name)});
  const filter=(label,input)=>E('label',{className:'planner-filter'},label,input);
  const tools=E('details',{},E('summary',{textContent:'Действия с планом'}),E('div',{className:'planner-actions'},B('＋ Новый план',newPlan),exportButton,B('Удалить план',removePlan)));
  function createVisibleTask(){
    const today=new Date();
    const weekEnd=new Date(monday);weekEnd.setDate(weekEnd.getDate()+6);
    if(mode==='Неделя'&&(dateString(today)<dateString(monday)||dateString(today)>dateString(weekEnd)))return create(dateString(monday));
    if(mode==='Календарь'&&(today.getMonth()!==monthCursor.getMonth()||today.getFullYear()!==monthCursor.getFullYear()))return create(dateString(monthCursor));
    create(dateString(today));
  }
  const toolbar=E('div',{className:'planner-toolbar'},viewTabs,E('div',{className:'planner-utility'},search,B('＋ Запись',createVisibleTask,'planner-primary')));
  const filters=E('details',{className:'planner-disclosure'},E('summary',{textContent:'Фильтры и планы'}),
    E('div',{className:'planner-actions'},filter('План',planSelect),filter('Площадка',channel),filter('Статус',stageFilter),
      B('Сбросить фильтры',()=>{search.value=channel.value=stageFilter.value='';listPlan()}),tools));
  const annaCard=E('section',{className:'planner-lower-card'},
    E('div',{className:'planner-lower-head'},E('span',{textContent:'☆ Редакция Анны'})),
    E('div',{className:'planner-anna-preview'},E('div',{className:'planner-anna-photo'}),
      B('Открыть редакцию',()=>selectTab(editorial))));
  const ideaInput=E('input',{required:true,placeholder:'Название идеи',ariaLabel:'Название идеи'});
  const ideaForm=E('form',{className:'quick-idea',onsubmit:event=>{
    event.preventDefault();
    const title=ideaInput.value.trim();
    if(!title)return;
    if(!currentPlan&&!newPlan())return;
    const item={id:uid(),plan:currentPlan,stage:'Идея',kind:'Идея',title,text:'',date:'',platforms:[],created:Date.now()};
    try{
      localStorage.setItem(prefix+item.id,JSON.stringify(item));
      records.set(item.id,item);
      ideaInput.value='';
      ideaStatus.textContent='';
      listPlan();refreshIdeas();refreshStats();
    }catch(error){ideaStatus.textContent='Не удалось сохранить идею: '+error.message}
  }},ideaInput,E('button',{type:'submit',textContent:'＋ Добавить'}));
  const ideaStatus=E('small',{role:'status'});
  const ideaList=E('ul',{className:'planner-idea-list'});
  const ideaCard=E('section',{className:'planner-lower-card'},E('div',{className:'planner-lower-head',textContent:'Банк идей'}),ideaForm,ideaStatus,
    E('details',{className:'planner-disclosure'},E('summary',{textContent:'Открыть идеи'}),ideaList));
  function refreshIdeas(){
    const ideas=inPlan().filter(item=>item.stage==='Идея').sort((a,b)=>b.created-a.created);
    ideaList.replaceChildren(...ideas.map(item=>E('li',{},B(item.title||'Без названия',()=>edit(item)))));
    if(!ideas.length)ideaList.append(E('li',{textContent:'Здесь появятся идеи этого плана.'}));
  }
  const statsCard=E('section',{className:'planner-lower-card'},E('div',{className:'planner-lower-head'},E('span',{textContent:'▥  Статистика'}),E('small',{textContent:'За всё время'})));
  const stats=E('div',{className:'planner-stat-row'});
  const statPublished=E('strong',{textContent:'0'}),statPlanned=E('strong',{textContent:'0'}),statIdeas=E('strong',{textContent:'0'});
  for(const [num,label,cls] of [[statPublished,'Публикаций',''],[statPlanned,'Запланировано','planner-stat-growth'],[statIdeas,'Идей','']])stats.append(E('div',{className:'planner-stat'},Object.assign(E('span'),{textContent:''}),num,E('small',{textContent:label})));
  const refreshStats=()=>{const all=inPlan();statPublished.textContent=String(all.filter(x=>x.stage==='Опубликовано').length);statPlanned.textContent=String(all.filter(x=>x.stage==='Запланировано').length);statIdeas.textContent=String(all.filter(x=>x.stage==='Идея').length)};
  statsCard.append(E('details',{className:'planner-disclosure'},E('summary',{textContent:'Показать статистику'}),stats));
  const lower=E('div',{className:'planner-lower'},ideaCard,statsCard,annaCard);
  section.append(E('aside',{className:'planner-index'},toolbar,E('div',{className:'planner-toolbar'},weekNav,monthNav,filters),moveStatus,list),lower,dialog);
  const planner=E('div',{className:'vintage-content-planner'},section);
  const resources=E('div',{className:'personal-resources'}),googleDoc=linkedWorkspacePanel('document');
  const editorial=annaEditorialView(dateString(monday>=new Date()?monday:new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+7)),(start,season,seasonName,stories)=>{
    const name=seasonName+' · '+start;
    const existing=plans.find(p=>p.seasonStart===start&&(p.season||'first')===season);
    if(existing){currentPlan=existing.id}
    else{
      const plan={id:uid(),name,seasonStart:start,season},added=[];
      try{
        for(const story of stories){
          const day=new Date(start+'T12:00:00');day.setDate(day.getDate()+story.day);
          const item={id:uid(),plan:plan.id,title:story.title,kind:['Ролик','Яппинг','Видео'].includes(story.format)?'Видео':'Пост',
            stage:stages[0],date:dateString(day),time:'',created:Date.now(),platforms:[...story.channels],
            explanation:story.why,text:story.script,shoot:story.shot,measure:story.metric,rubric:story.rubric,storyFormat:story.format,goal:story.goal};
          localStorage.setItem(prefix+item.id,JSON.stringify(item));added.push(item);
        }
        localStorage.setItem(planKey,JSON.stringify([...plans,plan]));
      }catch(error){for(const item of added)localStorage.removeItem(prefix+item.id);alert('Не удалось сохранить сезон: '+error.message);return}
      plans.push(plan);for(const item of added)records.set(item.id,item);currentPlan=plan.id;
    }
    refreshPlans();monthCursor.setTime(new Date(start+'T12:00:00').getTime());monthCursor.setDate(1);mode='Календарь';search.value='';channel.value=stageFilter.value='';viewTabs.children[1].click();changePlan();selectTab(planner);
  });
  const modernCalendar=E('div',{className:'content-plan-modern',hidden:true});
  modernCalendar.style.cssText='min-width:0;width:100%;min-height:620px';
  let modernCalendarStop=()=>{};
  const tabs=E('nav',{className:'builder-tabs',ariaLabel:'Разделы контента'});
  const views=[planner,editorial,googleDoc,resources,modernCalendar];
  function selectTab(view){
    views.forEach((section,i)=>{section.hidden=section!==view;tabs.children[i].setAttribute('aria-pressed',String(section===view))});
    if(view===resources&&!resources.childElementCount)resourceEditor(resources);
    if(view===modernCalendar&&!modernCalendar.dataset.loaded){
      modernCalendar.dataset.loaded='loading';
      import('./content-plan.js?v=2').then(async module=>{
        const stop=await module.renderContentPlan(modernCalendar,{load,save});
        if(!modernCalendar.isConnected)stop();else modernCalendarStop=stop;
        modernCalendar.dataset.loaded='yes';
      }).catch(error=>{
        delete modernCalendar.dataset.loaded;
        modernCalendar.append(E('p',{className:'mut',textContent:'Не удалось открыть дополнительный календарь: '+error.message}));
      });
    }
  }
  for(const [i,title] of ['Мой контент-план','Продвижение · Редакция Анны','Google Документ','Мои ресурсы','Новый календарь'].entries())tabs.append(B(title,()=>selectTab(views[i])));
  selectTab(planner);
  m.append(tabs,...views);
  changePlan();
  const originalStore=store;
  store=function(){originalStore();refreshIdeas();refreshStats()};
  const originalRelease=release;
  cleanup=()=>{originalRelease();modernCalendarStop()};;
}

function resourceEditor(host){
  const sites=['anesterovna.ru','harizma.deploya.ru'];
  const tabs=E('div',{className:'builder-tabs',ariaLabel:'Сайты'});
  const live=E('a',{className:'resource-link',target:'_blank',rel:'noopener noreferrer'});
  const code=E('textarea',{spellcheck:false,wrap:'off',ariaLabel:'Исходный HTML'});
  const frame=E('iframe',{className:'workspace-preview',title:'Предпросмотр HTML',hidden:true,referrerPolicy:'no-referrer'});
  frame.setAttribute('sandbox','allow-scripts');
  const status=E('small',{role:'status'}),upload=E('input',{type:'file',accept:'.html,.htm'});
  let currentSite='',filename='',version=0,revision=0,edited=false;
  const key=site=>'resource-html:'+currentUser.uid+':'+site;
  const preview=B('Предпросмотр',()=>{
    const doc=new DOMParser().parseFromString(code.value,'text/html');
    if(!doc.querySelector('base[href]'))doc.head.prepend(Object.assign(doc.createElement('base'),{href:live.href}));
    frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;frame.hidden=false;
  });
  const download=B('Скачать HTML',()=>{
    const url=URL.createObjectURL(new Blob([code.value],{type:'text/html;charset=utf-8'}));
    const a=E('a',{href:url,download:filename});a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  });
  function available(ready){code.disabled=preview.disabled=download.disabled=!ready}
  async function persist(){
    const site=currentSite,rev=++revision;edited=true;status.textContent='Сохраняю…';
    try{
      await localPut('docs',{key:key(site),value:{source:code.value,filename}});
      if(site===currentSite&&rev===revision)status.textContent='Черновик сохранён на устройстве';
    }catch(error){if(site===currentSite&&rev===revision)status.textContent='Не удалось сохранить черновик. Скачай HTML: '+error.message}
  }
  async function openSite(site){
    const request=++version;currentSite=site;edited=false;revision++;available(false);
    code.value='';frame.hidden=true;frame.removeAttribute('srcdoc');
    live.href='https://'+site+'/';live.textContent='Открыть '+site+' ↗';
    for(const button of tabs.children)button.setAttribute('aria-pressed',String(button.textContent===site));
    status.textContent='Открываю HTML…';
    try{
      const draft=(await localGet('docs',key(site)))?.value;
      let source=draft?.source;
      if(typeof source!=='string'){
        const response=await fetch('./assets/resources/'+site+'.html.txt');
        if(!response.ok)throw Error('Исходник недоступен. Открой HTML с устройства.');
        source=await response.text();
      }
      if(request!==version)return;
      filename=draft?.filename||site+'.html';code.value=source;edited=!!draft;
      status.textContent=draft?'Открыт локальный черновик':'Открыта копия главной страницы';available(true);
    }catch(error){if(request===version)status.textContent=error.message}
  }
  upload.onchange=async()=>{
    const file=upload.files[0];upload.value='';if(!file)return;
    if(!/\.html?$/i.test(file.name)){status.textContent='Выбери HTML-файл';return}
    if(edited&&!confirm('Заменить черновик этого сайта выбранным файлом?'))return;
    const request=++version;
    try{
      const source=await file.text();if(request!==version)return;
      filename=file.name;code.value=source;frame.hidden=true;frame.removeAttribute('srcdoc');available(true);await persist();
    }catch(error){if(request===version)status.textContent=error.message}
  };
  code.oninput=persist;
  for(const site of sites)tabs.append(B(site,()=>{if(currentSite!==site)void openSite(site)}));
  const socials=E('nav',{className:'resource-socials',ariaLabel:'Мои соцсети'});
  const profiles=[
  [
    "Telegram",
    "https://t.me/anfocuses"
  ],
  [
    "Instagram",
    "https://www.instagram.com/annfocuses?vrfl=bjIxbDd6NWcxenJ3&utm_source=qr"
  ],
  [
    "ВКонтакте",
    "https://vk.ru/anfocuses"
  ],
  [
    "MAX",
    "https://max.ru/join/O8eqgDIWEFbaQmuAmSSV5r4e1MFffSAEBoqGVs48orc"
  ]
];
  for(const [name,href] of profiles)socials.append(E('a',{href,target:'_blank',rel:'noopener noreferrer',textContent:name+' ↗'}));
  host.append(E('section',{className:'card'},E('h3',{textContent:'Мои соцсети'}),socials));
  host.append(E('section',{className:'card resource-editor'},E('h3',{textContent:'Мои ресурсы'}),tabs,live,E('label',{},'Открыть HTML с устройства',upload),E('label',{},'Исходный HTML',code),E('div',{className:'row'},preview,download),status,frame));
  void openSite(sites[0]);
}

function bufferScheduler(item,prefix){
  const key=prefix.replace('aspace:content:','aspace:delivery:')+item.id;
  const receipt=()=>JSON.parse(localStorage.getItem(key)||'null');
  const info=E('p',{role:'status'}),target=E('select',{ariaLabel:'Канал Buffer'}),media=E('input',{type:'url',placeholder:'Публичная HTTPS-ссылка на медиа'});
  const kind=E('select',{ariaLabel:'Вложение'},...['Только текст','Изображение','Видео'].map(textContent=>E('option',{textContent})));
  const panel=E('details',{},E('summary',{textContent:'Автопостинг через Buffer'}));
  const queue=E('a',{href:'https://publish.buffer.com',target:'_blank',rel:'noopener noreferrer',textContent:'Проверить очередь в Buffer ↗'});
  async function api(method,body){
    const r=await fetch(CFG.reserve.url+'/v1/publishing',{method,headers:{Authorization:'Bearer '+await currentUser.getIdToken(),'Content-Type':'application/json'},body:body&&JSON.stringify(body)});
    if(r.status===404||r.status===503)throw Error('Автопостинг ещё не подключён. Для Worker нужны BUFFER_API_KEY и BUFFER_ORGANIZATION_ID.');
    const data=await r.json();if(!r.ok)throw Error(data.error||'Не удалось связаться с Buffer');return data;
  }
  const load=B('Загрузить мои каналы',async()=>{
    load.disabled=true;try{const channels=await api('GET');target.replaceChildren(...channels.map(c=>E('option',{value:c.id,textContent:c.name+' · '+c.service})));info.textContent=channels.length?'Выбери канал назначения.':'В Buffer нет подключённых каналов.'}catch(e){info.textContent=e.message}finally{load.disabled=false}
  });
  const send=B('Поставить в очередь',async()=>{
    const time=new Date(item.date+'T'+item.time),channel=target.selectedOptions[0];
    if(!channel||!(item.text||'').trim()||!Number.isFinite(+time)||time<=new Date()){info.textContent='Нужны канал, текст и будущая дата со временем.';return}
    const asset=kind.selectedIndex?{type:kind.selectedIndex===1?'image':'video',url:media.value}:null;
    if(asset&&!/^https:\/\//.test(asset.url)){info.textContent='Укажи HTTPS-ссылку на файл.';return}
    if(receipt())return;
    if(!confirm('Запланировать публикацию в '+channel.textContent+' на '+time.toLocaleString('ru')+' по времени этого устройства?'))return;
    const label=channel.textContent+' · '+time.toLocaleString('ru');send.disabled=true;
    try{
      localStorage.setItem(key,JSON.stringify({label,pending:true}));
      const data=await api('POST',{channelId:channel.value,dueAt:time.toISOString(),text:item.text,asset});
      localStorage.setItem(key,JSON.stringify({label,id:data.id}));info.textContent='В очереди Buffer: '+label;
    }catch(e){info.textContent=e.message+' Проверь очередь перед повтором.'}
  });
  const saved=receipt();if(saved){info.textContent=(saved.id?'В очереди Buffer: ':'Требует сверки с Buffer: ')+saved.label;send.disabled=true}
  const clear=B('Сбросить отметку после сверки',()=>{if(receipt()&&confirm('Запись проверена в Buffer? Сбросить локальную отметку? Это не отменяет публикацию в Buffer.')){localStorage.removeItem(key);send.disabled=false;info.textContent='Можно планировать заново.'}});
  panel.append(E('p',{textContent:'В очередь уйдёт текущий текст записи. Дата и время — местные. После отправки изменения и отмена выполняются в Buffer.'}),E('div',{className:'planner-actions'},load,target,kind,media,send),info,queue,clear);return panel;
}
