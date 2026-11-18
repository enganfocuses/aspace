import {savedBooks, savedBook, identifyOriginal, saveOriginal, displayPdf} from './book-library.mjs';
import {LESSONS,SOURCES,VYGOTSKY,DEFENSES} from './course-data.mjs?v=2';
import {BOOK_EXCERPTS} from './book-excerpts.mjs';
import {WORKSHEETS,CASES} from './worksheets.mjs';
import {VAULT_KEY} from './vault.mjs';
import {LocalJournal} from './local-journal.mjs';
const $=id=>document.getElementById(id),E=(tag,props={},...kids)=>{const e=document.createElement(tag);Object.assign(e,props);e.append(...kids.filter(x=>x!==null&&x!==undefined));return e},B=(text,fn,cls='')=>E('button',{type:'button',textContent:text,onclick:fn,className:cls}),P=(text,cls='')=>E('p',{textContent:text,className:cls});
const links=(text,url)=>E('a',{href:url,textContent:text,target:'_blank',rel:'noopener noreferrer',referrerPolicy:'no-referrer'});
const main=$('content'),progressKey='aspace-psychology-progress-v1';let progress={done:[],last:null};
try{const p=JSON.parse(localStorage.getItem(progressKey));if(p&&Array.isArray(p.done))progress={done:[...new Set(p.done.filter(id=>LESSONS.some(l=>l.id===id)))],last:LESSONS.some(l=>l.id===p.last)?p.last:null}}catch{}
let journalStore=null;
try{journalStore=new LocalJournal()}catch{}
let editor=null,saveTimer=null,dirty=false,pdfURL=null,noticeTimer=null;
const trainingLesson='integration';
const toast=text=>{$('message').textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('message').textContent=''},6500)};
const date=iso=>new Date(iso).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'});
function saveProgress(){try{localStorage.setItem(progressKey,JSON.stringify(progress))}catch{toast('Отметка сохранится только до закрытия страницы: хранилище недоступно.')}}
async function flush(){clearTimeout(saveTimer);if(!dirty||!editor||!journalStore)return;const active=editor,revision=editor.revision;const fields=Object.fromEntries(active.inputs.map(([id,input])=>[id,input.value]));
 try{await journalStore.mutate(d=>{d.drafts[active.key]={type:active.type,title:active.title,fields,entryId:active.entryId||null,updatedAt:new Date().toISOString()}});if(editor===active){dirty=active.revision!==revision;active.status.textContent=dirty?'Черновик сохранён; есть новые изменения…':'Черновик сохранён на этом устройстве'}}catch(error){active.status.textContent=error.message;throw error}}
