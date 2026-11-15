import { expect, test } from '@playwright/test';

/**
 * Owner's report, 15 Nov 2026: a text cursor blinks wherever one clicks, and a REF button sticks out of the side of
 * the screen.
 *
 * Every label in the interface was selectable text, so a click put a caret at the clicked letter. Most browsers do
 * not draw it; with caret browsing on (F7 in Chrome and Edge) it is a blinking bar. The REF tab was the launcher of
 * the ship-reference inspector, a review tool, fixed to the right-hand edge over the battle.
 */
test('a click on the interface leaves no text caret, and nothing sticks out of the side of the screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-menu="quick-battle"]')).toBeVisible();
  // The menu title: plain text, nothing to click.
  await page.locator('.menu-title').click();
  expect(await page.evaluate(() => window.getSelection()?.type)).toBe('None');

  await page.click('[data-menu="quick-battle"]');
  await page.click('[data-action="launch"]');
  await expect(page.locator('[data-action="pause"]')).toBeVisible();
  for (const selector of ['.hud-top .panel-title', '.hud-clock', '.hud-right .panel-title']) {
    await page.locator(selector).first().click();
    expect(await page.evaluate(() => window.getSelection()?.type), selector).toBe('None');
  }
  // A field that is typed into keeps its caret.
  expect(await page.evaluate(() => {
    const field = document.createElement('input');
    field.type = 'text';
    document.getElementById('ui')!.append(field);
    const style = getComputedStyle(field);
    const found = [style.userSelect, style.caretColor, getComputedStyle(document.body).caretColor];
    field.remove();
    return found;
  })).toEqual(['text', 'rgb(219, 231, 245)', 'rgba(0, 0, 0, 0)']);

  // No REF tab; the inspector still opens and closes with Alt+R.
  await expect(page.locator('#ship-reference-launch')).toHaveCount(0);
  await expect(page.locator('.shipref-open')).toHaveCount(0);
  await page.keyboard.press('Alt+r');
  await expect(page.locator('#ship-reference-panel')).toBeVisible();
  await page.keyboard.press('Alt+r');
  await expect(page.locator('#ship-reference-panel')).toHaveCount(0);
});
