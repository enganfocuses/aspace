import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const json=JSON.parse(readFileSync(new URL("../firebase/rules.owner-guest.template.json",import.meta.url),"utf8"));
const rules=json.rules;
const secure=uid=>uid.includes("__ASPACE_OWNER_UID__")&&uid.includes("auth.uid");
test("no broad public database read or write",()=>{
 assert.equal(rules[".read"],false);
 assert.equal(rules[".write"],false);
 for(const name of ["docs","img","media"]){
  assert.ok(secure(rules[name][".read"]));
  assert.ok(secure(rules[name][".write"]));
 }
});
test("guest meta may only be written by owner",()=>{
 const meta=rules.shares["$token"].meta;
 assert.ok(secure(meta[".write"]));
 assert.match(meta[".read"],/48/);
 assert.match(meta[".validate"],/role/);
});
test("viewers are not allowed to edit shared whiteboards",()=>{
 const board=rules.shares["$token"].board;
 assert.match(board[".read"],/meta/);
 assert.match(board[".write"],/=== 'editor'/);
 assert.match(board[".write"],/__ASPACE_OWNER_UID__/);
 assert.match(board.items["$itemId"][".validate"],/newData.child\('id'\)/);
 assert.doesNotMatch(board.items["$itemId"][".validate"],/=== \$itemId/);
});
test("owner may revoke room; anonymous participants only post bounded room messages",()=>{
 const room=rules.shares["$token"].room;
 assert.ok(secure(room[".write"]));
 assert.match(room["$msg"][".write"],/150000/);
 const calls=rules.rooms["$room"].call;
 assert.match(calls[".read"],/c-/);
 assert.match(calls["$signal"][".write"],/150000/);
});
test("all production owner placeholders are consistent",()=>{
 const raw=JSON.stringify(json);
 const placeholders=raw.match(/__ASPACE_OWNER_UID__/g)||[];
 assert.ok(placeholders.length>=6);
 assert.doesNotMatch(raw,/\\.read"\s*:\s*true/);
 assert.doesNotMatch(raw,/\\.write"\s*:\s*true/);
});
