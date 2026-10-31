// Health Connect bridge contract v1. Keeps episodes separate for user review.
const ORIGIN='com.sec.android.app.shealth';
export function normalizeHealthConnectSleep(input){
  if(!Array.isArray(input)||input.length>500)throw Error('睡眠批次无效或过大');
  const byId=new Map();
  for(const r of input){
    if(r?.origin!==ORIGIN)continue;
    const {id,startMs,endMs,endOffsetMinutes,updatedMs,stages}=r;
    if(!/^[\w-]{1,90}$/.test(id)||![startMs,endMs,updatedMs].every(Number.isSafeInteger)||startMs<0||endMs<=startMs||endMs-startMs>86400000||updatedMs<0||!Number.isInteger(endOffsetMinutes)||Math.abs(endOffsetMinutes)>840||!Array.isArray(stages)||stages.length>2000)throw Error('Health Connect睡眠记录无效');
    const old=byId.get(id);
    if(old&&old.updatedMs===updatedMs&&JSON.stringify(old)!==JSON.stringify(r))throw Error('同一版本睡眠数据不一致');
    if(!old||old.updatedMs<updatedMs)byId.set(id,r);
  }
  return [...byId.values()].map(r=>{
    let cursor=r.startMs,actual=0,complete=r.stages.length>0;
    const stages=[...r.stages].sort((a,b)=>a.startMs-b.startMs);
    for(const s of stages){
      if(!Number.isSafeInteger(s.startMs)||!Number.isSafeInteger(s.endMs)||s.startMs!==cursor||s.endMs<=s.startMs||s.endMs>r.endMs||!['awake','out_of_bed','awake_in_bed','sleeping','light','deep','rem'].includes(s.type)){complete=false;break;}
      if(['sleeping','light','deep','rem'].includes(s.type))actual+=s.endMs-s.startMs;
      cursor=s.endMs;
    }
    if(cursor!==r.endMs)complete=false;
    return {source:'Samsung Health',sourceId:'hc_'+r.id,groupId:'',date:new Date(r.endMs+r.endOffsetMinutes*60000).toISOString().slice(0,10),start:new Date(r.startMs).toISOString(),end:new Date(r.endMs).toISOString(),offsetMinutes:r.endOffsetMinutes,intervalMinutes:(r.endMs-r.startMs)/60000,actualMinutes:complete?actual/60000:null};
  }).sort((a,b)=>b.end.localeCompare(a.end));
}
