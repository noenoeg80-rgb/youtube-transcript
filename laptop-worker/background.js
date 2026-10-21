const APP = 'https://youtube-transcript-woad-nine.vercel.app';
const ACTIVE = new Set(['loading', 'reading']);
let chain = Promise.resolve();
function serial(fn) { const result = chain.then(fn); chain = result.catch(() => {}); return result; }
async function readJob() { return (await chrome.storage.local.get('job')).job || null; }
async function save(job) { await chrome.storage.local.set({job}); return job; }
function appSender(sender) {
  try { return sender.frameId === 0 && new URL(sender.url).origin === APP; } catch { return false; }
}
function validId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id); }
async function expire() {
  const job = await readJob();
  if (job && ACTIVE.has(job.state) && Date.now() - job.updated > 100000) {
    job.state = 'needs_user'; job.message = 'Waktu habis. Periksa tab YouTube, lalu tekan Coba lagi setelah siap.';
    job.updated = Date.now(); await save(job);
  }
  return job;
}
async function start(videoId) {
  if (!validId(videoId)) throw new Error('Link YouTube tidak valid.');
  const previous = await expire();
  if (previous && ACTIVE.has(previous.state)) throw new Error('Satu tugas masih berjalan. Tunggu atau batalkan dulu.');
  const job = {id: crypto.randomUUID(), videoId, state: 'loading', updated: Date.now(), message: 'Membuka video di laptop…'};
  await save(job);
  try {
    const tab = await chrome.tabs.create({url: `https://www.youtube.com/watch?v=${videoId}`, active: true});
    job.tabId = tab.id;
    await chrome.tabs.update(tab.id, {muted: true});
    await save(job);
    // The load event can race tab creation. A completed tab is started here as well.
    const current = await chrome.tabs.get(tab.id);
    if (current.status === 'complete') await dispatch(job);
    return await readJob();
  } catch {
    job.state = 'failed'; job.message = 'Tidak dapat membuka tab YouTube.'; return save(job);
  }
}
async function dispatch(job) {
  if (job.state !== 'loading') return;
  job.state = 'reading'; job.updated = Date.now(); job.message = 'Membuka panel transkrip YouTube…'; await save(job);
  try { await chrome.tabs.sendMessage(job.tabId, {kind:'pakcarik-read', jobId:job.id, videoId:job.videoId}); }
  catch { job.state = 'needs_user'; job.message = 'Halaman belum siap atau dialihkan ke login. Periksa tab YouTube, lalu Coba lagi.'; await save(job); }
}
function validateResult(result) {
  if (!result || !Array.isArray(result.segments) || !result.segments.length || result.segments.length > 20000) throw new Error('Transkrip kosong atau terlalu panjang.');
  let size = 0;
  const segments = result.segments.map(s => {
    if (!Number.isFinite(s.start) || s.start < 0 || s.start > 604800 || typeof s.text !== 'string' || !s.text.trim()) throw new Error('Segmen transkrip tidak valid.');
    size += s.text.length;
    if (size > 1500000) throw new Error('Transkrip terlalu panjang untuk penyimpanan lokal.');
    return {start:s.start, text:s.text.trim()};
  });
  for (let i=1;i<segments.length;i++) if(segments[i].start<segments[i-1].start) throw new Error('Urutan timestamp tidak valid.');
  return {segments, title:String(result.title || '').slice(0,300), source:'youtube-laptop'};
}
async function handle(message, sender) {
  if (message?.kind === 'pakcarik-result') {
    const job = await readJob();
    let url; try {url=new URL(sender.url);} catch {return {ok:false};}
    if (!job || !ACTIVE.has(job.state) || sender.frameId!==0 || sender.tab?.id!==job.tabId || message.jobId!==job.id || url.origin!=='https://www.youtube.com' || url.searchParams.get('v')!==job.videoId) return {ok:false};
    job.updated=Date.now();
    if (message.result) {
      try { job.result=validateResult(message.result); job.state='done'; job.message='Transkrip selesai. Kembali ke tab Pak Carik.'; }
      catch(e) {job.state='failed';job.message=e.message;}
    } else {
      job.state=message.needsUser?'needs_user':'failed'; job.message=String(message.error||'Transkrip tidak tersedia.').slice(0,500);
    }
    await save(job); return {ok:true};
  }
  if (!appSender(sender)) return {ok:false, error:'Sumber permintaan tidak diizinkan.'};
  if (message?.kind==='pakcarik-status') return {ok:true, job:await expire()};
  if (message?.kind==='pakcarik-start') return {ok:true, job:await start(message.videoId)};
  if (message?.kind==='pakcarik-cancel') {
    const job=await readJob();
    if(job && ACTIVE.has(job.state)){job.state='cancelled';job.message='Dibatalkan. Tab YouTube tetap terbuka.';await save(job);}
    return {ok:true,job};
  }
  if (message?.kind==='pakcarik-clear') {
    const job=await readJob(); if(job&&ACTIVE.has(job.state)) throw new Error('Batalkan tugas sebelum menghapus hasil.');
    await chrome.storage.local.remove('job');return {ok:true,job:null};
  }
  return {ok:false,error:'Perintah tidak dikenal.'};
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  serial(()=>handle(message,sender)).then(reply,e=>reply({ok:false,error:e.message}));return true;
});
chrome.tabs.onUpdated.addListener((id,change)=>{
  if(change.status!=='complete')return;
  serial(async()=>{const job=await readJob();if(job?.tabId===id&&job.state==='loading')await dispatch(job);});
});
chrome.tabs.onRemoved.addListener(id=>serial(async()=>{
  const job=await readJob();if(job?.tabId===id&&ACTIVE.has(job.state)){job.state='needs_user';job.message='Tab YouTube ditutup sebelum selesai. Tekan Coba lagi.';await save(job);}
}));
async function watchdog(){await chrome.alarms.create('pakcarik-watchdog',{periodInMinutes:1});await serial(expire);}
chrome.runtime.onInstalled.addListener(watchdog);
chrome.runtime.onStartup.addListener(watchdog);
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='pakcarik-watchdog')serial(expire);});
chrome.action.onClicked.addListener(()=>chrome.tabs.create({url:APP}));
