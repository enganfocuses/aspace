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
 assert.match(html,/root\.replaceChildren\(E\('div',\{className:'warn'/);
});
test("standby controller bypasses legacy pending queue",()=>{
 assert.match(html,/async function syncLocalChanges\(\)\{\s*if\(standbyController\)return/);
});
test("real-time guest share endpoints remain unchanged in staging",()=>{
 assert.match(html,/const shareRead=async\(token,part\)/);
 assert.match(html,/const shareWrite=async\(token,part,value/);
});
