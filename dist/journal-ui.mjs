import {planCard} from './journal-cards.mjs';
import {STRENGTH_ROUTINE,STRENGTH_PLAN,WORKOUTS,isStrength,defaultWorkout,workoutPlan} from './strength-plan.mjs';
import {sleepSection,bindSleepImport} from './sleep-ui.mjs';
import {mealPhotoSection,bindMealPhotos,mealArchive,mealArchives,restoreMealArchive} from './meal-photos.mjs';
import {DEFAULT_PLAN,LABELS,label,today,plusDays,dateOK,copy,activeTrial,startTrial,startSession,entry,writeEntry,exerciseEntryId,blankRows,sessions,sessionExercises,hasActual,removeEntry,changePlan,validatePlan,trialSummary,trialMarkdown} from './journal.mjs';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
function input(key,title,value,type='text',extra=''){return `<label class="journal-field"><span>${title}</span><input class="text-input" data-field="${key}" type="${type}" value="${esc(value??'')}" ${type==='number'?'min="0" max="100000" step="any"':''} ${type==='text'?'maxlength="200"':''} ${extra}></label>`;}
function area(key,title,value,placeholder=''){return `<label class="journal-field"><span>${title}</span><textarea class="text-input" data-field="${key}" rows="3" maxlength="6000" placeholder="${esc(placeholder)}">${esc(value??'')}</textarea></label>`;}
function select(key,title,value,group){return `<label class="journal-field"><span>${title}</span><select class="text-input" data-field="${key}"><option value="">未填写</option>${Object.entries(LABELS[group]).map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('')}</select></label>`;}
const mealGuide=()=>`<details class="journal-guide"><summary>饮食试行安排与替换</summary><p>目标：吃得足够、支持训练和恢复，先不主动减重。预算分配需要用实际购买验证。</p><div class="meal-guide"><p><b>早餐 · 约6元</b><br>2颗鸡蛋＋红薯／燕麦／馒头＋约300毫升牛奶。</p><p><b>午餐 · 约12元</b><br>米饭／面条＋一掌心肉或鱼＋1–2拳蔬菜。外食不足时补鸡蛋、豆腐、鸡肉或部分自带。</p><p><b>晚餐 · 约10元</b><br>正常份量的主食＋一掌心肉或鱼＋约200克豆腐＋1–2拳蔬菜。肉已较多时，豆腐可移到午餐。</p><p><b>水果 · 约2元</b><br>当季水果约200–350克。咖啡费用也计入预算，优先自备。</p></div><p>主食以吃饱、支持活动为起点，不因加奶或豆腐就自动删掉原有主食。训练或打球后明显更饿，可加主食或小加餐并记录。</p><p>先详记3个代表日：普通日、力量训练日、羽毛球日。注明肉类生／熟、包装总量和实际食用量；不直接把包装克数当作纯肉量。</p><p>咖啡固定产品和粉量；杯子水量不能代表咖啡因剂量。结合睡眠、胃部和心悸等反馈调整，不用咖啡代替食物。</p><p class="hint">此模板不能保证具体热量或蛋白质达标。核对实际食物后再决定调整。<a href="https://dg.cnsoc.org/article/04/70JvPbFmTlyZbjoO67LeRg.html" target="_blank" rel="noopener">膳食指南参考</a></p></details>`;
export function mountJournal({getState,transact,restoreRecords,notify,download,legacyPlan,legacyHistory}){
  let selectedSession=null,selectedDate=today(),planMode=false,selectedWorkout=defaultWorkout(today());
  const state=()=>getState(),trial=()=>activeTrial(state());
  const guard=fn=>{try{return fn();}catch(e){notify(e.message);return null;}};
  function modal(title,html,eyebrow='每日记录'){
    $('dialogTitle').textContent=title;$('dialogEyebrow').textContent=eyebrow;
    $('dialogContent').innerHTML=`<p class="hint" id="journalSave" role="status">填写后自动保存</p>${html}`;
    if(!$('exerciseDialog').open)$('exerciseDialog').showModal();$('exerciseDialog').scrollTop=0;
  }
  function save(fn,options){try{const result=transact(fn,options);if($('journalSave'))$('journalSave').textContent='已保存本机；登录后联网自动同步';return result;}catch(e){if($('journalSave')){$('journalSave').textContent='保存失败：'+e.message+'。当前输入请先保留。';$('journalSave').className='error';}notify(e.message);return false;}}
  function bindFields(id,kind,initial={}){
    $('dialogContent').querySelectorAll('[data-field]').forEach(el=>{
      el.addEventListener('input',()=>{
        if(!el.checkValidity()){$('journalSave').textContent='输入尚未保存：请填写有效数值或日期。';return;}
        const key=el.dataset.field,value=el.type==='number'?(el.value===''?null:Number(el.value)):el.value;
        if((key==='date'||key==='recoveryDate')&&value&&(!dateOK(value)||value>today())){$('journalSave').textContent='输入尚未保存：实际日期不能晚于今天。';return;}
        save(s=>writeEntry(s,id,kind,{...(entry(s,id)?{}:initial),[key]:value}));
      });
    });
  }
  function openStart(){
    modal('开始两周试行',`<form id="startTrialForm">${input('start','开始日期',today(),'date')}${input('budget','每日饮食预算（元）',30,'number','max="10000"')}<p class="hint">周二、周四同表全身训练，周末一次羽毛球。正式开始后保留阶段和记录；满两周只生成复盘，不自动加量。</p><button class="btn" type="submit">确认开始试行</button></form>`,'两周 · 四次力量训练');
    $('startTrialForm').onsubmit=ev=>{ev.preventDefault();guard(()=>{const start=$('dialogContent').querySelector('[data-field=start]').value,budget=Number($('dialogContent').querySelector('[data-field=budget]').value);transact(s=>startTrial(s,{start,budget}));selectedSession=null;$('exerciseDialog').close();renderPlan();});};
  }
  function openStrength(){
    const previous=trial();
    modal('三日力量训练 · 确认安排',`<p>周一 A、周三 B、周五 C，周末一次羽毛球。正课30分钟，热身另计5–8分钟；相邻力量日尽量间隔一天，可按恢复顺延。</p><p>这是持续训练阶段，每周复盘；旧阶段、训练记录和餐照保留。</p>${Object.entries(WORKOUTS).map(([key,w])=>`<details class="journal-guide" ${key==='A'?'open':''}><summary>${w.title} · 5个动作</summary>${workoutPlan(STRENGTH_PLAN,key).map(e=>`<p>${esc(e.name)}：2组 × ${e.sides?'每侧 ':''}${e.min}–${e.max}次</p>`).join('')}</details>`).join('')}<p>大多数动作留2–3次余力，新哑铃动作先留3–4次。标准俯卧撑先从8–10次校准，目标范围仍为6–12次。主动作休息90–120秒，辅助动作60–90秒。</p>${strengthEquipment()}<form id="startStrengthForm">${input('start','阶段开始日期',today(),'date',`max="${today()}"`)}<p class="hint">先让手机和平板都更新到2.4.0或更高版本，再切换。确认后，以后新建的场次使用三日动作表；已有场次仍可补记。</p><button class="btn" id="confirmStrength" type="submit">确认启用三日计划</button></form>`,'已核对方案 · 确认后启用');
    $('journalSave').textContent='正在预览，尚未改变当前计划。';
    $('startStrengthForm').onsubmit=ev=>{
      ev.preventDefault();const button=$('confirmStrength');if(button.disabled)return;button.disabled=true;
      const start=$('startStrengthForm').querySelector('[data-field=start]').value;
      if(save(s=>{if(trial()!==previous)throw Error('当前数据已更新，请关闭后重新核对');return startTrial(s,{start,budget:previous?.budget??30,routine:STRENGTH_ROUTINE});},{requireCurrentAccountCache:true})===false){button.disabled=false;return;}
      selectedSession=null;selectedWorkout=defaultWorkout(today());$('exerciseDialog').close();renderPlan();notify('三日力量阶段已启用，旧记录保留');
    };
  }
  function strengthEquipment(){return `<details class="journal-guide"><summary>最少器械与初始强度</summary><p>一对可调哑铃：轻重量起步，按能力逐步加重；按已购器械的实际配重组合记录。优先选可小步加重的配置，核对含杆和锁扣的单只重量；套装总重不等于单只重量。</p><p>沿用瑜伽垫，划船用稳固支撑；不必另购训练凳。重量从动作可控、保留余力的程度选择，记录每只实际重量，不按包装总重填写。</p><p>器械未齐就标记缺器械。临时用弹力带划船或臀桥时，写明实际替代动作、双侧／单侧次数和阻力；替代记录不能与哑铃动作直接合并作为加量依据。</p></details>`;}
  function openNewStrengthSession(date=today()){
    const t=trial();
    if(!isStrength(t)){selectedSession=transact(s=>startSession(s,{date}));openSession(selectedSession);return;}
    modal('选择本次动作表',`<form id="newStrengthSessionForm">${input('date','实际训练日期',date,'date',`min="${t.start}" max="${today()}"`)}<label class="journal-field">动作表<select class="text-input" data-field="workout">${Object.entries(WORKOUTS).map(([key,w])=>`<option value="${key}" ${key===defaultWorkout(date)?'selected':''}>${w.title}</option>`).join('')}</select></label><p class="hint">可顺延日期。新建后保留当时的动作表和目标，不改写其他场次。</p><button class="btn" type="submit">新建本次训练</button></form>`,'三日力量训练');
    $('journalSave').textContent='选择后新建；尚未记录本次训练。';
    $('newStrengthSessionForm').onsubmit=ev=>{ev.preventDefault();guard(()=>{const form=$('newStrengthSessionForm'),button=form.querySelector('button');if(button.disabled)return;const date=form.querySelector('[data-field=date]').value,workout=form.querySelector('[data-field=workout]').value;button.disabled=true;try{selectedSession=transact(s=>{if(activeTrial(s)?.id!==t.id)throw Error('当前阶段已改变，请重新选择');return startSession(s,{date,workout});});openSession(selectedSession);}catch(e){button.disabled=false;throw e;}});};
  }
  function chosenSession(){let se=selectedSession&&entry(state(),selectedSession);if(se?.fields.trialId!==trial()?.id)se=null;return se||sessions(state(),trial()?.id).filter(e=>e.fields.date===today()).at(-1)||null;}
  function getOrCreateSession(){let se=chosenSession();if(!se){const id=transact(s=>startSession(s,{workout:selectedWorkout}));selectedSession=id;se=entry(state(),id);}return se;}
  function beginTraining(){
    const existing=chosenSession(),t=trial();
    const plan=existing?.fields.plan||(isStrength(t)?workoutPlan(t.plan,selectedWorkout):t.plan);
    const available=plan.filter(e=>!e.paused&&!t.plan.find(p=>p.id===e.id)?.paused);
    if(!available.length){notify('本次动作均已暂停，请先核对后续训练安排');return;}
    const current=getOrCreateSession();
    const next=available.find(e=>{
      const rows=entry(state(),exerciseEntryId(current.id,e.id))?.fields.rows||[];
      return rows.length<e.sets||rows.slice(0,e.sets).some(r=>e.sides?r.left==null||r.right==null:r.reps==null);
    })||available[0];
    openExercise(current.id,next.id);
  }
  function renderPlan(){
    if(planMode){legacyPlan();const back=document.createElement('button');back.className='inline';back.textContent='← 返回当前训练';back.onclick=()=>{planMode=false;renderPlan();};$('main').prepend(back);return;}
    const t=trial(),strength=isStrength(t),se=t?chosenSession():null,detailsOpen=$('planDetails')?.open||false;
    const plan=se?.fields.plan||(strength?workoutPlan(t.plan,selectedWorkout):t?.plan||DEFAULT_PLAN),q=t?trialSummary(state()):null;
    const picker=strength&&!se?`<label class="journal-field">本次动作表<select class="text-input" id="strengthWorkout">${Object.entries(WORKOUTS).map(([key,w])=>`<option value="${key}" ${key===selectedWorkout?'selected':''}>${w.title}</option>`).join('')}</select></label><p class="hint">可顺延日期，相邻力量日尽量间隔一天。</p>`:'';
    $('main').innerHTML=`<div class="eyebrow">${today()} · ${strength?'三日力量':'两周试行'}</div><div class="plan-heading"><h1>今天的训练</h1><span class="muted">正课 ≤30分钟</span></div><p class="session-hint">${strength?'周一 A · 周三 B · 周五 C':'周二、周四全身训练'} · 周末一次羽毛球</p>
    <section class="card trial-overview">${t?`<div class="row"><b>${strength?'三日力量 · 持续训练':t.start+' — '+t.end}</b><span class="muted">${strength?'每周复盘':today()>t.end?'可复盘／继续观察':today()<t.start?'待开始':'试行中'}</span></div><p class="muted">${strength?'本周':'已有'}实际训练 ${q.actual.length} 场 · ${strength?'每周计划3次':'计划4次'}</p>${picker}<button class="btn" id="beginSession">${se?'继续训练':'开始训练'}</button><div class="journal-actions"><button class="inline" id="todayFeedback">记一餐</button>${se?'<button class="inline" id="newSession">＋ 新建训练场次</button>':''}<button class="inline" id="quickReview">${strength?'本周复盘':'阶段复盘'}</button></div>`:`<h3>从确认后的计划开始。</h3><p class="muted">记录实际次数、余力和恢复，逐步校准难度。</p><button class="btn secondary" id="startTrial">开始两周试行</button>`}${!strength?'<button class="btn secondary" id="startStrength">查看并启用三日力量计划</button>':''}</section>
    ${se?`<p class="muted">正在记录：${esc(se.fields.date)} · ${se.fields.workout?esc(se.fields.workout)+' 表 · ':''}${label('status',se.fields.status)} <button class="inline" id="sessionFeedback">训练后反馈／恢复 →</button></p>`:''}
    <div class="exercise-grid">${plan.map(e=>{const latest=t?.plan.find(p=>p.id===e.id);return planCard(latest?.paused?{...e,paused:true,pauseReason:latest.pauseReason}:e,se?entry(state(),exerciseEntryId(se.id,e.id)):null);}).join('')}</div>
    <details id="planDetails" ${detailsOpen?'open':''}><summary>计划说明与历史</summary>${strength?strengthEquipment():''}${mealGuide()}
    <details><summary>训练与调整规则</summary><p>热身另计${strength?'5–8':'约5'}分钟：轻活动和当天动作的轻量练习。主动作休息90–120秒，辅助动作60–90秒。到30分钟可省略最后的辅助组并记录，不赶动作压缩必要休息。</p><p>多数动作留2–3次余力，新哑铃动作先留3–4次。同一版本、阻力和动作质量下，连续两次各组达到上限且至少留2次余力、没有疼痛、恢复正常，再考虑最小幅度提高阻力或难度。先预览，再本人确认；未确认不会改变下场目标。</p><p>周末羽毛球后的酸痛影响动作时，顺延或减少相关训练。明确疼痛停止相关动作，持续或加重需评估。</p><p>弹力带检查裂纹、磨损，按厂家说明固定并遵守拉伸范围。哑铃每次检查锁扣；临时替代动作写明实际版本，不与原动作混作加量证据。</p><p>${strength?'每周结合训练、饮食和睡眠复盘；不自动增加组数或训练天数。':'这两周用于校准难度、时间和恢复。'}短期外观不是增肌效果的判断依据。</p></details>
    <div class="journal-actions">${t?'<button class="inline" id="adjustTrial">调整后续训练安排</button>':''}<button class="inline" id="legacyPlan">查看原训练计划</button></div></details>`;
    if($('startTrial'))$('startTrial').onclick=openStart;
    if($('startStrength'))$('startStrength').onclick=openStrength;
    if($('strengthWorkout'))$('strengthWorkout').onchange=()=>{selectedWorkout=$('strengthWorkout').value;renderPlan();};
    if(t){$('beginSession').onclick=()=>guard(beginTraining);$('todayFeedback').onclick=()=>openMeal(today());$('quickReview').onclick=()=>openReview(t.id);$('adjustTrial').onclick=openAdjust;}
    if(se){$('sessionFeedback').onclick=()=>openSession(se.id);$('newSession').onclick=()=>guard(()=>openNewStrengthSession());}
    $('legacyPlan').onclick=()=>{planMode=true;renderPlan();};
    document.querySelectorAll('[data-journal-exercise]').forEach(b=>b.onclick=()=>guard(()=>{if(!trial()){openStart();return;}const current=getOrCreateSession();openExercise(current.id,b.dataset.journalExercise);}));
  }
  function openMeal(date){
    if(!dateOK(date)||date>today()){notify('请选择不晚于今天的有效日期');return;}
    const id='daily:'+date;
    modal(`${date} · 记一餐`,`${mealPhotoSection()}<button class="btn" id="journalDone">完成</button><button class="inline" id="moreDaily">补充每日感受</button>`,'餐照与实际食用量');
    bindMealPhotos({date,getFields:()=>entry(state(),id)?.fields||{},saveFields:fields=>save(s=>writeEntry(s,id,'daily',{date,...fields})),notify});
    $('journalDone').onclick=()=>$('exerciseDialog').close();$('moreDaily').onclick=()=>openDaily(date);
  }
  function openDaily(date=selectedDate){
    if(!dateOK(date)||date>today()){notify('请选择不晚于今天的有效日期');return;}
    selectedDate=date;const id='daily:'+date,f=entry(state(),id)?.fields||{};
    modal(`${date} · 每日记录`,`${sleepSection(state(),date)}${mealPhotoSection()}${select('feedbackScope','本次反馈覆盖时段',f.feedbackScope,'feedbackScope')}${select('afternoonHunger','下午是否饿（未到下午请留空）',f.afternoonHunger,'afternoonHunger')}${select('digestion','胃肠感受',f.digestion,'digestion')}${select('activity','当天主要活动',f.activity,'activity')}${input('badmintonMinutes','羽毛球时长（分钟，可留空）',f.badmintonMinutes,'number')}${select('hunger','饥饿与饱腹',f.hunger,'hunger')}${select('energy','精神状态',f.energy,'energy')}${select('sleepQuality','昨晚睡眠感受',f.sleepQuality,'sleep')}${input('cost','当天食用成本估算（元）',f.cost,'number')}<details><summary>三餐与份量 · 任选3个代表日详记</summary><p class="hint">普通日、力量训练日、羽毛球日各一次。可写近似份量；注明生／熟、包装总量与实际吃掉多少。</p>${area('breakfast','早餐',f.breakfast)}${area('lunch','午餐',f.lunch)}${area('dinner','晚餐',f.dinner)}${area('foodNotes','加餐、食量与包装说明',f.foodNotes)}${input('purchase','当天采购付款（元，与当天食用成本分开）',f.purchase,'number')}</details><details><summary>咖啡与睡眠补充</summary>${input('coffeeProduct','咖啡产品／规格',f.coffeeProduct)}${input('coffeeTime1','第一杯时间',f.coffeeTime1,'time')}${input('coffeeGrams1','第一杯咖啡粉（克，不确定留空）',f.coffeeGrams1,'number')}${input('coffeeTime2','第二杯时间',f.coffeeTime2,'time')}${input('coffeeGrams2','第二杯咖啡粉（克，不确定留空）',f.coffeeGrams2,'number')}</details><details><summary>可选体重与腰围</summary>${input('weight','体重（kg）',f.weight,'number')}${input('waist','腰围（cm）',f.waist,'number')}${area('measureNotes','测量条件与腰围位置',f.measureNotes,'同一时间、同一位置；不把不同测法直接比较。')}</details>${area('notes','自由补充：感受、问题或临时变化',f.notes)}<button class="btn" id="journalDone">完成本次填写</button>${entry(state(),id)?'<button class="inline" id="deleteDaily">删除这天误建的每日反馈</button>':''}`, '训练、饮食与恢复 · 按日期汇总');
    bindFields(id,'daily',{date});bindMealPhotos({date,getFields:()=>entry(state(),id)?.fields||{},saveFields:fields=>save(s=>writeEntry(s,id,'daily',{date,...fields})),notify});$('journalDone').onclick=()=>$('exerciseDialog').close();if($('deleteDaily'))$('deleteDaily').onclick=()=>{if(!confirm('删除这天的饮食与每日反馈？训练场次和动作记录仍保留。'))return;guard(()=>{transact(s=>removeEntry(s,id));$('exerciseDialog').close();});};
  }
  function openSession(id){
    const se=entry(state(),id);if(!se)return;selectedSession=id;const f=se.fields;
    modal(`${f.date} · 训练后反馈`,`${input('date','实际训练日期（可补记、改日期）',f.date,'date',`max="${today()}"`)}${input('time','实际训练时间（可选）',f.time,'time')}${select('status','本次训练状态',f.status,'status')}${input('minutes','正课实际耗时（分钟）',f.minutes,'number')}${input('sleepHours','训练前一晚睡眠（小时）',f.sleepHours,'number')}${select('pain','本次是否疼痛／明显不适',f.pain,'pain')}${area('painNotes','不适位置、出现在哪个动作',f.painNotes)}${area('reason','未训练、部分完成或提前结束的原因',f.reason)}${area('notes','训练感受与问题',f.notes)}<details><summary>补记／修改这次训练的动作</summary>${f.plan.map(p=>`<button class="btn secondary" data-session-exercise="${p.id}">${esc(p.name)}</button>`).join('')}</details><details id="recoveryFields"><summary>恢复反馈 · 下次训练前回顾，可补记</summary>${input('recoveryDate','恢复反馈日期',f.recoveryDate,'date',`max="${today()}"`)}${select('recoveryStatus','恢复与酸痛',f.recoveryStatus,'recovery')}${area('recoveryNotes','部位、持续时间、是否影响活动；近期羽毛球情况',f.recoveryNotes)}</details><button class="btn" id="journalDone">完成本次填写</button><button class="inline" id="deleteSession">删除这次误建的训练场次</button>`,'训练场次 · 可分次填写');
    bindFields(id,'session');$('dialogContent').querySelectorAll('[data-session-exercise]').forEach(b=>b.onclick=()=>openExercise(id,b.dataset.sessionExercise));$('journalDone').onclick=()=>$('exerciseDialog').close();
    $('deleteSession').onclick=()=>{if(!confirm('删除这次场次及其动作记录？删除状态会同步；已有导出备份不受影响。'))return;guard(()=>{transact(s=>{removeEntry(s,id);for(const p of f.plan)removeEntry(s,exerciseEntryId(id,p.id));});selectedSession=null;$('exerciseDialog').close();renderPlan();});};
  }
  function openExercise(sessionId,exerciseId){
    const se=entry(state(),sessionId),plan=se?.fields.plan.find(e=>e.id===exerciseId);if(!plan)return;
    if(plan.paused){notify('此场次该动作已暂停；请在调整后续训练安排中确认恢复');return;}
    const id=exerciseEntryId(sessionId,exerciseId),f=entry(state(),id)?.fields||{},rows=f.rows||blankRows(plan);
    const rowHTML=(r,i)=>`<fieldset class="set-card"><legend>第${i+1}组${i>=plan.sets?' · 额外一组／同组分段':''}</legend><label class="journal-field">阻力规格／握距<input class="text-input" data-row="${i}" data-key="load" maxlength="200" value="${esc(r.load)}"></label><div class="journal-columns">${plan.sides?`<label>左侧次数<input class="text-input" data-row="${i}" data-key="left" type="number" min="0" max="600" step="1" value="${r.left??''}"></label><label>右侧次数<input class="text-input" data-row="${i}" data-key="right" type="number" min="0" max="600" step="1" value="${r.right??''}"></label>`:`<label>实际次数<input class="text-input" data-row="${i}" data-key="reps" type="number" min="0" max="600" step="1" value="${r.reps??''}"></label>`}<label>还能规范做几次<select class="text-input" data-row="${i}" data-key="rir"><option value="">未填写</option>${Object.entries(LABELS.rir).map(([v,t])=>`<option value="${v}" ${r.rir===v?'selected':''}>${t}</option>`).join('')}</select></label></div><details><summary>版本、休息与动作质量</summary><label class="journal-field">实际动作版本<input class="text-input" data-row="${i}" data-key="variant" maxlength="200" value="${esc(r.variant)}"></label><label class="journal-field">组间休息（秒）<input class="text-input" data-row="${i}" data-key="rest" type="number" min="0" max="600" step="1" value="${r.rest??''}"></label><label class="journal-field">动作质量<select class="text-input" data-row="${i}" data-key="quality"><option value="">未填写</option>${Object.entries(LABELS.quality).map(([v,t])=>`<option value="${v}" ${r.quality===v?'selected':''}>${t}</option>`).join('')}</select></label></details></fieldset>`;
    modal(plan.name,`<p class="muted">${se.fields.date} · 当时目标 ${plan.sets}组 × ${plan.sides?'每侧':''}${plan.min}–${plan.max}次 · 休息${plan.rest}秒左右</p><details class="exercise-help"><summary>动作要点与填写说明</summary><p>${esc(plan.cue)}</p><p>空白是未填，0是实际做了0次。余力估不准选“不确定”。同组换版本时另加一行并注明分段。</p></details><div id="trialSetRows">${rows.map(rowHTML).join('')}</div><button class="inline" id="addSetRow">＋ 添加一行：额外组或同组换版本</button><details><summary>完成情况与补充</summary>${select('exerciseStatus','这个动作的完成情况',f.exerciseStatus,'exerciseStatus')}${area('notes','动作问题／分段说明／未完成原因',f.notes)}</details><button class="inline" id="backSession">返回训练后反馈／次日恢复</button><button class="btn" id="journalDone">完成本次填写</button>`,'逐组实际记录');
    bindFields(id,'exercise',{sessionId,exerciseId,rows:copy(rows)});$('backSession').onclick=()=>openSession(sessionId);
    $('dialogContent').querySelectorAll('[data-row]').forEach(el=>el.oninput=()=>{
      if(!el.checkValidity()){$('journalSave').textContent='输入尚未保存：次数与休息需为0–600的整数。';return;}
      const i=Number(el.dataset.row),k=el.dataset.key,v=el.type==='number'?(el.value===''?null:Number(el.value)):el.value;
      save(s=>{const current=entry(s,id)?.fields.rows||copy(rows);const next=copy(current);next[i][k]=v;writeEntry(s,id,'exercise',{sessionId,exerciseId,rows:next});});
    });
    $('addSetRow').onclick=()=>{const current=entry(state(),id)?.fields.rows||rows;if(current.length>=20){notify('最多20行，请在备注补充');return;}if(save(s=>writeEntry(s,id,'exercise',{sessionId,exerciseId,rows:[...copy(current),blankRows({...plan,sets:1})[0]]}))!==false)openExercise(sessionId,exerciseId);};
    $('journalDone').onclick=()=>$('exerciseDialog').close();
  }
  function renderRecords(){
    const t=trial(),list=sessions(state()).filter(e=>e.fields.date===selectedDate);
    const daily=entry(state(),'daily:'+selectedDate),days=Object.values(state().journal?.entries||{}).filter(e=>!e.deleted&&e.kind==='daily').sort((a,b)=>b.fields.date.localeCompare(a.fields.date));
    $('main').innerHTML=`<div class="eyebrow">训练 · 饮食 · 恢复</div><h1>每日记录</h1><button class="inline" id="importSleep">导入三星睡眠 ZIP</button><label class="journal-field">选择日期<input class="text-input" type="date" id="journalDate" value="${selectedDate}" max="${today()}"></label><section class="card"><div class="row"><b>${selectedDate}</b><span class="muted">${daily?'已有每日反馈':'每日反馈未填写'}</span></div>${sleepSection(state(),selectedDate)}<button class="btn" id="editDaily">填写饮食与每日反馈</button>${list.map(e=>`<button class="btn secondary" data-session="${e.id}">训练场次 · ${e.fields.workout?e.fields.workout+' · ':''}${label('status',e.fields.status)} · ${e.fields.recoveryStatus?'已有恢复反馈':'恢复待补'}</button>`).join('')}${t&&(!isStrength(t)||selectedDate>=t.start)?'<button class="inline" id="additionalSession">＋ 记录这天的另一次训练</button>':''}</section>${t?`<section class="card"><h3>阶段与每周复盘</h3><p class="muted">三日力量阶段按所选日期所在周汇总；旧试行仍按原阶段导出。补记后可重新生成。</p><select class="text-input" id="reviewTrial">${Object.values(state().journal.trials).sort((a,b)=>b.created.localeCompare(a.created)).map(x=>`<option value="${x.id}" ${x.id===t.id?'selected':''}>${x.start} — ${isStrength(x)?'三日力量 · 持续':x.end}</option>`).join('')}</select><button class="btn secondary" id="reviewTrialButton">查看／导出阶段复盘</button></section>`:''}<details><summary>最近的训练与每日反馈</summary>${sessions(state()).slice(-30).reverse().map(e=>`<button class="journal-log" data-session="${e.id}">${esc(e.fields.date)} · 训练 · ${label('status',e.fields.status)}</button>`).join('')}${days.slice(0,30).map(e=>`<button class="journal-log" data-day="${esc(e.fields.date)}">${esc(e.fields.date)} · 饮食与每日反馈</button>`).join('')}</details><div class="journal-actions"><button class="inline" id="legacyHistory">查看原单动作历史</button>${!isStrength(t)?'<button class="inline" id="newTrial">查看三日力量阶段</button>':''}</div>`;
    $('journalDate').onchange=()=>{const value=$('journalDate').value;if(!dateOK(value)||value>today()){notify('请选择有效日期');return;}selectedDate=value;renderRecords();};
    $('editDaily').onclick=()=>openDaily(selectedDate);
    bindSleepImport({state,save,modal,notify,refresh:renderRecords});
    document.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>{selectedSession=b.dataset.session;openSession(selectedSession);});
    document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>openDaily(b.dataset.day));
    if($('additionalSession'))$('additionalSession').onclick=()=>guard(()=>openNewStrengthSession(selectedDate));if(t)$('reviewTrialButton').onclick=()=>openReview($('reviewTrial').value,selectedDate);
    $('legacyHistory').onclick=()=>{legacyHistory();const back=document.createElement('button');back.className='inline';back.textContent='← 返回每日记录';back.onclick=renderRecords;$('main').prepend(back);};if($('newTrial'))$('newTrial').onclick=openStrength;
  }
  function openReview(id,date=today()){
    const strength=isStrength(state().journal.trials[id]),asOf=strength?date:today(),q=trialSummary(state(),id,asOf);
    if(strength&&q.totalDays===0){notify('所选日期早于阶段开始，请选择开始后的日期，或切换到原试行阶段');return;}
    const text=trialMarkdown(state(),id,asOf),title=strength?'三日力量训练周复盘':'两周试行复盘';
    const missing=Array.from({length:q.totalDays},(_,i)=>plusDays(q.from,i)).filter(d=>!q.days.some(e=>e.fields.date===d));
    const feedback=q.list.filter(e=>!e.fields.pain||!e.fields.recoveryStatus);
    const summary=`<section id="reviewSummary"><p class="muted">${q.from} — ${q.to}</p><div class="review-facts"><p><strong>${q.actual.length}</strong> 场有次数记录</p><p><strong>${q.complete}</strong> 场标记完成</p><p><strong>${q.partial}</strong> 场部分完成</p></div><h3>训练与恢复</h3>${q.list.length?q.list.map(se=>`<details><summary>${esc(se.fields.date)}${se.fields.workout?' · '+esc(se.fields.workout):''} · ${label('status',se.fields.status)}</summary><p>正课 ${se.fields.minutes??'未填写'}${se.fields.minutes==null?'':' 分钟'} · 疼痛：${label('pain',se.fields.pain)} · 恢复：${label('recovery',se.fields.recoveryStatus)}</p>${sessionExercises(state(),se).map(({plan,log})=>`<p><b>${esc(plan.name)}</b><br>${log?.fields.rows?.some(hasActual)?log.fields.rows.map((r,i)=>`第${i+1}组：${plan.sides?'左 '+(r.left??'未填')+'／右 '+(r.right??'未填'):(r.reps??'未填')} 次 · ${esc(r.load||'负重未填')} · 余力 ${esc(r.rir||'未填')}`).join('<br>'):'次数未填写'}</p>`).join('')}${se.fields.notes?`<p>${esc(se.fields.notes)}</p>`:''}</details>`).join(''):'<p>尚未记录训练场次。</p>'}<h3>饮食与睡眠</h3><p>有每日记录 ${q.days.length} 天，其中导入睡眠 ${q.days.filter(d=>d.fields.samsungSleep).length} 天。</p>${q.days.length?`<details><summary>查看每日反馈</summary>${q.days.map(d=>`<div class="log"><b>${d.fields.date}</b>${sleepSection(state(),d.fields.date)}<p>精神：${label('energy',d.fields.energy)} · 饥饿：${label('hunger',d.fields.hunger)}</p><p>${['breakfast','lunch','dinner'].map((key,i)=>`${['早餐','午餐','晚餐'][i]}：${label('mealAmount',d.fields[key+'Amount'])}${d.fields[key+'Note']?' · '+esc(d.fields[key+'Note']):''}`).join('<br>')}</p>${d.fields.notes?`<p>${esc(d.fields.notes)}</p>`:''}</div>`).join('')}</details>`:''}<h3>复盘前待补</h3><p>${missing.length?'尚无每日记录：'+missing.join('、')+'。':'本范围每天都有记录，具体字段仍可能未填。'}</p><p>${feedback.length?feedback.length+' 场疼痛或恢复反馈未填。':q.list.length?'当前场次疼痛与恢复反馈已填写。':'暂无训练场次反馈。'}</p><p class="muted">保持或调整待本人确认；不同动作版本与负重分开比较。</p></section>`;
    modal(title,`${summary}<button class="btn" id="downloadTrialPhotos">导出复盘＋照片 ZIP</button><details id="reviewDetails"><summary>文字导出与完整原文</summary><button class="btn secondary" id="downloadTrial">仅导出文字 Markdown</button><button class="btn secondary" id="copyTrial">复制复盘全文</button><pre class="review-preview">${esc(text)}</pre></details>`,'本期事实');
    $('journalSave').hidden=true;
    const markdown=()=>trialMarkdown(state(),id,asOf);
    $('downloadTrialPhotos').onclick=async()=>{const b=$('downloadTrialPhotos');b.disabled=true;b.textContent='正在整理记录和照片…';try{const data=await mealArchive({from:q.from,to:q.to,markdown:markdown()});if(data)download(`${title}含照片-${q.from}.zip`,data,'application/zip');}catch(e){notify(e.message);}finally{b.disabled=false;b.textContent='导出复盘＋照片 ZIP';}};
    $('downloadTrial').onclick=()=>download(`${title}-${q.from}.md`,markdown(),'text/markdown;charset=utf-8');$('copyTrial').onclick=async()=>{try{await navigator.clipboard.writeText(markdown());notify('复盘全文已复制');}catch{notify('复制不可用，请导出Markdown');}};
  }
  function openAdjust(){
    const t=trial();if(!t)return;
    modal('调整后续训练安排',`<form id="adjustTrialForm">
      <p class="hint">仅影响以后新建的场次，已开始场次和旧记录保留当时目标。</p>
      ${t.plan.map((p,i)=>`<details>
        <summary>${esc(p.name)}</summary>
        <label class="journal-field"><span><input type="checkbox" data-paused="${i}" ${p.paused?'checked':''}> 暂停这个动作</span></label>
        ${input(i+'-pauseReason','暂停说明（可选）',p.pauseReason)}
        <div class="journal-columns">
          ${input(i+'-sets','组数',p.sets,'number','min="1" max="6" step="1"')}
          ${input(i+'-min','次数下限',p.min,'number','min="1" max="100" step="1"')}
          ${input(i+'-max','次数上限',p.max,'number','min="1" max="100" step="1"')}
        </div>
        ${input(i+'-variant','动作版本',p.variant)}
        ${input(i+'-load','阻力／握距',p.load)}
      </details>`).join('')}
      ${area('reason','本次调整原因（必填）','')}
      <button class="btn" type="submit">预览改动</button>
    </form><section id="adjustPreview" hidden></section>`,'预览后确认 · 历史保留');
    const dialog=$('exerciseDialog'),form=$('adjustTrialForm'),preview=$('adjustPreview'),status=$('journalSave');
    const value=k=>form.querySelector(`[data-field="${k}"]`).value;
    // Single-line inputs can strip line breaks from older plan text.
    const initialText=t.plan.map((_,i)=>({
      pauseReason:value(i+'-pauseReason'),variant:value(i+'-variant'),load:value(i+'-load')
    }));
    const editedText=(i,key,original)=>{
      const entered=value(i+'-'+key);
      return entered===initialText[i][key]?original:entered;
    };
    const checkContext=()=>{
      if(trial()!==t)throw Error('当前训练数据已更新，请关闭后重新预览。');
    };
    const display=v=>typeof v==='boolean'?(v?'暂停':'继续训练'):esc(v===''?'未填写':v);
    status.textContent='先预览改动，再确认保存。';
    form.onsubmit=ev=>{
      ev.preventDefault();
      if(!dialog.open||!form.isConnected||form.hidden)return;
      guard(()=>{
        checkContext();
        const reason=value('reason').trim();
        if(!reason)throw Error('请填写调整原因');
        const changes=[];
        const plan=t.plan.map((p,i)=>{
          const next={...p},rows=[];
          const fields=[
            ['paused','动作状态',p.paused??false,form.querySelector(`[data-paused="${i}"]`).checked],
            ['pauseReason','暂停说明',p.pauseReason??'',editedText(i,'pauseReason',p.pauseReason??'')],
            ['sets','组数',p.sets,Number(value(i+'-sets'))],
            ['min','次数下限',p.min,Number(value(i+'-min'))],
            ['max','次数上限',p.max,Number(value(i+'-max'))],
            ['variant','动作版本',p.variant,editedText(i,'variant',p.variant)],
            ['load','阻力／握距',p.load,editedText(i,'load',p.load)]
          ];
          for(const [key,label,before,after] of fields){
            if(before===after)continue;
            next[key]=after;
            rows.push(`<li>${label}：${display(before)} → ${display(after)}</li>`);
          }
          if(rows.length)changes.push(`<div class="log"><strong>${esc(p.name)}</strong><ul>${rows.join('')}</ul></div>`);
          return next;
        });
        validatePlan(plan);
        if(!changes.length)throw Error('没有需要保存的改动');
        preview.innerHTML=`<h3 id="adjustPreviewTitle" tabindex="-1">核对后续改动</h3>
          ${changes.join('')}
          <p class="log">调整原因：${esc(reason)}</p>
          <button class="btn" id="confirmAdjust" type="button">确认并保存改动</button>
          <button class="btn secondary" id="editAdjust" type="button">返回修改</button>`;
        form.hidden=true;
        preview.hidden=false;
        status.textContent='正在预览，改动尚未保存。';
        status.className='hint';
        $('adjustPreviewTitle').focus();
        $('editAdjust').onclick=()=>{
          preview.hidden=true;
          form.hidden=false;
          status.textContent='先预览改动，再确认保存。';
          status.className='hint';
          form.querySelector('button[type=submit]').focus();
        };
        const confirm=$('confirmAdjust');
        confirm.onclick=()=>{
          if(!dialog.open||preview.hidden||!confirm.isConnected||confirm.disabled)return;
          confirm.disabled=true;
          if(save(s=>{checkContext();changePlan(s,plan,reason);},{requireCurrentAccountCache:true})===false){
            confirm.disabled=false;
            return;
          }
          dialog.close();
          renderPlan();
          notify('后续安排已调整，既有场次保持原快照');
        };
      });
    };
  }
  function photoBackupSection(){return `<section class="card"><h3>餐次照片备份</h3><p class="muted">ZIP包含照片、照片清单和文字记录JSON。离线只能导出本机已缓存的照片。解压后可把复盘Markdown和photos文件夹一起放入Obsidian。</p><button class="btn secondary" id="exportMealBackup">导出照片与记录 ZIP</button><div id="backupParts"></div><label class="btn secondary file-label">从ZIP恢复照片与记录<input type="file" id="restoreMealBackup" accept=".zip,application/zip"></label><p class="hint">ZIP中的照片与文字一起恢复；旧版纯照片ZIP也兼容。大备份分卷导出，请保存并依次恢复所有卷。清除浏览器数据前先备份待同步照片。</p></section>`;}
  function bindPhotoBackup(){
    $('exportMealBackup').onclick=async()=>{const b=$('exportMealBackup');b.disabled=true;try{const parts=await mealArchives({markdown:trial()?trialMarkdown(state()):'# 饮食照片记录\n',records:state()});if(parts?.length===1)download(`训练卡照片与记录-${today()}.zip`,parts[0].data,'application/zip');else if(parts){const slot=$('backupParts');slot.replaceChildren();for(const part of parts){const button=document.createElement('button');button.className='btn secondary';button.textContent=`下载第${part.part}/${part.parts}卷（${part.photoCount}张）`;button.onclick=()=>download(`训练卡备份-${today()}-${part.part}共${part.parts}卷.zip`,part.data,'application/zip');slot.append(button);}}}catch(e){notify(e.message);}finally{b.disabled=false;}};
    $('restoreMealBackup').onchange=async ev=>{const file=ev.target.files[0];if(!file)return;try{const n=await restoreMealArchive(file,{restoreRecords});if(n!==undefined)notify(`已恢复本卷记录，新增${n}张照片；联网后同步`);}catch(e){notify(e.message);}finally{ev.target.value='';}};
  }
  function exportSection(){const t=trial();return photoBackupSection()+(t?`<section class="card"><h3>${isStrength(t)?'每周训练复盘':'两周试行复盘'}</h3><p class="muted">训练、饮食、恢复与未填写信息统一导出，支持Obsidian与后续分析。</p><button class="btn" id="settingsTrialReview">查看／导出复盘</button></section>`:'');}
  function bindExport(){bindPhotoBackup();if($('settingsTrialReview'))$('settingsTrialReview').onclick=()=>openReview(trial().id);}
  $('exerciseDialog').addEventListener('close',()=>{document.dispatchEvent(new Event('training:journal-close'));});
  return {renderPlan,renderRecords,exportSection,bindExport};
}
