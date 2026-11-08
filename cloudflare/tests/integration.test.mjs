import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html=readFileSync(new URL("../../index.html",import.meta.url),"utf8");

test("production main page keeps single board load and save entrypoints",()=>{
 assert.equal((html.match(/async function load\(p\)/g)||[]).length,1);
 assert.equal((html.match(/async function save\(p,d\)/g)||[]).length,1);
 assert.match(html,/if\(standbyController&&standbyKey\(p\)\)/);
});
test("standby mode is explicitly opt-in and owner gated",()=>{
 assert.match(html,/get\('standby'\)==='lab'/);
 assert.match(html,/user\?\.uid===CFG\.ownerUid/);
 assert.match(html,/replaceChildren\(E\('div',\{className:'warn'/);
});
test("standby controller bypasses legacy pending queue",()=>{
 assert.match(html,/async function syncLocalChanges\(\)\{\s*if\(standbyController\)return/);
});
test("real-time guest share endpoints remain unchanged in staging",()=>{
 assert.match(html,/const shareRead=async\(token,part\)/);
 assert.match(html,/const shareWrite=async\(token,part,value/);
});

test("board navigation keeps one persistent call window",()=>{
 assert.match(html,/let persistentCallSession=null/);
 assert.match(html,/callRoom\.on\('boardnav'/);
 assert.match(html,/cleanup=\(\)=>\{\}/);
 assert.match(html,/Перейти на доску вместе/);
});
test("external embeds are host-scoped and do not upload videos",()=>{
 assert.match(html,/function externalMedia\(raw\)/);
 assert.match(html,/youtube-nocookie\.com\/embed/);
 assert.match(html,/player\.vimeo\.com\/video/);
 assert.match(html,/w\.soundcloud\.com\/player/);
 assert.match(html,/Медиа по ссылке/);
});
test("shape palette and right-middle mouse pan are native board features",()=>{
 assert.match(html,/aspace-shape-palette/);
 assert.match(html,/new EyeDropper\(\)\.open\(\)/);
 assert.match(html,/e\.button!==1&&e\.button!==2/);
});
test("education view is a local static HTML builder without databases",()=>{
 const m=html.match(/async function eduView\(m\)\{([\s\S]*?)\n\}\n\nstart\(\)/);
 assert.ok(m);
 assert.match(m[1],/education\/speakout-b1plus-builder\.html/);
 assert.doesNotMatch(m[1].replace(/\/\/[^\n]*/g,''),/await load\(|await save\(|firebase|cloudflare/i);
});
