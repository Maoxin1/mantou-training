import {validateSleepSegments,sleepLine} from './sleep-core.mjs';
// Versioned daily journal. No personal measurements, account details or real logs belong here.
export const copy=x=>JSON.parse(JSON.stringify(x));
export const today=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export function dateOK(x){if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false;const d=new Date(x+'T12:00:00');return !Number.isNaN(+d)&&today(d)===x;}
export function plusDays(x,n){const d=new Date(x+'T12:00:00');d.setDate(d.getDate()+n);return today(d);}
const stamp=()=>new Date().toISOString();
export const DEFAULT_PLAN=[
  {id:'push',name:'俯卧撑',sets:2,min:6,max:12,sides:false,rest:90,variant:'选择标准／跪姿／稳定高台',load:'自重',cue:'选择能控制完成的版本；同一组更换版本时分开记录。'},
  {id:'row',name:'弹力带划船',sets:2,min:10,max:15,sides:false,rest:90,variant:'按厂家说明稳固固定',load:'待填写带规格及握距',cue:'控制拉回和还原，不甩动身体。无合适器械时标记缺器械，不把空手练习算成阻力训练。'},
  {id:'split',name:'扶稳原地分腿蹲',sets:2,min:8,max:12,sides:true,rest:60,variant:'手扶稳固支撑',load:'自重',cue:'左右分别记录次数；保持动作可控。'},
  {id:'bridge',name:'臀桥',sets:2,min:12,max:20,sides:false,rest:60,variant:'双腿臀桥',load:'自重',cue:'通过髋部抬起，避免用腰部过度后仰顶起。'},
  {id:'deadbug',name:'死虫式',sets:2,min:6,max:10,sides:true,rest:60,variant:'选择可控制的伸展幅度',load:'自重',cue:'左右分别记录；缩小幅度也可以，优先控制躯干。'}
];
export const LABELS={
  mealAmount:{all:'全部吃完',part:'吃了一部分',unknown:'不确定'},
  feedbackScope:{morning:'截至早上',afternoon:'截至下午',day:'全天回顾'},
  afternoonHunger:{none:'没有明显饿',some:'有点饿',strong:'明显饿'},
  digestion:{normal:'没有不适',discomfort:'有不适，备注说明'},
  status:{draft:'填写中',complete:'已完成',partial:'部分完成',skipped:'未训练'},
  rir:{unknown:'不确定','0':'余力0–1次','2':'余力2–3次','4':'余力约4次或更多'},
  quality:{normal:'动作稳定',form:'动作变形',fatigue:'明显疲劳',pain:'疼痛／明显不适'},
  recovery:{normal:'恢复正常',mild:'轻微酸痛，不影响活动',affected:'影响活动或训练',unknown:'不确定'},
  hunger:{comfortable:'饱腹基本合适',hungry:'经常明显饿',full:'经常过饱',unknown:'不确定'},
  energy:{good:'精神良好',normal:'一般',low:'明显乏力',unknown:'不确定'},
  activity:{strength:'力量训练',badminton:'羽毛球',rest:'休息／散步',skipped:'原计划未训练'},
  sleep:{good:'睡眠良好',normal:'一般',poor:'入睡慢／夜醒／恢复差',unknown:'不确定'},
  pain:{no:'无疼痛',yes:'有疼痛／明显不适',unknown:'不确定'},
  exerciseStatus:{done:'已练',partial:'部分完成',equipment:'缺器械',skipped:'本次未练'}
};
export const label=(group,x)=>x===''||x===undefined||x===null?'未填写':LABELS[group]?.[x]??String(x);
export const emptyJournal=()=>({version:1,trials:{},entries:{},settings:{}});
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
function safeJSON(x,depth=0){
  if(depth>14)throw Error('备份中的每日记录嵌套过深');
  if(x===null||typeof x==='boolean')return;
  if(typeof x==='number'&&Number.isFinite(x))return;
  if(typeof x==='string'&&x.length<=12000)return;
  if(Array.isArray(x)&&x.length<=200){x.forEach(v=>safeJSON(v,depth+1));return;}
  if(obj(x)&&Object.keys(x).length<=100){for(const [k,v]of Object.entries(x)){if(['__proto__','prototype','constructor'].includes(k))throw Error('备份含不安全字段');safeJSON(v,depth+1);}return;}
  throw Error('备份含无效每日记录字段');
}
export function validatePlan(plan){
  if(!Array.isArray(plan)||plan.length!==5)throw Error('备份中的试行计划不完整');
  for(let i=0;i<5;i++){const e=plan[i];if(!obj(e)||e.id!==DEFAULT_PLAN[i].id||!Number.isInteger(e.sets)||e.sets<1||e.sets>6||!Number.isInteger(e.min)||!Number.isInteger(e.max)||e.min<1||e.max<e.min||e.max>100||!Number.isFinite(e.rest)||e.rest<30||e.rest>300||typeof e.sides!=='boolean'||typeof e.name!=='string'||typeof e.variant!=='string'||typeof e.load!=='string')throw Error('备份含无效试行动作');}
  safeJSON(plan);return plan;
}
export function validateJournal(value){
  if(value===undefined)return emptyJournal();
  if(!obj(value)||value.version!==1||!obj(value.trials)||!obj(value.entries)||!obj(value.settings)||Object.keys(value.entries).length>10000)throw Error('备份中的每日记录不兼容');
  for(const [id,t]of Object.entries(value.trials)){
    if(!/^[A-Za-z0-9:._-]{1,180}$/.test(id)||['__proto__','prototype','constructor'].includes(id))throw Error('备份含无效阶段标识');
    if(!obj(t)||t.id!==id||!dateOK(t.start)||t.end!==plusDays(t.start,13)||!Number.isFinite(t.budget)||t.budget<0||t.budget>10000||!Array.isArray(t.changes)||typeof t.created!=='string')throw Error('备份含无效试行阶段');
    validatePlan(t.plan);validatePlan(t.initialPlan);safeJSON(t);
  }
  for(const [id,e]of Object.entries(value.entries)){
    if(!/^[A-Za-z0-9:._-]{1,180}$/.test(id)||['__proto__','prototype','constructor'].includes(id))throw Error('备份含无效记录标识');
    if(!obj(e)||e.id!==id||!['daily','session','exercise'].includes(e.kind)||!obj(e.fields)||typeof e.created!=='string'||typeof e.updated!=='string'||typeof e.deleted!=='boolean')throw Error('备份含无效每日记录');
    safeJSON(e);
    if(e.fields.samsungSleep!==undefined&&(e.kind!=='daily'||!validateSleepSegments(e.fields.samsungSleep)||e.fields.samsungSleep.date!==e.fields.date))throw Error('备份含无效三星睡眠数据');
    if(e.kind==='daily'||e.kind==='session'){if(!dateOK(e.fields.date))throw Error('备份含无效记录日期');}
    if(e.kind==='session'){if(typeof e.fields.trialId!=='string'||!value.trials[e.fields.trialId])throw Error('备份中的训练缺少试行阶段');validatePlan(e.fields.plan);}
    if(e.kind==='exercise'){
      const f=e.fields;if(typeof f.sessionId!=='string'||!DEFAULT_PLAN.some(x=>x.id===f.exerciseId)||!Array.isArray(f.rows)||f.rows.length>20)throw Error('备份含无效动作反馈');
      for(const r of f.rows){if(!obj(r)||!['reps','left','right','rest'].every(k=>r[k]===null||(Number.isInteger(r[k])&&r[k]>=0&&r[k]<=600))||typeof r.variant!=='string'||typeof r.load!=='string'||!['','unknown','0','2','4'].includes(r.rir)||!['','normal','form','fatigue','pain'].includes(r.quality))throw Error('备份含无效组数记录');}
    }
    const f=e.fields;
    for(const meal of ['breakfast','lunch','dinner','snack'])if(f[meal+'Amount']!==undefined&&f[meal+'Amount']!==''&&!Object.hasOwn(LABELS.mealAmount,f[meal+'Amount']))throw Error('备份含无效实际食用份量');
    if(f.recoveryDate&&( !dateOK(f.recoveryDate)||f.recoveryDate<f.date))throw Error('备份中的恢复日期早于训练日期或无效');
    for(const k of ['minutes','sleepHours','weight','waist','cost','purchase','badmintonMinutes','coffeeGrams1','coffeeGrams2'])if(f[k]!==undefined&&f[k]!==null&&(typeof f[k]!=='number'||!Number.isFinite(f[k])||f[k]<0||f[k]>100000))throw Error('备份含无效反馈数值');
    for(const [k,g]of [['feedbackScope','feedbackScope'],['afternoonHunger','afternoonHunger'],['digestion','digestion'],['status','status'],['recoveryStatus','recovery'],['hunger','hunger'],['energy','energy'],['activity','activity'],['sleepQuality','sleep'],['pain','pain'],['exerciseStatus','exerciseStatus']])if(f[k]!==undefined&&f[k]!==''&&!Object.hasOwn(LABELS[g],f[k]))throw Error('备份含无效反馈选项');
  }
  if(value.settings.activeTrial!==undefined&&!value.trials[value.settings.activeTrial])throw Error('备份中的当前试行阶段不存在');
  safeJSON(value.settings);return copy(value);
}
export function ensureJournal(s){s.journal=validateJournal(s.journal);return s.journal;}
export function activeTrial(s){const j=s.journal;return j?.trials[j.settings.activeTrial]||null;}
export function startTrial(s,{start=today(),budget=30}={}){
  if(!dateOK(start)||!Number.isFinite(budget)||budget<0||budget>10000)throw Error('请填写有效开始日期和预算');
  const j=ensureJournal(s),id=crypto.randomUUID(),at=stamp();
  j.trials[id]={id,start,end:plusDays(start,13),budget,created:at,plan:copy(DEFAULT_PLAN),initialPlan:copy(DEFAULT_PLAN),changes:[]};j.settings.activeTrial=id;return id;
}
export function plannedDates(t){return Array.from({length:14},(_,i)=>plusDays(t.start,i)).filter(d=>[2,4].includes(new Date(d+'T12:00:00').getDay()));}
export function entry(s,id){const e=s.journal?.entries[id];return e&&!e.deleted?e:null;}
export function writeEntry(s,id,kind,fields){
  const j=ensureJournal(s),old=j.entries[id],at=stamp();
  if(['daily','session'].includes(kind)&&fields.date!==undefined&&(!dateOK(fields.date)||fields.date>today()))throw Error('实际记录日期必须有效且不晚于今天');
  j.entries[id]={id,kind,created:old?.created||at,updated:at,deleted:false,fieldUpdated:{...Object.fromEntries(Object.keys(old?.fields||{}).map(k=>[k,old.fieldUpdated?.[k]||old.updated])),...Object.fromEntries(Object.keys(fields).filter(k=>JSON.stringify(old?.fields[k])!==JSON.stringify(fields[k])).map(k=>[k,at]))},fields:{...(old?.fields||{}),...copy(fields)}};
  validateJournal(j);return j.entries[id];
}
export function startSession(s,{date=today(),trialId=activeTrial(s)?.id}={}){
  const t=s.journal?.trials[trialId];if(!t)throw Error('请先开始两周试行');
  const id=crypto.randomUUID();writeEntry(s,id,'session',{date,trialId,status:'draft',plan:copy(t.plan)});return id;
}
export function exerciseEntryId(sessionId,exerciseId){return `exercise:${sessionId}:${exerciseId}`;}
export function blankRows(e){return Array.from({length:e.sets},()=>({reps:null,left:null,right:null,variant:e.variant,load:e.load,rir:'',quality:'',rest:null}));}
export function sessionExercises(s,session){return session.fields.plan.map(e=>({plan:e,log:entry(s,exerciseEntryId(session.id,e.id))}));}
export function hasActual(row){return [row.reps,row.left,row.right].some(n=>typeof n==='number');}
export function sessions(s,trialId){return Object.values(s.journal?.entries||{}).filter(e=>!e.deleted&&e.kind==='session'&&(!trialId||e.fields.trialId===trialId)).sort((a,b)=>a.fields.date.localeCompare(b.fields.date)||a.created.localeCompare(b.created));}
export function removeEntry(s,id){const j=ensureJournal(s);if(!j.entries[id])return;j.entries[id].deleted=true;j.entries[id].updated=stamp();}
export function changePlan(s,plan,reason){
  const j=ensureJournal(s),t=j.trials[j.settings.activeTrial];if(!t)throw Error('请先开始试行');validatePlan(plan);
  if(!String(reason).trim())throw Error('请填写调整原因');
  const at=stamp();t.changes.push({id:crypto.randomUUID(),at,reason:String(reason).trim(),before:copy(t.plan),after:copy(plan)});t.plan=copy(plan);
}
const cell=x=>String(x??'未填写').replaceAll('|','／').replaceAll('\n','；');
const number=x=>x===undefined||x===null?'未填写':String(x);
export function trialSummary(s,trialId=activeTrial(s)?.id,asOf=today()){
  const t=s.journal?.trials[trialId];if(!t)throw Error('没有可复盘的试行阶段');
  const to=asOf<t.end?asOf:t.end;
  const list=sessions(s,t.id).filter(e=>e.fields.date>=t.start&&e.fields.date<=to);
  const actual=list.filter(e=>sessionExercises(s,e).some(x=>x.log?.fields.rows.some(hasActual)));
  const complete=actual.filter(e=>e.fields.status==='complete').length,partial=actual.filter(e=>e.fields.status==='partial').length;
  const days=Object.values(s.journal.entries).filter(e=>e.kind==='daily'&&!e.deleted&&e.fields.date>=t.start&&e.fields.date<=to).sort((a,b)=>a.fields.date.localeCompare(b.fields.date));
  const totalDays=to<t.start?0:Math.round((new Date(to+'T12:00:00')-new Date(t.start+'T12:00:00'))/86400000)+1;
  return {trial:t,to,list,actual,complete,partial,days,totalDays,planned:plannedDates(t)};
}
export function trialMarkdown(s,trialId=activeTrial(s)?.id,asOf=today()){
  const q=trialSummary(s,trialId,asOf),t=q.trial;
  let out=`---\ntype: training_trial_review\ntrial_id: ${t.id}\nstart: ${t.start}\nend: ${t.end}\nexported: ${stamp()}\n---\n\n# 两周试行复盘｜${t.start} — ${t.end}\n\n> 统计截至 ${q.to}。缺失不等于正常，未记录不等于未训练。保留原始事实；不自动增加训练量，也不据两周数据判断增肌或减脂效果。\n\n## 完成与信息覆盖\n\n- 计划力量训练：${q.planned.join('、')}（共${q.planned.length}次，可顺延）。\n- 已记录实际训练：${q.actual.length}场；标为完成${q.complete}场，部分完成${q.partial}场。其他场次可能仍在填写。\n- 训练后状态已填：${q.list.filter(e=>e.fields.status&&e.fields.status!=='draft').length}/${q.list.length}场；次日恢复已填：${q.actual.filter(e=>e.fields.recoveryStatus).length}/${q.actual.length}场。\n- 饮食代表日（至少一餐有内容）：${q.days.filter(e=>['breakfast','lunch','dinner'].some(k=>e.fields[k]?.trim())).length}天。\n- 饥饿反馈：${q.days.filter(e=>e.fields.hunger).length}/${q.totalDays}天；精神反馈：${q.days.filter(e=>e.fields.energy).length}/${q.totalDays}天；食用成本估算：${q.days.filter(e=>typeof e.fields.cost==='number').length}/${q.totalDays}天。\n`;
  const costDays=q.days.filter(e=>typeof e.fields.cost==='number');if(costDays.length)out+=`- 有记录日的平均食用成本：${(costDays.reduce((n,e)=>n+e.fields.cost,0)/costDays.length).toFixed(1)}元；预算参考${t.budget}元/日。不代表完整两周平均。\n`;
  if(q.actual.length<4)out+='- 证据不足：实际训练少于4场，先检查原因或继续观察，不自动判定需要加量。\n';
  const pain=q.list.filter(e=>e.fields.pain==='yes'||String(e.fields.painNotes||'').trim()||sessionExercises(s,e).some(x=>x.log?.fields.rows.some(r=>r.quality==='pain')));
  if(pain.length)out+=`- 待优先复核的不适记录：${pain.map(e=>e.fields.date+'（'+e.id+'）').join('、')}。停止引起疼痛的相关动作；持续或加重时评估。\n`;
  out+='\n## 当前安排及调整历史\n\n周二、周四全身训练；周末一次羽毛球按实际日期记录。正课最多30分钟，热身另计约5分钟。\n\n| 动作 | 目标 | 版本与阻力 |\n|---|---|---|\n';
  for(const e of t.plan)out+=`| ${cell(e.name)} | ${e.sets}组 × ${e.sides?'每侧':''}${e.min}–${e.max}次 | ${cell(e.variant)}；${cell(e.load)} |\n`;
  out+='\n';for(const c of t.changes)out+=`- ${c.at}：${c.reason}\n  - 调整前：${cell(JSON.stringify(c.before))}\n  - 调整后：${cell(JSON.stringify(c.after))}\n`;
  out+='\n## 可比较的动作事实\n\n> 仅把同一动作、版本和阻力的已填数据并列；休息、动作质量、左右侧和恢复仍需结合下方原记录核对。次数上升不自动等于力量增长。\n\n';
  const groups=new Map();for(const se of q.list)for(const {plan,log}of sessionExercises(s,se))for(const [i,r]of (log?.fields.rows||[]).entries())if(hasActual(r)){
    const key=JSON.stringify([plan.id,r.variant,r.load]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push({se,plan,r,i});
  }
  for(const rows of groups.values()){
    const first=rows[0];out+=`### ${first.plan.name}｜${cell(first.r.variant)}｜${cell(first.r.load)}\n\n`;
    if(new Set(rows.map(x=>x.se.id)).size<2)out+='仅1场记录，尚无跨场比较。\n\n';
    for(const {se,plan,r,i}of rows)out+=`- ${se.fields.date}｜场次${se.id}｜第${i+1}行：${plan.sides?`左${number(r.left)}／右${number(r.right)}`:number(r.reps)}次；${label('rir',r.rir)}；${label('quality',r.quality)}；休息${number(r.rest)}秒。\n`;
    out+='\n';
  }
  if(!groups.size)out+='尚无实际动作数据。\n';
  out+='\n## 按日期的原始记录\n\n';
  for(const se of q.list){const f=se.fields;out+=`### ${f.date}｜训练场次 ${se.id}\n\n- 状态：${label('status',f.status)}；实际时间${f.time||'未填写'}；正课${number(f.minutes)}分钟；训练前睡眠${number(f.sleepHours)}小时。\n- 疼痛：${label('pain',f.pain)}；位置／说明：${f.painNotes||'未填写'}。\n- 结束或未完成原因：${f.reason||'未填写'}。\n- 训练感受：${f.notes||'未填写'}。\n- 恢复反馈日期：${f.recoveryDate||'未填写'}；${label('recovery',f.recoveryStatus)}；${f.recoveryNotes||'未填写'}。\n- 保存时间：${se.updated}。\n`;
    for(const {plan,log}of sessionExercises(s,se)){out+=`- ${plan.name}：${label('exerciseStatus',log?.fields.exerciseStatus)}；${log?.fields.notes||'无补充'}；当时目标${plan.sets}组×${plan.min}–${plan.max}次${plan.sides?'／侧':''}。\n`;}
    out+='\n';
  }
  for(const d of q.days){const f=d.fields;if(f.samsungSleep)out+=`- ${f.date} 导入睡眠：${sleepLine(f.samsungSleep)}。\n`;out+=`### ${f.date}｜每日反馈 ${d.id}\n\n- 活动：${label('activity',f.activity)}；羽毛球${number(f.badmintonMinutes)}分钟。\n- 反馈时段：${label('feedbackScope',f.feedbackScope)}；下午饥饿：${label('afternoonHunger',f.afternoonHunger)}；胃肠感受：${label('digestion',f.digestion)}。\n- 饥饿：${label('hunger',f.hunger)}；精神：${label('energy',f.energy)}；睡眠：${label('sleep',f.sleepQuality)}。\n- 早餐：${f.breakfast||'未填写'}；实际食用：${label('mealAmount',f.breakfastAmount)}；补充：${f.breakfastNote||'未填写'}\n- 午餐：${f.lunch||'未填写'}；实际食用：${label('mealAmount',f.lunchAmount)}；补充：${f.lunchNote||'未填写'}\n- 晚餐：${f.dinner||'未填写'}；实际食用：${label('mealAmount',f.dinnerAmount)}；补充：${f.dinnerNote||'未填写'}\n- 加餐：${f.snackNote||'未填写'}；实际食用：${label('mealAmount',f.snackAmount)}\n- 加餐／份量说明：${f.foodNotes||'未填写'}\n- 当日食用成本估算：${number(f.cost)}元；当日采购付款：${number(f.purchase)}元。\n- 咖啡：${f.coffeeProduct||'产品未填写'}；第1杯${f.coffeeTime1||'时间未填'}／${number(f.coffeeGrams1)}克；第2杯${f.coffeeTime2||'时间未填'}／${number(f.coffeeGrams2)}克。\n- 体重${number(f.weight)}kg；腰围${number(f.waist)}cm；测量条件${f.measureNotes||'未填写'}。\n- 自由补充：${f.notes||'未填写'}\n- 保存时间：${d.updated}。\n\n`;}
  const missing=Array.from({length:q.totalDays},(_,i)=>plusDays(t.start,i)).filter(d=>!q.days.some(e=>e.fields.date===d));out+=`## 缺失与下一阶段讨论\n\n- 尚无每日反馈的日期：${missing.join('、')||'无'}。\n- 核对动作版本、阻力、休息、完成质量后，再讨论次数变化。\n- 结合持续饥饿、精神、恢复和实际食物份量讨论饮食；不把空白、包装重量或单日体重当作结论。\n- 保持／调整：待本人确认。\n- 调整依据与尚缺信息：\n\n> 将此Markdown放入Obsidian，或发给助手读取。助手不能默认直接访问账号记录。完整JSON备份另用于恢复。\n`;
  return out;
}
