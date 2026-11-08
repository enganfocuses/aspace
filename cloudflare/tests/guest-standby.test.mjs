import test from "node:test";
import assert from "node:assert/strict";
import {createAspaceGuestStandby} from "../guest-standby.js";

const token="a".repeat(48);
const sample=()=>({name:"Lesson",bg:"dots",
  items:[{id:"note1",k:"note",x:10,y:20,w:180,h:90,t:"Hi"}],strokes:[]});
function setup({role="editor"}={}){
  let revision=1,board=sample(),currentRole=role,revoked=false;
  const requests=[];
  const fetchImpl=async(url,options={})=>{
    requests.push({url,method:options.method||"GET",headers:options.headers});
    if(revoked)return new Response(JSON.stringify({error:"invalid_share"}),{status:404});
    if(options.headers?.["X-Aspace-Share-Token"]!==token)
      return new Response("no token",{status:401});
    if(options.method==="PUT"){
      if(currentRole!=="editor")return new Response("read_only",{status:403});
      const body=JSON.parse(options.body);
      if(body.expectedRevision!==revision)return new Response("revision_conflict",{status:409});
      board=JSON.parse(body.j);revision++;
      return Response.json({ok:true,revision});
    }
    return Response.json({j:JSON.stringify(board),role:currentRole,
      revision,boardId:"boardABC"});
  };
  return {
    create:()=>createAspaceGuestStandby({
      baseUrl:"https://aspace-staging.example",fetchImpl
    }),
    requests,
    updateBoard:b=>{board=b;revision++},
    role:r=>{currentRole=r},
    revoke:()=>{revoked=true},
    state:()=>({board,revision})
  };
}

test("same legacy 48-character share token opens the same board ID",async()=>{
 const s=setup(),client=s.create(),data=await client.read(token);
 assert.equal(data.boardId,"boardABC");
 assert.equal(data.role,"editor");
 assert.deepEqual(data.board,sample());
 assert.equal(s.requests[0].headers["X-Aspace-Share-Token"],token);
 assert.ok(!s.requests[0].url.includes(token));
});
test("guest may CAS-edit without a Firebase login",async()=>{
 const s=setup(),client=s.create();await client.read(token);
 const next={...sample(),items:[...sample().items,
  {id:"note2",k:"note",x:25,y:40,w:160,h:90,t:"Student"}]};
 const out=await client.write(token,next);
 assert.equal(out.revision,2);
 assert.deepEqual(s.state().board,next);
 assert.equal(s.requests.at(-1).method,"PUT");
});
test("view-only link never gains write permission",async()=>{
 const s=setup({role:"viewer"}),client=s.create();
 await client.read(token);
 await assert.rejects(()=>client.write(token,sample()),error=>error.status===403);
 assert.equal(s.requests.length,1);
});
test("revoked link cannot read or edit again",async()=>{
 const s=setup(),client=s.create();await client.read(token);s.revoke();
 await assert.rejects(()=>client.write(token,{...sample(),name:"edit"}),error=>error.status===404);
 await assert.rejects(()=>client.read(token),error=>error.status===404);
});
test("parallel participant edits block stale CAS",async()=>{
 const s=setup(),client=s.create();await client.read(token);
 s.updateBoard({...sample(),name:"Other student's edit"});
 await assert.rejects(()=>client.write(token,{...sample(),name:"My edit"}),error=>error.status===409);
 assert.equal(s.state().board.name,"Other student's edit");
});
test("no writes before reading a confirmed D1 version",async()=>{
 const s=setup(),client=s.create();
 await assert.rejects(()=>client.write(token,sample()),error=>error.status===428);
});
test("untrusted large or embedded media is rejected",async()=>{
 const s=setup(),client=s.create();await client.read(token);
 await assert.rejects(()=>client.write(token,{...sample(),url:"data:image/png;base64,abcd"}),error=>error.status===413);
 await assert.rejects(()=>client.write(token,{...sample(),name:"X".repeat(800000)}),error=>error.status===413);
});
test("identical already-applied write is idempotent",async()=>{
 const s=setup(),client=s.create();await client.read(token);
 const out=await client.write(token,sample());
 assert.equal(out.alreadyApplied,true);
 assert.equal(s.state().revision,1);
});
