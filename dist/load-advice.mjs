import {entry,exerciseEntryId,hasActual,plusDays,sessions} from './journal.mjs';
import {STRENGTH_PLAN} from './strength-plan.mjs';

export const plateVariant='双手各握一片配重片侧平举';
export const bottleVariant='坐姿俯身，每手持一瓶水反向飞鸟';
export const rodSetup='短杆两端各一片 1.25 kg，另计杆与锁扣';
export const starts={
  dbrow:'有稳固支撑时，单只短杆两端各装一片 1.25 kg。称整只重量后填写。',
  rdl:'每只短杆两端各装一片 1.25 kg。单只重量含短杆和两个锁扣。',
  lateral:'每手直接握一片 1.25 kg，能稳握时试做。',
  rear:'每手约 0.5 kg，可用称过的水瓶。',
  push:'自重',split:'先用自重',deadbug:'自重'
};
const weighted=new Set(['dbrow','rdl','rear','lateral']);
const formatted=kg=>'单只 '+kg+' kg';
export const kgOf=text=>{
  const normalized=String(text??'').normalize('NFKC').trim();
  const match=/^(?:单只|每只|每支|每手|左右各|左右手各)\s*(\d+(?:\.\d+)?)\s*(?:kg|公斤|千克)$/i.exec(normalized);
  const kg=match?Number(match[1]):null;
  return Number.isFinite(kg)&&kg>0?kg:null;
};
export function loadAdvice(state,trial,plan,date,availableKg){
  const message=(kind,text,target=null)=>({kind,text,target});
  const target=(kg,variant=plan.variant)=>({load:formatted(kg),variant});
  if(plan.paused||!weighted.has(plan.id))return message('info',plan.paused?'此动作已暂停。':starts[plan.id]);
  const from=plusDays(date,-13);
  const observations=[];
  const usedWeights=new Map();
  for(const se of sessions(state,trial.id).reverse()){
    const f=se.fields;
    if(f.date<from||f.date>date||f.status==='skipped')continue;
    const snapshot=f.plan.find(p=>p.id===plan.id);
    if(!snapshot||snapshot.paused)continue;
    const log=entry(state,exerciseEntryId(se.id,plan.id))?.fields;
    const rows=(log?.rows||[]).filter((r,i)=>i<snapshot.sets||hasActual(r)||r.quality||r.rir||r.rest!=null||
      r.variant!==snapshot.variant||r.load!==snapshot.load);
    if(!rows.some(r=>r.quality==='pain')&&(!rows.some(hasActual)||['equipment','skipped'].includes(log?.exerciseStatus)))continue;
    for(const row of rows){
      const actual=kgOf(row.load);
      const positive=plan.sides?row.left>0&&row.right>0:row.reps>0;
      if(actual&&positive&&row.quality==='normal'&&f.pain==='no'&&!f.painNotes?.trim()&&f.recoveryStatus!=='affected'){
        if(!usedWeights.has(row.variant))usedWeights.set(row.variant,new Set());
        usedWeights.get(row.variant).add(actual);
      }
    }
    const pain=f.pain==='yes'||Boolean(f.painNotes?.trim())||f.recoveryStatus==='affected'||rows.some(r=>r.quality==='pain');
    const kg=kgOf(rows[0].load);
    const variant=rows[0].variant;
    const compatible=variant===plan.variant||(plan.id==='lateral'&&plan.variant==='双臂可控侧平举'&&variant===plateVariant);
    const same=compatible&&kg!==null&&rows.every(r=>kgOf(r.load)===kg&&r.variant===variant)
      &&snapshot.sets===plan.sets&&snapshot.min===plan.min&&snapshot.max===plan.max&&snapshot.sides===plan.sides;
    const count=r=>plan.sides?Math.min(r.left??-1,r.right??-1):r.reps??-1;
    const struggling=rows.some(r=>['fatigue','form'].includes(r.quality))||
      rows.some(r=>hasActual(r)&&count(r)>=0&&count(r)<plan.min&&r.rir==='0');
    const qualifies=same&&f.status==='complete'&&f.pain==='no'&&!pain&&!struggling&&log.exerciseStatus!=='partial'
      &&rows.length===plan.sets&&rows.every(r=>count(r)>=plan.max&&r.quality==='normal'&&r.rir!=='0')
      &&['2','4'].includes(rows.at(-1).rir);
    const baseline=same&&f.status==='complete'&&f.pain==='no'&&!pain&&!struggling&&log.exerciseStatus!=='partial'
      &&rows.length===plan.sets&&rows.every(r=>count(r)>=plan.min)&&['2','4'].includes(rows.at(-1).rir);
    observations.push({date:f.date,pain,kg,variant,same,struggling,qualifies,baseline});
  }
  const [last,previous]=observations;
  const configured=kgOf(plan.load);
  if(!last){
    const template=STRENGTH_PLAN.find(p=>p.id===plan.id);
    if(plan.variant!==template.variant||plan.load!==template.load)return message('hold','沿用计划档位：'+plan.load+'。近 14 天缺少可比记录。');
    let initial=null;
    if(plan.id==='lateral')initial=target(1.25,plateVariant);
    if(plan.id==='rear')initial=target(0.5,bottleVariant);
    if(plan.id==='dbrow'||plan.id==='rdl')initial={variant:plan.variant,load:rodSetup};
    return message('start',starts[plan.id],initial);
  }
  if(last.pain)return message('check','近期记录有不适或恢复受影响。先核对当时的情况，本次暂缓调重。');
  if(!last.same||(configured!==null?configured!==last.kg:!['待填写每只哑铃重量',rodSetup].includes(plan.load)))return message('hold','最近一次的重量、版本或目标与当前计划不一致。先按当前计划校准。');
  const note='最近一次每手 '+last.kg+' kg。';
  const known=[...(usedWeights.get(last.variant)||[])].sort((a,b)=>a-b);
  if(availableKg==null){
    availableKg=last.struggling?known.filter(w=>w<last.kg).at(-1):known.find(w=>w>last.kg);
  }
  if(last.struggling){
    const lighter=Number.isFinite(availableKg)&&availableKg>0&&availableKg<last.kg;
    if(availableKg==null&&plan.id==='lateral'&&last.kg>1.25&&[plateVariant,'双臂可控侧平举'].includes(last.variant)){
      return message('lower',note+'本次反馈吃力。可换为每手握一片 1.25 kg 重新校准，单独记录持片表现。',target(1.25,plateVariant));
    }
    return message('lower',note+'动作质量下降或接近力竭仍未达下限，可试更轻的可用档。',lighter?target(availableKg,last.variant):null);
  }
  if(!last.qualifies||!previous?.qualifies||previous.kg!==last.kg||previous.variant!==last.variant||previous.date===last.date){
    return message('hold',note+'先维持。升档需两个不同日期同档达标，动作稳定、无疼痛且末组有余力。',
      last.baseline&&['待填写每只哑铃重量',rodSetup].includes(plan.load)?target(last.kg,last.variant):null);
  }
  if(!Number.isFinite(availableKg)||availableKg<=last.kg)return message('ready',note+'两次均达标，可核对下一档的实际单只重量。');
  if(availableKg>last.kg*1.1+1e-9)return message('step',note+'下一档增幅超过 10%，建议保留当前重量。');
  return message('raise',note+'两次均达标，建议下一场试每手 '+availableKg+' kg。',target(availableKg,last.variant));
}
