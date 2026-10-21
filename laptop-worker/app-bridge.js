(() => {
  if(location.pathname!=='/'&&location.pathname!=='/index.html')return;
  const input=document.querySelector('#url'),manual=document.querySelector('#manualText'),use=document.querySelector('#useManual');
  if(!input||!manual||!use||document.querySelector('#pakcarik-laptop'))return;
  const panel=document.createElement('section');panel.id='pakcarik-laptop';panel.className='panel';
  const title=document.createElement('h2');title.textContent='Pekerja laptop tersambung';
  const note=document.createElement('p');note.textContent='Masukkan link di atas, lalu jalankan. YouTube dibuka di browser ini. Akun tetap di laptop; satu tugas pada satu waktu.';
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  function button(text,kind){const el=document.createElement('button');el.type='button';el.className=kind;el.textContent=text;return el;}
  const start=button('Ambil lewat laptop','primary'),apply=button('Masukkan hasil ke Pak Carik','secondary'),cancel=button('Batalkan tugas','secondary'),clear=button('Hapus hasil lokal','secondary');
  panel.append(title,note,status,start,apply,cancel,clear);document.querySelector('main').insertBefore(panel,document.querySelector('#manualPanel'));
  let job=null,applied=null,connected=true,requesting=false;
  function videoId(value){
    if(/^[\w-]{11}$/.test(value.trim()))return value.trim();
    try{const u=new URL(value),parts=u.pathname.split('/').filter(Boolean);let id;
      if(u.protocol!=='https:'&&u.protocol!=='http:')return null;
      if(u.hostname==='youtu.be')id=parts[0];
      else if(u.hostname==='youtube.com'||u.hostname.endsWith('.youtube.com'))id=u.searchParams.get('v')||(['shorts','live','embed'].includes(parts[0])?parts[1]:null);
      return /^[\w-]{11}$/.test(id||'')?id:null;
    }catch{return null;}
  }
  const clock=s=>{const t=Math.floor(s),h=Math.floor(t/3600),m=Math.floor(t%3600/60),r=String(t%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${r}`:`${m}:${r}`;};
  function render(){
    const running=['loading','reading'].includes(job?.state);
    status.textContent=job?.message||'Siap. Login YouTube tetap dilakukan oleh pemilik akun di browser ini.';
    start.disabled=running||requesting;cancel.hidden=!running;clear.hidden=!job||running;apply.hidden=job?.state!=='done';
    start.textContent=job?.state==='needs_user'?'Coba lagi lewat laptop':'Ambil lewat laptop';
  }
  async function call(kind,extra={}){
    try{const reply=await chrome.runtime.sendMessage({kind,...extra});if(!reply?.ok)throw new Error(reply?.error||'Pekerja tidak merespons.');job=reply.job;render();return reply;}
    catch(e){status.textContent=e.message;if(/context invalidated|receiving end/i.test(e.message)){connected=false;status.textContent='Ekstensi berubah. Refresh halaman Pak Carik.';}throw e;}
  }
  function applyResult(){
    if(job?.state!=='done'||!job.result?.segments)return;
    if(document.querySelector('#get')?.disabled){status.textContent='Tunggu pengambilan server selesai, lalu masukkan hasil laptop.';return;}
    input.value='https://www.youtube.com/watch?v='+job.videoId;
    manual.value=job.result.segments.map(s=>`[${clock(s.start)}] ${s.text}`).join('\n');
    use.click();applied=job.id;status.textContent='Hasil laptop sudah dimasukkan. Periksa hasil dan bagikan ke ChatGPT.';
  }
  start.addEventListener('click',async()=>{
    const id=videoId(input.value);if(!id){status.textContent='Isi link YouTube yang valid di kolom Link YouTube.';input.focus();return;}
    requesting=true;render();try{await call('pakcarik-start',{videoId:id});}catch{}finally{requesting=false;render();}
  });
  apply.addEventListener('click',applyResult);
  cancel.addEventListener('click',()=>call('pakcarik-cancel').catch(()=>{}));
  clear.addEventListener('click',()=>call('pakcarik-clear').catch(()=>{}));
  async function poll(){
    if(!connected)return;
    try{
      await call('pakcarik-status');
      // Never overwrite input for a different video or an existing manual draft.
      if(job?.state==='done'&&job.id!==applied&&videoId(input.value)===job.videoId&&!manual.value.trim())applyResult();
    }catch{}
    if(connected)setTimeout(poll,2500);
  }
  poll();
})();
