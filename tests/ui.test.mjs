import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const course=readFileSync(new URL('../education/speakout-b1plus-builder.html',import.meta.url),'utf8');
const script=index.match(/<script>([\s\S]*?)<\/script>/)?.[1];
test('Aspace main script parses',()=>{assert.ok(script);new vm.Script(script)});
test('single board UI with complete panning',()=>{
 assert.equal((index.match(/async function openBoard\(/g)||[]).length,1);
 assert.match(index,/mousePan=.*null|let mousePan=null/);
 assert.match(index,/e\.button!==1&&e\.button!==2/);
 assert.match(index,/contextmenu/);
});
test('one background remains consistent at any zoom',()=>{
 assert.match(index,/\.bscroll\.dots\{background-image/);
 assert.match(index,/\.wrap\{[^\n]*background:transparent/);
 assert.match(index,/sc\.className='bscroll '\+bg/);
});
test('shapes use saved colors, spectrum and eyedropper',()=>{
 assert.match(index,/aspace-shape-palette/);
 assert.match(index,/new EyeDropper\(\)\.open\(\)/);
 assert.match(index,/Спектр: любой цвет фигуры/);
});
test('media embeds use provider allowlist and not upload calls',()=>{
 assert.match(index,/function externalMedia\(/);
 for(const domain of ['youtube-nocookie.com','player.vimeo.com','w.soundcloud.com'])
   assert.ok(index.includes(domain));
 assert.match(index,/Добавлено по ссылке, без загрузки в наши базы/);
});
test('call can outlive route navigation to boards',()=>{
 assert.match(index,/persistentCallSession/);
 assert.match(index,/callRoom\.on\('boardnav'/);
 assert.match(index,/Перейти на доску вместе/);
 assert.match(index,/cleanup=\(\)=>\{\}/);
});
test('Education serves a standalone local HTML builder',()=>{
 const begin=index.indexOf('async function eduView(m){'),end=index.indexOf('start();',begin);
 const edu=index.slice(begin,end).replace(/\/\/[^\n]*/g,'');
 assert.match(edu,/education\/speakout-b1plus-builder\.html/);
 assert.doesNotMatch(edu,/await load\(|await save\(|fetch\(|firebase|cloudflare/i);
 assert.match(course,/Speakout 3rd Edition/);
 assert.doesNotMatch(course,/fetch\(|firebase|indexedDB|localStorage|XMLHttpRequest/i);
});

test('guest access uses the canonical checked transport, not an unverified cached share',()=>{
 assert.match(index,/runtime.shareMeta\(token\)/);
 assert.match(index,/runtime.shared\(token\)/);
 assert.match(index,/\[401,403,404\].includes\(error.status\)/);
 assert.match(index,/unsyncedShareDraft/);
});
test('anonymous student video access is checked before opening the call',()=>{
 assert.match(index,/testGuestCallAccess\(id\)/);
 assert.match(index,/const read=await rawFetch\(base\+'\.json\?shallow=true'/);
 assert.match(index,/const probe=await fetch\(base\+'\.json'/);
 assert.match(index,/await new Promise\(\(resolve,reject\)=>/);
});
test('quota-safe board sync does not post oversized catch-up snapshots',()=>{
 assert.match(index,/if\(size>120000\)return/);
 assert.match(index,/if\(!isOwner\|\|x\.data\?\.from===r\.id/);
 assert.match(index,/Date\.now\(\)-lastStateReply<6000/);
});


test('external meeting providers request compact popup windows and offer retry when blocked',()=>{
 const begin=index.indexOf('function launchMeeting(service){');
 const end=index.indexOf('const defaultCall=',begin);
 const launch=index.slice(begin,end);
 assert.ok(launch.includes('popup=yes,resizable=yes,scrollbars=yes'));
 assert.ok(launch.includes("width='+width+',height='+height"));
 assert.ok(launch.includes('if(!popup){showCallInvitation(service,url);return}'));
 assert.ok(launch.includes('Повторить открытие отдельного окна'));
 assert.ok(launch.includes("target:'_blank'"));
 assert.ok(launch.includes("rel:'noopener noreferrer'"));
 assert.ok(launch.includes('Открыть звонок в отдельной вкладке'));
 assert.ok(launch.includes('Если браузер или телефон не поддерживает отдельное окно'));
 assert.match(index,/if\(service\)launchMeeting\(service\)/);
});


test('opening a shared board never starts a meeting automatically',()=>{
 assert.doesNotMatch(index,/if\(!isOwner&&!persistentCallSession\)\{const service=entryService\(\);if\(service\)launchMeeting\(service\);else openVideo\(true\)\}/);
 assert.match(index,/Opening the board itself must never start a call/);
});

test('student video button opens the channel selected by the owner',()=>{
 assert.match(index,/Канал по кнопке видео ученика/);
 assert.match(index,/vtop\.querySelector\('summary'\)\.addEventListener\('click'/);
 assert.match(index,/const service=entryService\(\);\s*if\(service\)launchMeeting\(service\);else openVideo\(true\)/);
});

test('student chat is visible when the shared board opens',()=>{
 assert.match(index,/chat\.open=!isOwner/);
 assert.match(index,/r\.on\('chat',event=>showChat\(event\.data,false\)\)/);
});

test('shared announcements can refresh from Firebase without the standby runtime',()=>{
 assert.match(index,/boardTransport\?await boardTransport\.read\(\):\s*boardShareToken\?\{value:await shareRead\(boardShareToken,'board'\)\}:null/);
 assert.match(index,/d\.announcement=value\.announcement&&typeof value\.announcement\.text==='string'\?value\.announcement:null/);
});

test('Firebase signaling waits through transient EventSource reconnects',()=>{
 assert.match(index,/if\(es\.readyState!==EventSource\.CLOSED\)return/);
});

test('eraser size is adjustable and pencil accepts any custom color',()=>{
 assert.match(index,/eraserWidth=32/);
 assert.match(index,/min:4,max:120,step:1,value:eraserWidth/);
 assert.match(index,/w:er\?eraserWidth/);
 assert.match(index,/type:'color',value:color,title:'Спектр карандаша'/);
 assert.match(index,/penColors\.add\(c\)/);
 assert.match(index,/＋ Добавить цвет/);
});
