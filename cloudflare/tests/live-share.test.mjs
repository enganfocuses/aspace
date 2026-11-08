import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
const worker=readFileSync(new URL("../worker.js",import.meta.url),"utf8");
const validators=worker.slice(worker.indexOf("function isPrototypeDoc("),worker.indexOf("async function readBody("));
assert.ok(validators.startsWith("function isPrototypeDoc("));
const {isPrototypeDoc,isLiveBoardDoc,isShareableDoc,validLiveBoard}=new Function(validators+
  "\nreturn {isPrototypeDoc,isLiveBoardDoc,isShareableDoc,validLiveBoard};")();
const hashSource=worker.slice(worker.indexOf("async function shareTokenHash("),worker.indexOf("function isPrototypeDoc("));
const shareTokenHash=new Function("crypto",hashSource+"\nreturn shareTokenHash;")(webcrypto);
const sample=()=>({name:"English lesson",bg:"dots",siteUrl:"https://example.com",
  items:[{id:"note123",k:"note",x:40,y:30,w:180,h:140,t:"Hello",c:"#ffeeaa"}],
  strokes:[{id:"stroke123",w:4,c:"#112233",p:[10,10,50,50]}]});
test("Aspace live board keys restricted to boards/ID",()=>{
 assert.equal(isPrototypeDoc("prototype-board-v1"),true);
 assert.equal(isLiveBoardDoc("boards/abc_123"),true);
 for(const key of ["meta/boards","boards/../secret","users/a","boards/x/y",
  "rooms/owner","docs/boards/a"]){
  assert.equal(isShareableDoc(key),false,key);
 }
});
test("valid existing Aspace board schema accepted",()=>{
 assert.equal(validLiveBoard(sample()),true);
 const b=sample();b.items.push({id:"vid2",k:"embed",x:200,y:10,w:440,h:280,
  u:"https://www.youtube.com/watch?v=AbCdEfGhI12"});
 assert.equal(validLiveBoard(b),true);
});
test("published failover diagnostic uses the actual flat stroke format",()=>{
 const html=readFileSync(new URL("../../cloudflare-failover-check.html",import.meta.url),"utf8");
 const fixture=html.match(/const fixture=(\{[\s\S]*?\});\n try\{/);
 assert.ok(fixture);
 assert.equal(validLiveBoard(new Function('return ('+fixture[1]+')')()),true);
});
test("malformed fields and excessively large content rejected",()=>{
 const invalid=[
  {name:"Wrong",items:null,strokes:[]},
  {...sample(),items:[{id:"../../malicious",k:"note",x:0,y:0,w:100,h:100}]},
  {...sample(),items:[{id:"abc",k:"evil",x:0,y:0,w:100,h:100}]},
  {...sample(),strokes:[{id:"s1",w:2,p:[1,2,3]}]},
  {...sample(),strokes:[{id:"s1",w:2,p:[1,Infinity]}]},
  {...sample(),siteUrl:"a".repeat(3000)},
 ];
 for(const board of invalid)assert.equal(validLiveBoard(board),false);
});
test("legacy 48-character guest tokens hash without storing raw token",async()=>{
 const token="a".repeat(48);
 const hashed=await shareTokenHash(token);
 assert.match(hashed,/^[a-f0-9]{64}$/);
 assert.equal(await shareTokenHash(token),hashed);
 assert.equal(await shareTokenHash("a".repeat(10)),null);
 assert.equal(await shareTokenHash("invalid/".repeat(6)),null);
});
test("viewer writes forbidden and role change cannot resurrect revoked links",()=>{
 assert.match(worker,/if \(share.role !== "editor"\) return json\(\{ error: "read_only" \}, 403\)/);
 assert.match(worker,/revoked = 0 AND role = 'editor'/);
 assert.match(worker,/AND owner_uid = \? AND revoked = 0 RETURNING token_hash/);
 assert.match(worker,/UPDATE shares SET revoked = 1/);
});
