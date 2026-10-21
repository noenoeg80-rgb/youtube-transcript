// Reads only the normal YouTube page. No private API, cookie export or challenge solving.
(() => {
  let busy=false;
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const visible=el=>Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility!=='hidden');
  const label=el=>(el.getAttribute('aria-label')||el.textContent||'').trim();
  const controls=()=>[...document.querySelectorAll('button,[role="button"]')].filter(visible);
  function stopReason(){
    const text=document.body?.innerText||'';
    if(/confirm you(?:’|')?re not a bot|konfirmasi.*bukan (?:robot|bot)|confirm.*not a bot|unusual traffic|verify you are human/i.test(text))return 'YouTube meminta verifikasi. Pekerja berhenti; selesaikan sendiri di tab YouTube sebelum mencoba lagi.';
    if(document.querySelector('iframe[src*="recaptcha"],form[action*="/sorry/"]'))return 'YouTube meminta verifikasi. Pekerja berhenti.';
    if(/sign in to confirm your age|login untuk mengonfirmasi usia|sign in to view this video/i.test(text))return 'Video memerlukan login atau konfirmasi akun. Selesaikan sendiri di YouTube sebelum mencoba lagi.';
    return '';
  }
  function timestamp(value){
    const match=String(value).trim().match(/^(\d{1,}:\d{2}(?::\d{2})?)$/);
    return match?match[1].split(':').map(Number).reduce((n,v)=>n*60+v,0):null;
  }
  function readSegments(){
    const rows=[...document.querySelectorAll('ytd-transcript-segment-renderer')].filter(visible);
    return rows.map(row=>{
      const stamp=row.querySelector('.segment-timestamp');
      const body=row.querySelector('.segment-text');
      return {start:timestamp(stamp?.textContent),text:(body?.textContent||'').replace(/\s+/g,' ').trim()};
    }).filter(s=>s.start!==null&&s.text);
  }
  async function run(message){
    const send=payload=>chrome.runtime.sendMessage({kind:'pakcarik-result',jobId:message.jobId,...payload});
    try {
      if(new URL(location.href).searchParams.get('v')!==message.videoId)throw new Error('Video berubah sebelum dibaca.');
      let opened=false,expanded=false,previous='',stable=0;
      const end=Date.now()+65000;
      while(Date.now()<end){
        if(new URL(location.href).searchParams.get('v')!==message.videoId)throw new Error('Video berubah saat transkrip dibaca.');
        const block=stopReason();if(block){await send({needsUser:true,error:block});return;}
        // Do not play the video just to read captions.
        document.querySelectorAll('video').forEach(video=>video.pause());
        const segments=readSegments();
        if(segments.length){
          const signature=JSON.stringify(segments);
          stable=signature===previous?stable+1:0;previous=signature;
          if(stable>=2){
            const title=document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim()||document.title;
            await send({result:{segments,title}});return;
          }
        }else if(!opened){
          const show=controls().find(el=>/^(show transcript|tampilkan transkrip|tampilkan transkripsi|lihat transkrip)$/i.test(label(el)));
          if(show){show.click();opened=true;}
          else if(!expanded){
            const more=document.querySelector('ytd-watch-metadata #description-inline-expander #expand');
            if(visible(more)){more.click();expanded=true;}
          }
        }
        await sleep(1000);
      }
      await send({needsUser:true,error:'Panel transkrip belum terbaca. Buka Tampilkan transkrip di YouTube dan periksa apakah caption tersedia. Tata letak/bahasa YouTube mungkin berbeda.'});
    } catch(e) {await send({error:e.message||'Gagal membaca halaman YouTube.'});}
    finally{busy=false;}
  }
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.kind!=='pakcarik-read')return;
    if(busy){reply({ok:false});return;}
    busy=true;reply({ok:true});run(message).catch(()=>{busy=false;});
  });
})();
