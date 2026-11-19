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

      .vintage-planner-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:8px 0 22px;padding:22px 26px;border:1px solid #d9c6a8;border-radius:18px;background:radial-gradient(ellipse at 82% 18%,#fff7e8 0,#f4e8d8 48%,#ead8c8 100%);box-shadow:inset 0 0 0 4px #fff9,0 8px 22px #4b293012;position:relative;overflow:hidden}
      .vintage-planner-heading:after{content:'✧  ·  ✦  ·  ✧';position:absolute;right:22px;bottom:10px;color:#a88765;letter-spacing:9px;font-size:13px}
      .vintage-kicker{font:700 10px/1.4 Georgia,serif;letter-spacing:.2em;color:var(--v-gold)}
      .vintage-heading-copy h2{font:600 clamp(25px,3vw,36px)/1.15 Georgia,serif;color:var(--v-wine);margin:7px 0}
      .vintage-heading-copy p{margin:0;color:#75645a;font:14px Georgia,serif}
      .vintage-heading-art{display:flex;align-items:center;gap:8px;color:var(--v-gold);font-size:32px;filter:sepia(.35);padding:0 14px}
      .vintage-heading-art span:nth-child(2n){font-size:17px}
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
      .vintage-event-kind{font-size:10px;color:#8a6249}.vintage-event strong{font:600 11px/1.25 Georgia,serif}.vintage-event small{font-size:9px;color:#77665b}
      .vintage-empty-mark{display:block;text-align:center;color:#cbb89e;font-size:10px;margin-top:18px}
      .vintage-empty-note{text-align:center;color:#806d5d;font:14px Georgia,serif;padding:10px}
      .vintage-content-planner .content-editor{background:#fffaf1;border-color:#dfcfb8}
      @media(max-width:760px){.vintage-planner-heading{padding:16px}.vintage-heading-art{font-size:23px;padding:0}.vintage-month-grid{gap:2px}.vintage-day{min-height:90px;padding:4px;border-radius:6px}.vintage-weekday{font-size:10px;padding:5px 0}.vintage-event{padding:4px;margin:3px 0}.vintage-event strong{font-size:10px}.vintage-event small{font-size:8px}.planner-month-label{font-size:18px;min-width:160px}}
      @media(max-width:480px){.vintage-heading-art{display:none}.vintage-day{min-height:72px}.vintage-event-kind{display:none}.vintage-event strong{font-size:9px}.vintage-day-top{font-size:11px}}
    `;
    document.head.append(css);
  }

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
  const planKey='aspace:plans:'+currentUser.uid;
  const plans=JSON.parse(localStorage.getItem(planKey)||'null')||[{id:'default',name:'Мой план'}];
  const stages=['Идея','В работе','На проверке','Запланировано','Опубликовано'];
  const planSelect=E('select',{ariaLabel:'Контент-план'}),search=E('input',{type:'search',placeholder:'Найти идею или текст',ariaLabel:'Поиск записей'});
  const channel=E('select',{ariaLabel:'Площадка'},E('option',{value:'',textContent:'Все площадки'}),...platforms.map(textContent=>E('option',{textContent})));
  const mode=E('select',{ariaLabel:'Вид плана'},...['Календарь','По этапам','По датам','Неделя'].map(textContent=>E('option',{textContent})));mode.value='Календарь';
  const monthCursor=new Date();monthCursor.setDate(1);monthCursor.setHours(12,0,0,0);
  const monthLabel=E('strong',{className:'planner-month-label'});
  function shiftMonth(delta){monthCursor.setMonth(monthCursor.getMonth()+delta);listPlan()}
  const monthNav=E('div',{className:'planner-month-nav'},B('‹',()=>shiftMonth(-1)),monthLabel,B('›',()=>shiftMonth(1)));
  let currentPlan=plans.find(p=>p.id===localStorage.getItem(planKey+':selected'))?.id||plans[0]?.id;
  const dateString=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const monday=new Date();monday.setHours(12,0,0,0);monday.setDate(monday.getDate()-(monday.getDay()+6)%7);
  const weekRange=E('strong');
  function shiftWeek(days){monday.setDate(monday.getDate()+days);listPlan()}
  const weekNav=E('div',{className:'planner-week',hidden:true},B('←',()=>shiftWeek(-7)),weekRange,B('→',()=>shiftWeek(7)));
  weekNav.firstChild.title='Предыдущая неделя';weekNav.lastChild.title='Следующая неделя';
  const inPlan=()=>[...records.values()].filter(item=>(item.plan||'default')===currentPlan);
  function refreshPlans(){
    planSelect.replaceChildren(...plans.map(plan=>E('option',{value:plan.id,textContent:plan.name})));planSelect.value=currentPlan||'';
  }
  function changePlan(){
    localStorage.setItem(planKey+':selected',currentPlan||'');entry=null;release();editor.replaceChildren();editor.hidden=true;listPlan();
    const first=inPlan().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||b.created-a.created)[0];if(first)edit(first);
  }
  function newPlan(){
    const name=prompt('Название контент-плана')?.trim();if(!name)return false;
    const plan={id:uid(),name};plans.push(plan);localStorage.setItem(planKey,JSON.stringify(plans));currentPlan=plan.id;refreshPlans();changePlan();return true;
  }
  function listPlan(){
    list.replaceChildren();
    const query=search.value.trim().toLocaleLowerCase();
    const visible=inPlan().filter(item=>(!channel.value||item.platforms.includes(channel.value))&&[item.title,item.text].join(' ').toLocaleLowerCase().includes(query));
    const byStage=mode.value==='По этапам',calendarMode=mode.value==='Календарь';
    visible.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'').localeCompare(b.time||'')||b.created-a.created);
    const groupName=item=>byStage?(item.stage||stages[0]):item.date||'Без даты';
    const week=mode.value==='Неделя';weekNav.hidden=!week;monthNav.hidden=!calendarMode;
    if(calendarMode){
      monthLabel.textContent=monthCursor.toLocaleDateString('ru',{month:'long',year:'numeric'});
      const weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
      const grid=E('div',{className:'vintage-month-grid'});
      for(const name of weekdays)grid.append(E('div',{className:'vintage-weekday',textContent:name}));
      const first=new Date(monthCursor);first.setDate(1);
      const offset=(first.getDay()+6)%7;
      const start=new Date(first);start.setDate(first.getDate()-offset);
      for(let i=0;i<42;i++){
        const day=new Date(start);day.setDate(start.getDate()+i);
        const key=dateString(day),sameMonth=day.getMonth()===monthCursor.getMonth();
        const cell=E('div',{className:'vintage-day'+(sameMonth?'':' outside-month')+(key===dateString(new Date())?' today':'')});
        const top=E('div',{className:'vintage-day-top'},E('span',{textContent:String(day.getDate())}));
        const add=B('+',()=>create(key));add.className='vintage-day-add';add.title='Добавить публикацию';top.append(add);cell.append(top);
        const entries=visible.filter(item=>item.date===key);
        for(const item of entries){
          const chip=B('',()=>edit(item));chip.className='vintage-event '+(item.stage==='Опубликовано'?'is-published':item.stage==='Запланировано'?'is-scheduled':'');
          chip.append(E('span',{className:'vintage-event-kind',textContent:item.kind==='Видео'?'▶':item.kind==='Пост'?'✎':'✧'}),E('strong',{textContent:item.title||'Без названия'}),E('small',{textContent:[item.time,item.stage].filter(Boolean).join(' · ')}));
          cell.append(chip);
        }
        if(!entries.length&&sameMonth)cell.append(E('span',{className:'vintage-empty-mark',textContent:'✦'}));
        grid.append(cell);
      }
      list.append(grid);
      if(!visible.length)list.append(E('p',{className:'vintage-empty-note',textContent:'Пока нет публикаций. Нажми «+» в нужной дате, чтобы добавить первую.'}));
      return;
    }
    const days=Array.from({length:7},(_,i)=>{const day=new Date(monday);day.setDate(day.getDate()+i);return dateString(day)});
    weekRange.textContent=days[0].slice(8)+'.'+days[0].slice(5,7)+' — '+days[6].slice(8)+'.'+days[6].slice(5,7);
    const groups=week?days:byStage?stages:[...new Set(visible.map(groupName))];
    for(const name of groups){
      const members=visible.filter(item=>groupName(item)===name);if(!week&&!members.length)continue;
      const label=!byStage&&name!=='Без даты'?new Date(name+'T12:00:00').toLocaleDateString('ru',{weekday:'short',day:'numeric',month:'long'}):name;
      const heading=E('h4',{textContent:label+' · '+members.length});
      if(week){const add=B('＋',()=>create(name));add.title='Добавить публикацию на '+name;add.setAttribute('aria-label',add.title);heading.append(add)}list.append(heading);
      for(const item of members){
        const button=E('button',{className:'content-entry',onclick:()=>edit(item)},E('strong',{textContent:item.title||'Без названия'}),E('small',{textContent:[item.kind,item.date,item.time,...item.platforms].filter(Boolean).join(' · ')}));
        button.setAttribute('aria-pressed',String(entry===item));list.append(button);
      }
    }
    if(!week&&!visible.length)list.append(E('p',{textContent:query||channel.value?'По этим условиям записей нет.':'В этом плане пока нет записей.'}));
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
  planSelect.onchange=()=>{currentPlan=planSelect.value;changePlan()};search.oninput=channel.onchange=mode.onchange=listPlan;refreshPlans();
  function store(){
    try{localStorage.setItem(prefix+entry.id,JSON.stringify(entry));records.set(entry.id,entry);status.textContent='Сохранено на устройстве';listPlan()}
    catch(error){status.textContent='Ошибка записи на устройстве: '+error.message}
  }
  function edit(item){
    release();entry=item;editor.hidden=false;listPlan();editor.replaceChildren();
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
    if(item.storyFormat)editor.append(E('details',{},E('summary',{textContent:item.storyFormat+' · '+item.rubric}),field('Съёмка','shoot',E('textarea',{rows:3})),field('Что измерить','measure',E('textarea',{rows:2})),field('Результат и следующий тест','result',E('textarea',{rows:2}))));
    localGet('assets',assetKey).then(saved=>{if(saved?.value)show(saved.value)}).catch(error=>status.textContent=error.message);
  }
  function create(date=''){if(!currentPlan&&!newPlan())return;const item={id:uid(),plan:currentPlan,stage:stages[0],created:Date.now(),title:'',kind:'Идея',text:'',date:typeof date==='string'?date:'',platforms:[]};edit(item);store();editor.querySelector('input').focus()}
  const planTools=E('div',{className:'planner-actions'},planSelect,B('＋ План',newPlan),B('Скачать план',()=>{const plan=plans.find(p=>p.id===currentPlan);if(plan)exportRecords(inPlan(),plan.name)}),B('Удалить план',removePlan));
  const viewTabs=E('div',{className:'planner-view-tabs'},...['Календарь','Список','Недели'].map((label,i)=>{const b=B(label,()=>{mode.value=['Календарь','По датам','Неделя'][i];listPlan();[...viewTabs.children].forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});b.setAttribute('aria-pressed',String(i===0));return b}));
  const exportButton=B('↓ Экспорт',()=>{const plan=plans.find(p=>p.id===currentPlan);if(plan)exportRecords(inPlan(),plan.name)});
  const toolbar=E('div',{className:'planner-toolbar'},viewTabs,E('div',{className:'planner-utility'},search,exportButton));
  const monthTools=E('div',{className:'planner-toolbar'},monthNav,planSelect,B('＋ План',newPlan),B('＋ Запись',create));
  const annaCard=E('section',{className:'planner-lower-card'},
    E('div',{className:'planner-lower-head'},E('span',{textContent:'☆  Редакция Анны'}),B('Все материалы →',()=>selectTab(editorial))),
    E('div',{className:'planner-anna-preview'},E('div',{className:'planner-anna-photo',textContent:'✦  Авторский сезон'}),E('div',{},E('strong',{textContent:'Авторский сезон о мышлении и речи'}),E('p',{textContent:'Сценарии, идеи и готовый план публикаций'}),B('Открыть материалы',()=>selectTab(editorial)))));
  const ideaCard=E('section',{className:'planner-lower-card'},E('div',{className:'planner-lower-head'},E('span',{textContent:'♧  Идеи'}),B('Все идеи →',()=>{mode.value='По этапам';listPlan();selectTab(planner)})));
  const ideaList=E('ul',{className:'planner-idea-list'});
  const refreshIdeas=()=>{ideaList.replaceChildren();const ideas=inPlan().filter(x=>x.stage==='Идея'||x.kind==='Идея').slice(0,5);for(const item of ideas)ideaList.append(E('li',{textContent:item.title||'Новая идея',onclick:()=>{edit(item);selectTab(planner)}}));if(!ideas.length)ideaList.append(E('li',{textContent:'Добавьте первую идею через календарь'}) )};
  ideaCard.append(ideaList);
  const statsCard=E('section',{className:'planner-lower-card'},E('div',{className:'planner-lower-head'},E('span',{textContent:'▥  Статистика'}),E('small',{textContent:'За всё время'})));
  const stats=E('div',{className:'planner-stat-row'});
  const statPublished=E('strong',{textContent:'0'}),statPlanned=E('strong',{textContent:'0'}),statIdeas=E('strong',{textContent:'0'});
  for(const [num,label,cls] of [[statPublished,'Публикаций',''],[statPlanned,'Запланировано','planner-stat-growth'],[statIdeas,'Идей','']])stats.append(E('div',{className:'planner-stat'},Object.assign(E('span'),{textContent:''}),num,E('small',{textContent:label})));
  const refreshStats=()=>{const all=inPlan();statPublished.textContent=String(all.filter(x=>x.stage==='Опубликовано').length);statPlanned.textContent=String(all.filter(x=>x.stage==='Запланировано').length);statIdeas.textContent=String(all.filter(x=>x.stage==='Идея'||x.kind==='Идея').length)};
  statsCard.append(stats);
  const lower=E('div',{className:'planner-lower'},annaCard,ideaCard,statsCard);
  section.append(E('aside',{className:'planner-index'},toolbar,monthTools,E('div',{className:'planner-actions'},channel),weekNav,list),editor,lower);
  const planner=E('div',{className:'vintage-content-planner'},
    E('div',{className:'vintage-planner-heading'},
      E('div',{className:'vintage-heading-copy'},E('span',{className:'vintage-kicker',textContent:'✦ МОЯ РЕЧЕВАЯ МАСТЕРСКАЯ ✦'}),E('h2',{textContent:'Календарь контента'}),E('p',{textContent:'Мысли, которые обретают голос. Публикации, которые находят свой день.'})),
      E('div',{className:'vintage-heading-art','aria-hidden':'true'},E('span',{textContent:'🗝'}),E('span',{textContent:'✧'}),E('span',{textContent:'🎙'}),E('span',{textContent:'✧'}),E('span',{textContent:'▤'}))),
    planTools,section,linkedWorkspacePanel('document')),resources=E('div',{hidden:true,className:'personal-resources'});
  const editorial=annaEditorialView(dateString(monday>=new Date()?monday:new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+7)),start=>{
    const name='Мысли есть · '+start;
    const existing=plans.find(p=>p.seasonStart===start);
    if(existing){currentPlan=existing.id}
    else{
      const plan={id:uid(),name,seasonStart:start},added=[];
      try{
        for(const story of annaSeason){
          const day=new Date(start+'T12:00:00');day.setDate(day.getDate()+story.day);
          const item={id:uid(),plan:plan.id,title:story.title,kind:['Ролик','Яппинг'].includes(story.format)?'Видео':'Пост',
            stage:stages[0],date:dateString(day),time:'',created:Date.now(),platforms:[...story.channels],
            text:story.script,shoot:story.shot,measure:story.metric,rubric:story.rubric,storyFormat:story.format,goal:story.goal};
          localStorage.setItem(prefix+item.id,JSON.stringify(item));added.push(item);
        }
        localStorage.setItem(planKey,JSON.stringify([...plans,plan]));
      }catch(error){for(const item of added)localStorage.removeItem(prefix+item.id);alert('Не удалось сохранить сезон: '+error.message);return}
      plans.push(plan);for(const item of added)records.set(item.id,item);currentPlan=plan.id;
    }
    refreshPlans();mode.value='По датам';search.value='';channel.value='';changePlan();selectTab(planner);
  });
  const tabs=E('nav',{className:'builder-tabs',ariaLabel:'Разделы контента'});
  const views=[editorial,planner,resources];
  function selectTab(view){
    views.forEach((section,i)=>{section.hidden=section!==view;tabs.children[i].setAttribute('aria-pressed',String(section===view))});
    if(view===resources&&!resources.childElementCount)resourceEditor(resources);
  }
  for(const [i,title] of ['Редакция Анны','Контент-план','Мои ресурсы'].entries())tabs.append(B(title,()=>selectTab(views[i])));
  selectTab(editorial);
  m.append(E('h2',{textContent:'Контент'}),tabs,...views);
  changePlan();refreshIdeas();refreshStats();
  const originalStore=store;
  store=function(){originalStore();refreshIdeas();refreshStats()};
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
