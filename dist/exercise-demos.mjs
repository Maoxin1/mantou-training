const demos={
  dbrow:{
    title:'扶大腿单臂划船',
    variant:'家用替代动作',
    phases:['手臂垂下','手肘往后拉'],
    cue:'右手持铃时，左脚在前，左手撑左大腿。肘沿身体向后，练另一侧时换边。',
    check:'躯干保持稳定。使用家用版本时，在「实际动作版本」里注明扶大腿。',
    source:'PureGym · 扶腿替代说明',
    url:'https://www.puregym.com/exercises/back/rows/single-arm-dumbbell-row/',
    draw:drawRow,
    animated:true,
  },
  push:{
    title:'标准俯卧撑',
    phases:['手脚撑地','屈肘下放'],
    cue:'双手在肩下附近，脚尖着地。身体连成一线，屈肘让胸口靠近地面，再推回。图为侧面。',
    check:'肩、髋一起升降，手肘斜向后。',
    source:'NASM · 俯卧撑要点',
    url:'https://www.nasm.org/resource-center/exercise-library/push-up',
    draw:drawPushUp,
  },
  split:{
    title:'扶稳原地分腿蹲',
    phases:['前后站稳','屈膝下沉'],
    cue:'单手轻扶墙或固定扶手，双脚前后错开。前脚踩实，后脚脚跟抬起，双膝弯曲后再站回。',
    check:'两脚位置固定，下到可控的幅度；做完换边。',
    source:'Rep & Range · 扶稳分腿蹲参考',
    url:'https://repandrange.com/workouts/exercise-atlas/split-squat',
    draw:drawSplitSquat,
  },
  rdl:{
    title:'双哑铃罗马尼亚硬拉',
    phases:['站稳、膝微弯','髋向后、铃贴腿'],
    cue:'髋往后移，哑铃贴近腿下放。大腿后侧有拉伸感且背仍稳时，站回起始位。',
    check:'先空手找髋的位置，再试轻重量。',
    source:'NASM · 真人示范',
    url:'https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift',
    draw:drawDeadlift,
    animated:true,
  },
  lateral:{
    title:'轻哑铃侧平举',
    phases:['轻铃垂身侧','向两侧抬起'],
    cue:'站稳，手肘微弯，双臂从身体两侧抬起，再慢慢放回。抬到舒服且可控的高度，最高与肩平齐。',
    check:'保持肩放松，躯干稳定。',
    source:'NASM · 真人示范',
    url:'https://www.youtube.com/watch?v=XPPfnSEATJA',
    draw:drawLateralRaise,
  },
  rear:{
    title:'坐姿俯身反向飞鸟',
    phases:['侧面：坐稳俯身','正面：双臂打开'],
    playbackCaption:'正面视角 · 躯干保持俯身',
    cue:'坐在稳固无轮的椅子上，双脚踩实，髋部向前折。手肘微弯，双臂往两侧打开再放下。',
    check:'躯干角度保持稳定，抬到舒适的位置，手肘至多与肩齐高。',
    source:'Mayo Clinic · 真人示范',
    url:'https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/reverse-fly/vid-20084679',
    draw:drawFly,
    animated:true,
  },
  deadbug:{
    title:'短幅死虫式',
    phases:['仰卧举手屈膝','对侧手脚短幅伸出'],
    cue:'仰卧，手指向上，髋膝约弯成直角。图示右手和左腿一起缓慢伸出一小段，回到起始位后换边。',
    check:'腰背稳住并自然呼吸。腰背开始拱起时，缩小幅度。',
    source:'NASM · 死虫式动作要点',
    url:'https://www.nasm.org/resource-center/exercise-library/dead-bug',
    draw:drawShortDeadBug,
  },
};

const ink='#253c57', far='#718ca9', accent='#0864d8', support='#935c20';
const line=(ctx,points,color=ink,width=6)=>{
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for(const point of points.slice(1))ctx.lineTo(...point);
  ctx.strokeStyle=color;
  ctx.lineWidth=width;
  ctx.lineJoin='round';
  ctx.lineCap='round';
  ctx.stroke();
};
const interpolate=(from,to,t)=>from.map((value,i)=>value+(to[i]-value)*t);
const mixPose=(a,b,t)=>a.map((point,i)=>interpolate(point,b[i],t));

function floor(ctx){
  line(ctx,[[19,118],[134,118]],'#91a9c6',1.5);
}

function head(ctx,x,y,radius=8){
  ctx.beginPath();
  ctx.arc(x,y,radius,0,Math.PI*2);
  ctx.fillStyle=ink;
  ctx.fill();
}

function dumbbell(ctx,[x,y]){
  line(ctx,[[x-8,y],[x+8,y]],accent,3);
  for(const offset of [-7,7])line(ctx,[[x+offset,y-4],[x+offset,y+4]],accent,4);
}

