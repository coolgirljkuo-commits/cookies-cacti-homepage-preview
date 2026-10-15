/* Homepage lifecycle and scroll-friendly completed-tap handling. No storage. */
(function(){
'use strict';
const root=document.getElementById('experience'),stage=document.getElementById('stage');
const canvas=document.getElementById('canvas'),logo=document.getElementById('logo');
const layer=document.getElementById('scene-layer'),logoLayer=document.getElementById('logo-layer');
const targets=document.getElementById('targets'),message=document.getElementById('message');
const reset=document.getElementById('reset'),fallback=document.getElementById('fallback-note');
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
let model=null,phase='logo',ready=false,onscreen=true,last=0,raf=0;
let gesture=null;const pointers=new Set(),buttons=[];
// Nonvisual startup diagnostics, measured from navigation start. No stored data.
const startup=window.CookieLoading || {images:{}};
startup.appStarted=performance.now();
const stamp=name=>{startup[name]=performance.now();root.dataset.startup=JSON.stringify(startup)};
stamp('bootStarted');
layer.addEventListener('transitionend',event=>{
 if(event.target===layer && event.propertyName==='opacity')stamp('fadeFinished');
});
function fail(error){
 phase='failed';ready=false;cancelAnimationFrame(raf);raf=0;gesture=null;pointers.clear();
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
 try{const r=stage.getBoundingClientRect();model.resize(r.width,r.height,window.devicePixelRatio || 1);syncTargets()}
 catch(error){fail(error)}
}
function resume(){
 if(!ready || document.hidden || !onscreen || raf || (phase==='complete' && model.idle))return;
 last=0;raf=requestAnimationFrame(frame);
}
function frame(time){
 raf=0;if(!ready || document.hidden || !onscreen)return;
 try{
  const dt=last?Math.min(100,time-last):0;last=time;
  if(phase==='logo'){
   // measure() has already painted the complete scene behind the logo.
   // Reveal on the next visible frame, with no extra post-readiness hold.
   phase='playing';stamp('firstPlayable');stamp('fadeStarted');root.dataset.phase='playing';
   logoLayer.setAttribute('aria-hidden','true');layer.inert=false;layer.setAttribute('aria-hidden','false');
  }else if(dt>0)model.frame(Math.min(33,dt));
  syncTargets();
  if(!(phase==='complete' && model.idle))raf=requestAnimationFrame(frame);
 }catch(error){fail(error)}
}
function requestAttack(index){
 if(phase!=='playing' || document.hidden || !onscreen || !model)return;
 try{model.attack(index);resume()}catch(error){fail(error)}
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
 try{gesture=null;pointers.clear();model.reset();phase='playing';root.dataset.phase='playing';
  message.textContent='Tap a cactus!';reset.hidden=true;syncTargets();resume();}
 catch(error){fail(error)}
});
document.addEventListener('visibilitychange',()=>{
 gesture=null;pointers.clear();cancelAnimationFrame(raf);raf=0;last=0;
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
  model=window.CookieHomepage.createScene(window.Matter,sprites,canvas,{reducedMotion:motion.matches,onClear(){
   phase='complete';root.dataset.phase='complete';message.textContent='Cookie strikes again!';reset.hidden=false;
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
  if(window.ResizeObserver)new ResizeObserver(measure).observe(stage);
  else window.addEventListener('resize',measure);
  stamp('firstDrawReady');
  ready=true;resume();
 }catch(error){fail(error)}
}
boot();
})();
