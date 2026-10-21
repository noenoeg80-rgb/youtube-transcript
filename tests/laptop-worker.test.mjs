import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
const source=readFileSync(new URL('../laptop-worker/background.js',import.meta.url),'utf8');
let store={},nextTab=100;
const event=()=>({addListener(){}});
const chrome={
 storage:{local:{get:async key=>({[key]:structuredClone(store[key])}),set:async value=>{store={...store,...structuredClone(value)};},remove:async key=>{delete store[key];}}},
 tabs:{create:async()=>({id:nextTab++}),update:async()=>{},get:async()=>({status:'loading'}),sendMessage:async()=>({ok:true}),onUpdated:event(),onRemoved:event()},
 runtime:{onMessage:event(),onInstalled:event(),onStartup:event()},alarms:{create:async()=>{},onAlarm:event()},action:{onClicked:event()}
};
function runtime(){const context=vm.createContext({chrome,crypto:webcrypto,URL,Date,console});vm.runInContext(source+'\nthis.api={handle,readJob,expire,dispatch};',context);return context.api;}
let api=runtime();
const app={url:'https://youtube-transcript-woad-nine.vercel.app/',frameId:0,tab:{id:1}};
assert.equal((await api.handle({kind:'pakcarik-start',videoId:'jNQXAC9IVRw'},{...app,url:'https://evil.example/'})).ok,false);
assert.equal((await api.handle({kind:'pakcarik-start',videoId:'jNQXAC9IVRw'},{...app,frameId:1})).ok,false);
await assert.rejects(api.handle({kind:'pakcarik-start',videoId:'https://evil.example/'},app));
let response=await api.handle({kind:'pakcarik-start',videoId:'jNQXAC9IVRw'},app);
assert.equal(response.job.state,'loading');
await assert.rejects(api.handle({kind:'pakcarik-start',videoId:'jNQXAC9IVRw'},app));
await assert.rejects(api.handle({kind:'pakcarik-clear'},app));
await api.dispatch(response.job);
let job=await api.readJob();assert.equal(job.state,'reading');
const yt={url:'https://www.youtube.com/watch?v=jNQXAC9IVRw',frameId:0,tab:{id:job.tabId}};
const result={kind:'pakcarik-result',jobId:job.id,result:{segments:[{start:0,text:'Contoh teks uji'},{start:8,text:'Bagian kedua'}],title:'Uji'}};
assert.equal((await api.handle(result,{...yt,tab:{id:999}})).ok,false);
assert.equal((await api.handle(result,{...yt,url:'https://www.youtube.com/watch?v=AAAAAAAAAAA'})).ok,false);
assert.equal((await api.handle(result,yt)).ok,true);
assert.equal((await api.readJob()).state,'done');
api=runtime();assert.equal((await api.handle({kind:'pakcarik-status'},app)).job.result.segments.length,2);
assert.equal((await api.handle(result,yt)).ok,false); // late/duplicate result ignored
await api.handle({kind:'pakcarik-clear'},app);assert.equal(await api.readJob(),null);
job=(await api.handle({kind:'pakcarik-start',videoId:'jNQXAC9IVRw'},app)).job;
store.job.updated=Date.now()-101000;assert.equal((await api.expire()).state,'needs_user');
job=(await api.handle({kind:'pakcarik-start',videoId:'jNQXAC9IVRw'},app)).job;
await api.handle({kind:'pakcarik-cancel'},app);
assert.equal((await api.handle({...result,jobId:job.id},{...yt,tab:{id:job.tabId}})).ok,false);
job=(await api.handle({kind:'pakcarik-start',videoId:'jNQXAC9IVRw'},app)).job;
await api.handle({...result,jobId:job.id,result:{segments:[{start:-1,text:'Bad'}]}},{...yt,tab:{id:job.tabId}});
assert.equal((await api.readJob()).state,'failed');
console.log('PASS: origin/frame/tab/video validation, single-task guard, persistence across worker restart, duplicate result, expiry, cancel, clear, invalid payload.');
