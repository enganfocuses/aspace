// All provider-wide readings are explicitly unknown or manually entered.
// Browser observations are local lower bounds, never billing totals.
export async function renderUsage(m,{getOwner,tracker,loadIndex,cfg,E,B}){
 if(!getOwner()){m.append(E('p',{textContent:'Этот раздел доступен только владельцу.'}));return ()=>{}}
 const {LIMITS,quotaStatus,utcDay}=window.AspaceUsage;
 const fmt=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1});
 const size=n=>{if(!Number.isFinite(n))return 'Нет данных';const units=['Б','кБ','МБ','ГБ'];let i=0;while(n>=1000&&i<3){n/=1000;i++}return fmt.format(n)+' '+units[i]};
 const date=n=>new Date(n).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК';
 const number=n=>Number.isFinite(n)?fmt.format(n):'Нет данных';
 let disposed=false,busy=false,timer=null,index={items:[]};
 const panel=E('section',{className:'usage-page'}),body=E('div'),stamp=E('p',{className:'mut',ariaLive:'polite'});
 const refreshButton=B('Обновить',()=>refresh(true));
 const head=E('div',{className:'usage-heading'},E('div',{},E('h2',{textContent:'Лимиты пространства'}),
  E('p',{className:'mut',textContent:'Файлы, доски, локальные копии и бесплатные лимиты сервисов'})),refreshButton);
 panel.append(head,stamp,body);m.append(panel);
 const link=(text,href)=>E('a',{textContent:text,href,target:'_blank',rel:'noopener noreferrer'});
 const card=(label,value,note)=>E('article',{className:'usage-card'},E('div',{className:'mut',textContent:label}),
  E('strong',{className:'usage-value',textContent:value}),E('p',{className:'mut',textContent:note}));
 const rows=[
  {id:'firebaseStorage',title:'Firebase · хранение базы',limit:LIMITS.firebaseStorage,unit:'МБ',scale:1e6,period:'current',note:'Бесплатный Spark: 1 ГБ. Файлы сейчас тоже хранятся в Realtime Database.'},
  {id:'firebaseDownloads',title:'Firebase · скачивание',limit:LIMITS.firebaseDownloads,unit:'МБ',scale:1e6,period:'month',note:'10 ГБ за месяц на Spark, включая служебный трафик. Не только содержимое файлов.'},
  {id:'firebaseConnections',title:'Firebase · одновременные соединения',limit:LIMITS.firebaseConnections,unit:'соединений',scale:1,period:'instant',note:'100 открытых realtime-соединений, а не 100 учеников. Одна вкладка может открыть несколько.'},
  {id:'workerRequests',title:'Cloudflare Worker · запросы',limit:LIMITS.workerRequests,unit:'запросов',scale:1,period:'day',note:'100 000 в сутки на весь аккаунт Workers Free. Сброс в 00:00 UTC / 03:00 МСК.'},
  {id:'d1Database',title:'Cloudflare D1 · одна база',limit:LIMITS.d1Database,unit:'МБ',scale:1e6,period:'current',note:'500 МБ для одной базы на Free. Суммарно все базы аккаунта — до 5 ГБ.'},
  {id:'d1Reads',title:'Cloudflare D1 · прочитанные строки',limit:LIMITS.d1Reads,unit:'строк',scale:1,period:'day',note:'5 000 000 строк в сутки на аккаунт Free. Один запрос может прочитать несколько строк.'},
  {id:'d1Writes',title:'Cloudflare D1 · записанные строки',limit:LIMITS.d1Writes,unit:'строк',scale:1,period:'day',note:'100 000 строк в сутки на аккаунт Free. Это не то же самое, что число HTTP-запросов.'}
 ];
 function periodFor(row){const day=utcDay(Date.now());return row.period==='day'?day:row.period==='month'?day.slice(0,7):row.period}
 function freshReading(row,record){
  if(!record||record.period!==periodFor(row))return false;
  const age=Date.now()-record.updatedAt;
  // Storage observations can change on other devices. Never keep a green old reading indefinitely.
  return age>=0&&age<(row.period==='instant'?5*60000:row.period==='current'?24*3600000:Infinity);
 }
 function inputFor(row,state,container){
  const previous=state.manual[row.id];
  const details=E('details',{className:'usage-reading'}),input=E('input',{
   type:'number',min:0,step:'any',value:previous?String(previous.value/row.scale):'',
   ariaLabel:row.title+' — использовано, '+row.unit,placeholder:'Из консоли, '+row.unit});
  const feedback=E('span',{className:'mut',ariaLive:'polite'});
  const save=B('Сохранить показание',()=>{
   if(input.value.trim()===''){feedback.textContent='Введите число; пустое поле означает отсутствие данных.';return}
   const value=Number(input.value)*row.scale;
   try{tracker.setManual(row.id,value,periodFor(row));void refresh(false)}catch(e){feedback.textContent=e.message}
  });
  details.append(E('summary',{textContent:'Внести показание из консоли'}),
   E('p',{className:'mut',textContent:'Это ручное показание общего расхода. Единица: '+row.unit+'. Сохраняется только в этом браузере.'}),
   E('div',{className:'row'},input,save,B('Убрать показание',()=>{tracker.clearManual(row.id);void refresh(false)})),feedback);
  container.append(details);
 }
 function quotaCards(state){
  const section=E('section',{},E('h3',{textContent:'Лимиты Firebase и Cloudflare'}),
   E('p',{className:'usage-notice',textContent:'Общий расход аккаунтов автоматически не подключён. Нет данных ≠ 0. Показания можно внести из консолей: тогда появятся остаток и предупреждение на 80%. Ниже — справочные лимиты бесплатных планов; тариф аккаунта нужно проверить в консоли.'}));
  const grid=E('div',{className:'usage-quota-grid'});
  for(const row of rows){
   const record=state.manual[row.id],fresh=freshReading(row,record),status=quotaStatus(fresh?record.value:null,row.limit);
   const display=row.scale===1?number:size;
   const item=E('article',{className:'usage-card usage-'+status.level},E('h4',{textContent:row.title}),
    E('div',{className:'usage-value',textContent:display(row.limit)}),E('p',{className:'mut',textContent:row.note}));
   if(status.known){
    item.append(E('p',{textContent:'Использовано '+display(record.value)+' · осталось '+display(status.remaining)}),
     E('progress',{value:Math.min(100,status.percent),max:100,ariaLabel:row.title+' — процент использования'}),
     E('p',{className:'mut',textContent:'Внесено вручную: '+date(record.updatedAt)+(status.level==='full'?' · Лимит достигнут':status.level==='warning'?' · Осталось менее 20%':'')}));
   }else item.append(E('p',{className:'usage-unknown',textContent:record?'Показание устарело — обнови его в консоли':'Использовано: нет данных · остаток неизвестен'}));
   inputFor(row,state,item);grid.append(item);
  }
  section.append(E('div',{className:'row usage-links'},
   link('Открыть Firebase Console','https://console.firebase.google.com/project/'+encodeURIComponent(cfg.firebase.projectId)+'/database'),
   link('Открыть Cloudflare','https://dash.cloudflare.com/')),
   E('p',{className:'mut',textContent:'Firebase → Realtime Database → Usage. Cloudflare → Workers & Pages → aspace-fallback-api → Metrics; D1 → aspace-fallback → Metrics.'}),grid);
  section.append(E('details',{},E('summary',{textContent:'Официальные источники и другие ограничения'}),
   E('p',{className:'mut',textContent:'Проверено 08.11.2026. Workers Free: CPU до 10 мс на запрос. Вход владельца использует отдельные лимиты Firebase Authentication. Трафик самого WebRTC-видео не равен трафику базы.'}),
   E('div',{className:'usage-links'},
    link('Firebase: хранение и скачивание','https://firebase.google.com/docs/database/usage/billing'),
    link('Firebase: соединения','https://firebase.google.com/docs/database/usage/limits'),
    link('Workers: бесплатный план','https://developers.cloudflare.com/workers/platform/pricing/'),
    link('D1: лимиты','https://developers.cloudflare.com/d1/platform/limits/'),
    link('D1: дневные квоты','https://developers.cloudflare.com/d1/platform/pricing/'))));
  return section;
 }
 function browserCounters(state){
  const day=utcDay(Date.now()),month=day.slice(0,7),today=state.days[day]||{};
  const totals={firebase:{requests:0,failed:0,uploadBytes:0,knownResponseBytes:0,unknownResponses:0},cloudflare:{requests:0,failed:0,uploadBytes:0,knownResponseBytes:0,unknownResponses:0}};
  for(const [key,data] of Object.entries(state.days))if(key.startsWith(month))for(const provider of Object.keys(totals))
   for(const name of Object.keys(totals[provider]))totals[provider][name]+=data[provider]?.[name]||0;
  const section=E('section',{},E('h3',{textContent:'Наблюдения этого браузера'}),
   E('p',{className:'mut',textContent:(state.startedAt?'Сбор включён '+date(state.startedAt)+'. ':'Пока нет наблюдений. ')+
    'Это только вкладки владельца на этом устройстве. Ученические устройства, SSE-потоки, видео и сетевые накладные расходы сюда не входят. Размер части ответов сервер не сообщает. Эти числа не показывают остаток общей квоты.'}));
  const table=E('table',{className:'usage-table'},E('thead',{},E('tr',{},...['Сервис','Запросов сегодня UTC','Запросов за месяц UTC','Известно отправленных байт','Известный размер ответов','Ответов без размера','Ошибок за месяц'].map(text=>E('th',{textContent:text})))));
  const body=E('tbody');
  for(const [provider,title] of [['firebase','Firebase'],['cloudflare','Cloudflare']]){
   const row=totals[provider];body.append(E('tr',{},...[
    title,number(today[provider]?.requests||0),number(row.requests),size(row.uploadBytes),size(row.knownResponseBytes),number(row.unknownResponses),number(row.failed)
   ].map(text=>E('td',{textContent:text}))));
  }
  table.append(body);section.append(E('div',{className:'usage-table-wrap'},table));return section;
 }
 async function refresh(reloadIndex=false){
  if(disposed||busy)return;
  if(!panel.isConnected){disposed=true;clearInterval(timer);return}
  busy=true;refreshButton.disabled=true;
  try{
   if(!getOwner()){body.replaceChildren(E('p',{textContent:'Нужен вход владельца.'}));return}
   if(reloadIndex)try{index=(await loadIndex())||{items:[]}}catch{}
   const state=tracker.snapshot();
   let estimate=null;try{estimate=await navigator.storage?.estimate()}catch{}
   const boards=(Array.isArray(index.items)?index.items:[]).filter(x=>x&&typeof x.id==='string').map(board=>{
    const key='boards/'+board.id;
    return {...board,measurement:state.boards[key]||null};
   });
   const measured=boards.filter(x=>x.measurement),attention=measured.filter(x=>!x.measurement.eligible||x.measurement.bytes>=LIMITS.boardBytes*.8||x.measurement.pending||x.measurement.conflict);
   const grid=E('div',{className:'usage-grid'},
    card('Один загружаемый файл','6 МиБ','Фактический предел приложения — 6 291 456 байт. Большие аудио и видео добавляются внешней ссылкой.'),
    card('Структура одной доски в резерве','700 кБ','700 000 байт JSON. Встроенные data: медиа в D1 не копируются; ссылки на файлы не равны резерву самих файлов.'),
    card('Локальное хранилище',estimate?size(estimate.usage)+' / '+size(estimate.quota):'Нет данных','Оценка браузера для всего origin '+location.origin+': включает локальные базы и кэши. Это не облачная квота.'),
    card('Требуют внимания',String(attention.length),'По последним измерениям '+measured.length+' из '+boards.length+' досок. Неизмеренные доски ещё не проверены.'));
   const boardSection=E('section',{},E('h3',{textContent:'Размеры досок и состояние резерва'}),
    E('p',{className:'mut',textContent:'Обновляются при открытии и сохранении доски. Этот экран не скачивает все уроки или медиа ради подсчёта. Запись «в резерве» относится к структуре, а не к файлам.'}));
   const table=E('table',{className:'usage-table'},E('thead',{},E('tr',{},...['Доска','JSON / предел 700 кБ','Состояние','Измерено'].map(text=>E('th',{textContent:text}))))),tbody=E('tbody');
   for(const board of boards.sort((a,b)=>(b.measurement?.bytes||0)-(a.measurement?.bytes||0))){
    const stat=board.measurement;let text='Ещё не измерена — открой доску';
    if(stat)text=stat.conflict?'Конфликт — версии сохранены':stat.embedded?'Встроенные медиа: резерв не поддерживается':!stat.eligible?'Размер превышает предел резерва':stat.pending?'Есть изменения, ожидающие синхронизации':stat.source==='cloudflare'?'Прочитана из резерва':stat.mirrored?'Копия в резерве подтверждена':stat.source==='cache'?'Локальная копия; резерв не проверен':'Резерв не подтверждён';
    if(stat?.eligible&&stat.bytes>=LIMITS.boardBytes*.8)text='Близко к пределу · '+text;
    tbody.append(E('tr',{},E('td',{textContent:String(board.name||'Доска')}),E('td',{textContent:stat?size(stat.bytes)+' / 700 кБ':'Нет данных'}),
     E('td',{textContent:text,className:stat&&(!stat.eligible||stat.conflict)?'usage-alert':''}),E('td',{textContent:stat?.updatedAt?date(stat.updatedAt):'—'})));
   }
   if(!boards.length)tbody.append(E('tr',{},E('td',{textContent:'Список досок не загружен или пока пуст.',colSpan:4})));
   table.append(tbody);boardSection.append(E('div',{className:'usage-table-wrap'},table));
   const disconnected=E('section',{className:'usage-notice'},E('h3',{textContent:'Ещё не подключено'}),
    E('p',{textContent:'Backblaze B2, Open Relay и независимый вход владельца пока только предложены. Их бесплатные лимиты не прибавлены к доступному месту. Firebase Storage / R2 для загрузок не используются.'}),
    E('p',{className:'mut',textContent:'Остаток общей квоты станет достоверным после подключения статистики провайдера или ввода свежего показания из его консоли. Приложение не запрашивает ключи администрирования и не отправляет эти наблюдения сторонним сервисам.'}));
   if(disposed||!getOwner())return;
   const activeInput=body.contains(document.activeElement)&&['INPUT','TEXTAREA'].includes(document.activeElement.tagName);
   if(activeInput&&!reloadIndex)return;
   body.replaceChildren(grid,quotaCards(state),browserCounters(state),boardSection,disconnected);
   stamp.textContent='Локальные данные обновлены '+date(Date.now())+' · автообновление каждые 15 секунд';
  }catch(error){if(!disposed)stamp.textContent='Не удалось обновить: '+error.message}
  finally{busy=false;refreshButton.disabled=false}
 }
 await refresh(true);if(disposed)return ()=>{};timer=setInterval(()=>{void refresh(false)},15000);
 return ()=>{disposed=true;clearInterval(timer)};
}
