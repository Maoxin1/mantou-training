import {createAuthClient,BetterAuthVanillaAdapter} from './auth-sdk.mjs';
import {AUTH_URL} from './cloud-config.mjs';
import {fresh,clone} from './engine.mjs';
import {SyncStore} from './sync-core.mjs';
const auth=createAuthClient(AUTH_URL,{adapter:BetterAuthVanillaAdapter({fetchOptions:{credentials:'include'}})}),ID='mantou-training-account',PREFIX='mantou-training-account:';
const node=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
export function mountCloud({guest,apply,notify}){
  let ownsWindow=!navigator.locks,identity=null,store=null,busy=false,message='未登录 · 记录保存在本机',timer;
  try{identity=JSON.parse(localStorage.getItem(ID)||'null');}catch{}
  const section=node('details');section.className='card cloud-panel';section.style.margin='12px 0';
  const summary=node('summary','邮箱账号与同步'),status=node('p',message),content=node('div');status.setAttribute('role','status');section.append(summary,content);document.querySelector('header').after(status,section);status.hidden=true;const placePanel=()=>{const slot=document.getElementById('accountSlot');if(slot)slot.append(section);else section.remove();};document.addEventListener('training:render',placePanel);placePanel();
  function setMessage(text){message=text;status.textContent=text;window.dispatchEvent(new CustomEvent('training:cloud-status',{detail:text}));}
  function activate(user){identity={id:user.id,email:user.email};store=new SyncStore({storage:localStorage,key:PREFIX+user.id,initial:fresh()});localStorage.setItem(ID,JSON.stringify(identity));apply(clone(store.data.local),true);draw();}
  function update(){if(store)apply(clone(store.data.local),true);draw();}
  async function transport(accountId,method,body){const t=await auth.token();if(t.error||!t.data?.token)throw Error('需要联网重新登录；待同步记录仍保留');const response=await fetch('/api/sync',{method,cache:'no-store',headers:{'X-Account-Id':accountId,Authorization:'Bearer '+t.data.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});if(response.status===409)return {conflict:true};let data;try{data=await response.json();}catch{throw Error('同步接口未就绪；本机记录仍保留');}if(!response.ok)throw Error(data.error||'同步暂不可用');return data;}
  async function sync(){
    if(!ownsWindow||!store||busy||document.querySelector('dialog[open]'))return;
    if(store.data.conflict){setMessage('存在冲突 · 请展开选择版本');return;}
    if(!navigator.onLine){setMessage('离线 · '+(store.data.pending?'有待同步记录':'显示上次同步的数据'));return;}
    const target=store,accountId=identity.id;busy=true;setMessage('正在同步…');
    try{const result=await target.sync((method,body)=>transport(accountId,method,body));if(store!==target)return;if(!document.querySelector('dialog[open]'))update();setMessage(result==='conflict'?'存在冲突 · 请展开选择版本':result==='pending'?'已保存本机 · 等待再次同步':'已与云端同步 · '+new Date().toLocaleTimeString());}
    catch(e){if(store===target)setMessage('同步失败 · '+(e.message||'本机记录仍保留'));}finally{busy=false;}
  }
  if(navigator.locks)navigator.locks.request('mantou-training-editor',{ifAvailable:true},lock=>{if(!lock){setMessage('另一窗口正在使用训练卡 · 请关闭另一窗口后刷新，本窗口暂不可编辑');return;}ownsWindow=true;schedule();return new Promise(()=>{});});
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(sync,800);};
  function draw(){
    content.replaceChildren();
    if(identity&&store){
      content.append(node('p',identity.email));
      const now=node('button','立即同步');now.className='btn secondary';now.onclick=sync;content.append(now);
      const hasGuest=Object.values(guest().exercises).some(e=>e.records.length||e.changes.length||e.validation||e.blocked);
      if(hasGuest){const migrate=node('button','将此浏览器原有记录迁入账号');migrate.className='btn secondary';migrate.onclick=()=>{if(!confirm('先导出原有记录备份。迁入将与云端比较；同一动作有不同版本时需要选择。继续？'))return;store.import(guest());update();schedule();};content.append(migrate);}
      if(store.data.conflict){
        const c=store.data.conflict,choices={};content.append(node('p','两台设备修改了同一项目。不同日期的记录会保留；请选择有分歧的计划或同日记录。继续训练仍可保存本机。'));
        for(const item of c.conflicts){const label=node('label',item.key.startsWith('exercise:')?c.merged.exercises[item.key.slice(9)].name:item.key),select=node('select');select.className='text-input';for(const [v,t]of [['','请选择'],['local','此设备版本'],['remote','云端／另一设备版本']]){const o=node('option',t);o.value=v;select.append(o);}select.onchange=()=>choices[item.key]=select.value;label.append(select);content.append(label);if(item.key.startsWith('exercise:'))content.append(node('p',`本机 ${item.local.records.length} 条记录，目标 ${item.local.target.join('/')}；云端 ${item.remote.records.length} 条记录，目标 ${item.remote.target.join('/')}`));}
        const backup=node('button','导出冲突双方完整备份');backup.className='btn secondary';backup.onclick=()=>download(c,'training-conflict.json');content.append(backup);
        const resolve=node('button','确认所选版本并同步');resolve.className='btn';resolve.onclick=()=>{try{store.resolve(choices);update();schedule();}catch(e){notify(e.message);}};content.append(resolve);
      }
      const archive=node('button','导出历史冲突备份');archive.className='inline';archive.onclick=()=>download(JSON.parse(localStorage.getItem(store.key+':conflict-archive')||'[]'),'training-conflict-history.json');content.append(archive);
      const relog=node('button','重新验证邮箱登录');relog.className='inline';relog.onclick=()=>{identity=null;store=null;localStorage.removeItem(ID);apply(guest(),false);setMessage('请用原邮箱登录，待同步记录保留在账号缓存');draw();};content.append(relog);const logout=node('button','退出账号');logout.className='inline';logout.onclick=async()=>{if(store.data.pending&&!confirm('此设备还有待同步记录。退出后仍保留在此账号本机缓存中，下次登录继续同步。确定退出？'))return;try{if(navigator.onLine)await auth.signOut();}catch{}clearTimeout(timer);localStorage.removeItem(ID);identity=null;store=null;apply(guest(),false);setMessage('已退出 · 显示未登录的本机记录');draw();};content.append(logout);return;
    }
    const form=node('form'),email=node('input'),code=node('input'),send=node('button','发送邮箱验证码'),submit=node('button','登录并同步'),hint=node('p','手机和平板使用同一邮箱。首次登录需联网；登录后可离线记录。');
    email.type='email';email.required=true;email.autocomplete='email';email.placeholder='你的邮箱';email.className='text-input';email.setAttribute('aria-label','邮箱');
    code.inputMode='numeric';code.autocomplete='one-time-code';code.placeholder='邮箱验证码';code.className='text-input';code.setAttribute('aria-label','邮箱验证码');send.type='button';send.className='btn secondary';submit.type='submit';submit.className='btn';
    send.onclick=async()=>{if(!email.reportValidity())return;send.disabled=true;try{const r=await auth.emailOtp.sendVerificationOtp({email:email.value.trim(),type:'sign-in'});if(r.error)throw Error(r.error.message);setMessage('验证码已发送，请检查收件箱和垃圾邮件');setTimeout(()=>send.disabled=false,60000);}catch(e){setMessage('验证码发送失败 · '+e.message);send.disabled=false;}};
    form.onsubmit=async e=>{e.preventDefault();if(!code.value.trim()){setMessage('请输入收到的验证码');return;}submit.disabled=true;try{const r=await auth.signIn.emailOtp({email:email.value.trim(),otp:code.value.trim()});if(r.error)throw Error(r.error.message);const session=await auth.getSession();if(!session.data?.user)throw Error('未能取得登录状态，请重试');activate(session.data.user);await sync();}catch(error){setMessage('登录失败 · '+error.message);}finally{submit.disabled=false;}};
    form.append(hint,email,send,code,submit);content.append(form);
  }
  function download(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(identity){try{activate(identity);setMessage('已载入账号本机缓存 · 等待同步');}catch(e){identity=null;store=null;setMessage('账号缓存读取失败，请保留备份后重新登录');}}
  draw();setMessage(message);
  window.addEventListener('storage',e=>{if(e.key===ID||(store&&e.key===store.key))setMessage('另一个窗口已更新数据 · 请刷新后继续，未提交输入请先保留');});document.addEventListener('close',()=>{if(store){update();schedule();}},true);window.addEventListener('online',schedule);window.addEventListener('offline',()=>setMessage('离线 · 新记录会在联网后同步'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  setInterval(()=>{if(!document.hidden)sync();},30000);schedule();
  return {import(next){if(!ownsWindow)throw Error('请关闭另一训练窗口后刷新，本窗口暂不可编辑');if(!store)return false;store.import(next);update();setMessage('备份已合并 · 如有冲突请展开处理');schedule();return true;},save(next){if(!ownsWindow)throw Error('请关闭另一训练窗口后刷新，本窗口暂不可编辑');if(!store)return false;store.edit(next);setMessage('已保存本机 · 待同步');schedule();return true;},isAccount:()=>!!store,changed:schedule};
}
