import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('async function twitchHelix('),source.indexOf('function setupBroadcast('));
function setup(fetch){
  const states=[],removed=[],sockets=[];
  const context={fetch,URL,Error,setTimeout,clearTimeout,
    oauth:{token:'test-token',clientId:'test-client',userId:'',login:''},
    twitchConnection:null,twitchGeneration:0,demoOn:false,TOKEN_KEY:'token',
    sessionStorage:{removeItem:key=>removed.push(key)},
    setStatus:(...v)=>states.push(v),showToast:()=>{},processAction:()=>{},
    WebSocket:class{constructor(){sockets.push(this);}addEventListener(){}close(){}},
  };
  const api=runInNewContext(functions+'\n({initializeTwitch,disconnectTwitch,twitchHelix});',context);
  return{...api,context,states,removed,sockets};
}

test('disconnect during account lookup prevents late socket creation',async()=>{
  let resolve;const h=setup(()=>new Promise(r=>{resolve=r;}));
  const pending=h.initializeTwitch();h.disconnectTwitch();
  resolve({ok:true,json:async()=>({data:[{id:'123',login:'fern'}]})});await pending;
  assert.equal(h.sockets.length,0);assert.equal(h.context.oauth.token,'');
  assert.equal(h.states.at(-1)[0],'demo');
});

test('late lookup failure cannot overwrite a newer connection attempt',async()=>{
  let reject;let calls=0;
  const h=setup(()=>++calls===1?new Promise((_,r)=>{reject=r;}):Promise.resolve({ok:true,json:async()=>({data:[{id:'123',login:'fern'}]})}));
  const first=h.initializeTwitch();await h.initializeTwitch();
  reject(new Error('old request failed'));await first;
  assert.equal(h.sockets.length,1);assert.equal(h.context.oauth.token,'test-token');
  assert.equal(h.states.at(-1)[0],'connecting');h.disconnectTwitch();
});

test('Helix HTTP status survives error parsing for retry classification',async()=>{
  const h=setup(async()=>({ok:false,status:403,json:async()=>({message:'Missing scope'})}));
  await assert.rejects(h.twitchHelix('eventsub/subscriptions',{method:'POST',body:{}}),error=>error.status===403&&error.message.includes('Missing scope'));
});
