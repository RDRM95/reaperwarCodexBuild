import { expect, test, type Page } from '@playwright/test';
import type { App } from '../src/ui/app';

async function openWorlds(page: Page) {
  await page.goto('/');
  await page.locator('[data-menu="au-worlds-civilizations"]').click();
  await expect(page.locator('h1')).toHaveText('AU WORLDS & CIVILIZATIONS');
}

async function state(page: Page) {
  return page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.civilization!);
}

async function flushSave(page: Page) {
  await page.evaluate(async () => (window as unknown as { reaperwar: App }).reaperwar.saveCivilization());
}

async function found(page: Page, name = 'Aster Republic') {
  await openWorlds(page);
  await page.locator('[data-action="open-civilization"]').click();
  await page.locator('[data-action="civ-name"]').fill(name);
  await page.locator('[data-action="civ-seed"]').fill('1800');
  await page.locator('[data-action="found-civilization"]').click();
  await expect(page.locator('[data-action="civilization-name"]')).toHaveText(name);
}

test('AU Worlds routes real branch and crossover fleets without replacing canonical campaign factions', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openWorlds(page);
  for (const id of ['aligned_humanity', 'iron_dawn', 'beacon_1800', 'relay_free_humanity', 'prothean_victory', 'past_cycles', 'hfy_terran_ascendancy']) {
    await expect(page.locator(`[data-au-profile="${id}"]`)).toHaveCount(1);
  }
  await expect(page.locator('[data-au-action="campaign-prothean_victory"]')).toHaveCount(0);
  await expect(page.locator('[data-au-action="campaign-past_cycles"]')).toHaveCount(0);
  await page.locator('[data-au-action="fleet-aligned_humanity"]').click();
  await expect(page.locator('[data-action="custom-timeline"]')).toHaveValue('aligned_humanity');
  await expect(page.locator('[data-faction="sideA"]')).toHaveValue('alliance');
  await expect(page.locator('[data-faction="A2"]')).toHaveValue('cerberus');

  // Enter through the hub again: an existing custom setup must not overwrite
  // the explicit branch template the player just selected.
  await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.show('au_hub'));
  await page.locator('[data-au-action="fleet-prothean_victory"]').click();
  await expect(page.locator('[data-action="custom-timeline"]')).toHaveValue('prothean_victory');
  await expect(page.locator('[data-faction="sideA"]')).toHaveValue('prothean');
  await expect(page.locator('[data-count="sideA:prothean_dreadnought"]')).toBeVisible();
  await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.show('au_hub'));
  await page.locator('[data-action="earth-skynet"]').click();
  await expect(page.locator('[data-action="custom-timeline"]')).toHaveValue('multiverse_crossover');
  await expect(page.locator('[data-faction="sideA"]')).toHaveValue('skynet');
  await expect(page.locator('[data-faction="sideB"]')).toHaveValue('reaper');
  await expect(page.locator('[data-count="sideA:skynet_harvester"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('civilization construction, monthly politics and policy affect the saved inventory and fleet statistics', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await found(page);
  const before = await state(page);
  await page.locator('[data-build-class="player_civ_cruiser"]').click();
  const built = await state(page);
  expect(built.fleetCounts.player_civ_cruiser).toBe(before.fleetCounts.player_civ_cruiser + 1);
  expect(built.industry).toBe(before.industry - 280);
  const techBefore = await page.locator('[data-action="civ-effective-tech"]').innerText();
  await page.locator('[data-action="civ-policy"]').selectOption('mobilized');
  expect((await state(page)).influence).toBe(before.influence - 15);
  await expect(page.locator('[data-action="civ-effective-tech"]')).not.toHaveText(techBefore);
  for (let month = 1; month <= 3; month++) {
    await page.locator('[data-action="civ-advance"]').click();
    await expect(page.locator('[data-action="civ-turn"]')).toHaveText(String(month));
  }
  await expect(page.locator('[data-action="civ-decision"]')).toBeVisible();
  await expect(page.locator('[data-action="civ-advance"]')).toBeDisabled();
  const politicalBefore = await state(page);
  await page.locator('[data-choice="defer_decision"]').click();
  const politicalAfter = await state(page);
  expect(politicalAfter.decisionPending).toBeUndefined();
  expect(politicalAfter.legitimacy).toBe(politicalBefore.legitimacy - 4);
  expect(politicalAfter.stability).toBe(politicalBefore.stability - 2);
  await expect(page.locator('[data-action="civ-advance"]')).toBeEnabled();
  await flushSave(page);
  await openWorlds(page);
  await expect(page.locator('[data-action="open-civilization"]')).toHaveText('Continue civilization →');
  await page.locator('[data-action="open-civilization"]').click();
  expect(await state(page)).toEqual(politicalAfter);
  await expect(page.locator('[data-action="civ-hulls"]')).toHaveText(`${Object.values(politicalAfter.fleetCounts).reduce((a, b) => a + b, 0)} ships`);
  expect(errors).toEqual([]);
});

