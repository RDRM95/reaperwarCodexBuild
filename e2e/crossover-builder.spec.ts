import { expect, test, type Page } from '@playwright/test';
import type { App } from '../src/ui/app';
import { CROSSOVER_FACTION_IDS, MASS_EFFECT_FACTION_IDS, SANDBOX_FACTION_IDS } from '../src/data/types';

async function openBuilder(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('boot')!).opacity === '0');
  await page.locator('[data-menu="custom-battle"]').click();
  await expect(page.locator('[data-action="roster-mode"]')).toBeVisible();
}

async function count(page: Page, fleet: string, hull: string, amount: number) {
  const input = page.locator(`[data-count="${fleet}:${hull}"]`);
  await input.fill(String(amount)); await input.blur();
}

async function keepOnly(page: Page, fleet: string, keep: Record<string, number>) {
  const ids = await page.locator(`[data-fleet-card="${fleet}"] [data-count]`).evaluateAll(inputs => inputs.map(input => input.getAttribute('data-count')!.split(':')[1]));
  for (const id of ids) await count(page, fleet, id, keep[id] ?? 0);
}

async function launchAndRender(page: Page, seconds = 0) {
  await page.locator('[data-action="launch-custom"]').click();
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  return page.evaluate(seconds => {
    const b = (window as unknown as { reaperwar: App }).reaperwar.battle!;
    b.paused = true;
    while (!b.sim.finished && b.sim.time < seconds) { b.sim.step(); b.view.update(0.05, 1); }
    for (let i = 0; i < 30; i++) b.view.update(1 / 60, 1);
    b.view.render();
    return { rules: b.config.rules.id, strict: !!b.config.rules.strictLore,
      factions: b.config.fleets.map(f => f.faction), hulls: b.sim.ships.map(s => s.classId),
      fired: b.sim.events.filter(e => e.type === 'weapon_fired').length,
      draws: b.view.drawCalls, models: b.view.visuals.size, glError: b.view.renderer.getContext().getError() };
  }, seconds);
}

test('multiverse roster exposes all factions in main, allied and reinforcement selectors and launches real Halo combat', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /webgl|shader|three|program/i.test(m.text())) errors.push(m.text()); });
  await openBuilder(page);
  await expect(page.locator('[data-faction="sideA"] option')).toHaveCount(8);
  await page.locator('[data-action="roster-mode"]').selectOption('multiverse');
  await expect(page.locator('[data-action="custom-timeline"]')).toHaveValue('multiverse_crossover');
  for (const key of ['sideA', 'sideB', 'reinforcements']) await expect(page.locator(`[data-faction="${key}"] option`)).toHaveCount(MASS_EFFECT_FACTION_IDS.length + SANDBOX_FACTION_IDS.length + CROSSOVER_FACTION_IDS.length);
  await page.locator('[data-action="add-fleet-A"]').click();
  await expect(page.locator('[data-faction="A2"] option')).toHaveCount(MASS_EFFECT_FACTION_IDS.length + SANDBOX_FACTION_IDS.length + CROSSOVER_FACTION_IDS.length);
  await page.locator('[data-faction="A2"]').selectOption('imperium');
  await expect(page.locator('[data-count="A2:imperium_retribution"]')).toBeVisible();
  await page.locator('[data-faction="reinforcements"]').selectOption('chaos');
  await expect(page.locator('[data-count="reinforcements:chaos_desolator"]')).toBeVisible();
  await page.locator('[data-action="preset-unsc-covenant"]').click();
  await expect(page.locator('[data-action="crossover-estimate-note"]')).toContainText('AU simulation estimates');
  await keepOnly(page, 'sideA', { unsc_marathon: 1 });
  await keepOnly(page, 'sideB', { covenant_ccs: 1 });
  await page.locator('[data-action="starting-distance"]').evaluate(element => {
    (element as HTMLInputElement).value = '60'; element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const result = await launchAndRender(page, 15);
  expect(result.rules).toBe('multiverse_crossover'); expect(result.strict).toBe(false);
  expect(result.factions).toEqual(['unsc', 'covenant']);
  expect(result.hulls.sort()).toEqual(['covenant_ccs', 'unsc_marathon']);
  expect(result.fired).toBeGreaterThan(0); expect(result.draws).toBeGreaterThan(0); expect(result.models).toBe(2); expect(result.glError).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('halo-crossover-combat.png') });
  expect(errors).toEqual([]);
});

