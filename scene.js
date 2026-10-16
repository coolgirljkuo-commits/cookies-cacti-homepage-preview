// Independent homepage scene. Artwork, automatic attacks and physics adapted
// from Cookie's Cacti Chaos 44ce1d1; the source game is not a runtime dependency.
(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.CookieHomepage=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const WIDTH=360,HEIGHT=340,SCALE=.78;
const specs=[
 {r:.36,h:1.28,m:1.2,c:'#c98770',kind:'round',plant:'wobbler'},
 {r:.31,h:1.05,m:.82,c:'#d89a80',kind:'square',plant:'tiny'},
 {r:.42,h:1.42,m:1.55,c:'#bd806a',kind:'tall',plant:'barrel'},
 {r:.33,h:1.13,m:.9,c:'#d3997e',kind:'round',plant:'oddball'},
 {r:.39,h:1.3,m:1.35,c:'#c48970',kind:'square',plant:'paddle'}
];
const plantShapes={barrel:{height:35,halfWidth:20},wobbler:{height:69,halfWidth:14},
 paddle:{height:63,halfWidth:24},tiny:{height:26,halfWidth:22},oddball:{height:63,halfWidth:27}};
const layout={shelves:[{y:.38,ranges:[[.06,.86]]},{y:.76,ranges:[[.08,.96]]}],
 pots:[{level:0,x:.16,spec:0},{level:0,x:.30,spec:2},{level:0,x:.60,spec:1},{level:0,x:.75,spec:4},
 {level:1,x:.37,spec:3},{level:1,x:.505,spec:1,color:'#dda48a'},{level:1,x:.65,spec:2,color:'#c28c76'},{level:1,x:.91,spec:0,color:'#b97861'}],
 start:{level:1,x:.17}};
// Reversible content-only experiment: same pots, lower shelf, and Cookie start.
const splitLayout={...layout,
 shelves:[{y:.38,ranges:[[.08,.43],[.57,.96]]},layout.shelves[1]],
 pots:layout.pots.map((pot,i)=>i<4?{...pot,x:[.17,.34,.66,.84][i]}:pot)};
const colors={yellow:'#f5e8b5',blue:'#dbe3f1',pink:'#ead8da',sage:'#e4eadb',
 green:'#91aa7a',greenLight:'#a9bd93',dark:'#49653b',soil:'#6d6550',
 potEdge:'#8b5e50',potLip:'#e0aa91',shelf:'#c7a18a',shelfEdge:'#806859'};
function createScene(Matter,cookieSprites,canvas,options={}){
 const content=options.layout==='split'?splitLayout:layout;
 const {Engine,Bodies,Body,Composite,Sleeping,Events,Query}=Matter;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas is unavailable');
 const width=WIDTH,height=HEIGHT,scale=SCALE,engine=Engine.create({enableSleeping:true});
 engine.gravity.y=1.05;
 let cookie,pots=[],plants=[],shelves=[],cookieShelf=1,action=null,queuedPots=[],impact=null,facing=1;
 let physicsTravel=Infinity,now=0,complete=false,reducedMotion=!!options.reducedMotion;
 let viewWidth=360,viewHeight=340,camera={zoom:1,x:0,y:0};
 const gameNow=()=>now;
 const canStartSwat=()=>!complete;
 function hasExitedDisplay(body){
  const vx=body.velocity.x;
  return body.bounds.min.y>height || (body.bounds.max.x<0 && vx<=0) || (body.bounds.min.x>width && vx>=0);
 }
 let cleared=new Set();
 function inPlay(body){return !cleared.has(body) && !hasExitedDisplay(body) && body.bounds.max.y>=0}
 function shelfPartAt(x,level){return shelves[level].parts.find(p=>x>=p.bounds.min.x && x<=p.bounds.max.x)}
 function supportedOnShelf(body,level){return inPlay(body) && !!shelfPartAt(body.position.x,level)
   && Math.abs(body.bounds.max.y-shelves[level].bounds.min.y)<22*scale}
 function onGroundShelf(body){return supportedOnShelf(body,cookieShelf)}
 function reset(){
  Composite.clear(engine.world,false);Engine.clear(engine);
  cleared=new Set();complete=false;now=0;action=null;queuedPots=[];impact=null;facing=1;
  shelves=content.shelves.map(({y:fraction,ranges})=>{
   const y=height*fraction;
   const parts=ranges.map(([left,right])=>Bodies.rectangle(width*(left+right)/2,y,width*(right-left),10*scale,
    {isStatic:true,friction:.78,restitution:.04}));
   Composite.add(engine.world,parts);
   return {position:{y},bounds:{min:{x:width*ranges[0][0],y:y-5*scale},max:{x:width*ranges.at(-1)[1],y:y+5*scale}},parts};
  });
  cookieShelf=content.start.level;
  cookie=Bodies.circle(width*content.start.x,shelves[cookieShelf].bounds.min.y-23*scale,23*scale,
    {label:'cookie',isStatic:true,collisionFilter:{mask:0}});Composite.add(engine.world,cookie);
  pots=[];plants=[];
  content.pots.forEach((item,i)=>{
   const s=specs[item.spec],r=50*scale*s.r,h=40*scale*s.h;
   const x=width*item.x,y=shelves[item.level].bounds.min.y-h/2;
   const properties={density:s.m*.0007,friction:.72,restitution:.08,label:'pot'};
   const body=s.kind==='square'?Bodies.rectangle(x,y,r*1.8,h,{...properties,chamfer:{radius:4*scale}})
    :Bodies.trapezoid(x,y,r*1.9,h,.13,properties);
   body.meta={color:item.color || s.c,kind:s.kind,r,h,index:i,level:item.level};pots.push(body);Composite.add(engine.world,body);
   const shape=plantShapes[s.plant];
   plants.push({body,kind:s.plant,height:shape.height*scale*.72,halfWidth:shape.halfWidth*scale*.72});
  });
  physicsTravel=Math.min(...pots.map(b=>Math.min(b.meta.r*1.8,b.meta.h)))*.45;draw();
 }
  function wakePotsAfterSupportLoss({pairs}){
    // Matter wakes sleepers on active impacts, but not when support separates.
    // Only inspect sleepers whose upward supporting contact just ended.
    const lostSupports=new Map();
    for(const pair of pairs){
      for(const [body,other,sign] of [[pair.bodyA,pair.bodyB,1],[pair.bodyB,pair.bodyA,-1]]){
        if(!body.isSleeping || !pots.includes(body) || pair.collision.normal.y*sign>=-1e-6)continue;
        if(!lostSupports.has(body))lostSupports.set(body,new Set());
        lostSupports.get(body).add(other);
      }
    }
    if(!lostSupports.size)return;
    const physicalBodies=[...pots,...shelves.flatMap(level=>level.parts)];
    for(const [body,lost] of lostSupports){
      // A shelf, another pot, or a frictional side contact may still hold it.
      // Ended contacts can retain a tiny overlap after resolution; exclude them.
      const remaining=physicalBodies.filter(other=>other!==body && !lost.has(other));
      const supported=Query.collides(body,remaining).some(collision=>
        collision.normal.y*(collision.bodyA===body?1:-1)<=1e-6);
      if(!supported)Sleeping.set(body,false);
    }
  }
  function stepPhysics(dt){
    const baseStep=1000/60;
    // Use equal slices. A 16.8 ms frame must not produce a 16.67 ms step
    // followed by a tiny tail step: Matter can eject resting contacts when
    // the next step is much shorter than the preceding one.
    const stableDt=Math.abs(dt-baseStep)<.1?baseStep:dt;
    const slices=Math.max(1,Math.ceil(stableDt/baseStep));
    const slice=stableDt/slices;
    if(slices>1){
      // Matter clears forces after every update. Keep a pending swat's
      // velocity change consistent when the first update is shorter.
      const impulseScale=baseStep/slice;
      for(const body of pots){body.force.x*=impulseScale;body.force.y*=impulseScale;body.torque*=impulseScale}
    }
    for(let i=0;i<slices;i++){
      let remaining=slice,first=true;
      while(remaining>1e-6){
        // Recheck after every contact; a struck neighbor can immediately become
        // the fastest body. Matter only checks overlap at the end of an update.
        let travel=0;
        for(const body of pots){
          if(body.isSleeping)continue;
          const radius=Math.hypot(body.meta.r,body.meta.h/2);
          const speed=Math.hypot(body.velocity.x,body.velocity.y)
            +Math.abs(body.angularVelocity)*radius;
          const force=Math.hypot(body.force.x,body.force.y)/body.mass
            +Math.abs(body.torque)/body.inertia*radius;
          travel=Math.max(travel,speed*remaining/baseStep+force*remaining*remaining);
        }
        const steps=Math.max(1,Math.ceil(travel/physicsTravel));
        const micro=remaining/steps;
        if(first && steps>1){
          // Matter clears force and torque after each update. Preserve the
          // swat's velocity change when its first update becomes shorter.
          for(const body of pots){
            body.force.x*=steps;body.force.y*=steps;body.torque*=steps;
          }
        }
        Engine.update(engine,micro);
        remaining-=micro;first=false;
      }
    }
  }
  function drawBands(ctx){
    // One slope and one perpendicular width keep all four bands parallel on any canvas.
    const rise=height*.72,band=(height+rise)/4;
    const palette=[colors.yellow,colors.blue,colors.pink,colors.sage];
    ctx.fillStyle=colors.sage;ctx.fillRect(0,0,width,height);
    palette.forEach((color,i)=>{
      const top=-rise+i*band,bottom=top+band;
      ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,top);ctx.lineTo(width,top+rise);
      ctx.lineTo(width,bottom+rise);ctx.lineTo(0,bottom);ctx.closePath();ctx.fill();
    });
  }
  function drawShelf(ctx){
    shelves.forEach(level=>level.parts.forEach(body=>{
      const x=body.bounds.min.x,y=body.bounds.min.y,w=body.bounds.max.x-x;
      ctx.fillStyle=colors.shelfEdge;ctx.fillRect(x,y,w,10*scale);
      ctx.fillStyle=colors.shelf;ctx.fillRect(x+2*scale,y+2*scale,w-4*scale,5*scale);
      ctx.fillStyle='rgba(73,101,59,.12)';ctx.fillRect(x+8*scale,y+10*scale,w-16*scale,3*scale);
    }));
  }
  function drawPot(ctx,p,plant){
    const {r,h,color,kind}=p.meta;
    const top=kind==='tall'?.74:.76,base=kind==='square'?.67:kind==='tall'?.50:.56;ctx.save();ctx.translate(p.position.x,p.position.y);ctx.rotate(p.angle);
    ctx.fillStyle='rgba(61,77,51,.12)';ctx.beginPath();ctx.ellipse(0,h*.55,r*1.25,4*scale,0,0,Math.PI*2);ctx.fill();
    // soil and cactus are drawn in the pot's local frame; their motion follows every collision.
    ctx.fillStyle=colors.soil;ctx.fillRect(-r*.72,-h*.2,r*1.44,6*scale);
    drawCactus(ctx,0,-h*.22,plant.kind);
    ctx.fillStyle=color;ctx.strokeStyle=colors.potEdge;ctx.lineWidth=2*scale;
    ctx.beginPath();ctx.moveTo(-r*top,-h*.19);ctx.lineTo(r*top,-h*.19);
    ctx.lineTo(r*base,h*.51);ctx.lineTo(-r*base,h*.51);ctx.closePath();ctx.fill();ctx.stroke();
    // Flat translucent facets add quiet terracotta depth without new assets.
    ctx.fillStyle='rgba(255,237,206,.22)';ctx.beginPath();
    ctx.moveTo(-r*.68,-h*.14);ctx.lineTo(-r*.33,-h*.14);ctx.lineTo(-r*.27,h*.44);ctx.lineTo(-r*.49,h*.44);ctx.closePath();ctx.fill();
    ctx.fillStyle='rgba(104,58,44,.13)';ctx.beginPath();
    ctx.moveTo(r*.42,-h*.14);ctx.lineTo(r*.69,-h*.14);ctx.lineTo(r*.49,h*.44);ctx.lineTo(r*.30,h*.44);ctx.closePath();ctx.fill();
    ctx.fillStyle=colors.potLip;ctx.strokeStyle=colors.potEdge;
    ctx.fillRect(-r*.9,-h*.25,r*1.8,7*scale);ctx.strokeRect(-r*.9,-h*.25,r*1.8,7*scale);
    ctx.fillStyle='rgba(255,245,222,.4)';ctx.fillRect(-r*.79,-h*.25+scale,r*1.58,1.3*scale);
    ctx.strokeStyle='rgba(105,67,57,.35)';ctx.lineWidth=1.5*scale;
    ctx.beginPath();ctx.moveTo(-r*.43,h*.01);ctx.lineTo(-r*.35,h*.37);ctx.stroke();
    ctx.restore();
  }
  function cactusPolygon(ctx,points,fill=colors.green){
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
    ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=colors.dark;ctx.lineWidth=2.8;ctx.stroke();
  }
  function cactusEllipse(ctx,x,y,rx,ry,fill=colors.green){
    ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);
    ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=colors.dark;ctx.lineWidth=2.8;ctx.stroke();
  }
  function cactusRib(ctx,points){
    ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
    ctx.strokeStyle=colors.dark;ctx.lineWidth=1.8;ctx.stroke();
  }
  function drawCactus(ctx,x,y,kind){
    ctx.save();ctx.translate(x,y);ctx.scale(scale*.72,scale*.72);
    ctx.lineJoin='round';ctx.lineCap='round';
    if(kind==='barrel'){
      cactusEllipse(ctx,0,-17,19,17);
      cactusRib(ctx,[[0,-32],[0,-2]]);
      for(const side of [-1,1])cactusRib(ctx,[[side*8,-29],[side*11,-17],[side*8,-5]]);
    }else if(kind==='wobbler'){
      cactusPolygon(ctx,[[-10,0],[-12,-7],[-12,-60],[-9,-68],[9,-68],[12,-60],[12,-7],[10,0]]);
      for(const rib of [-6,0,6])cactusRib(ctx,[[rib,-65],[rib,-3]]);
    }else if(kind==='paddle'){
      cactusPolygon(ctx,[[-5,0],[5,0],[6,-36],[-6,-36]]);
      cactusEllipse(ctx,-15,-39,8,13,colors.greenLight);
      cactusEllipse(ctx,15,-45,8,14);
      cactusEllipse(ctx,0,-50,10,13,colors.greenLight);
      cactusRib(ctx,[[-15,-46],[-15,-33]]);cactusRib(ctx,[[15,-52],[15,-38]]);
    }else if(kind==='tiny'){
      cactusEllipse(ctx,0,-13,14,13,colors.greenLight);
      cactusRib(ctx,[[0,-24],[0,-2]]);
      for(const side of [-1,1])cactusRib(ctx,[[side*6,-22],[side*8,-13],[side*6,-4]]);
    }else if(kind==='oddball'){
      cactusPolygon(ctx,[[-5,-35],[-17,-35],[-17,-51],[-23,-51],[-23,-29],[-5,-27]],colors.greenLight);
      cactusPolygon(ctx,[[5,-27],[19,-27],[19,-45],[25,-45],[25,-22],[5,-19]],colors.greenLight);
      cactusPolygon(ctx,[[-7,0],[-7,-59],[-4,-62],[4,-62],[7,-59],[7,0]]);
      for(const rib of [-3,3])cactusRib(ctx,[[rib,-58],[rib,-2]]);
    }
    ctx.restore();
  }
  function drawCookie(ctx){
    const {x,y}=cookie.position;
    const spriteScale=1.5;
    const bob=!reducedMotion && action?.phase==='run' ? -3*scale*Math.abs(Math.sin(action.travel/(10*scale))) : 0;
    const landing=action?.phase==='land' ? Math.min(1,(gameNow()-action.at)/70) : 0;
    const lift=action?.air ? action.air.lift : action?.phase==='jump' ? action.jump.height*jumpArc(action.jump.progress)
      : action?.phase==='land' ? action.jump.height*(1-smoothstep(landing)) : 0;
    // Settle the painted feet on a supported shelf, then rise into the aerial punch.
    // The action's lift and position still drive contact, force, and timing.
    let paintedLift=lift;
    if(action?.air){
      const air=action.air;
      if(action.phase==='airApproach'){
        const level=shelves.findIndex((_,index)=>supportedOnShelf(action.target,index));
        if(level!==-1){
          const progress=Math.min(1,(gameNow()-air.start)/(air.approachDuration+55));
          const descent=Math.max(0,Math.min(1,(progress-.72)/.28));
          paintedLift+=(y+23*scale-lift-shelves[level].bounds.min.y)*smoothstep(descent);
        }
      }else if(action.phase==='airSwat'){
        const rise=Math.min(1,(gameNow()-action.at)/95);
        paintedLift+=(air.visualOffset || 0)*(1-smoothstep(rise));
      }
    }
    const view=action?(facing<0?'left':'right'):'front';
    const sprite=cookieSprites[view];
    if(sprite?.complete && sprite.naturalWidth===810 && sprite.naturalHeight===1017){
      const spriteHeight=60*scale*spriteScale,spriteWidth=spriteHeight*810/1017;
      const shadowWidth=26*scale*Math.max(.65,1-lift/(action?.jump?.height||action?.air?.height||1)*.3);
      ctx.save();ctx.translate(x,y+bob-paintedLift);
      ctx.fillStyle='rgba(54,47,34,.13)';ctx.beginPath();
      ctx.ellipse(0,26*scale-bob+paintedLift,shadowWidth,7*scale,0,0,Math.PI*2);ctx.fill();
      const tilt=reducedMotion?0:action?.phase==='run' ? facing*.035*Math.sin(action.travel/(10*scale))
        : action?.phase==='jump' ? facing*.09*Math.sin(Math.PI*action.jump.progress) : 0;
      ctx.save();ctx.rotate(tilt);ctx.imageSmoothingEnabled=false;
      ctx.drawImage(sprite,-spriteWidth/2,23*scale-spriteHeight*1001/1017,spriteWidth,spriteHeight);
      ctx.restore();
      if(action?.phase==='swat' || action?.phase==='airSwat'){
        const baseX=facing*14*scale*spriteScale;
        const baseY=(23+(7-23)*spriteScale)*scale;
        let tipX,tipY;
        if(action.phase==='swat'){
          const contact=action.hitContact || {
            x:x+action.side*swatEdgeDistance(action.target,action.side,x),
            y:action.target.position.y-action.target.meta.h*.22
          };
          tipX=baseX+(contact.x-x-baseX)*action.paw;
          tipY=baseY+(contact.y-y-baseY)*action.paw;
        }else{
          const contact=action.hitContact || airContact(action.target,action.side);
          tipX=baseX+(contact.x-x-baseX)*action.paw;
          tipY=baseY+(contact.y-(y-paintedLift)-baseY)*action.paw;
        }
        ctx.strokeStyle=facing===1?'#d87832':'#242226';ctx.lineWidth=8*scale*spriteScale;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(baseX,baseY);ctx.lineTo(tipX,tipY);ctx.stroke();
        ctx.fillStyle='#fff8ec';ctx.beginPath();ctx.arc(tipX,tipY,5*scale*spriteScale,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
      return;
    }
  }
  function drawImpact(ctx){
    if(reducedMotion || !impact)return;
    const progress=Math.min(1,(gameNow()-impact.start)/350);
    if(progress>=1){impact=null;return}
    const {body,side}=impact;
    const point=impact.point || {x:body.position.x-side*body.meta.r*.7,y:body.position.y-body.meta.h*.2};
    ctx.save();ctx.globalAlpha=1-progress;ctx.strokeStyle='#f1b45c';ctx.lineWidth=(4+progress*5)*scale;
    ctx.beginPath();ctx.arc(point.x,point.y,(8+progress*24)*scale,0,Math.PI*2);ctx.stroke();ctx.restore();
  }
  function onShelf(body){return onGroundShelf(body)}
  function swatEdgeX(body,side){return side===1?body.bounds.min.x:body.bounds.max.x}
  function swatEdgeDistance(body,side,x){return side*(swatEdgeX(body,side)-x)}
  function canSwatFrom(body,side,x){
    const reach=swatEdgeDistance(body,side,x);
    if(reach<24*scale || reach>44*scale)return false;
    const part=shelfPartAt(x,cookieShelf);
    if(!part || x<part.bounds.min.x+23*scale || x>part.bounds.max.x-23*scale)return false;
    if(part!==shelfPartAt(body.position.x,cookieShelf))return false;
    return pots.every(other=>other===body || !onShelf(other) || (
      Math.abs(other.position.x-x)>23*scale+(other.bounds.max.x-other.bounds.min.x)/2+3*scale
      && !(side*(other.position.x-x)>0 && side*(other.position.x-body.position.x)<0)
    ));
  }
  function standX(body,side){
    for(const distance of [32,28,36,40,25,44]){
      const x=swatEdgeX(body,side)-side*distance*scale;
      if(canSwatFrom(body,side,x))return x;
    }
    return null;
  }
  function airStandX(body,side){
    const min=12*scale,max=width-12*scale;
    const contactX=airContact(body,side).x;
    const x=Math.max(min,Math.min(max,contactX-side*38*scale));
    const reach=side*(contactX-x);
    return reach>=5*scale && reach<=55*scale ? x : null;
  }
  function airContact(body,side){
    const inset=Math.min(5*scale,(body.bounds.max.y-body.bounds.min.y)/4);
    const y=Math.max(body.bounds.min.y+inset,Math.min(body.bounds.max.y-inset,body.position.y-body.meta.h*.22));
    const edges=[];
    if(body.vertices)for(let i=0;i<body.vertices.length;i++){
      const a=body.vertices[i],b=body.vertices[(i+1)%body.vertices.length];
      if(y>=Math.min(a.y,b.y) && y<=Math.max(a.y,b.y) && Math.abs(a.y-b.y)>.001)
        edges.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y));
    }
    const surface=edges.length?(side===1?Math.min(...edges):Math.max(...edges)):swatEdgeX(body,side);
    return {x:surface+side*3*scale,y};
  }
  function shelfFor(body){
    const supported=shelves.findIndex((_,level)=>supportedOnShelf(body,level));
    if(supported!==-1)return supported;
    const bottom=body.bounds.max.y;
    return shelves.reduce((best,shelf,index)=>
      Math.abs(shelf.bounds.min.y-bottom)<Math.abs(shelves[best].bounds.min.y-bottom)?index:best,0);
  }
  function safeLandingX(preferred,level){
    const margin=23*scale;
    const ranges=shelves[level].parts.map(part=>[part.bounds.min.x+margin,part.bounds.max.x-margin]);
    const candidates=[preferred];
    for(const [min,max] of ranges){
      candidates.push(min,max);
      for(let x=min;x<=max;x+=12*scale)candidates.push(x);
    }
    const withinShelf=x=>ranges.some(([min,max])=>x>=min && x<=max);
    candidates.sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred));
    return candidates.find(x=>withinShelf(x) && pots.every(body=>!supportedOnShelf(body,level)
      || x<body.bounds.min.x-27*scale || x>body.bounds.max.x+27*scale))
      ?? candidates.find(withinShelf) ?? preferred;
  }
  function smoothstep(t){return t*t*(3-2*t)}
  function jumpArc(progress){return smoothstep(Math.min(1,progress/.14))}
  function obstaclesBetween(destination,travelSide){
    const remaining=travelSide*(destination-cookie.position.x);
    if(remaining<=0)return [];
    return pots.filter(body=>onShelf(body)
      && travelSide*(body.position.x-cookie.position.x)>0
      && travelSide*(body.position.x-cookie.position.x)<remaining+body.meta.r)
      .sort((a,b)=>travelSide*(a.position.x-b.position.x));
  }
  function startJump(obstacles,destination,now){
    const heightNeeded=Math.max(...obstacles.map(body=>{
      const plant=plants[body.meta.index];
      return body.meta.h*.75+plant.height+30*scale;
    }));
    action.phase='jump';action.at=now;
    action.jump={from:cookie.position.x,to:destination,progress:0,height:Math.max(80*scale,heightNeeded)};

  }
  function beginAirAttack(body,preferred,now){
    const side=[preferred,-preferred].find(direction=>airStandX(body,direction)!==null);
    if(!side){action=null;finishAction(now);return}
    const destination=airStandX(body,side);
    const travelSide=Math.sign(destination-cookie.position.x);
    const obstacles=travelSide?obstaclesBetween(destination,travelSide).filter(other=>other!==body):[];
    const heightNeeded=obstacles.reduce((height,other)=>{
      const plant=plants[other.meta.index];
      return Math.max(height,other.meta.h*.75+plant.height+30*scale);
    },90*scale);
    facing=side;
    action={phase:'airApproach',target:body,side,paw:0,hit:false,at:now,
      air:{takeoffX:cookie.position.x,takeoffY:cookie.position.y,takeoffLevel:cookieShelf,
        start:now,last:now,lift:0,height:Math.min(heightNeeded,42*scale),
        approachDuration:Math.max(145,Math.abs(destination-cookie.position.x)/(2500*scale)*1000)}};

  }
  function startAirReturn(now){
    const air=action.air;
    air.returnLevel=action.hit?action.hitShelf:air.takeoffLevel;
    air.returnX=safeLandingX(cookie.position.x,air.returnLevel);
    air.returnY=shelves[air.returnLevel].bounds.min.y-23*scale;
    air.returnFromX=cookie.position.x;air.returnFromY=cookie.position.y;air.returnFromLift=air.lift;
    air.returnDuration=Math.max(150,Math.abs(air.returnX-cookie.position.x)/(2600*scale)*1000);
    action.phase='airReturn';action.at=now;action.paw=0;

  }
  function beginAction(body,now){
    if(!canStartSwat() || !inPlay(body))return;
    const preferred=cookie.position.x<=body.position.x?1:-1;
    const sides=[preferred,-preferred];
    if(!onGroundShelf(body)){beginAirAttack(body,preferred,now);return}
    const readySide=sides.find(direction=>canSwatFrom(body,direction,cookie.position.x));
    const side=readySide || sides.find(direction=>standX(body,direction)!==null);
    if(!side){beginAirAttack(body,preferred,now);return}
    facing=side;
    action={phase:readySide?'swat':'run',target:body,side,paw:0,travel:0,at:now,hit:false};
  }
  function finishAction(now){
    action=null;
    while(queuedPots.length){
      const next=queuedPots.shift();
      if(inPlay(next) && canStartSwat()){beginAction(next,now);if(action)return}
    }
  }
  function updateAction(now){
    if(!action)return;
    const {target,side}=action;
    if(action.air){
      const air=action.air;
      if(action.phase==='airReturn'){
        const progress=Math.min(1,(now-action.at)/air.returnDuration);
        const x=air.returnFromX+(air.returnX-air.returnFromX)*progress;
        const y=air.returnFromY+(air.returnY-air.returnFromY)*progress;
        Body.setPosition(cookie,{x,y});
        air.lift=air.returnFromLift*(1-smoothstep(progress))+air.height*.45*Math.sin(Math.PI*progress);
        if(progress>=1){air.lift=0;cookieShelf=air.returnLevel;finishAction(now)}
        return;
      }
      if(!inPlay(target)){startAirReturn(now);return}
      let destination=airStandX(target,action.side);
      if(destination===null){
        const opposite=airStandX(target,-action.side);
        if(opposite===null){startAirReturn(now);return}
        action.side=-action.side;facing=action.side;destination=opposite;
      }
      const dt=Math.max(0,Math.min(33,now-air.last));air.last=now;
      const dx=destination-cookie.position.x;
      // Launch upward first so Cookie clears a nearby pot before moving across it.
      const step=action.phase==='airApproach' && now-air.start<55 ? 0
        : Math.min(Math.abs(dx),2500*scale*dt/1000);
      const nextX=cookie.position.x+Math.sign(dx)*step;
      const destinationY=Math.max(24*scale,Math.min(height-22*scale,
        target.position.y+target.meta.h*.28));
      const progressToTarget=Math.min(1,(now-air.start)/(air.approachDuration+55));
      const nextY=air.takeoffY+(destinationY-air.takeoffY)*smoothstep(progressToTarget);
      Body.setPosition(cookie,{x:nextX,y:nextY});
      const contact=airContact(target,action.side);
      const contactLift=Math.max(0,Math.min(24*scale,cookie.position.y-contact.y+7*scale));
      if(action.phase==='airApproach'){
        const progress=Math.min(1,(now-air.start)/(air.approachDuration+55));
        const descent=Math.max(0,Math.min(1,(progress-.72)/.28));
        air.lift=contactLift*smoothstep(progress)+air.height*jumpArc(progress)*(1-smoothstep(descent));
        if(progress>=1 && Math.abs(destination-cookie.position.x)<=3*scale){
          air.lift=contactLift;
          const level=shelves.findIndex((_,index)=>supportedOnShelf(target,index));
          air.visualOffset=level===-1?0
            : cookie.position.y+23*scale-air.lift-shelves[level].bounds.min.y;
          action.phase='airSwat';action.at=now;action.paw=0;

        }
        return;
      }
      const liftStep=1500*scale*dt/1000;
      air.lift+=Math.max(-liftStep,Math.min(liftStep,contactLift-air.lift));
      const elapsed=now-action.at;
      const pawLength=Math.hypot(contact.x-cookie.position.x-action.side*14*scale,
        contact.y-(cookie.position.y-air.lift)-7*scale);
      const reach=action.side*(contact.x-cookie.position.x);
      const inReach=reach>=5*scale && reach<=58*scale && pawLength<=72*scale;
      action.paw=action.hit?1:Math.min(inReach?1:.85,elapsed/95);
      if(!action.hit && elapsed>=95 && inReach){
        // The painted paw and the force use the same contact point on the current body.
        const kick={x:action.side*target.mass*.052,y:-target.mass*.018};
        Sleeping.set(target,false);Body.applyForce(target,contact,kick);
        impact={body:target,side:action.side,point:contact,start:now};
        action.hit=true;action.hitAt=now;action.hitContact=contact;action.hitShelf=shelfFor(target);action.paw=1;
      }
      if(action.hit && now-action.hitAt>=100 || !action.hit && elapsed>=320)startAirReturn(now);
      return;
    }
    if(action.phase==='jump'){
      const jump=action.jump;
      const dx=jump.to-cookie.position.x;
      const step=Math.min(Math.abs(dx),2150*scale*Math.max(0,Math.min(33,now-action.at))/1000);
      if(step>0)Body.setPosition(cookie,{x:cookie.position.x+Math.sign(dx)*step,y:cookie.position.y});
      action.at=now;
      jump.progress=Math.min(1,Math.abs(cookie.position.x-jump.from)/Math.abs(jump.to-jump.from));
      if(Math.abs(jump.to-cookie.position.x)<=2*scale){
        Body.setPosition(cookie,{x:jump.to,y:cookie.position.y});
        action.phase='land';action.at=now;
      }
      return;
    }
    if(action.phase==='land'){
      if(now-action.at>=70){
        action.jump=null;action.phase='run';action.at=now;
        if(!inPlay(target)){finishAction(now);return}
        if(!onGroundShelf(target)){beginAirAttack(target,cookie.position.x<=target.position.x?1:-1,now);return}

      }
      return;
    }
    // The impulse may lift a hit pot away from its shelf on the next frame.
    // Its recovery belongs to the same tap and must not start a new attack.
    if(action.phase==='swat' && action.hit){
      const elapsed=now-action.at;
      action.paw=Math.max(0,1-(elapsed-95)/100);
      if(elapsed>=195)finishAction(now);
      return;
    }
    if(!inPlay(target)){finishAction(now);return}
    if(!onGroundShelf(target)){beginAirAttack(target,cookie.position.x<=target.position.x?1:-1,now);return}
    if(action.phase==='run'){
      if(canSwatFrom(target,side,cookie.position.x)){
        action.phase='swat';action.at=now;action.paw=0;return;
      }
      const destination=standX(target,side);
      if(destination===null){
        if(standX(target,-side)!==null){action.side=-side;facing=-side;return}
        beginAirAttack(target,cookie.position.x<=target.position.x?1:-1,now);return;
      }
      if(shelfPartAt(cookie.position.x,cookieShelf)!==shelfPartAt(destination,cookieShelf)){
        beginAirAttack(target,cookie.position.x<=target.position.x?1:-1,now);return;
      }
      const dx=destination-cookie.position.x;
      const step=Math.min(Math.abs(dx),1900*scale*Math.max(0,Math.min(33,now-action.at))/1000);
      const travelSide=Math.sign(dx);
      const obstacles=obstaclesBetween(destination,travelSide);
      if(obstacles.length && travelSide*(obstacles[0].position.x-cookie.position.x)<=obstacles[0].meta.r+23*scale+32*scale+step){
        startJump(obstacles,destination,now);return;
      }
      if(step>0){Body.setPosition(cookie,{x:cookie.position.x+Math.sign(dx)*step,y:cookie.position.y});action.travel+=step}
      action.at=now;
      if(Math.abs(destination-cookie.position.x)<=2*scale){
        Body.setPosition(cookie,{x:destination,y:cookie.position.y});
        if(canSwatFrom(target,side,destination)){
          action.phase='swat';action.at=now;action.paw=0;
        }
      }
      return;
    }
    const elapsed=now-action.at;
    if(!action.hit && !canSwatFrom(target,side,cookie.position.x)){
      action.phase='run';action.at=now;action.paw=0;
      return;
    }
    action.paw=elapsed<95 ? Math.min(1,elapsed/95) : Math.max(0,1-(elapsed-95)/100);
    if(!action.hit && elapsed>=95){
      // Same mass-scaled, off-center V0.2 impulse, released at visible paw contact.
      const kick={x:side*target.mass*.052,y:-target.mass*.018};
      const point={x:target.position.x,y:target.position.y-target.meta.h*.22};
      action.hitContact={x:swatEdgeX(target,side),y:point.y};
      Sleeping.set(target,false);
      Body.applyForce(target,point,kick);
      impact={body:target,side,start:now};action.hit=true;action.paw=1;
    }
    if(elapsed>=195)finishAction(now);
  }

 function draw(){
  ctx.clearRect(0,0,viewWidth,viewHeight);
  ctx.save();ctx.translate(camera.x,camera.y);ctx.scale(camera.zoom,camera.zoom);
  ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
  drawBands(ctx);drawShelf(ctx);
  pots.forEach((p,i)=>{if(!cleared.has(p))drawPot(ctx,p,plants[i])});
  drawCookie(ctx);drawImpact(ctx);ctx.restore();
 }
 function resize(w,h,dpr=1){
  if(w<=0 || h<=0)return;
  viewWidth=w;viewHeight=h;const zoom=Math.min(w/width,h/height);
  camera={zoom,x:(w-width*zoom)/2,y:(h-height*zoom)/2};
  const ratio=Math.max(1,Math.min(2,dpr));
  canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
  ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);draw();
 }
 function pick(clientX,clientY,rect,touch=false){
  const x=((clientX-rect.left)*viewWidth/rect.width-camera.x)/camera.zoom;
  const y=((clientY-rect.top)*viewHeight/rect.height-camera.y)/camera.zoom;
  if(x<0 || x>width || y<0 || y>height)return null;
  const padding=touch?12*viewWidth/rect.width/camera.zoom:0;
  let index=null,distance=Infinity;
  pots.forEach((body,i)=>{
   if(!inPlay(body))return;
   const dx=x-body.position.x,dy=y-body.position.y,c=Math.cos(body.angle),s=Math.sin(body.angle);
   const localX=dx*c+dy*s,localY=-dx*s+dy*c,{r,h}=body.meta,plant=plants[i];
   if(Math.abs(localX)>Math.max(r*1.1,plant.halfWidth,17*scale)+padding
    || localY< -h*.22-plant.height-padding || localY>h*.57+padding)return;
   const d=Math.hypot(localX,localY+h*.18);
   if(d<distance){index=i;distance=d}
  });return index;
 }
 function targetRects(){
  return pots.map((body,i)=>{
   if(!inPlay(body))return null;
   const plant=plants[i],{r,h}=body.meta,c=Math.cos(body.angle),s=Math.sin(body.angle);
   const half=Math.max(r*1.1,plant.halfWidth,17*scale);
   const points=[[-half,-h*.22-plant.height],[half,-h*.22-plant.height],[-half,h*.57],[half,h*.57]]
    .map(([x,y])=>({x:camera.x+(body.position.x+x*c-y*s)*camera.zoom,y:camera.y+(body.position.y+x*s+y*c)*camera.zoom}));
   const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
   const minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
   const w=Math.max(44,maxX-minX+12),hgt=Math.max(44,maxY-minY+12);
   const left=Math.max(0,(minX+maxX-w)/2),top=Math.max(0,(minY+maxY-hgt)/2);
   return {left,top,width:Math.max(0,Math.min(w,viewWidth-left)),height:Math.max(0,Math.min(hgt,viewHeight-top))};
  });
 }
 function attack(index){
  const body=pots[index];if(!body || !inPlay(body) || !canStartSwat())return false;
  if(action)queuedPots.push(body);else beginAction(body,now);return true;
 }
 function frame(dt){
  now+=Math.max(0,Math.min(33,dt));updateAction(now);stepPhysics(Math.max(.1,Math.min(33,dt)));
  let changed=false;
  for(const body of pots)if(!cleared.has(body) && hasExitedDisplay(body)){cleared.add(body);changed=true;}
  if(!complete && changed && cleared.size===pots.length){complete=true;queuedPots=[];options.onClear?.();}
  draw();
 }
 Events.on(engine,'collisionEnd',wakePotsAfterSupportLoss);reset();
 return {resize,frame,draw,reset,attack,pick,targetRects,
  setReducedMotion(value){reducedMotion=!!value;draw()},
  get idle(){return complete && !action},
  // Read-only quiet check: never wake, move, or change the physics bodies.
  get settled(){return !action && !queuedPots.length && pots.every(body=>cleared.has(body) || body.isSleeping || (Math.hypot(body.velocity.x,body.velocity.y)<.08 && Math.abs(body.angularVelocity)<.008))},
  get complete(){return complete},
  // Presentation-only anchor midway from the actual lower shelf edge to the scene edge.
  get replayCenterY(){return (Math.max(...shelves.flatMap(level=>level.parts.map(body=>body.bounds.max.y)))+height)/2},
  // Internal scene inspection supports deterministic tests; never shown to visitors.
  inspect(){return {engine,pots,cookie,shelves,action,cleared,camera:{...camera},width,height,viewWidth,viewHeight,scale,now,queued:queuedPots.length}},
  destroy(){Events.off(engine);Composite.clear(engine.world,false);Engine.clear(engine)}
 };
}
return {createScene,WIDTH,HEIGHT,POT_COUNT:layout.pots.length,
 potNames:layout.pots.map((p,i)=>['tall cactus','small cactus','round barrel cactus','branching cactus','prickly pear cactus'][p.spec]+' '+(i+1))};
});