test('pending civilization deployments retain seed and actual inventory through reload, then apply real combat survivors once', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await found(page, 'Charon Directorate');
  const inventory = (await state(page)).fleetCounts;
  await page.locator('[data-action="civ-encounter"]').selectOption('patrol');
  await page.locator('[data-action="civ-deploy"]').click();
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  const launch = await page.evaluate(async () => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    app.battle!.paused = true;
    await app.saveCivilization();
    const b = app.battle!;
    return { id: b.config.id, seed: b.config.seed, rules: b.config.rules.id,
      counts: b.config.fleets.find(f => f.id === 'custom-a')!.ships,
      factions: b.config.fleets.map(f => f.faction) };
  });
  expect(launch.rules).toBe('player_civilization');
  expect(launch.factions).toEqual(['player_civ', 'reaper']);
  await openWorlds(page);
  await page.locator('[data-action="open-civilization"]').click();
  await expect(page.locator('[data-action="civ-advance"]')).toBeDisabled();
  await expect(page.locator('[data-build-class="player_civ_cruiser"]')).toBeDisabled();
  await expect(page.locator('[data-action="civ-deploy"]')).toHaveText('Restart pending engagement (same seed)');
  expect((await state(page)).fleetCounts).toEqual(inventory);
  await page.locator('[data-action="civ-deploy"]').click();
  const restarted = await page.evaluate(() => {
    const b = (window as unknown as { reaperwar: App }).reaperwar.battle!; b.paused = true;
    return { id: b.config.id, seed: b.config.seed, ships: b.config.fleets.find(f => f.id === 'custom-a')!.ships };
  });
  expect(restarted).toEqual({ id: launch.id, seed: launch.seed, ships: launch.counts });
  const survivors = await page.evaluate(async () => {
    const app = (window as unknown as { reaperwar: App }).reaperwar, b = app.battle!;
    while (!b.sim.finished) b.sim.step();
    const counts: Record<string, number> = {};
    for (const ship of b.sim.ships) if (ship.fleetId === 'custom-a' && ship.alive) counts[ship.classId] = (counts[ship.classId] ?? 0) + 1;
    app.finishBattle(); await app.saveCivilization(); return counts;
  });
  await expect(page.locator('[data-action="return-civilization"]')).toBeVisible();
  const after = await state(page);
  expect(after.pendingBattle).toBeUndefined(); expect(after.lastAppliedBattle).toBe(launch.id);
  for (const id of Object.keys(inventory)) expect(after.fleetCounts[id]).toBe(survivors[id] ?? 0);
  // Replaying a completed battle keeps civilization navigation and cannot
  // charge its casualties or political consequences for a second time.
  await page.locator('[data-action="replay"]').click();
  await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    app.battle!.paused = true;
    while (!app.battle!.sim.finished) app.battle!.sim.step();
    app.finishBattle();
  });
  await expect(page.locator('[data-action="return-civilization"]')).toBeVisible();
  expect(await state(page)).toEqual(after);
  // Revisiting results must not apply the engagement a second time.
  await page.locator('[data-action="return-civilization"]').click();
  await page.evaluate(() => (window as unknown as { reaperwar: App }).reaperwar.show('results'));
  await page.locator('[data-action="return-civilization"]').click();
  expect(await state(page)).toEqual(after);
  await flushSave(page); await openWorlds(page); await page.locator('[data-action="open-civilization"]').click();
  expect(await state(page)).toEqual(after);
  expect(errors).toEqual([]);
});

