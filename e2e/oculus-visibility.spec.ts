import {test,expect} from '@playwright/test';
test('four-craft Oculus encounters use real fire with a readable optic',async({page},info)=>{
 await page.goto('/');await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
 const records=await page.evaluate(()=>{
  const app=(window as any).reaperwar,records=[];
  for(const seed of [7,1337,42]){
   app.startBattle({id:'oculus-qa',name:'Controlled Oculus QA',scenarioId:'custom',seed,rules:app.getTimeline('prime_apex'),
    environment:'deep_space',maxDuration:180,perspectiveSide:'A',objective:'Observe actual fighter fire',fleets:[
     {id:'qa-a',name:'Tridents',faction:'alliance',side:'A',ships:[{classId:'alliance_carrier',count:1},{classId:'alliance_fighter',count:4}],formation:'fighter_screen',position:{x:0,y:0,z:-10},heading:{x:0,y:0,z:1}},
     {id:'qa-b',name:'Oculus',faction:'reaper',side:'B',ships:[{classId:'reaper_capital',count:1},{classId:'reaper_oculus',count:4}],formation:'fighter_screen',position:{x:0,y:0,z:10},heading:{x:0,y:0,z:-1}}]});
   const ctrl=app.battle;ctrl.paused=true;const sim=ctrl.sim;
   // Controlled dogfight: parent batteries and further launches are held.
   // Fighter weapons, target selection, movement, hits and damage remain live.
   for(const ship of sim.ships)if(ship.role!=='fighter'){
    for(const weapon of ship.weapons)weapon.cooldown=1000;
    if(ship.hangar)ship.hangar.remaining=0;
   }
   for(let n=0;n<200&&!sim.finished;n++)sim.step();
   const shots=sim.events.filter((e:any)=>e.type==='weapon_fired'&&sim.getShip(e.shipId)?.role==='fighter');
   records.push({seed,shotsA:shots.filter((e:any)=>sim.getShip(e.shipId)?.side==='A').length,shotsB:shots.filter((e:any)=>sim.getShip(e.shipId)?.side==='B').length,
    oculusBeams:shots.filter((e:any)=>e.weaponId==='oculus_beam').length,fighters:sim.ships.filter((s:any)=>s.role==='fighter').length});
   if(seed===42){
    ctrl.overlay.visible=false;const view=ctrl.view;
    const eye=sim.ships.find((s:any)=>s.classId==='reaper_oculus'&&s.alive);
    view.followId=eye.id;view.rig.setMode('follow');view.rig.yaw=Math.PI-.4;view.rig.pitch=.18;view.rig.distance=80;
    for(let n=0;n<25;n++)view.update(.1,1);view.render();
   }
  }
  return records;
 });
 await page.locator('#battle-canvas').screenshot({path:info.outputPath('oculus-front-optic.png')});
 for(const record of records){expect(record.shotsA).toBeGreaterThan(0);expect(record.shotsB).toBeGreaterThan(0);expect(record.oculusBeams).toBeGreaterThan(0);expect(record.fighters).toBe(8);}
});
