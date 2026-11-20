import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAdvice,plateVariant,rodSetup} from '../dist/load-advice.mjs';
import {STRENGTH_PLAN} from '../dist/strength-plan.mjs';
import {blankRows,exerciseEntryId} from '../dist/journal.mjs';

const plan=STRENGTH_PLAN.find(p=>p.id==='lateral');
const asOf='2026-11-19',trial={id:'trial'};
function fixture(){
  const entries={},s={journal:{entries}};
  function add(date,kg=1.25,{session={},row={},exercise={},snapshot=plan}={}){
    const id=String(Object.keys(entries).length),rows=blankRows(snapshot).map(r=>({...r,reps:20,quality:'normal',rir:'2',variant:plateVariant,load:'单只 '+kg+' kg',...row}));
    entries[id]={id,kind:'session',created:id,fields:{date,plan:[snapshot],trialId:trial.id,pain:'no',status:'complete',...session}};
    entries[exerciseEntryId(id,plan.id)]={kind:'exercise',fields:{rows,...exercise}};
    return entries[id];
  }
  return {add,advice:(kg,p=plan)=>loadAdvice(s,trial,p,asOf,kg)};
}
test('starter distinguishes direct plates from handles, custom plans and unloaded exercises',()=>{
  const {advice}=fixture();
  assert.deepEqual(advice().target,{load:'单只 1.25 kg',variant:plateVariant});
  const row=STRENGTH_PLAN.find(p=>p.id==='dbrow');
  assert.equal(advice(undefined,row).target.load,rodSetup);
  assert.equal(advice(3.2,row).target.load,rodSetup);
  assert.equal(advice(undefined,{...plan,load:'自选弹力带'}).target,null);
  for(const p of STRENGTH_PLAN.filter(p=>['push','split','deadbug'].includes(p.id)))assert.equal(advice(undefined,p).kind,'info');
});
test('two separate comparable dates plus an actual available step, preserving variant',()=>{
  const {add,advice}=fixture();
  add('2026-11-06',1.35);add('2026-11-12');add(asOf);
  assert.deepEqual(advice().target,{load:'单只 1.35 kg',variant:plateVariant});
  assert.equal(advice(2.5).kind,'step');
  assert.equal(advice(2.5).target,null);
  assert.equal(advice(undefined,{...plan,load:'单只 1.35 kg'}).kind,'hold');
});
test('unavailable step, same-day repeats and 14-day boundary',()=>{
  const first=fixture();first.add('2026-11-05');first.add(asOf);
  assert.equal(first.advice(1.3).kind,'hold');
  const same=fixture();same.add(asOf);same.add(asOf);
  assert.equal(same.advice(1.3).kind,'hold');
  const distinct=fixture();distinct.add('2026-11-06');distinct.add(asOf);
  assert.equal(distinct.advice().kind,'ready');
});
test('missing facts, changed versions, mixed or partial work cannot qualify for increase',()=>{
  for(const change of [{session:{pain:''}},{session:{status:'partial'}},{row:{quality:''}},{row:{variant:'弹力带'}},{row:{rir:'unknown'}},{row:{reps:19}},{exercise:{exerciseStatus:'partial'}},{snapshot:{...plan,min:13}}]){
    const {add,advice}=fixture();add('2026-11-12');add(asOf,1.25,change);
    assert.equal(advice(1.3).kind,'hold',JSON.stringify(change));
  }
});
test('recent discomfort supersedes progression, and poor form permits a known lighter step',()=>{
  for(const change of [{session:{pain:'yes'}},{session:{recoveryStatus:'affected'}},{row:{quality:'pain'}}]){
    const {add,advice}=fixture();add('2026-11-12');add(asOf,1.25,change);
    assert.equal(advice(1.3).kind,'check');
    assert.equal(advice(1.3).target,null);
  }
  const {add,advice}=fixture();add('2026-11-12',1);add(asOf,1.25,{row:{quality:'form'}});
  assert.equal(advice().target.load,'单只 1 kg');
  assert.equal(advice(1.5).target,null);
});
test('exclude other stages, deleted entries, and dates after the review',()=>{
  const {add,advice}=fixture();
  add('2026-11-12',2,{session:{trialId:'different'}});
  add(asOf).deleted=true;add('2026-11-20');
  assert.equal(advice().kind,'start');
});
test('unambiguous per-hand text and untouched extra rows preserve a usable baseline',()=>{
  const {add,advice}=fixture();
  const rows=blankRows(plan).map(r=>({...r,reps:16,load:'左右手各 ４ 公斤',rir:'2'}));
  add(asOf,4,{exercise:{rows:[...rows,...blankRows(plan).slice(0,1)]}});
  assert.equal(advice().kind,'hold');
  assert.equal(advice().target?.load,'单只 4 kg');
  for(const load of ['总重 4 kg','每端 4 kg','每支 4 kg 配重，不含杆','4','各 4 斤']){
    rows[0].load=load;assert.equal(advice().target,null);
  }
});
test('ambiguous left/right weight needs a measured single implement, once only',()=>{
  const {add,advice}=fixture();
  add(asOf,4,{row:{variant:plan.variant,load:'左右各 4 kg'}});
  assert.equal(advice().kind,'measure');
  assert.equal(advice().target,null);
  assert.equal(advice(4.2).target.load,'单只 4.2 kg');
  assert.equal(advice(undefined,{...plan,load:'单只 4.2 kg'}).target,null);
});
test('fatigue with an explicit per-hand load can propose the lighter plate variant for calibration',()=>{
  const {add,advice}=fixture();
  add(asOf,4,{row:{variant:plan.variant,load:'每支 4kg',rir:'0',quality:'fatigue'}});
  assert.equal(advice().kind,'lower');
  assert.deepEqual(advice().target,{load:'单只 1.25 kg',variant:plateVariant});
  assert.equal(advice(4.5).target,null);
});
test('extra work, a zero, or a pain marker in an extra row cannot be discarded as empty',()=>{
  for(const extra of [{reps:0},{rir:'unknown'},{quality:'pain'}]){
    const {add,advice}=fixture();add('2026-11-16');
    const rows=blankRows(plan).map(r=>({...r,variant:plateVariant,reps:20,load:'每手1.25kg',rir:'2',quality:'normal'}));
    add(asOf,1.25,{exercise:{rows:[...rows,{...blankRows(plan)[0],...extra}]}});
    assert.equal(advice(1.3).target,null);
    if(extra.quality)assert.equal(advice().kind,'check');
  }
});