test('strict lore removes excluded hulls from main fleets, allies and reinforcement waves before launch', async ({ page }) => {
  await openBuilder(page);
  await page.locator('[data-action="roster-mode"]').selectOption('multiverse');
  await keepOnly(page, 'sideA', { alliance_dreadnought: 1, alliance_omaha: 2 });
  await page.locator('[data-faction="sideB"]').selectOption('covenant');
  await page.locator('[data-action="add-fleet-A"]').click();
  await page.locator('[data-faction="A2"]').selectOption('imperium');
  await page.locator('[data-action="add-fleet-B"]').click();
  await page.locator('[data-faction="B2"]').selectOption('cerberus');
  await keepOnly(page, 'B2', { cerberus_dreadnought: 2, cerberus_cruiser: 1 });
  await page.locator('[data-faction="reinforcements"]').selectOption('chaos');
  await count(page, 'reinforcements', 'chaos_murder', 1);
  await page.locator('[data-action="reinforcement-time"]').fill('20'); await page.locator('[data-action="reinforcement-time"]').blur();
  await page.locator('[data-action="custom-timeline"]').selectOption('strict_lore');
  await expect(page.locator('[data-action="roster-mode"]')).toHaveValue('mass_effect');
  await expect(page.locator('[data-action="roster-exclusions"]')).toContainText('Strict lore removed');
  await expect(page.locator('[data-count="sideA:alliance_omaha"]')).toHaveCount(0);
  await expect(page.locator('[data-fleet-card="A2"]')).toHaveCount(0);
  await expect(page.locator('[data-count="B2:cerberus_dreadnought"]')).toHaveCount(0);
  await expect(page.locator('[data-action="reinforcement-time"]')).toHaveValue('0');
  for (const key of ['sideA', 'sideB', 'B2', 'reinforcements']) await expect(page.locator(`[data-faction="${key}"] option`)).toHaveCount(8);
  await expect(page.locator('[data-faction="sideB"]')).toHaveValue('reaper');
  await count(page, 'sideB', 'reaper_capital', 1);
  const result = await launchAndRender(page);
  expect(result.rules).toBe('strict_lore'); expect(result.strict).toBe(true);
  expect(result.factions).toEqual(['alliance', 'reaper', 'cerberus']);
  expect(result.hulls.sort()).toEqual(['alliance_dreadnought', 'cerberus_cruiser', 'reaper_capital']);
  expect(result.glError).toBe(0);
});

test('crossover presets retain setting-weighted power and round-trip saved setups including legacy roster inference', async ({ page }, testInfo) => {
  await openBuilder(page);
  const relativePower = async () => Number((await page.locator('[data-power="sideA"]').innerText()).split('·')[1].replace(/\D/g, ''));
  await page.locator('[data-action="preset-unsc-covenant"]').click();
  const haloPower = await relativePower();
  await page.locator('[data-action="preset-imperium-chaos"]').click();
  expect(await relativePower()).toBeGreaterThan(haloPower * 3);
  await expect(page.locator('[data-action="roster-mode"]')).toHaveValue('multiverse');
  await page.locator('[data-action="save-custom"]').click();
  // Persist a legacy version of the same setup: old/imported saves have no
  // rosterMode. Read/write actual storage, then force a new app instance.
  await page.evaluate(async () => {
    const raw = localStorage.getItem('reaperwar:customBattle');
    if (!raw) throw new Error('Custom setup was not saved');
    const saved = JSON.parse(raw); delete saved.rosterMode; saved.rulesId = 'canon_me3';
    localStorage.setItem('reaperwar:customBattle', JSON.stringify(saved));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('reaperwar', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(saved, 'customBattle');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
  });
  await openBuilder(page);
  await expect(page.locator('[data-action="roster-mode"]')).toHaveValue('multiverse');
  await expect(page.locator('[data-action="custom-timeline"]')).toHaveValue('multiverse_crossover');
  await expect(page.locator('[data-faction="sideA"]')).toHaveValue('imperium');
  await expect(page.locator('[data-faction="sideB"]')).toHaveValue('chaos');
  await page.screenshot({ path: testInfo.outputPath('warhammer-crossover-builder.png') });
  const result = await launchAndRender(page);
  expect(result.factions).toEqual(['imperium', 'chaos']); expect(result.models).toBe(8);
  expect(result.draws).toBeGreaterThan(0); expect(result.glError).toBe(0);
});
