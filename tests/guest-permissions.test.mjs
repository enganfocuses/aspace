import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rules=JSON.parse(readFileSync(new URL('../database.rules.json',import.meta.url),'utf8'));
const template=JSON.parse(readFileSync(new URL('../firebase/rules.owner-guest.template.json',import.meta.url),'utf8'));

const viewerRoomWrite=rules.rules.shares.$token.room.$message['.write'];
const viewerCallWrite=rules.rules.shares.$token.room.call.$signal['.write'];
const templateRoomWrite=template.rules.shares.$token.room.$msg['.write'];
const templateCallWrite=template.rules.shares.$token.room.call.$signal['.write'];

test('viewer may send presence, chat and navigation requests but not board mutations',()=>{
  for(const type of ['ready','presence','vp','bring','bringack','followme','followack','cursor','chat','req']){
    assert.ok(viewerRoomWrite.includes("=== '"+type+"'"),'viewer room signal should allow '+type);
    assert.ok(templateRoomWrite.includes("=== '"+type+"'"),'template should allow '+type);
  }
  for(const type of ['i','d','ds','sp','clr','bg','site','boardstate','state','boardnav']){
    assert.ok(!viewerRoomWrite.includes("=== '"+type+"'"),'viewer room signal must block '+type);
    assert.ok(!templateRoomWrite.includes("=== '"+type+"'"),'template must block '+type);
  }
});

test('viewer may use WebRTC signaling without gaining board navigation rights',()=>{
  for(const type of ['ready','accesscheck','sig','hello','bye']){
    assert.ok(viewerCallWrite.includes("=== '"+type+"'"),'call channel should allow '+type);
    assert.ok(templateCallWrite.includes("=== '"+type+"'"),'template call channel should allow '+type);
  }
  assert.ok(!viewerCallWrite.includes("=== 'boardnav'"));
  assert.ok(!templateCallWrite.includes("=== 'boardnav'"));
});

test('permanent room IDs are readable without weakening board-share token rules',()=>{
  assert.match(template.rules.shares.$token.meta['.read'],/a-f0-9\]\{48\}\|\[a-z0-9\]\{14\}/);
  assert.match(template.rules.shares.$token.meta['.validate'],/!newData\.child\('boardId'\)\.exists\(\)/);
  assert.match(template.rules.shares.$token.room['.read'],/a-z0-9/);
  assert.match(template.rules.shares.$token.room.call.$signal['.write'],/a-z0-9/);
  assert.match(template.rules.rooms.$room.call['.read'],/__ASPACE_OWNER_UID__/);
});

test('viewer cleanup cannot remove the complete nested call channel',()=>{
  assert.match(viewerRoomWrite, /\\$message !== 'call'/);
  assert.match(templateRoomWrite, /\\$msg !== 'call'/);
});

test('edit rights remain separate from the ephemeral signaling channel',()=>{
  assert.match(rules.rules.shares.$token.board['.write'],/role/);
  assert.match(rules.rules.shares.$token.assets.$asset['.write'],/role/);
  assert.match(viewerRoomWrite,/role/);
  assert.match(viewerCallWrite,/role/);
});

test('permanent-room calls use the existing nested share room channel',()=>{
  assert.match(index,/room0\.join\('call-'\+id,'\/shares\/'\+encodeURIComponent\(id\)\+'\/room\/call'\)/);
  assert.match(index,/const base=DB\(\)\+'\/shares\/'\+encodeURIComponent\(id\)\+'\/room\/call'/);
  assert.doesNotMatch(index,/\/shares\/[^\n]*\/call\.json/);
});

test('external meeting destination is opened only by the existing student video control',()=>{
  assert.match(index,/The share's route controls the existing top-right student video button/);
  assert.match(index,/vtop\.querySelector\('summary'\)[\s\S]*?entryService\(\)/);
  assert.doesNotMatch(index,/window\.open\(boardVideoTarget/);
});
