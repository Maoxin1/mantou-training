const b=document.getElementById('update'),s=document.getElementById('status');
b.onclick=async()=>{b.disabled=true;s.textContent='正在下载新版，请稍等…';try{
  if(!navigator.onLine)throw Error('请先联网再更新');
  const r=await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});await r.update();
  if(r.installing){await new Promise((resolve,reject)=>{const w=r.installing,t=setTimeout(()=>reject(Error('下载尚未完成，请保持联网后重试')),45000);const check=()=>{if(w.state==='installed'||w.state==='activated'){clearTimeout(t);resolve();}else if(w.state==='redundant'){clearTimeout(t);reject(Error('新版下载未完成，请重试'));}};w.addEventListener('statechange',check);check();});}
  if(r.waiting){await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('新版正在启动，请再次点击更新')),15000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(t);resolve();},{once:true});r.waiting.postMessage({type:'ACTIVATE_UPDATE'});});}
  await navigator.serviceWorker.ready;s.textContent='更新完成，正在打开…';location.replace('/?updated=2.4.2');
}catch(e){s.textContent=e.message||'更新失败，请保持联网后重试';b.disabled=false;}};
