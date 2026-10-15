/* Shared, nonpersistent diagnostic arithmetic; no telemetry or game controls. */
(function(root,factory){
 if(typeof module==='object' && module.exports)module.exports=factory();else root.CookieLoadingReport=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const number=x=>typeof x==='number' && Number.isFinite(x);
 const gap=(end,start)=>number(end)&&number(start)&&end>=start?Math.round((end-start)*10)/10:null;
 function summarize(child,hostOrigin){
  const offset=gap(child.timeOrigin,hostOrigin),fromHost=t=>number(offset)&&number(t)?Math.round((offset+t)*10)/10:null;
  const nav=child.navigation || {};
  return {
   hostToChildNavigationMs:offset,hostToVisibleLogoMs:fromHost(child.logoRendered),
   hostToPlayableMs:fromHost(child.firstPlayable),hostToFadeFinishedMs:fromHost(child.fadeFinished),
   stages:{hostBeforeChildNavigationMs:offset,childNavigationToLogoMs:number(child.logoRendered)?child.logoRendered:null,
    logoToPlayableMs:gap(child.firstPlayable,child.logoRendered),playableToFadeFinishedMs:gap(child.fadeFinished,child.firstPlayable)},
   details:{htmlFirstByteAfterRequestMs:gap(nav.responseStart,nav.requestStart),htmlTransferMs:gap(nav.responseEnd,nav.responseStart),
    assetBarrierFromControllerMs:gap(child.assetsReady,child.appStarted),sceneSetupMs:gap(child.sceneSetupFinished,child.sceneSetupStarted),
    readyToPlayableMs:gap(child.firstPlayable,child.firstDrawReady),
    images:Object.entries(child.images || {}).map(([file,t])=>({file,loadEventAfterControllerRequestMs:gap(t.loaded,t.requested),decodeAfterLoadEventMs:gap(t.decoded,t.loaded)})),
    resources:(child.resources || []).map(t=>({file:t.file,transferBytes:t.transferBytes,
     discoveryToRequestMs:t.request>0?gap(t.request,t.start):null,
     requestToFirstByteMs:t.request>0&&t.firstByte>0?gap(t.firstByte,t.request):null,
     responseTransferMs:t.firstByte>0?gap(t.end,t.firstByte):null}))}
  };
 }
 return {summarize};
});
