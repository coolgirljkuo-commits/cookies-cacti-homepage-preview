/* Local-only startup evidence. No analytics, storage, or network reporting. */
(function(){
 'use strict';
 const timing=window.CookieLoading={timeOrigin:performance.timeOrigin,images:{},resources:[]};
 const publish=()=>{const root=document.getElementById('experience');if(root)root.dataset.startup=JSON.stringify(timing)};
 const observe=(type,read)=>{
  try{new PerformanceObserver(list=>{for(const entry of list.getEntries())read(entry);publish()}).observe({type,buffered:true})}catch{}
 };
 observe('paint',entry=>{if(entry.name==='first-contentful-paint')timing.firstContentfulPaint=entry.startTime});
 observe('element',entry=>{if(entry.identifier==='brand-logo' && !timing.logoRendered)timing.logoRendered=entry.renderTime || entry.startTime});
 const snapshot=()=>{
  const nav=performance.getEntriesByType('navigation')[0];
  if(nav)timing.navigation={requestStart:nav.requestStart,responseStart:nav.responseStart,responseEnd:nav.responseEnd,
   domInteractive:nav.domInteractive,domContentLoaded:nav.domContentLoadedEventEnd,loadEnd:nav.loadEventEnd,
   transferSize:nav.transferSize};
  timing.resources=performance.getEntriesByType('resource').filter(e=>['img','script','link','css'].includes(e.initiatorType)).map(e=>({
   file:new URL(e.name).pathname,start:e.startTime,request:e.requestStart,firstByte:e.responseStart,
   end:e.responseEnd,transferBytes:e.transferSize,decodedBytes:e.decodedBodySize}));publish();
 };
 observe('resource',snapshot);window.addEventListener('load',()=>setTimeout(snapshot,0));
 // Explicit developer-only direct-load report. Normal visitor UI is unchanged.
 if(window.location?.search && new URLSearchParams(window.location.search).get('loadingReport')==='1'){
  window.addEventListener('load',()=>{
   const report=document.createElement('pre');report.id='direct-loading-report';
   report.setAttribute('aria-label','Developer loading report');
   Object.assign(report.style,{position:'fixed',left:'8px',right:'8px',bottom:'8px',maxHeight:'35vh',overflow:'auto',
    margin:'0',padding:'12px',background:'#ffffffed',color:'#273b2c',border:'1px solid #49653b',zIndex:'10',font:'12px monospace',whiteSpace:'pre-wrap',overflowWrap:'anywhere'});
   document.body.appendChild(report);let checks=0;
   const timer=setInterval(()=>{
    const raw=document.getElementById('experience')?.dataset.startup;
    if(raw){report.textContent='DIRECT navigation timing — developer report\n'+JSON.stringify(JSON.parse(raw),null,2);}
    if(timing.fadeFinished || ++checks>=120)clearInterval(timer);
   },250);
  });
 }

})();