function drawRow(ctx,t){
  const shoulder=[102,48], pelvis=[61,74], frontKnee=[107,91], frontAnkle=[106,114];
  floor(ctx);
  line(ctx,[pelvis,[62,93],[41,114],[48,114]],far,6);
  line(ctx,[pelvis,frontKnee,frontAnkle,[119,114]]);
  line(ctx,[pelvis,shoulder,[110,43]],ink,10);
  head(ctx,118,37);
  line(ctx,[shoulder,[113,68],[94,86]],support,5);
  const [elbow,wrist]=mixPose([[100,70],[100,91]],[[80,48],[80,69]],t);
  line(ctx,[shoulder,elbow,wrist],accent,5);
  dumbbell(ctx,wrist);
}

function drawDeadlift(ctx,t){
  const [pelvis,knee,shoulder,elbow,wrist,face]=mixPose(
    [[73,72],[76,94],[77,36],[84,57],[84,75],[80,21]],
    [[49,68],[75,94],[86,55],[85,75],[81,95],[100,51]],t);
  floor(ctx);
  const shift=(p,dx,dy)=>[p[0]+dx,p[1]+dy];
  line(ctx,[shift(pelvis,-5,-2),shift(knee,-6,-1),[69,114],[79,114]],far);
  line(ctx,[shift(shoulder,-6,0),shift(elbow,-6,0),shift(wrist,-6,0)],far,5);
  dumbbell(ctx,shift(wrist,-6,-2));
  line(ctx,[pelvis,knee,[76,114],[88,114]]);
  line(ctx,[pelvis,shoulder],ink,10);
  head(ctx,...face);
  line(ctx,[shoulder,elbow,wrist],accent,5);
  dumbbell(ctx,wrist);
}

function drawFly(ctx,t){
  floor(ctx);
  line(ctx,[[52,75],[52,93],[55,113]],far,4);
  line(ctx,[[100,75],[100,93],[97,113]],far,4);
  line(ctx,[[51,82],[101,82]],'#91a9c6',5);
  line(ctx,[[70,74],[57,93],[55,114],[47,114]]);
  line(ctx,[[82,74],[95,93],[97,114],[105,114]]);
  line(ctx,[[76,74],[76,51]],ink,12);
  line(ctx,[[63,50],[89,50]],ink,8);
  head(ctx,76,42);
  for(const side of [-1,1]){
    const shoulder=[76+side*13,50];
    const upper=1.53+(0.03-1.53)*t;
    const forearm=1.30+(0.24-1.30)*t;
    const elbow=[shoulder[0]+side*19*Math.cos(upper),shoulder[1]+19*Math.sin(upper)];
    const hand=[elbow[0]+side*18*Math.cos(forearm),elbow[1]+18*Math.sin(forearm)];
    line(ctx,[shoulder,elbow,hand],accent,5);
    dumbbell(ctx,hand);
  }
}

function drawFlySide(ctx){
  line(ctx,[[43,91],[76,91],[76,113]],far,4);
  line(ctx,[[47,91],[47,113]],far,4);
  line(ctx,[[58,86],[91,88],[89,113],[104,113]]);
  line(ctx,[[58,86],[90,63],[95,58]],ink,8);
  head(ctx,102,52,7);
  line(ctx,[[90,63],[94,80],[95,96]],accent,5);
  dumbbell(ctx,[95,96]);
}

function drawPushUp(ctx,end){
  const shoulder=end?[28,90]:[48,68];
  const hip=end?[75,98]:[84,83];
  const knee=end?[113,104]:[114,97];
  const wrist=[48,115];
  line(ctx,[[12,118],[145,118]],'#91a9c6',1.5);
  line(ctx,[hip,knee,[135,108],[139,115]]);
  line(ctx,[hip,shoulder],ink,10);
  head(ctx,shoulder[0]-13,shoulder[1]-6,7);
  line(ctx,[shoulder,[48,90],wrist,[39,115]],accent,5);
}

function drawSplitSquat(ctx,end){
  const hip=end?[72,82]:[76,62];
  const shoulder=end?[81,54]:[84,34];
  const frontKnee=end?[104,87]:[92,87];
  const backKnee=end?[60,108]:[53,84];
  const palmY=end?61:48;
  floor(ctx);
  line(ctx,[[134,27],[134,118]],'#91a9c6',2);
  line(ctx,[hip,backKnee,[35,108],[42,115]],far);
  line(ctx,[hip,frontKnee,[101,114],[113,114]],accent);
  line(ctx,[hip,shoulder],ink,10);
  head(ctx,shoulder[0]+3,shoulder[1]-14);
  line(ctx,[shoulder,[103,palmY+4],[132,palmY]],support,5);
}

