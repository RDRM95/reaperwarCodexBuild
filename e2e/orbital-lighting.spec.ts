import {test,expect} from '@playwright/test';
test('orbital terrain keeps its solar lighting as ship fill changes',async({page},info)=>{
 await page.goto('/');
 await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
 const metrics=await page.evaluate(()=>{
  const app=(window as any).reaperwar;
  app.startBattle({id:'orbital-qa',name:'Orbital lighting QA',scenarioId:'custom',seed:42,rules:app.getTimeline('prime_apex'),
   environment:'earth_orbit',maxDuration:180,perspectiveSide:'A',objective:'Observe orbital lighting',fleets:[
    {id:'qa-a',name:'Alliance',faction:'alliance',side:'A',ships:[{classId:'alliance_dreadnought',count:4}],formation:'line_abreast',position:{x:0,y:0,z:-30},heading:{x:0,y:0,z:1}},
    {id:'qa-b',name:'Reapers',faction:'reaper',side:'B',ships:[{classId:'reaper_capital',count:2}],formation:'line_abreast',position:{x:0,y:0,z:30},heading:{x:0,y:0,z:-1}}]});
  const ctrl=app.battle;ctrl.paused=true;ctrl.overlay.visible=false;
  const view=ctrl.view,canvas=document.querySelector<HTMLCanvasElement>('#battle-canvas')!;
  canvas.style.width='960px';canvas.style.height='540px';view.resize(960,540);
  view.rig.setMode('free');view.rig.freePos.set(100,80,-250);
  view.rig.freeYaw=Math.atan2(-100,350);view.rig.freePitch=Math.atan2(-180,Math.hypot(-100,350));
  for(let n=0;n<20;n++)view.update(.1,1);
  const gl=view.renderer.getContext();
  const pixels=()=>{view.render();const p=new Uint8Array(300*65*4);gl.readPixels(330,5,300,65,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const fill=view.fillLight;fill.intensity=0;const dark=pixels();fill.intensity=8;const lit=pixels();
  let difference=0,brightness=0;
  for(let i=0;i<dark.length;i+=4)for(let c=0;c<3;c++){difference+=Math.abs(dark[i+c]-lit[i+c]);brightness+=dark[i+c];}
  fill.intensity=.9;view.render();
  return{meanFillDifference:difference/(dark.length/4*3),meanPlanetBrightness:brightness/(dark.length/4*3)};
 });
 await page.locator('#battle-canvas').screenshot({path:info.outputPath('solar-lit-orbit.png')});
 expect(metrics.meanPlanetBrightness).toBeGreaterThan(4);expect(metrics.meanFillDifference).toBeLessThan(.1);
});
