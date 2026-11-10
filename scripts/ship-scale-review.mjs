import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:4180';
const out = process.argv[3] ?? 'test-results/ship-scale';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1200 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.locator('#ship-reference-launch').click();
  await page.locator('.shipref-top select').selectOption('REP-001');
  await page.locator('.shipref-grid').screenshot({ path: path.join(out, 'reaper-six-views.png') });
  await page.getByRole('button', { name: 'TRUE-SCALE COMPARISON', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'True-scale fleet comparison' });
  await comparison.locator('canvas').screenshot({ path: path.join(out, 'comparison-top.png') });
  await comparison.screenshot({ path: path.join(out, 'comparison-with-measurements.png') });
  const metrics = await comparison.evaluate(el => ({
    glError: el.dataset.glError, drawCalls: el.dataset.drawCalls,
    rows: [...el.querySelectorAll('tbody tr')].map(row => ({ classId: row.dataset.classId, values: [...row.cells].map(cell => cell.textContent) }))
  }));
  await page.getByLabel('Show measured bounds').check();
  await comparison.locator('canvas').screenshot({ path: path.join(out, 'comparison-bounds.png') });
  await page.getByRole('button', { name: 'Three-quarter — hull depth' }).click();
  await comparison.locator('canvas').screenshot({ path: path.join(out, 'comparison-quarter.png') });
  await page.getByRole('button', { name: 'BACK TO SIX VIEWS' }).click();
  await page.locator('.shipref-top select').selectOption('ALL-005');
  await page.locator('.shipref-grid').screenshot({ path: path.join(out, 'fighter-six-views.png') });
  await writeFile(path.join(out, 'metrics.json'), JSON.stringify({ ...metrics, errors, browser: browser.version(), renderer: 'ANGLE SwiftShader (cloud software rendering)' }, null, 2));
  if (errors.length || metrics.glError !== '0') throw new Error(JSON.stringify({ errors, metrics }));
  console.log(JSON.stringify({ output: out, drawCalls: metrics.drawCalls, errors }));
} finally { await browser.close(); }
