// Generic, user-confirmed template. No account data or assumed working weights.
export const STRENGTH_ROUTINE='strength3-v1';
export const WORKOUTS={
  A:{title:'A · 周一',ids:['dbrow','push','split','lateral','deadbug']},
  B:{title:'B · 周三',ids:['dbrow','push','rdl','lateral','rear']},
  C:{title:'C · 周五',ids:['dbrow','push','split','rdl','deadbug']}
};
const main={sets:2,rest:90,restMax:120};
const accessory={sets:2,rest:60,restMax:90};
export const STRENGTH_PLAN=[
  {...main,id:'dbrow',name:'支撑单臂哑铃划船',min:10,max:15,sides:true,variant:'单手扶稳固支撑，单臂划船',load:'待填写每只哑铃重量',cue:'左右分别做2组、分别记录。稳定躯干，向髋部拉回；不靠转腰甩起。新哑铃动作先留3–4次余力。'},
  {...main,id:'push',name:'标准俯卧撑',min:6,max:12,sides:false,variant:'标准俯卧撑',load:'自重',cue:'先从每组8–10次校准，目标保留2–3次规范动作余力；不为凑次数力竭。若换跪姿或高台，填写实际版本并分开比较。'},
  {...main,id:'split',name:'扶稳原地分腿蹲',min:8,max:12,sides:true,variant:'手扶稳固支撑，原地分腿蹲',load:'先自重，再按余力选择负重',cue:'每侧2组，左右分别记录。全程可控；需要负重时填写实际重量。'},
  {...main,id:'rdl',name:'哑铃罗马尼亚硬拉',min:8,max:12,sides:false,variant:'双手持哑铃，髋部后移',load:'待填写每只哑铃重量',cue:'微屈膝、髋向后移，哑铃贴近腿；到能保持躯干稳定的位置即可。新动作先留3–4次余力。'},
  {...accessory,id:'lateral',name:'轻哑铃侧平举',min:12,max:20,sides:false,variant:'双臂可控侧平举',load:'待填写每只哑铃重量',cue:'选择轻重量，不耸肩甩动；在舒适、可控范围内抬起。新动作先留3–4次余力。'},
  {...accessory,id:'rear',name:'坐姿俯身轻哑铃反向飞鸟',min:12,max:20,sides:false,variant:'坐姿俯身，双臂反向飞鸟',load:'待填写每只哑铃重量',cue:'坐稳、躯干稳定，轻重量展开双臂，避免甩腰耸肩。新动作先留3–4次余力。'},
  {...accessory,id:'deadbug',name:'短幅死虫式',min:6,max:10,sides:true,variant:'缩小伸展幅度，控制躯干',load:'自重',cue:'每侧2组，左右分别记录；腰背位置可控，不以伸得远为目标。'}
];
export const isStrength=t=>t?.routine===STRENGTH_ROUTINE;
export function defaultWorkout(date){const day=new Date(date+'T12:00:00').getDay();return day===3||day===4?'B':day===5||day===6||day===0?'C':'A';}
export function workoutPlan(plan,key){
  if(!Object.hasOwn(WORKOUTS,key))throw Error('请选择 A、B 或 C 动作表');
  return WORKOUTS[key].ids.map(id=>{const e=plan.find(x=>x.id===id);if(!e)throw Error('三日力量动作表不完整');return structuredClone(e);});
}
