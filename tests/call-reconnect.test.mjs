import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=source.indexOf('pc.oniceconnectionstatechange=()=>{');const end=source.indexOf('\n    };',start)+7;
function setup(init=true){let offers=0;const timers=new Map(),pending=new Map(),pcs={},pc={iceConnectionState:'disconnected',signalingState:'stable',async createOffer(o){assert.equal(o.iceRestart,true);offers++;return {}},async setLocalDescription(){}};pcs.peer=pc;
 new Function('pc','init','pcs','id','me','r','reconnectTimers','setTimeout','clearTimeout',source.slice(start,end))(pc,init,pcs,'peer','me',{emit:async()=>true},pending,(fn,ms)=>{const key={};timers.set(key,{fn,ms});return key},key=>timers.delete(key));
 return {pc,timers,pcs,get offers(){return offers},async tick(){const [key,timer]=timers.entries().next().value;timers.delete(key);await timer.fn()}};
}
test('temporary cellular disconnect schedules recovery and cancels it if connection returns',()=>{const s=setup();s.pc.oniceconnectionstatechange();assert.equal([...s.timers.values()][0].ms,4000);s.pc.iceConnectionState='connected';s.pc.oniceconnectionstatechange();assert.equal(s.timers.size,0)});
test('initiator restarts ICE after persistent loss; the other peer does not create competing offers',async()=>{const s=setup();s.pc.oniceconnectionstatechange();await s.tick();assert.equal(s.offers,1);assert.equal(s.timers.size,1);const remote=setup(false);remote.pc.oniceconnectionstatechange();assert.equal(remote.timers.size,0)});
test('closing a peer before retry prevents stale offers',async()=>{const s=setup();s.pc.oniceconnectionstatechange();delete s.pcs.peer;await s.tick();assert.equal(s.offers,0)});

test('answering uses the transceivers created by the incoming offer for both local tracks',async()=>{
  const media=source.slice(source.indexOf('  async function attachMedia(pc)'),source.indexOf("  offs.push(r.on('hello'"));
  const offer=source.match(/if\(x\.k==='offer'\)\{([^\n]+)\}/)[1];
  const tracks=[{kind:'audio'},{kind:'video'}];
  const transceivers=[];
  class Peer {
    async setRemoteDescription(){
      for(const track of tracks)transceivers.push({receiver:{track},sender:{
        replaceTrack(local){this.track=local}
      }});
    }
    getTransceivers(){return transceivers}
    async createAnswer(){
      assert.deepEqual(transceivers.map(tr=>tr.sender.track),tracks);
      assert.ok(transceivers.every(tr=>tr.direction==='sendrecv'));
      return {type:'answer'};
    }
    async setLocalDescription(){}
  }
  const signals=[];
  await new Function('RTCPeerConnection','MediaStream','st','r',`
    const ICE=[],pcs={},me='self',x={from:'peer',d:{}},flushIce=async()=>{};
    ${media}
    return (async()=>{${offer}})();
  `)(Peer,class {},{getTracks:()=>tracks},{emit:(_,value)=>signals.push(value)});
  assert.equal(signals[0].k,'answer');
});
