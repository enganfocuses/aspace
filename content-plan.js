const PLATFORMS = [
  {id:'telegram',label:'Telegram',color:'#4b8bbe'},
  {id:'vk',label:'VK',color:'#5a8ad1'},
  {id:'instagram',label:'Instagram',color:'#c96a9b'},
  {id:'youtube',label:'YouTube',color:'#c94a4a'},
  {id:'dzen',label:'Дзен',color:'#4a8a5a'},
  {id:'site',label:'Сайт',color:'#7a6ab8'},
  {id:'email',label:'Email',color:'#8a6aaa'}
];
const STATUSES = [{id:'idea',label:'Идея',color:'#8a8098'},{id:'planned',label:'В плане',color:'#4a6a9e'},{id:'done',label:'Готово',color:'#5a8040'}];
const FORMATS = [{id:'text',label:'Текст'},{id:'image',label:'Картинка'},{id:'carousel',label:'Карусель'},{id:'video',label:'Видео'},{id:'reels',label:'Reels / Shorts'},{id:'story',label:'Сторис'},{id:'live',label:'Эфир'}];
const PILLARS = [{id:'useful',label:'Польза'},{id:'personal',label:'Личное'},{id:'case',label:'Кейс'},{id:'opinion',label:'Мнение'},{id:'news',label:'Анонс'},{id:'engage',label:'Вовлечение'},{id:'other',label:'Другое'}];
const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DOW = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => 'p_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2,'0');
const keyOf = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parseDate = key => {if(!key)return null;const [y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d)};
const byId = (items,id) => items.find(x=>x.id===id) || items[items.length-1];
const safePost = p => ({
  id:String(p.id||uid()),date:p.date||null,time:p.time||'',platforms:Array.isArray(p.platforms)?p.platforms.filter(id=>PLATFORMS.some(x=>x.id===id)):['telegram'],
  format:FORMATS.some(x=>x.id===p.format)?p.format:'text',pillar:PILLARS.some(x=>x.id===p.pillar)?p.pillar:'useful',
  status:STATUSES.some(x=>x.id===p.status)?p.status:(p.status==='published'?'done':'idea'),
  title:String(p.title||''),caption:String(p.caption||''),cta:String(p.cta||''),mediaUrl:String(p.mediaUrl||''),
  tags:Array.isArray(p.tags)?p.tags.map(String):[],notes:String(p.notes||''),publishedUrl:String(p.publishedUrl||''),
  publishedAt:p.publishedAt||'',createdAt:p.createdAt||Date.now(),updatedAt:p.updatedAt||Date.now()
});

