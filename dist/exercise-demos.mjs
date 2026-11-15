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
  },
  rdl:{
    title:'双哑铃罗马尼亚硬拉',
    phases:['站稳、膝微弯','髋向后、铃贴腿'],
    cue:'髋往后移，哑铃贴近腿下放。大腿后侧有拉伸感且背仍稳时，站回起始位。',
    check:'先空手找髋的位置，再试轻重量。',
    source:'NASM · 真人示范',
    url:'https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift',
    draw:drawDeadlift,
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

export const exerciseDemoList=Object.entries(demos).map(([id,{title}])=>({id,title}));

export function exerciseDemoHTML(id){
  if(!Object.hasOwn(demos,id))return '';
  const demo=demos[id];
  return `<section class="exercise-demo" aria-label="${demo.title}示意">
    <h3>${demo.title}${demo.variant?`<span>${demo.variant}</span>`:''}</h3>
    <div class="exercise-demo-poses">
      ${demo.phases.map(phase=>`<figure><canvas width="304" height="248" aria-hidden="true"></canvas><figcaption>${phase}</figcaption></figure>`).join('')}
    </div>
    <figure class="exercise-demo-player" hidden>
      <canvas width="304" height="248" aria-hidden="true"></canvas>
      ${demo.playbackCaption?`<figcaption>${demo.playbackCaption}</figcaption>`:''}
    </figure>
    <div class="exercise-demo-actions">
      <button type="button" class="btn secondary exercise-demo-play">播放一次</button>
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
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const stillCanvases=Array.from(poses.querySelectorAll('canvas'));
  const ready=stillCanvases.every(canvas=>canvas.getContext('2d'))&&player.querySelector('canvas').getContext('2d');
  if(!ready){
    poses.hidden=true;
    button.hidden=true;
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
    button.hidden=motion.matches;
  }
  details?.addEventListener('toggle',showStills);
  showStills();
  button.addEventListener('click',()=>{
    if(request){reset();return;}
    if(motion.matches)return;
    const canvas=player.querySelector('canvas'),started=performance.now();
    poses.hidden=true;
    player.hidden=false;
    button.textContent='停止播放';
    paint(canvas,0);
    request=requestAnimationFrame(function animate(now){
      if(!block.isConnected||!dialog.open||(details&&!details.open)||motion.matches){reset();return;}
      const elapsed=now-started;
      if(elapsed>=3000){reset();return;}
      const position=(1-Math.cos((elapsed/3000)*2*Math.PI))/2;
      paint(canvas,position);
      request=requestAnimationFrame(animate);
    });
  });
}