function drawLateralRaise(ctx,end){
  floor(ctx);
  line(ctx,[[69,76],[65,96],[62,114],[55,114]]);
  line(ctx,[[83,76],[87,96],[90,114],[97,114]]);
  line(ctx,[[76,76],[76,43]],ink,14);
  line(ctx,[[62,43],[90,43]],ink,8);
  head(ctx,76,27);
  for(const side of [-1,1]){
    const shoulder=[76+side*14,43];
    const elbow=[76+side*(end?32:19),end?48:63];
    const hand=[76+side*(end?49:25),end?52:83];
    line(ctx,[shoulder,elbow,hand],accent,5);
    dumbbell(ctx,hand);
  }
}

function drawShortDeadBug(ctx,end){
  const shoulder=[46,105],hip=[80,111];
  floor(ctx);
  line(ctx,[shoulder,[47,83],[47,60]],far,5);
  line(ctx,[hip,[86,69],[111,69]],far,5);
  line(ctx,[shoulder,[64,109],hip],ink,9);
  head(ctx,31,109,7);
  line(ctx,[shoulder,...(end?[[40,85],[29,66]]:[[54,83],[56,61]])],accent,5);
  line(ctx,[hip,...(end?[[104,83],[126,91]]:[[94,66],[121,66]])],accent,5);
}

export const exerciseDemoList=Object.entries(demos).map(([id,{title}])=>({id,title}));

export function exerciseDemoHTML(id){
  if(!Object.hasOwn(demos,id))return '';
  const demo=demos[id];
  return `<section class="exercise-demo" aria-label="${demo.title}示意">
    <h3>${demo.title}${demo.variant?`<span>${demo.variant}</span>`:''}</h3>
    <div class="exercise-demo-poses">
      ${demo.phases.map(phase=>`<figure><canvas width="304" height="248" aria-hidden="true"></canvas><figcaption>${phase}</figcaption></figure>`).join('')}
    </div>
    ${demo.animated?`<figure class="exercise-demo-player" hidden>
      <canvas width="304" height="248" aria-hidden="true"></canvas>
      ${demo.playbackCaption?`<figcaption>${demo.playbackCaption}</figcaption>`:''}
    </figure>`:''}
    <div class="exercise-demo-actions">
      ${demo.animated?'<button type="button" class="btn secondary exercise-demo-play">播放一次</button>':''}
      <a href="${demo.url}" target="_blank" rel="noopener noreferrer">${demo.source}</a>
    </div>
    <p>${demo.cue}</p><p>${demo.check}</p>
  </section>`;
}

export function bindExerciseDemo(dialog,id){
  if(!Object.hasOwn(demos,id))return;
  const block=dialog.querySelector('.exercise-demo');
  if(!block)return;
  const demo=demos[id],details=block.closest('details');
  const poses=block.querySelector('.exercise-demo-poses');
  const player=block.querySelector('.exercise-demo-player');
  const button=block.querySelector('.exercise-demo-play');
  const playbackCanvas=player?.querySelector('canvas');
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const stillCanvases=Array.from(poses.querySelectorAll('canvas'));
  const ready=stillCanvases.every(canvas=>canvas.getContext('2d'))&&(!playbackCanvas||playbackCanvas.getContext('2d'));
  if(!ready){
    poses.hidden=true;
    if(button)button.hidden=true;
    return;
  }
  let request=0;
  let drawn=false;
  function paint(canvas,t,sideView=false){
    const ctx=canvas.getContext('2d');
    ctx.setTransform(2,0,0,2,0,0);
    ctx.clearRect(0,0,152,124);
    if(sideView)drawFlySide(ctx);
    else demo.draw(ctx,t);
  }
  function reset(){
    if(!button)return;
    if(request)cancelAnimationFrame(request);
    request=0;
    poses.hidden=false;
    player.hidden=true;
    button.textContent='播放一次';
  }
  function showStills(){
    if(details&&!details.open){reset();return;}
    if(!drawn){
      paint(stillCanvases[0],0,id==='rear');
      paint(stillCanvases[1],1);
      drawn=true;
    }
    if(button)button.hidden=motion.matches;
  }
  details?.addEventListener('toggle',showStills);
  showStills();
  button?.addEventListener('click',()=>{
    if(request){reset();return;}
    if(motion.matches)return;
    const started=performance.now();
    poses.hidden=true;
    player.hidden=false;
    button.textContent='停止播放';
    paint(playbackCanvas,0);
    request=requestAnimationFrame(function animate(now){
      if(!block.isConnected||!dialog.open||(details&&!details.open)||motion.matches){reset();return;}
      const elapsed=now-started;
      if(elapsed>=3000){reset();return;}
      const position=(1-Math.cos((elapsed/3000)*2*Math.PI))/2;
      paint(playbackCanvas,position);
      request=requestAnimationFrame(animate);
    });
  });
}