export async function renderContentPlan(host,{load,save}={}){
  const path='content/plan';
  let posts=[];
  try{const stored=await load(path);posts=Array.isArray(stored)?stored.map(safePost):[]}
  catch(error){host.textContent='Не удалось загрузить контент-план: '+error.message;return ()=>{}}
  if(!host.isConnected)return ()=>{};
  const state={view:'month',cursor:new Date(),selected:null,platform:'all',query:'',busy:false};
  let saveTimer=0,disposed=false,dragId=null;
  const style=document.createElement('style');
  style.textContent=`
  #content-plan{height:100%;min-height:620px;display:flex;flex-direction:column;color:var(--cp-ink);font:13px/1.45 Inter,system-ui,sans-serif}
  #content-plan *{box-sizing:border-box}#content-plan button,#content-plan input,#content-plan select,#content-plan textarea{font:inherit;color:inherit}
  #content-plan button{border:1px solid var(--cp-line);background:var(--cp-card);border-radius:9px;padding:7px 11px;cursor:pointer}
  #content-plan button:hover{background:var(--cp-soft)}#content-plan button:disabled{opacity:.5;cursor:default}
  #content-plan .cp-primary{background:var(--cp-wine);color:#fff;border-color:var(--cp-wine)}
  #content-plan .cp-primary:hover{background:var(--cp-wine2)}
  #content-plan input,#content-plan select,#content-plan textarea{width:100%;min-width:0;background:var(--cp-card);border:1px solid var(--cp-line);border-radius:8px;padding:8px 10px}
  #content-plan textarea{min-height:76px;resize:vertical}
  #content-plan input:focus,#content-plan select:focus,#content-plan textarea:focus{outline:2px solid var(--cp-lav);outline-offset:1px}
  #content-plan .cp-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:11px 12px;background:var(--cp-card);border-bottom:1px solid var(--cp-line2)}
  #content-plan .cp-brand{font:20px Georgia,serif;color:var(--cp-wine);white-space:nowrap;margin-right:4px}
  #content-plan .cp-views{display:flex;gap:2px;padding:3px;background:var(--cp-soft);border-radius:10px}
  #content-plan .cp-views button{border:0;background:transparent;padding:6px 10px;font-size:12px}
  #content-plan .cp-views button.on{background:var(--cp-card);color:var(--cp-wine);box-shadow:0 1px 3px #51334418}
  #content-plan .cp-nav{display:flex;align-items:center;gap:5px}.cp-nav strong{min-width:130px;text-align:center;font:15px Georgia,serif}
  #content-plan .cp-spacer{flex:1}#content-plan .cp-search{max-width:210px}
  #content-plan .cp-coverage{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 12px;background:var(--cp-card);border-bottom:1px solid var(--cp-line2);font-size:11px;color:var(--cp-muted)}
  #content-plan .cp-coverage b{color:var(--cp-ink)}#content-plan .cp-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px}
  #content-plan .cp-layout{display:grid;grid-template-columns:210px minmax(0,1fr);flex:1;min-height:0;overflow:hidden}
  #content-plan .cp-layout.has-editor{grid-template-columns:210px minmax(0,1fr) minmax(300px,370px)}
  #content-plan .cp-backlog{display:flex;flex-direction:column;min-height:0;background:var(--cp-card);border-right:1px solid var(--cp-line2)}
  #content-plan .cp-backlog-head,#content-plan .cp-editor-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--cp-line2)}
  #content-plan .cp-backlog-head b,#content-plan .cp-editor-head b{font:16px Georgia,serif;color:var(--cp-wine)}
  #content-plan .cp-ideas{overflow:auto;padding:8px;display:flex;flex-direction:column;gap:6px}
  #content-plan .cp-idea{padding:8px 9px;background:var(--cp-paper);border:1px solid var(--cp-line2);border-left:3px solid var(--cp-wine);border-radius:8px;cursor:pointer}
  #content-plan .cp-idea strong{display:block;line-height:1.3;overflow-wrap:anywhere}.cp-idea small{display:block;color:var(--cp-muted);margin-top:4px}
  #content-plan .cp-calendar{min-width:0;min-height:0;overflow:auto;padding:12px}
  #content-plan .cp-editor{display:flex;flex-direction:column;min-height:0;overflow:hidden;background:var(--cp-card);border-left:1px solid var(--cp-line2)}
  #content-plan .cp-editor[hidden]{display:none}.cp-editor-body{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:11px;flex:1}
  #content-plan .cp-editor-foot{display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap;padding:9px 12px;border-top:1px solid var(--cp-line2)}
  #content-plan .cp-month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
  #content-plan .cp-dow{text-align:center;text-transform:uppercase;letter-spacing:.1em;color:var(--cp-muted);font-size:10px;padding:5px 2px}
  #content-plan .cp-cell{background:var(--cp-paper);border:1px solid var(--cp-line2);border-radius:10px;min-height:112px;padding:5px;display:flex;flex-direction:column;gap:4px;min-width:0}
  #content-plan .cp-cell.other{opacity:.48}#content-plan .cp-cell.today{border-color:var(--cp-wine);box-shadow:inset 0 0 0 1px var(--cp-wine)}
  #content-plan .cp-cell.dragover{background:var(--cp-soft);border-color:var(--cp-lav)}
  #content-plan .cp-cell-head{display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--cp-muted)}
  #content-plan .cp-cell-head b{font:14px Georgia,serif;color:var(--cp-ink)}
  #content-plan .cp-add{border:0!important;background:transparent!important;padding:0 4px!important;color:var(--cp-muted)}
  #content-plan .cp-tile{display:block;width:100%;text-align:left;border:1px solid var(--cp-line2)!important;border-left:3px solid var(--cp-wine)!important;border-radius:7px!important;padding:4px 5px!important;font-size:11px!important;line-height:1.25}
  #content-plan .cp-tile strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
  #content-plan .cp-tile small{color:var(--cp-muted);font-size:10px}
  #content-plan .cp-status{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;padding:1px 4px;border-radius:5px;background:var(--cp-soft);display:inline-block}
  #content-plan .cp-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
  #content-plan .cp-week-col{background:var(--cp-paper);border:1px solid var(--cp-line2);border-radius:10px;padding:6px;min-height:55vh;display:flex;flex-direction:column;gap:6px}
  #content-plan .cp-week-col.today{border-color:var(--cp-wine)}#content-plan .cp-week-col.dragover{background:var(--cp-soft)}
  #content-plan .cp-week-head{font-size:11px;color:var(--cp-muted);border-bottom:1px solid var(--cp-line2);padding-bottom:5px}
  #content-plan .cp-day,#content-plan .cp-list{max-width:900px;margin:0 auto}
  #content-plan .cp-day h2{font:22px Georgia,serif;color:var(--cp-wine);margin:0 0 12px}
  #content-plan .cp-row{display:grid;grid-template-columns:55px minmax(0,1fr);gap:10px;background:var(--cp-paper);border:1px solid var(--cp-line2);border-left:3px solid var(--cp-wine);border-radius:10px;padding:10px;margin-bottom:7px;cursor:pointer}
  #content-plan .cp-row time{font:15px Georgia,serif;color:var(--cp-wine)}#content-plan .cp-row strong{font-size:13px;overflow-wrap:anywhere}
  #content-plan .cp-meta{display:flex;gap:6px;flex-wrap:wrap;color:var(--cp-muted);font-size:10px;margin-bottom:3px}
  #content-plan .cp-empty{text-align:center;padding:35px 15px;color:var(--cp-muted)}
  #content-plan .cp-field{display:grid;gap:4px;color:var(--cp-muted);font-size:11px}#content-plan .cp-field b{color:var(--cp-ink);font-size:11px}
  #content-plan .cp-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  #content-plan .cp-chips{display:flex;gap:5px;flex-wrap:wrap}
  #content-plan .cp-chip{font-size:11px!important;padding:5px 8px!important;border-radius:18px!important}
  #content-plan .cp-chip.on{background:var(--cp-soft);border-color:var(--cp-lav);font-weight:700}
  #content-plan .cp-statuses{display:flex;gap:5px;flex-wrap:wrap}
  #content-plan .cp-statuses button{flex:1;min-width:75px;font-size:11px}
  #content-plan .cp-statuses button.on{background:var(--cp-wine);color:white;border-color:var(--cp-wine)}
  #content-plan .cp-preview{background:linear-gradient(145deg,#eee9f5,#e7eff5);border-radius:10px;padding:12px;color:#30283b;display:grid;gap:6px}
  #content-plan .cp-preview strong{font-size:14px}#content-plan .cp-preview p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#4a3b52;font-size:12px}
  #content-plan .cp-preview img{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:7px}
  #content-plan .cp-tags{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
  #content-plan .cp-tag{border-radius:14px;background:var(--cp-soft);padding:3px 7px;font-size:11px}
  #content-plan .cp-tag button{border:0;padding:0 2px;background:transparent}
  #content-plan .cp-quick{display:flex;gap:5px;flex-wrap:wrap}
  #content-plan .cp-save-state{font-size:10px;color:var(--cp-muted);align-self:center}
  :root{--cp-ink:#30283b;--cp-muted:#81778b;--cp-card:#fffcf6;--cp-paper:#fbf7ee;--cp-line:#d9cbd0;--cp-line2:#e7dde2;--cp-wine:#71384f;--cp-wine2:#54283c;--cp-soft:#f1ebf7;--cp-lav:#bba8df}
  [data-theme=dark]{--cp-ink:#eee7f2;--cp-muted:#b6aabd;--cp-card:#241d2b;--cp-paper:#221b28;--cp-line:#493b55;--cp-line2:#332639;--cp-wine:#a87594;--cp-wine2:#8f5d7c;--cp-soft:#302638;--cp-lav:#806a99}
  @media(max-width:1050px){#content-plan .cp-layout,#content-plan .cp-layout.has-editor{grid-template-columns:minmax(0,1fr)}#content-plan .cp-backlog{display:none}#content-plan .cp-editor{position:fixed;z-index:100;left:0;right:0;bottom:0;height:min(86dvh,760px);border:1px solid var(--cp-line);border-radius:18px 18px 0 0;box-shadow:0 -10px 35px #0002}#content-plan .cp-month{gap:3px}#content-plan .cp-cell{min-height:88px;padding:3px}#content-plan .cp-tile{font-size:10px!important;padding:3px!important}#content-plan .cp-week{grid-template-columns:1fr}#content-plan .cp-week-col{min-height:90px}#content-plan .cp-two{grid-template-columns:1fr}#content-plan .cp-toolbar{gap:5px}#content-plan .cp-brand{font-size:18px}#content-plan .cp-search{max-width:none;flex:1 1 130px}}
  @media(max-width:600px){#content-plan .cp-month{gap:2px}#content-plan .cp-cell{min-height:74px;padding:2px;border-radius:6px}#content-plan .cp-dow{font-size:8px;padding:3px 0}#content-plan .cp-cell-head{font-size:9px}#content-plan .cp-tile small{display:none}#content-plan .cp-views button{padding:5px 6px;font-size:11px}#content-plan .cp-nav strong{min-width:95px;font-size:12px}#content-plan .cp-coverage{gap:7px}#content-plan .cp-toolbar .cp-filter{display:none}}
  `;
  const root=document.createElement('section');root.id='content-plan';root.append(style);
  host.replaceChildren(root);
  const shell=document.createElement('div');
  shell.innerHTML=`
    <div class="cp-toolbar">
      <button class="cp-mobile-ideas" data-action="ideas" style="display:none">≡ Идеи</button>
      <span class="cp-brand">Контент-план</span>
      <div class="cp-views" role="tablist" aria-label="Вид календаря">
        <button data-view="month" class="on">Месяц</button><button data-view="week">Неделя</button><button data-view="day">День</button><button data-view="list">Список</button>
      </div>
      <div class="cp-nav"><button data-nav="-1" aria-label="Назад">‹</button><strong data-nav-label></strong><button data-nav="1" aria-label="Вперёд">›</button><button data-nav="0">Сегодня</button></div>
      <span class="cp-spacer"></span>
      <label class="cp-filter" style="display:flex;align-items:center;gap:5px;color:var(--cp-muted);font-size:11px">Площадка<select data-filter><option value="all">Все</option></select></label>
      <input class="cp-search" data-search placeholder="Поиск…" aria-label="Поиск постов">
      <button data-action="export" title="Экспорт календаря">↓ .ics</button><button class="cp-primary" data-action="new">＋ Пост</button>
    </div>
    <div class="cp-coverage" data-coverage></div>
    <div class="cp-layout" data-layout>
      <aside class="cp-backlog"><div class="cp-backlog-head"><b>Идеи без даты</b><span data-save-state class="cp-save-state">Сохранено</span></div><div class="cp-ideas" data-ideas></div></aside>
      <main class="cp-calendar" data-calendar></main>
      <aside class="cp-editor" data-editor hidden>
        <div class="cp-editor-head"><b>Пост</b><button data-action="close" aria-label="Закрыть">✕</button></div>
        <div class="cp-editor-body" data-editor-body></div>
        <div class="cp-editor-foot"><div><button data-action="duplicate">Дублировать</button> <button data-action="delete" style="color:#9b2929">Удалить</button></div><button class="cp-primary" data-action="close">Готово</button></div>
      </aside>
    </div>`;
  root.append(shell);
  const $=sel=>root.querySelector(sel);
  const saveNow=async()=>{
    clearTimeout(saveTimer);saveTimer=0;
    if(disposed)return;
    $('[data-save-state]').textContent='Сохраняем…';
    try{const ok=await save(path,posts);$('[data-save-state]').textContent=ok===false?'Сохранено локально · синхронизация ожидает':'Сохранено'}
    catch(error){$('[data-save-state]').textContent='Ошибка сохранения';console.error('Aspace content plan save:',error)}
  };
  const scheduleSave=()=>{clearTimeout(saveTimer);$('[data-save-state]').textContent='Есть изменения…';saveTimer=setTimeout(saveNow,550)};
  const filtered=()=>posts.filter(p=>{
    if(!p.date)return false;
    if(state.platform!=='all'&&!p.platforms.includes(state.platform))return false;
    const q=state.query.trim().toLowerCase();
    return !q||[p.title,p.caption,p.cta,p.notes,...p.tags].join(' ').toLowerCase().includes(q)
  });
  const groups=items=>{const map=new Map();for(const p of items){if(!map.has(p.date))map.set(p.date,[]);map.get(p.date).push(p)}for(const a of map.values())a.sort((x,y)=>(x.time||'').localeCompare(y.time||''));return map};
  const statusHTML=p=>'<span class="cp-status">'+esc(byId(STATUSES,p.status).label)+'</span>';
  const dots=p=>p.platforms.map(id=>{const pl=byId(PLATFORMS,id);return '<i class="cp-dot" title="'+esc(pl.label)+'" style="background:'+pl.color+'"></i>'}).join('');
  const tile=p=>'<button class="cp-tile" draggable="true" data-post="'+esc(p.id)+'" style="border-left-color:'+esc(byId(PLATFORMS,p.platforms[0]||'').color)+'"><strong>'+esc(p.title||'Без названия')+'</strong><small>'+(p.time?esc(p.time)+' · ':'')+dots(p)+' '+statusHTML(p)+'</small></button>';
  const row=p=>'<div class="cp-row" data-post="'+esc(p.id)+'"><time>'+esc(p.time||'—')+'</time><div><div class="cp-meta">'+dots(p)+' '+statusHTML(p)+' · '+esc(byId(FORMATS,p.format).label)+' · '+esc(byId(PILLARS,p.pillar).label)+'</div><strong>'+esc(p.title||'Без названия')+'</strong>'+(p.caption?'<p>'+esc(p.caption.slice(0,180))+'</p>':'')+'</div></div>';
  const navLabel=()=>{const c=state.cursor;if(state.view==='day')return c.getDate()+' '+MONTHS[c.getMonth()]+' '+c.getFullYear();if(state.view==='week'){const a=new Date(c);a.setDate(a.getDate()-((a.getDay()+6)%7));const b=new Date(a);b.setDate(a.getDate()+6);return a.getDate()+' '+MONTHS[a.getMonth()].slice(0,3)+' – '+b.getDate()+' '+MONTHS[b.getMonth()].slice(0,3)}return MONTHS[c.getMonth()]+' '+c.getFullYear()};
  function renderCoverage(){
    const c=state.cursor,start=new Date(c.getFullYear(),c.getMonth(),1),end=new Date(c.getFullYear(),c.getMonth()+1,0);
    const list=posts.filter(p=>p.date&&parseDate(p.date)>=start&&parseDate(p.date)<=end);
    const statuses=STATUSES.map(s=>'<span><i class="cp-dot" style="background:'+s.color+'"></i>'+s.label+': <b>'+list.filter(p=>p.status===s.id).length+'</b></span>').join('');
    const platforms=PLATFORMS.filter(pl=>list.some(p=>p.platforms.includes(pl.id))).map(pl=>'<span><i class="cp-dot" style="background:'+pl.color+'"></i>'+pl.label+': <b>'+list.filter(p=>p.platforms.includes(pl.id)).length+'</b></span>').join('');
    const pillars=PILLARS.filter(pl=>list.some(p=>p.pillar===pl.id)).map(pl=>'<span class="cp-tag">'+pl.label+' · '+list.filter(p=>p.pillar===pl.id).length+'</span>').join('');
    $('[data-coverage]').innerHTML='<b>Этот месяц:</b> '+statuses+' '+(platforms||'<span>Площадки: пока пусто</span>')+' '+pillars;
  }
  function renderMonth(){
    const c=state.cursor,first=new Date(c.getFullYear(),c.getMonth(),1),start=new Date(first);start.setDate(1-((first.getDay()+6)%7));
    const days=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d});
    const map=groups(filtered()),today=keyOf(new Date());
    return '<div class="cp-month">'+DOW.map(d=>'<div class="cp-dow">'+d+'</div>').join('')+days.map(d=>{
      const k=keyOf(d),list=map.get(k)||[];
      return '<div class="cp-cell '+(d.getMonth()!==c.getMonth()?'other ':'')+(k===today?'today':'')+'" data-date="'+k+'"><div class="cp-cell-head"><b>'+d.getDate()+'</b><button class="cp-add" data-add="'+k+'" aria-label="Добавить пост">＋</button></div>'+list.slice(0,3).map(tile).join('')+(list.length>3?'<small>+'+(list.length-3)+' ещё</small>':'')+'</div>'
    }).join('')+'</div>';
  }
  function renderWeek(){
    const c=state.cursor,start=new Date(c);start.setDate(c.getDate()-((c.getDay()+6)%7));
    const map=groups(filtered()),today=keyOf(new Date());
    return '<div class="cp-week">'+Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);const k=keyOf(d);return '<div class="cp-week-col '+(k===today?'today':'')+'" data-date="'+k+'"><div class="cp-week-head"><b>'+DOW[i]+' · '+d.getDate()+' '+MONTHS[d.getMonth()].slice(0,3)+'</b></div>'+(map.get(k)||[]).map(tile).join('')+'</div>'}).join('')+'</div>';
  }
  function renderDay(){
    const k=keyOf(state.cursor),items=groups(filtered()).get(k)||[];
    return '<div class="cp-day"><h2>'+state.cursor.getDate()+' '+MONTHS[state.cursor.getMonth()]+' '+state.cursor.getFullYear()+'</h2>'+(items.length?items.map(row).join(''):'<div class="cp-empty">На этот день пока ничего не запланировано.</div>')+'</div>';
  }
  function renderList(){
    const items=filtered().sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'').localeCompare(b.time||'')),map=groups(items);
    if(!items.length)return '<div class="cp-empty">Нет постов под выбранный фильтр.</div>';
    return '<div class="cp-list">'+[...map].map(([date,list])=>{const d=parseDate(date);return '<h3 class="cp-week-head">'+DOW[(d.getDay()+6)%7]+', '+d.getDate()+' '+MONTHS[d.getMonth()]+'</h3>'+list.map(row).join('')}).join('')+'</div>';
  }
  function renderIdeas(){
    const ideas=posts.filter(p=>!p.date&&p.status==='idea');
    $('[data-ideas]').innerHTML=ideas.length?ideas.map(p=>'<div class="cp-idea" data-post="'+esc(p.id)+'"><strong>'+esc(p.title||'Новая идея')+'</strong><small>'+dots(p)+' · '+esc(byId(FORMATS,p.format).label)+' '+p.tags.slice(0,2).map(t=>'#'+esc(t)).join(' ')+'</small></div>').join(''):'<div class="cp-empty">Здесь будут идеи без даты.</div>';
  }
  function renderEditor(){
    const p=posts.find(x=>x.id===state.selected);const editor=$('[data-editor]');
    editor.hidden=!p;$('[data-layout]').classList.toggle('has-editor',!!p);
    if(!p)return;
    const platforms=PLATFORMS.map(pl=>'<button type="button" class="cp-chip '+(p.platforms.includes(pl.id)?'on':'')+'" data-platform="'+pl.id+'"><i class="cp-dot" style="background:'+pl.color+'"></i>'+pl.label+'</button>').join('');
    const tags=p.tags.map((tag,i)=>'<span class="cp-tag">#'+esc(tag)+' <button type="button" data-remove-tag="'+i+'" aria-label="Удалить тег">×</button></span>').join('');
    const options=(items,val)=>items.map(x=>'<option value="'+x.id+'" '+(x.id===val?'selected':'')+'>'+esc(x.label)+'</option>').join('');
    const preview=p.mediaUrl&&/^https:\/\//i.test(p.mediaUrl)?'<img src="'+esc(p.mediaUrl)+'" alt="">':'';
    $('[data-editor-body]').innerHTML=`
      <div class="cp-preview"><div class="cp-meta">${esc(p.platforms.map(id=>byId(PLATFORMS,id).label).join(' · ')||'Без площадки')} · ${esc(p.time)}</div><strong data-preview-title>${esc(p.title||'Заголовок поста')}</strong>${preview}<p data-preview-caption>${esc(p.caption||'Текст поста…')}</p></div>
      <label class="cp-field"><b>Заголовок</b><input data-field="title" value="${esc(p.title)}" placeholder="О чём публикация"></label>
      <div class="cp-two"><label class="cp-field"><b>Дата</b><input type="date" data-field="date" value="${esc(p.date||'')}"></label><label class="cp-field"><b>Время</b><input type="time" data-field="time" value="${esc(p.time)}"></label></div>
      <div class="cp-field"><b>Площадки</b><div class="cp-chips"><button class="cp-chip" data-toggle-all>Все</button>${platforms}</div></div>
      <div class="cp-two"><label class="cp-field"><b>Формат</b><select data-field="format">${options(FORMATS,p.format)}</select></label><label class="cp-field"><b>Рубрика</b><select data-field="pillar">${options(PILLARS,p.pillar)}</select></label></div>
      <div class="cp-field"><b>Статус</b><div class="cp-statuses">${STATUSES.map(s=>'<button data-status="'+s.id+'" class="'+(p.status===s.id?'on':'')+'">'+s.label+'</button>').join('')}</div></div>
      <label class="cp-field"><b>Текст поста</b><textarea data-field="caption" placeholder="Черновик публикации…">${esc(p.caption)}</textarea></label>
      <label class="cp-field"><b>CTA</b><input data-field="cta" value="${esc(p.cta)}" placeholder="Призыв к действию"></label>
      <label class="cp-field"><b>Медиа (URL)</b><input data-field="mediaUrl" value="${esc(p.mediaUrl)}" placeholder="https://…"></label>
      <div class="cp-field"><b>Теги</b><div class="cp-tags">${tags}<input data-tag-input placeholder="+ добавить тег" style="max-width:130px;border:0;background:transparent"></div></div>
      <label class="cp-field"><b>Что нужно подготовить</b><textarea data-field="notes" placeholder="Снять видео, найти изображение, дописать…">${esc(p.notes)}</textarea></label>
      ${p.status==='done'?'<div class="cp-two"><label class="cp-field"><b>Ссылка на публикацию</b><input data-field="publishedUrl" value="'+esc(p.publishedUrl)+'" placeholder="https://…"></label><label class="cp-field"><b>Дата публикации</b><input type="date" data-field="publishedAt" value="'+esc(p.publishedAt)+'"></label></div>':''}
      <div class="cp-field"><b>Быстрый перенос</b><div class="cp-quick"><button data-reschedule="1">Завтра</button><button data-reschedule="3">+3 дня</button><button data-reschedule="7">+неделя</button><button data-reschedule="backlog">В идеи</button></div></div>`;
  }
  function render(){
    $('[data-nav-label]').textContent=navLabel();
    root.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('on',b.dataset.view===state.view));
    $('[data-filter]').value=state.platform;$('[data-search]').value=state.query;
    $('[data-calendar]').innerHTML=state.view==='month'?renderMonth():state.view==='week'?renderWeek():state.view==='day'?renderDay():renderList();
    renderCoverage();renderIdeas();renderEditor();
  }
  function openEditor(id){state.selected=id;render()}
  function createPost(date=null){
    const p=safePost({id:uid(),date,time:'10:00',platforms:['telegram'],format:'text',pillar:'useful',status:date?'planned':'idea'});
    posts.push(p);scheduleSave();openEditor(p.id);
  }
  function changePost(id,fn){const p=posts.find(x=>x.id===id);if(!p)return;fn(p);p.updatedAt=Date.now();scheduleSave();render()}
  function removePost(){const p=posts.find(x=>x.id===state.selected);if(!p)return;if(!confirm('Удалить пост «'+(p.title||'Без названия')+'»?'))return;posts=posts.filter(x=>x.id!==p.id);state.selected=null;scheduleSave();render()}
  function duplicate(){const p=posts.find(x=>x.id===state.selected);if(!p)return;const copy=safePost({...p,id:uid(),date:null,status:'idea',publishedUrl:'',publishedAt:'',title:(p.title||'Пост')+' (копия)',tags:[...p.tags],platforms:[...p.platforms]});posts.push(copy);scheduleSave();openEditor(copy.id)}
  function exportICS(){
    const events=posts.filter(p=>p.date);if(!events.length){alert('Нет запланированных публикаций.');return}
    const escapeICS=s=>String(s||'').replace(/[\\;,]/g,m=>'\\'+m).replace(/\n/g,'\\n');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Aspace//ContentPlan//RU','CALSCALE:GREGORIAN'];
    for(const p of events){const d=parseDate(p.date),[h,m]=String(p.time||'10:00').split(':').map(Number),start=new Date(d);start.setHours(h||0,m||0,0,0);const end=new Date(start);end.setMinutes(end.getMinutes()+30);const fmt=x=>keyOf(x).replace(/-/g,'')+'T'+pad(x.getHours())+pad(x.getMinutes())+'00';lines.push('BEGIN:VEVENT','UID:'+p.id+'@aspace','DTSTAMP:'+fmt(new Date()),'DTSTART:'+fmt(start),'DTEND:'+fmt(end),'SUMMARY:'+escapeICS((p.title||'Публикация')+' ['+p.platforms.map(id=>byId(PLATFORMS,id).label).join(', ')+']'),'DESCRIPTION:'+escapeICS(p.notes),'END:VEVENT')}
    lines.push('END:VCALENDAR');const blob=new Blob([lines.join('\r\n')],{type:'text/calendar'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='aspace-content-plan.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  root.addEventListener('click',e=>{
    const view=e.target.closest('[data-view]');if(view){state.view=view.dataset.view;render();return}
    const nav=e.target.closest('[data-nav]');if(nav){const n=Number(nav.dataset.nav),c=new Date(state.cursor);if(!n)state.cursor=new Date();else if(state.view==='day')c.setDate(c.getDate()+n);else if(state.view==='week')c.setDate(c.getDate()+7*n);else c.setMonth(c.getMonth()+n);if(n)state.cursor=c;render();return}
    const action=e.target.closest('[data-action]')?.dataset.action;
    if(action==='new'){createPost(keyOf(state.cursor));return}if(action==='export'){exportICS();return}if(action==='close'){state.selected=null;render();return}
    if(action==='delete'){removePost();return}if(action==='duplicate'){duplicate();return}
    const add=e.target.closest('[data-add]');if(add){createPost(add.dataset.add);return}
    const postEl=e.target.closest('[data-post]');if(postEl){openEditor(postEl.dataset.post);return}
    const platform=e.target.closest('[data-platform]');if(platform){changePost(state.selected,p=>{p.platforms=p.platforms.includes(platform.dataset.platform)?p.platforms.filter(x=>x!==platform.dataset.platform):[...p.platforms,platform.dataset.platform]});return}
    if(e.target.closest('[data-toggle-all]')){changePost(state.selected,p=>{p.platforms=p.platforms.length===PLATFORMS.length?[]:PLATFORMS.map(x=>x.id)});return}
    const status=e.target.closest('[data-status]');if(status){changePost(state.selected,p=>{p.status=status.dataset.status;if(p.status==='done'&&!p.publishedAt)p.publishedAt=p.date||keyOf(new Date())});return}
    const rm=e.target.closest('[data-remove-tag]');if(rm){changePost(state.selected,p=>p.tags.splice(Number(rm.dataset.removeTag),1));return}
    const rs=e.target.closest('[data-reschedule]');if(rs){changePost(state.selected,p=>{if(rs.dataset.reschedule==='backlog'){p.date=null;p.status='idea'}else{const d=parseDate(p.date)||new Date();d.setDate(d.getDate()+Number(rs.dataset.reschedule));p.date=keyOf(d);if(p.status==='idea')p.status='planned'}});return}
  });
  root.addEventListener('input',e=>{
    if(e.target.matches('[data-search]')){state.query=e.target.value;renderCalendarOnly();return}
    const field=e.target.dataset.field;if(!field)return;const p=posts.find(x=>x.id===state.selected);if(!p)return;p[field]=e.target.value;p.updatedAt=Date.now();scheduleSave();
    const title=$('[data-preview-title]'),caption=$('[data-preview-caption]');if(title&&field==='title')title.textContent=p.title||'Заголовок поста';if(caption&&field==='caption')caption.textContent=p.caption||'Текст поста…';
  });
  function renderCalendarOnly(){$('[data-calendar]').innerHTML=state.view==='month'?renderMonth():state.view==='week'?renderWeek():state.view==='day'?renderDay():renderList();renderCoverage();renderIdeas()}
  root.addEventListener('change',e=>{const field=e.target.dataset.field;if(!field)return;const p=posts.find(x=>x.id===state.selected);if(!p)return;p[field]=e.target.value;p.updatedAt=Date.now();scheduleSave();render()});
  root.addEventListener('keydown',e=>{if(e.target.matches('[data-tag-input]')&&(e.key==='Enter'||e.key===',')){e.preventDefault();const tag=e.target.value.trim().replace(/^#/,'');if(tag){changePost(state.selected,p=>{if(!p.tags.includes(tag))p.tags.push(tag)})}}if(e.key==='Escape'&&state.selected){state.selected=null;render()}});
  root.addEventListener('dragstart',e=>{const tileEl=e.target.closest('.cp-tile[draggable="true"]');if(!tileEl)return;dragId=tileEl.dataset.post;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',dragId)});
  root.addEventListener('dragover',e=>{if(!dragId)return;const cell=e.target.closest('[data-date]');if(cell){e.preventDefault();cell.classList.add('dragover')}});
  root.addEventListener('dragleave',e=>{const cell=e.target.closest('[data-date]');if(cell&&!cell.contains(e.relatedTarget))cell.classList.remove('dragover')});
  root.addEventListener('drop',e=>{if(!dragId)return;const cell=e.target.closest('[data-date]');if(!cell)return;e.preventDefault();const id=dragId,date=cell.dataset.date;dragId=null;changePost(id,p=>{p.date=date;if(p.status==='idea')p.status='planned'})});
  function cleanup(){disposed=true;clearTimeout(saveTimer);if(saveTimer)void saveNow();style.remove();root.remove()}
  window.addEventListener('pagehide',saveNow);
  render();
  return cleanup;
}