test('seeded past-cycle civilizations use their own hulls and cancelling deployment unlocks the original inventory', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openWorlds(page);
  await page.locator('[data-action="open-past-cycle"]').click();
  await expect(page.locator('[data-action="civ-origin"]')).toHaveValue('past_cycle');
  await page.locator('[data-action="civ-seed"]').fill('1800');
  await page.locator('[data-action="found-civilization"]').click();
  const generated = await state(page);
  expect(generated.faction).toBe('past_cycle'); expect(generated.name.length).toBeGreaterThan(5);
  expect(Object.keys(generated.fleetCounts).sort()).toEqual(['past_cycle_cruiser', 'past_cycle_dreadnought']);
  await page.locator('[data-action="civ-encounter"]').selectOption('skynet');
  await page.locator('[data-action="civ-deploy"]').click();
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  const deployed = await page.evaluate(async () => {
    const app = (window as unknown as { reaperwar: App }).reaperwar; app.battle!.paused = true; await app.saveCivilization();
    return { factions: app.battle!.config.fleets.map(f => f.faction), rules: app.battle!.config.rules.id };
  });
  expect(deployed.factions).toEqual(['past_cycle', 'skynet']); expect(deployed.rules).toBe('past_cycles');
  await openWorlds(page); await page.locator('[data-action="open-civilization"]').click();
  await page.locator('[data-action="civ-cancel-battle"]').click();
  const cancelled = await state(page);
  expect(cancelled.pendingBattle).toBeUndefined(); expect(cancelled.fleetCounts).toEqual(generated.fleetCounts);
  await expect(page.locator('[data-action="civ-advance"]')).toBeEnabled();
  await expect(page.locator('[data-build-class="past_cycle_cruiser"]')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('a duplicated Strict Lore timeline can save one faction override without changing other factions or the protected profile', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-menu="alternate-timelines"]').click();
  await page.locator('[data-timeline="strict_lore"]').click();
  await page.getByRole('button', { name: 'Duplicate selected & edit', exact: true }).click();
  await page.locator('[data-action="faction-override-select"]').selectOption('alliance');
  await page.locator('[data-action="faction-override-key"]').selectOption('massAcceleratorDamage');
  await page.locator('[data-action="faction-override-value"]').fill('2.75');
  await page.locator('[data-action="faction-override-set"]').click();
  await expect(page.locator('[data-action="faction-override-summary"]')).toContainText('Mass accelerator damage ×2.75');
  await page.locator('[data-action="faction-override-select"]').selectOption('cerberus');
  await expect(page.locator('[data-action="faction-override-value"]')).toHaveValue('1');
  await page.locator('[data-action="faction-override-select"]').selectOption('alliance');
  await expect(page.locator('[data-action="faction-override-value"]')).toHaveValue('2.75');
  await page.locator('[data-action="faction-override-reset"]').click();
  await expect(page.locator('[data-action="faction-override-value"]')).toHaveValue('1');
  await page.locator('[data-action="faction-override-value"]').fill('2.75');
  await page.locator('[data-action="faction-override-set"]').click();
  await page.locator('[data-action="save-timeline"]').click();
  const saved = await page.evaluate(() => {
    const app = (window as unknown as { reaperwar: App }).reaperwar;
    return { custom: app.customTimelines.at(-1)!, strict: app.getTimeline('strict_lore') };
  });
  expect(saved.custom.category).toBe('custom'); expect(saved.custom.strictLore).toBeUndefined();
  expect(saved.custom.factionOverrides).toEqual({ alliance: { massAcceleratorDamage: 2.75 } });
  expect(saved.custom.organic.massAcceleratorDamage).toBe(1); expect(saved.custom.reaper.massAcceleratorDamage).toBe(1);
  expect(saved.strict.strictLore).toBe(true); expect(saved.strict.factionOverrides).toEqual({});
  await page.waitForFunction(() => !!localStorage.getItem('reaperwar:customTimelines'));
  await page.reload(); await page.locator('[data-menu="alternate-timelines"]').click();
  await page.locator(`[data-timeline="${saved.custom.id}"]`).click();
  await expect(page.locator('[data-action="faction-override-value"]')).toHaveValue('2.75');
});