addEventListener('pagehide',()=>{void flush().catch(()=>{})});
addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue=''}});
const nav=[['home','Маршрут'],['practice','Практикум'],['library','Библиотека'],['journal','Мой дневник']];
for(const [view,text] of nav)$('nav').append(B(text,()=>show(view)));
function focusTitle(){main.querySelector('h1')?.setAttribute('tabindex','-1');main.querySelector('h1')?.focus({preventScroll:true})}
async function show(view,arg=null,training=false){
 try{await flush()}catch(e){toast(e.message);return}
 editor=null;dirty=false;main.replaceChildren();
 for(const [i,[name]] of nav.entries())$('nav').children[i].setAttribute('aria-current',name===view||view==='lesson'&&name==='home'?'page':'false');
 if(pdfURL){URL.revokeObjectURL(pdfURL);pdfURL=null}
 try{({home:home,lesson:()=>lesson(arg),practice:practice,library:library,journal:journal,worksheet:()=>worksheet(arg),entry:()=>entry(arg)})[view]?.();focusTitle();window.scrollTo({top:0,behavior:'instant'});if(view==='lesson'&&arg===trainingLesson&&training)document.getElementById('situation-training')?.scrollIntoView()}catch(e){main.append(P('Не удалось открыть раздел: '+e.message,'error'))}
}
function stat(value,text){return E('div',{className:'stat'},E('strong',{textContent:String(value)}),E('span',{textContent:text}))}
function home(){
 main.append(E('section',{className:'hero'},E('div',{className:'eyebrow',textContent:'Теория · практика · личные открытия'}),E('h1',{textContent:'КПТ: учиться понимать свои реакции'}),P('Теория — дословные фрагменты из двух учебников Джудит Бек, которые ты загрузила. В каждом модуле указаны книга, глава и страницы PDF. Авторский тренажёр отделён от текста учебников.'),E('div',{className:'row'},B('Продолжить обучение',()=>show('lesson',progress.last||LESSONS.find(l=>!progress.done.includes(l.id))?.id||LESSONS[0].id),'primary'),B('Выбрать рабочую форму',()=>show('practice')))));
 main.append(E('div',{className:'stats'},stat(LESSONS.length,'подробных модулей'),stat(LESSONS.length*3,'задания к теории'),stat(WORKSHEETS.length,'рабочих форм'),stat(progress.done.length+'/'+LESSONS.length,'отмечено изученными')));
 main.append(E('aside',{className:'notice'},P('Как пользоваться'),P('Читай один модуль, разбирай пример, пробуй посильное упражнение и возвращайся к результату. Отметка о прохождении — учебный прогресс, а не оценка психического здоровья. Для личных записей открой личный дневник. Ничего личного не отправляется в Firebase.','mut')));
 const search=E('input',{type:'search',placeholder:'Найти тему: тревога, мысли, границы…',ariaLabel:'Поиск по курсу'}),filter=E('select',{ariaLabel:'Этап курса'},E('option',{value:'',textContent:'Все этапы'}),...[...new Set(LESSONS.map(l=>l.stage))].map(stage=>E('option',{value:stage,textContent:stage}))),grid=E('div',{className:'grid'});
 const draw=()=>{const query=search.value.trim().toLocaleLowerCase('ru');const found=LESSONS.filter(l=>(!filter.value||l.stage===filter.value)&&[l.title,l.goal,l.id===trainingLesson?'Тренинги ситуаций':'',...BOOK_EXCERPTS[l.id].pages.map(p=>p.text)].join(' ').toLocaleLowerCase('ru').includes(query));grid.replaceChildren(...found.map(l=>E('article',{className:'card'},E('div',{className:'lesson-number',textContent:String(LESSONS.indexOf(l)+1).padStart(2,'0')+' / '+LESSONS.length+' · '+l.stage}),E('h3',{textContent:l.title}),P(l.goal),P('Около 25 минут чтения и практики · '+(progress.done.includes(l.id)?'изучено':'можно начать'),'meta'),B('Открыть модуль',()=>show('lesson',l.id)),l.id===trainingLesson?B('Тренинги ситуаций',()=>show('lesson',l.id,true)):null)));if(!found.length)grid.append(P('По этому запросу модулей нет. Попробуй другое слово.'))};search.oninput=draw;filter.onchange=draw;main.append(E('h2',{textContent:'Твой учебный маршрут'}),E('div',{className:'filters'},search,filter),grid);draw();
}
function questionBlock(question,index){const feedback=P('','feedback'),form=E('fieldset',{className:'question'},E('legend',{textContent:'Вопрос '+(index+1)}),P(question.text)),name=crypto.randomUUID();
 const choices=question.options.map((text,i)=>{const input=E('input',{type:'radio',name,value:String(i)});return {input,label:E('label',{className:'option'},input,E('span',{textContent:text}))}});
 form.append(E('div',{className:'options'},...choices.map(x=>x.label)),B('Проверить ответ',()=>{const selected=choices.findIndex(x=>x.input.checked);if(selected<0){feedback.textContent='Выбери вариант ответа.';return}feedback.textContent=(selected===question.answer?'Верно. ':'Попробуй пересмотреть ответ. ')+question.why;feedback.className='feedback '+(selected===question.answer?'success':'');}),feedback);feedback.setAttribute('aria-live','polite');return form;
}
function lesson(id){const l=LESSONS.find(l=>l.id===id)||LESSONS[0],i=LESSONS.indexOf(l);progress.last=l.id;saveProgress();const content=E('article',{className:'reading'}),side=E('aside',{className:'side no-print'},...LESSONS.map((x,j)=>B(String(j+1).padStart(2,'0')+' '+x.title,()=>show('lesson',x.id),x.id===l.id?'current':'')));
 content.append(E('div',{className:'eyebrow',textContent:l.stage+' · модуль '+(i+1)+' из '+LESSONS.length}),E('h1',{textContent:l.title}),P('Учебная цель модуля · редакционная навигация: '+l.goal,'meta'),P('Чтение: '+l.reading,'meta'));
 if(l.id===trainingLesson)content.append(B('Перейти к тренингам ситуаций',()=>document.getElementById('situation-training')?.scrollIntoView()));
 const source=BOOK_EXCERPTS[l.id];
 content.append(E('h2',{textContent:'Текст учебника · дословно'}),P(source.book,'source-book'),P(source.chapter,'meta'),E('aside',{className:'notice'},P('Ниже — фрагменты из загруженного PDF, без авторского пересказа. Указаны номера страниц PDF, а не печатная пагинация. Обращение автора к терапевту не является персональным назначением читателю.','mut')));
 if(source.ocr)content.append(P('Эта книга отсканирована. Основное чтение — изображения оригинальных страниц. Распознанный текст раскрывается отдельно и может содержать ошибки OCR.','mut'));
 else content.append(P('Сохранены слова, пунктуация и переносы текстового слоя PDF. Иллюстрации и исходная вёрстка не воспроизводятся в текстовом слое. Для страниц без доступного текстового слоя показаны оригинальные изображения. Две пустые страницы исходного PDF не включены. Контекст фрагмента — в указанной главе.','mut'));
 const extracts=E('div',{className:'book-extracts'});
 for(const page of source.pages){
  const section=E('section',{className:'source-page'},E('h3',{textContent:'Страница PDF '+page.page}));
  const quote=E('blockquote',{className:'verbatim',textContent:page.text});
  if(page.images){
   const images=E('div',{className:'facsimile'},...page.images.map((src,i)=>E('img',{src,loading:'lazy',alt:'Оригинальная страница '+page.page+', часть '+(i+1)+' из '+page.images.length})));
   section.append(images);if(page.text.length>=150)section.append(E('details',{},E('summary',{textContent:source.ocr?'Показать распознанный текст · возможны ошибки OCR':'Показать текстовый слой страницы'}),quote));else section.append(P('Текст или схема на этой странице представлены изображением. Выше — оригинал страницы PDF.','mut'));
  }else section.append(quote);
  section.append(P(source.book+' · '+source.chapter+' · PDF '+page.page,'source-caption'));extracts.append(section);
 }
 content.append(extracts);
 const ex=E('dl',{className:'example'});['Ситуация','Первоначальный взгляд','Другой шаг','Как понимать результат'].forEach((label,j)=>ex.append(E('dt',{textContent:label}),E('dd',{textContent:l.example[j]})));content.append(E('h2',{textContent:'Авторский разбор · не цитата из учебника'}),ex,E('h2',{textContent:'Авторские задания тренажёра'}),E('ol',{},...l.practice.map(t=>E('li',{textContent:t}))),B('Открыть практику этого модуля',()=>show('worksheet',{lessonId:l.id}),'primary'),E('h2',{textContent:'Авторская проверка понимания'}),...l.questions.map(questionBlock));
 if(l.id===trainingLesson)content.append(situationTraining());
 content.append(E('div',{className:'toolbar no-print'},B(progress.done.includes(l.id)?'Убрать отметку об изучении':'Отметить модуль изученным',()=>{progress.done=progress.done.includes(l.id)?progress.done.filter(x=>x!==l.id):[...progress.done,l.id];saveProgress();show('lesson',l.id)}),B('Печать теории / PDF',()=>window.print()),...(i>0?[B('← Предыдущий',()=>show('lesson',LESSONS[i-1].id))]:[]),...(i<LESSONS.length-1?[B('Следующий →',()=>show('lesson',LESSONS[i+1].id))]:[])));
 main.append(E('div',{className:'workspace'},side,content));
}
function practice(){main.append(E('h1',{textContent:'Практикум'}),P('Выбирай форму по задаче. Одна запись — один посильный эпизод. В личном дневнике формы сохраняются в этом браузере.'),E('div',{className:'grid'},...WORKSHEETS.map(w=>E('article',{className:'card'},E('h3',{textContent:w.title}),P(w.intro),P(w.fields.length+' полей с подсказками','meta'),B('Открыть форму',()=>show('worksheet',{id:w.id}))))));}
function situationTraining(){
 const section=E('section',{id:'situation-training',className:'situation-training'},
  E('h2',{textContent:'Тренинги ситуаций'}),
  P('Выбери ситуацию, прочитай пример и проверь свой ответ. Всего ситуаций: '+CASES.length+'.'));
 const select=E('select',{ariaLabel:'Выбрать ситуацию'},...CASES.map((c,i)=>E('option',{value:String(i),textContent:(i+1)+'. '+c.title})));
 const panels=CASES.map((c,i)=>E('article',{className:'case-panel',hidden:i!==0},
  E('h3',{textContent:c.title}),P(c.story),questionBlock({text:c.question,options:c.options,answer:c.answer,why:c.why},i)));
 const prev=B('← Предыдущая',()=>step(-1)),next=B('Следующая →',()=>step(1));
 function update(){
  panels.forEach((panel,i)=>{panel.hidden=i!==select.selectedIndex});
  prev.disabled=select.selectedIndex===0;
  next.disabled=select.selectedIndex===panels.length-1;
 }
 function step(direction){select.selectedIndex+=direction;update()}
 select.onchange=update;
 section.append(select,...panels,E('div',{className:'row'},prev,next));
 update();
 return section;
}
function download(name,value,type='application/json'){const url=URL.createObjectURL(new Blob([value],{type})),a=E('a',{href:url,download:name});a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function journalUnavailable(){main.append(P('Данные дневника недоступны в этом браузере.','error'))}
function journalBackups(){
 const old=localStorage.getItem(VAULT_KEY);
 const pass=E('input',{type:'password',placeholder:'Пароль старой копии',ariaLabel:'Пароль старой копии'});
 const file=E('input',{type:'file',accept:'.json,application/json',hidden:true});
 const status=P('','feedback');
 status.setAttribute('role','status');
 const restore=B('Выбрать JSON-копию',()=>file.click());
 const migrate=B('Перенести прежние записи',()=>void importRecords(old,true));
 async function importRecords(raw,migrating){
  restore.disabled=migrate.disabled=true;
  try{
   await journalStore.import(raw,pass.value,migrating);
   pass.value='';
   await show('journal');
   toast('Записи добавлены в дневник.');
  }catch(error){status.textContent=error.message}
  finally{restore.disabled=migrate.disabled=false}
 }
 file.onchange=async()=>{
  const selected=file.files[0];
  file.value='';
  if(!selected)return;
  if(selected.size>14_000_000){status.textContent='Файл слишком большой.';return}
  try{await importRecords(await selected.text(),false)}catch(error){status.textContent=error.message}
 };
 return E('details',{className:'backup no-print'},E('summary',{textContent:'Резервные копии и перенос записей'}),
  P('Пароль нужен только для переноса записей из прежнего зашифрованного дневника или старой зашифрованной копии.','mut'),
  E('div',{className:'row'},pass,restore,old&&!journalStore.data.legacyImported?migrate:null),
  file,status);
}
function worksheet(arg={}){
 let w,entryId=arg.entryId||null;
 if(arg.lessonId){const l=LESSONS.find(l=>l.id===arg.lessonId);if(!l)return practice();w={id:'lesson-'+l.id,title:'Практика · '+l.title,intro:'Ответь на задания своими словами. Можно сохранить частичную работу и вернуться к ней.',fields:l.practice.map((text,i)=>({id:'task'+i,label:'Задание '+(i+1),hint:text,type:'text'}))};}
 else w=WORKSHEETS.find(w=>w.id===arg.id)||WORKSHEETS[0];
 if(!journalStore){journalUnavailable();return}
 journalStore.data=journalStore.read();
 const key=arg.draftKey||(entryId?'edit-'+entryId:w.id),draft=journalStore.data.drafts[key],original=entryId?journalStore.data.entries.find(e=>e.id===entryId):null,values=draft?.fields||original?.fields||{},form=E('form',{className:'journal'}),status=P('Все записи остаются на этом устройстве.','save-status'),fieldset=E('fieldset',{style:'border:0;padding:0;margin:0'});
 form.append(E('h1',{textContent:w.title}),P(w.intro),status);const inputs=[];
 for(const f of w.fields){const input=f.type==='rating'?E('input',{type:'number',min:0,max:100,step:1,value:values[f.id]||'',placeholder:'0–100 или оставь пустым'}):E('textarea',{value:values[f.id]||'',rows:4,maxLength:30000});input.setAttribute('aria-label',f.label);inputs.push([f.id,input]);fieldset.append(E('label',{className:'field'},E('span',{textContent:f.label}),...(f.hint?[E('small',{textContent:f.hint})]:[]),input));}
 editor={key,type:w.id,title:w.title,entryId,inputs,status,revision:0};
 for(const [,input] of inputs)input.oninput=()=>{dirty=true;editor.revision++;status.textContent='Есть изменения…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>{void flush().catch(e=>toast(e.message))},700)};
 const submit=E('button',{type:'submit',textContent:entryId?'Сохранить изменения записи':'Сохранить запись в дневнике',className:'primary'});
 fieldset.append(E('div',{className:'toolbar no-print'},submit,B('К списку записей',()=>show('journal'))));form.append(fieldset);
 form.onsubmit=async e=>{e.preventDefault();if(!journalStore)return;const fields=Object.fromEntries(inputs.map(([id,input])=>[id,input.value]));if(!Object.values(fields).some(v=>v.trim())){status.textContent='Заполни хотя бы одно поле; частичную запись сохранить можно.';return}fieldset.disabled=true;
 try{await flush();const active=editor,id=entryId||crypto.randomUUID(),now=new Date().toISOString();await journalStore.mutate(d=>{const record={id,type:w.id,title:w.title,lessonId:arg.lessonId||null,fields,createdAt:original?.createdAt||now,updatedAt:now,deleted:false};const index=d.entries.findIndex(e=>e.id===id);if(index>=0)d.entries[index]=record;else d.entries.unshift(record);delete d.drafts[active.key]});dirty=false;editor=null;toast('Запись сохранена в дневнике');await show('entry',id)}catch(error){status.textContent=error.message;fieldset.disabled=false}
 };
 main.append(form);
}
function journal(){
 if(!journalStore){journalUnavailable();return}
 journalStore.data=journalStore.read();
 const section=E('section',{className:'journal'},E('h1',{textContent:'Мой дневник'}),P('Записи сохраняются в этом браузере без отдельного пароля и шифрования. Для переноса на другое устройство скачай резервную копию.','mut'),E('div',{className:'toolbar no-print'},B('Новая запись',()=>show('practice'),'primary'),B('Скачать копию',()=>download('aspace-psychology-journal.json',JSON.stringify(journalStore.data)))));
 section.append(journalBackups());
 const search=E('input',{type:'search',ariaLabel:'Поиск в открытом дневнике',placeholder:'Поиск в открытых записях'}),trash=E('input',{type:'checkbox'}),list=E('div');section.append(search,E('label',{className:'row no-print',style:'margin-top:15px'},trash,E('span',{textContent:'Показать корзину'})),list);
 const draw=()=>{const query=search.value.trim().toLocaleLowerCase('ru'),entries=journalStore.data.entries.filter(e=>!!e.deleted===trash.checked&&[e.title,...Object.values(e.fields)].join(' ').toLocaleLowerCase('ru').includes(query));list.replaceChildren(...entries.map(e=>E('article',{className:'entry'},E('h3',{textContent:e.title}),P(date(e.createdAt)+' МСК','meta'),P(Object.values(e.fields).filter(Boolean).join(' · ').slice(0,180)),E('div',{className:'row'},B('Открыть',()=>show('entry',e.id)),...(e.deleted?[B('Вернуть из корзины',async()=>{try{await journalStore.mutate(d=>{d.entries.find(x=>x.id===e.id).deleted=false});draw()}catch(error){toast(error.message)}})]:[B('В корзину',async()=>{try{await journalStore.mutate(d=>{d.entries.find(x=>x.id===e.id).deleted=true});draw()}catch(error){toast(error.message)}})])))));if(!entries.length)list.append(P(trash.checked?'Корзина пуста.':'Пока нет подходящих записей. Открой рабочую форму в практикуме.','empty'))};search.oninput=draw;trash.onchange=draw;draw();
 const drafts=Object.entries(journalStore.data.drafts);if(drafts.length)section.append(E('h2',{textContent:'Незавершённые черновики'}),...drafts.map(([draftKey,d])=>B(d.title,()=>show('worksheet',d.type.startsWith('lesson-')?{lessonId:d.type.slice(7),entryId:d.entryId||null,draftKey}:{id:d.type,entryId:d.entryId||null,draftKey}))));
 const pairs=journalStore.data.entries.filter(e=>!e.deleted&&e.type==='thought'&&e.fields.before!==''&&e.fields.after!==''&&Number.isFinite(Number(e.fields.before))&&Number.isFinite(Number(e.fields.after))).slice(0,10);
 if(pairs.length){
  const head=E('thead',{},E('tr',{},...['Дата','До','После'].map(t=>E('th',{textContent:t}))));
  const rows=pairs.map(e=>E('tr',{},E('td',{textContent:date(e.createdAt)}),E('td',{textContent:e.fields.before}),E('td',{textContent:e.fields.after})));
  const table=E('table',{},head,E('tbody',{},...rows));
  section.append(E('h2',{textContent:'Последние наблюдения интенсивности'}),P('Личные оценки 0–100, не диагностическая шкала. Их рост или снижение сами по себе не определяют результат обучения.','mut'),E('div',{className:'table-scroll'},table));
 }
 main.append(section);
}
function entry(id){if(!journalStore){journalUnavailable();return}journalStore.data=journalStore.read();const e=journalStore.data.entries.find(e=>e.id===id);if(!e){main.append(P('Запись не найдена.'),B('К дневнику',()=>show('journal')));return}const w=WORKSHEETS.find(w=>w.id===e.type),l=e.lessonId?LESSONS.find(l=>l.id===e.lessonId):null,labels=new Map(w?.fields.map(f=>[f.id,f.label])||l?.practice.map((t,i)=>['task'+i,'Задание '+(i+1)+' · '+t])||[]),dl=E('dl',{className:'entry'});
 for(const [key,value] of Object.entries(e.fields))if(value)dl.append(E('dt',{textContent:labels.get(key)||key}),E('dd',{textContent:value}));
 main.append(E('article',{className:'journal'},E('h1',{textContent:e.title}),P(date(e.createdAt)+' МСК'+(e.deleted?' · в корзине':''),'meta'),E('div',{className:'toolbar no-print'},B('← Дневник',()=>show('journal')),B('Редактировать',()=>show('worksheet',{id:e.type,lessonId:e.lessonId,entryId:e.id})),B('Печать этой записи / PDF',()=>window.print())),dl));
}
function library(){
 const holder=E('section',{className:'book',hidden:true});
 const originals=E('div');
 const importStatus=P('', 'mut');
 importStatus.setAttribute('role','status');
 const files=E('input',{type:'file',accept:'application/pdf,.pdf',multiple:true,hidden:true});
 const importButton=B('Добавить оригиналы из архива',()=>files.click());
 let selection=0;
 async function openPdf(file,title,request){
  if(request!==selection||!holder.isConnected)return;
  if(pdfURL)URL.revokeObjectURL(pdfURL);
  const url=URL.createObjectURL(file.slice(0,file.size,'application/pdf'));
  pdfURL=url;
  const close=B('Закрыть PDF',()=>{
   ++selection;URL.revokeObjectURL(url);pdfURL=null;holder.replaceChildren();holder.hidden=true;
  });
  holder.hidden=false;
  holder.replaceChildren(E('h2',{textContent:title}),E('div',{className:'row'},links('Открыть оригинал отдельно',url),close));
  holder.scrollIntoView({block:'start'});
  await displayPdf(file,holder,()=>holder.isConnected&&pdfURL===url,E,B,P);
 }
 async function refresh(){
  let ids=[];
  try{ids=await savedBooks()}catch{importStatus.textContent='Хранилище браузера недоступно. Открыть PDF можно через «Читать другой PDF».'}
  originals.replaceChildren(...SOURCES.map(source=>{
   const content=[E('span',{className:'tag',textContent:source.kind}),E('h2',{textContent:source.title}),P(source.detail),P(source.chapters)];
   if(ids.includes(source.id))content.push(B('Открыть PDF',async()=>{
    const request=++selection;
    try{const file=await savedBook(source.id);if(file)await openPdf(file,source.title,request);else await refresh()}
    catch{toast('Не удалось открыть сохранённый PDF.')}
   },'primary'));
   else content.push(P('Оригинал ещё не добавлен на этом устройстве.','mut'));
   return E('article',{className:'book'},...content);
  }));
 }
 files.onchange=async()=>{
  if(!files.files.length)return;
  importButton.disabled=true;
  importStatus.textContent='Добавляю оригиналы…';
  const added=new Set(),skipped=[];
  try{
   for(const file of files.files){
    const id=await identifyOriginal(file);
    if(id){await saveOriginal(id,file);added.add(id)}
    else skipped.push(file.name);
   }
   importStatus.textContent=[added.size?`Добавлено книг: ${added.size}.`:'',skipped.length?`Файлы вне архива: ${skipped.join(', ')}.`:''].filter(Boolean).join(' ');
  }catch{importStatus.textContent='Не удалось сохранить все выбранные файлы. Проверь свободное место в браузере.'}
  finally{files.value='';importButton.disabled=false;await refresh()}
 };
 const other=E('input',{type:'file',accept:'application/pdf,.pdf',hidden:true});
 other.onchange=async()=>{
  const file=other.files[0];
  const request=++selection;
  other.value='';
  if(!file)return;
  if(!(await file.slice(0,5).text()).startsWith('%PDF-')){toast('Выбери файл в формате PDF.');return}
  await openPdf(file,file.name,request);
 };
 main.append(E('h1',{textContent:'Библиотека и источники'}),
  E('section',{className:'book'},P('Распакуй исходный архив и выбери его PDF одним действием. Aspace распределит оригиналы по карточкам и сохранит их в этом браузере.'),E('div',{className:'row'},importButton,B('Читать другой PDF',()=>other.click())),files,other,importStatus),
  holder,originals);
 void refresh();
 main.append(E('article',{className:'book'},E('div',{className:'eyebrow',textContent:'Дополнительное чтение · '+VYGOTSKY.year}),E('h2',{textContent:VYGOTSKY.title}),P(VYGOTSKY.intro),E('div',{className:'row'},links('Читать книгу в библиотеке МГППУ',VYGOTSKY.reader),links('Проверить издание в РГБ',VYGOTSKY.catalog)),E('h3',{textContent:'Вопросы к чтению по семи главам'}),E('ol',{className:'book-list'},...VYGOTSKY.chapters.map(([title,question])=>E('li',{},E('strong',{textContent:title}),P(question,'mut')))),B('Открыть заметки по чтению',()=>show('worksheet',{id:'reading'}))));
 main.append(E('article',{className:'book'},E('h2',{textContent:DEFENSES.title}),...DEFENSES.sections.map(([title,text])=>E('section',{},E('h3',{textContent:title}),P(text))),B('Записать наблюдение через карту эпизода',()=>show('worksheet',{id:'model'}))));
 main.append(E('section',{className:'notice'},E('h3',{textContent:'Дополнительная проверка подхода'}),P('Курс не обещает лечебного эффекта и не заменяет помощь. Рекомендации NICE описывают структурированную самопомощь с поддержкой подготовленного специалиста; здесь такой поддержки автоматически нет.','mut'),E('div',{className:'row'},links('NICE · рекомендации по депрессии', 'https://www.nice.org.uk/guidance/ng222/chapter/recommendations'),links('Beck Institute · учебные ресурсы','https://beckinstitute.org/cbt-resources/resources-for-professionals-and-students/cbtresources/'))));
}
void show('home');
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('../sw.js').catch(()=>{});
