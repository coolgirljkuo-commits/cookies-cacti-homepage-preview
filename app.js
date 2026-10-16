/* Homepage lifecycle and scroll-friendly completed-tap handling. No storage. */
(function(){
'use strict';
const root=document.getElementById('experience'),stage=document.getElementById('stage');
const canvas=document.getElementById('canvas'),logo=document.getElementById('logo');
const layer=document.getElementById('scene-layer'),logoLayer=document.getElementById('logo-layer');
const targets=document.getElementById('targets'),message=document.getElementById('message');
const completionMessage=document.getElementById('completion-message');
const reset=document.getElementById('reset'),fallback=document.getElementById('fallback-note');
const card=document.getElementById('flip-card');
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
// Approved V1 defaults; explicit URL options retain reversible comparisons.
const query=new URLSearchParams(window.location?.search || '');
const idleReturn=query.get('idleReturn')!=='0';
const transition=!query.has('transition') || query.get('transition')==='flip'?'flip':'fade';
const logoWake=document.getElementById('logo-wake');
const layoutId=!query.has('layout') || query.get('layout')==='split'?'split':'original';
root.dataset.layout=layoutId;
const dramaticFinish=!query.has('finish') || query.get('finish')==='dramatic';
root.dataset.finish=dramaticFinish?'dramatic':'classic';
const typeStyle=query.get('type')==='rounded' || dramaticFinish?'rounded':'system';
root.dataset.type=typeStyle;
// Warm the optional local face during the logo hold, without blocking play.
if(typeStyle==='rounded')document.fonts?.load('500 19px "Cookie Rounded"').catch(()=>{});
if(dramaticFinish){
 document.getElementById('completion-line1').textContent='COOKIE STRIKES';
 const lastLine=document.getElementById('completion-line2');lastLine.textContent='AGAIN!';lastLine.hidden=false;
 completionMessage.setAttribute('aria-label','Cookie strikes again!');
 document.getElementById('reset-label').textContent='Make another mess!';
 root.dataset.poster='pending';
 if(document.fonts?.load)document.fonts.load('400 48px "Cookie Poster"').then(faces=>{root.dataset.poster=faces.length?'ready':'fallback'}).catch(()=>{root.dataset.poster='fallback'});
 else root.dataset.poster='fallback';
}
const revealDuration=transition==='flip'?800:700;
root.dataset.transition=transition;
let model=null,phase='logo',ready=false,onscreen=true,last=0,raf=0;
let inactivity=0,quiet=0;
let gesture=null,logoHoldRemaining=2000,fadeElapsed=0;const pointers=new Set(),buttons=[];
// Nonvisual startup diagnostics, measured from navigation start. No stored data.
const startup=window.CookieLoading || {images:{}};
startup.layout=layoutId;startup.transition=transition;startup.appStarted=performance.now();
const stamp=name=>{startup[name]=performance.now();root.dataset.startup=JSON.stringify(startup)};
stamp('bootStarted');
const revealSurface=transition==='flip'?card:layer;
revealSurface.addEventListener('transitionend',event=>{
 if(event.target===revealSurface && event.propertyName===(transition==='flip'?'transform':'opacity') ){
  if(phase==='fading')finishReveal();else if(phase==='returning')finishReturn();
 }
});
function finishReveal(){
 if(phase!=='fading')return;
 phase='playing';root.dataset.phase='playing';stamp('fadeFinished');stamp('firstPlayable');
 logoLayer.setAttribute('aria-hidden','true');layer.inert=false;layer.setAttribute('aria-hidden','false');
 syncTargets();
 if(document.activeElement===logoWake)buttons.find(b=>!b.hidden)?.focus({preventScroll:true});
}
function beginReveal(){
 logoWake.hidden=true;logoWake.disabled=true;logoLayer.setAttribute('aria-hidden','false');
 phase='fading';fadeElapsed=0;root.dataset.phase='fading';stamp('fadeStarted');
 if(motion.matches)finishReveal();
}
function finishReturn(){
 if(phase!=='returning')return;
 phase='idleLogo';root.dataset.phase=phase;logoWake.hidden=false;logoWake.disabled=false;
 if(layer.contains(document.activeElement))logoWake.focus({preventScroll:true});
}
function returnToLogo(){
 phase='returning';fadeElapsed=0;root.dataset.phase=phase;
 layer.inert=true;layer.setAttribute('aria-hidden','true');logoLayer.setAttribute('aria-hidden','false');
 if(motion.matches)finishReturn();
}
logoWake.addEventListener('click',()=>{
 if(phase!=='idleLogo' || document.hidden || !onscreen)return;
 try{model.reset();inactivity=0;quiet=0;message.hidden=false;completionMessage.hidden=true;reset.hidden=true;
 beginReveal();resume();}catch(error){fail(error)}
});
function fail(error){
 phase='failed';ready=false;cancelAnimationFrame(raf);raf=0;gesture=null;pointers.clear();
 logoWake.hidden=true;logoWake.disabled=true;
 root.dataset.phase='failed';layer.inert=true;layer.setAttribute('aria-hidden','true');
 logoLayer.setAttribute('aria-hidden','false');fallback.hidden=false;
 try{model?.destroy()}catch{};model=null;
 console.warn('Cookie’s Cacti kept the logo visible:',error?.message || 'Initialization failed');
}
function loadImage(image,src){
 const key=src || (image.currentSrc ? new URL(image.currentSrc).pathname : 'assets/logo.png'),timing=startup.images[key]={requested:performance.now()};
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=error=>{
   if(settled)return;settled=true;clearTimeout(timer);
   image.removeEventListener('load',loaded);image.removeEventListener('error',failed);
   if(error)reject(error);else{timing.decoded=performance.now();resolve(image)}
  };
  const loaded=()=>{
   timing.loaded=performance.now();
   if(!image.naturalWidth){finish(Error('Artwork is unavailable'));return}
   if(image.decode)image.decode().then(()=>finish(),()=>finish(Error('Artwork cannot be decoded')));
   else finish();
  };
  const failed=()=>finish(Error('Artwork is unavailable'));
  const timer=setTimeout(()=>finish(Error('Artwork loading timed out')),15000);
  image.addEventListener('load',loaded);image.addEventListener('error',failed);
  if(src)image.src=src;
  if(image.complete){if(image.naturalWidth)loaded();else if(image.getAttribute?.('src'))failed();}
 });
}
function syncTargets(){
 model.targetRects().forEach((r,i)=>{
  const button=buttons[i];button.hidden=!r || phase!=='playing';button.disabled=button.hidden;
  if(r)Object.assign(button.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'});
 });
}
function measure(){
 if(!model)return;
 try{
  const r=root.getBoundingClientRect(),world=window.CookieHomepage;
  const zoom=Math.min(r.width/world.WIDTH,r.height/world.HEIGHT);
  const width=world.WIDTH*zoom,height=world.HEIGHT*zoom;
  // Both layers occupy the same fixed rectangle throughout either reveal.
  for(const visual of (transition==='flip'?[card,layer,logoLayer]:[layer,logoLayer])){
   Object.assign(visual.style,{width:width+'px',height:height+'px'});
   visual.style.setProperty('--scene-width',width+'px');
   visual.style.setProperty('--scene-height',height+'px');
   visual.style.setProperty('--replay-center-y',model.replayCenterY*zoom+'px');
  }
  model.resize(width,height,window.devicePixelRatio || 1);syncTargets();
 }
 catch(error){fail(error)}
}
function resume(){
 if(!ready || document.hidden || !onscreen || raf || phase==='idleLogo' || (!idleReturn && phase==='complete' && model.idle))return;
 last=0;raf=requestAnimationFrame(frame);
}
function frame(time){
 raf=0;if(!ready || document.hidden || !onscreen)return;
 try{
  const dt=last?Math.min(100,time-last):0;last=time;
  if(phase==='logo'){
   // Hold the ready logo for two visible seconds. Hidden/offscreen time
   // does not consume the hold; physics stays paused until the reveal.
   logoHoldRemaining=Math.max(0,logoHoldRemaining-dt);
   if(logoHoldRemaining===0){
    beginReveal();
   }
  }else if(phase==='fading' || phase==='returning'){
   fadeElapsed+=dt;if(motion.matches || fadeElapsed>=revealDuration){if(phase==='fading')finishReveal();else finishReturn();}
  }else if(phase==='playing' || phase==='complete'){
   if(dt>0)model.frame(Math.min(33,dt));
   if(idleReturn){
    inactivity+=dt;quiet=model.settled?quiet+dt:0;
    if(inactivity>=30000 && quiet>=800)returnToLogo();
   }
  }
  syncTargets();
  if(phase!=='idleLogo' && !(!idleReturn && phase==='complete' && model.idle))raf=requestAnimationFrame(frame);
 }catch(error){fail(error)}
}
function requestAttack(index){
 if(phase!=='playing' || document.hidden || !onscreen || !model)return;
 try{if(model.attack(index)){inactivity=0;quiet=0;}resume()}catch(error){fail(error)}
}
stage.addEventListener('pointerdown',event=>{
 if(event.button!==undefined && event.button!==0)return;
 pointers.add(event.pointerId);
 if(pointers.size!==1 || phase!=='playing'){gesture=null;return}
 gesture={id:event.pointerId,x:event.clientX,y:event.clientY,at:performance.now(),type:event.pointerType};
});
stage.addEventListener('pointermove',event=>{
 if(gesture?.id===event.pointerId && Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>10)gesture=null;
});
stage.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);gesture=null});
stage.addEventListener('pointerup',event=>{
 const tap=gesture;gesture=null;pointers.delete(event.pointerId);
 if(!tap || tap.id!==event.pointerId || pointers.size || phase!=='playing'
  || performance.now()-tap.at>700 || Math.hypot(event.clientX-tap.x,event.clientY-tap.y)>10)return;
 const index=model.pick(event.clientX,event.clientY,canvas.getBoundingClientRect(),tap.type==='touch');
 if(index!==null)requestAttack(index);
});
// A release outside the stage must not leave an old touch/pen ID behind.
// These listeners only clean up after the stage's own bubbled tap handler.
for(const type of ['pointerup','pointercancel'])window.addEventListener(type,event=>{
 pointers.delete(event.pointerId);if(gesture?.id===event.pointerId)gesture=null;
});
window.addEventListener('blur',()=>{gesture=null;pointers.clear()});
reset.addEventListener('click',()=>{
 if(phase!=='complete' || !model)return;
 try{gesture=null;pointers.clear();model.reset();inactivity=0;quiet=0;phase='playing';root.dataset.phase='playing';
  message.hidden=false;completionMessage.hidden=true;reset.hidden=true;syncTargets();resume();}
 catch(error){fail(error)}
});
document.addEventListener('visibilitychange',()=>{
 gesture=null;pointers.clear();cancelAnimationFrame(raf);raf=0;last=0;
 for(const animation of (idleReturn ? root.getAnimations?.({subtree:true}) : []) || []){if(document.hidden)animation.pause();else animation.play();}
 if(!document.hidden)resume();
});
if(window.IntersectionObserver)new IntersectionObserver(entries=>{
 onscreen=entries[0].isIntersecting;
 if(!onscreen){cancelAnimationFrame(raf);raf=0;last=0;gesture=null;pointers.clear();}else resume();
}).observe(root);
motion.addEventListener?.('change',()=>{try{model?.setReducedMotion(motion.matches)}catch(error){fail(error)}});
async function boot(){
 try{
  if(!window.Matter || !window.CookieHomepage)throw Error('The interactive scene is unavailable');
  const sprites={};
  const logoReady=loadImage(logo).catch(error=>{
   if(!logo.currentSrc?.endsWith('.webp'))throw error;
   logo.parentElement?.querySelector('source')?.remove();
   return loadImage(logo,'assets/logo.png');
  });
  await Promise.all([logoReady,...['front','left','right'].map(view=>{
   const image=new Image();sprites[view]=image;return loadImage(image,'assets/cookie/cookie_'+view+'.webp').catch(()=>loadImage(image,'assets/cookie/cookie_'+view+'.png'));
  })]);
  for(const image of Object.values(sprites))if(image.naturalWidth!==810 || image.naturalHeight!==1017)throw Error('Unexpected Cookie artwork');
  stamp('assetsReady');
  stamp('sceneSetupStarted');
  model=window.CookieHomepage.createScene(window.Matter,sprites,canvas,{layout:layoutId,reducedMotion:motion.matches,onClear(){
   phase='complete';root.dataset.phase='complete';message.hidden=true;completionMessage.hidden=false;reset.hidden=false;
   if(targets.contains(document.activeElement))reset.focus({preventScroll:true});
  }});
  stamp('sceneSetupFinished');
  const names=window.CookieHomepage.potNames;
  names.forEach((name,i)=>{
   const button=document.createElement('button');button.type='button';button.className='pot-target';
   button.setAttribute('aria-label','Swat the '+name);button.hidden=true;
   // Pointer input belongs to the stage; this is the keyboard/assistive equivalent.
   button.addEventListener('click',()=>requestAttack(i));targets.appendChild(button);buttons.push(button);
  });
  measure();if(!model)return;
  if(window.ResizeObserver)new ResizeObserver(measure).observe(root);
  else window.addEventListener('resize',measure);
  stamp('firstDrawReady');
  ready=true;resume();
 }catch(error){fail(error)}
}
boot();
})();
