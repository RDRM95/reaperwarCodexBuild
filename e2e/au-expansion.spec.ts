import {test,expect} from '@playwright/test';

test('mission briefing resolves huge Apex strategic fleet immediately without instantiating ships',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.locator('[data-menu="quick-battle"]').click();
  const result=await page.evaluate(async()=>{
    const app=(window as unknown as {reaperwar:import('../src/ui/app').App}).reaperwar;
    app.show('briefing',{scenarioId:'apex_52500_final_offensive'});
    return {battleExists:!!app.battle};
  });
  expect(result.battleExists).toBe(false);
  await expect(page.locator('[data-action="instant-resolve"]')).toBeVisible();
  await page.locator('[data-action="instant-resolve"]').click();
  await expect(page.locator('[data-action="instant-battle-report"]')).toBeVisible();
  await expect(page.locator('[data-action="instant-battle-report"]')).toContainText('75,100');
  await expect(page.locator('[data-action="export-instant-report"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('live class losses panel is present and collapsible in a small battle',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    const app=(window as unknown as {reaperwar:import('../src/ui/app').App}).reaperwar;
    const a=app.getTimeline('prime_apex');
    app.startBattle({id:'scoreboard-e2e',name:'Ship kill scoreboard',scenarioId:'custom',
      seed:42,rules:a,environment:'deep_space',maxDuration:120,perspectiveSide:'A',
      objective:'Verify class losses in the HUD',fleets:[
        {id:'a',name:'Alliance',faction:'alliance',side:'A',formation:'line_abreast',
          position:{x:0,y:0,z:-20},heading:{x:0,y:0,z:1},
          ships:[{classId:'alliance_aegis_command',count:3}]},
        {id:'b',name:'Reapers',faction:'reaper',side:'B',formation:'capital_column',
          position:{x:0,y:0,z:20},heading:{x:0,y:0,z:-1},
          ships:[{classId:'reaper_destroyer',count:3}]}
      ]});
    app.battle!.paused=true;
  });
  await expect(page.locator('.kill-scoreboard')).toBeVisible();
  // Validate the actual visible panel; CSS/data attrs are implementation details.
  await expect(page.locator('.kill-scoreboard')).toContainText('No losses');
  await page.locator('[data-action="toggle-kill-score"]').click();
  await expect(page.locator('.kill-score-columns')).toBeHidden();
  await page.locator('[data-action="toggle-kill-score"]').click();
  await expect(page.locator('.kill-score-columns')).toBeVisible();
});
