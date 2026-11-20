/**
 * Cloudflare backup transport for the SAME Aspace guest board and link token.
 * Staging only. No Firebase login or duplicate whiteboard implementation.
 * Raw capability is sent only in the X-Aspace-Share-Token header over HTTPS.
 */
export function createAspaceGuestStandby({
  baseUrl, fetchImpl = fetch, onStatus = () => {}
}) {
  const base = String(baseUrl||"").replace(/\/+$/, "");
  if (!base.startsWith("https://")) throw new Error("HTTPS Cloudflare endpoint is required");
  const endpoint = base + "/v1/shared";
  const validate = token => {
    if (!/^(?:[a-f0-9]{48}|[a-f0-9]{64})$/.test(token||""))
      throw Object.assign(new Error("Invalid share token"), {status:400});
    return token;
  };
  const fail = (msg,status) => Object.assign(new Error(msg),{status});
  const state = new Map();
  const jsonStable = value => JSON.stringify(value);
  async function fetchShared(token,options={}) {
    validate(token);
    let response;
    try {
      response = await fetchImpl(endpoint,{
        ...options,
        cache:"no-store",
        referrerPolicy:"no-referrer",
        headers:{
          "X-Aspace-Share-Token":token,
          ...(options.body?{"Content-Type":"application/json"}:{}),
          ...(options.headers||{})
        }
      });
    }catch(error){throw fail("Cloudflare unavailable: "+(error?.message||"network"),503)}
    if (!response.ok) {
      const message = (await response.text().catch(()=>"")).slice(0,140);
      throw fail("Cloudflare HTTP "+response.status+(message?": "+message:""),response.status);
    }
    return response.json();
  }
  async function read(token) {
    const result = await fetchShared(token);
    if(typeof result?.j!=="string"||
       !Number.isSafeInteger(result.revision)||result.revision<1||
       !["viewer","editor"].includes(result.role))
      throw fail("Incomplete Cloudflare share response",502);
    let board;
    try { board = JSON.parse(result.j) }
    catch {throw fail("Invalid Cloudflare board",502)}
    if(!board||typeof board!=="object"||!Array.isArray(board.items)||
       !Array.isArray(board.strokes))
      throw fail("Cloudflare board schema invalid",502);
    const info={
      board,
      revision:result.revision,
      role:result.role,
      boardId:result.boardId,
      name:String(board.name||"Доска"),
      source:"cloudflare"
    };
    state.set(token,{...info,baseJson:jsonStable(board)});
    onStatus({source:"cloudflare",phase:"read",tokenLast4:token.slice(-4)});
    return info;
  }
  function current(token){validate(token);return state.get(token)||null}
  async function write(token,board) {
    validate(token);
    if(!board||typeof board!=="object"||!Array.isArray(board.items)||
       !Array.isArray(board.strokes))throw fail("Invalid board",400);
    const serial=jsonStable(board);
    if(new TextEncoder().encode(serial).byteLength>740000)
      throw fail("Board too large for Cloudflare D1 standby",413);
    if(["data:image/","data:audio/","data:video/","data:application/pdf"].some(p=>serial.includes(p)))
      throw fail("Embedded media cannot be written to D1 standby",413);
    // Read fresh before every CAS write, including after reload. Version and
    // content must match the client's last confirmed base.
    const remembered=state.get(token);
    if(!remembered)throw fail("Read standby board before editing",428);
    if(remembered.role!=="editor")throw fail("View-only link",403);
    const live=await fetchShared(token);
    if(!["viewer","editor"].includes(live.role)||live.role!=="editor")
      throw fail("Editing permission was revoked",403);
    if(typeof live.j!=="string"||!Number.isSafeInteger(live.revision))
      throw fail("Invalid version",502);
    if(live.j===serial){
      state.set(token,{...remembered,board,revision:live.revision,baseJson:serial});
      return {source:"cloudflare",revision:live.revision,alreadyApplied:true};
    }
    if(live.revision!==remembered.revision||live.j!==remembered.baseJson)
      throw fail("Another participant changed the standby board",409);
    let written;
    try {
      written=await fetchShared(token,{method:"PUT",
        body:JSON.stringify({j:serial,expectedRevision:live.revision})});
    }catch(error){
      // The write might have reached D1 even if the response was lost.
      if(error.status===403||error.status===404||error.status===409)throw error;
      const verify=await fetchShared(token).catch(()=>null);
      if(!verify||verify.j!==serial)throw error;
      written={revision:verify.revision};
    }
    if(!Number.isSafeInteger(written.revision)||written.revision<=live.revision)
      throw fail("Standby revision was not confirmed",502);
    state.set(token,{...remembered,board,revision:written.revision,baseJson:serial});
    onStatus({source:"cloudflare",phase:"write",tokenLast4:token.slice(-4)});
    return {source:"cloudflare",revision:written.revision};
  }
  function clear(token){state.delete(token)}
  return {read,write,current,clear};
}
