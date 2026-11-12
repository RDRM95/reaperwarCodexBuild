import { expect, test } from '@playwright/test';

/**
 * Nothing in the battle HUD's top bar may cover the side columns or the centre notice. The columns used to start at
 * a fixed 118 px; at 1920 px wide the status panel ended at 128 px and covered the head of the allied fleet list,
 * and at 1280 px it hid its own last line behind it. The notice sat at 90 px, across the camera buttons.
 */
for (const [width, height] of [[1280, 720], [1920, 1080]] as const) {
  test(`at ${width} x ${height} the top bar covers neither the side columns nor the centre notice`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.click('[data-menu="quick-battle"]');
    await page.click('[data-action="launch"]');
    await expect(page.locator('[data-action="pause"]')).toBeVisible();
    await expect(page.locator('.hud-left')).toBeVisible();
    // The columns are placed when the HUD is first laid out (a resize observer), with nothing asked of it.
    await page.waitForFunction(() => document.querySelector<HTMLElement>('.hud')!.style.getPropertyValue('--hud-left-top') !== '');
    const measured = await page.evaluate(() => {
      const box = (e: Element) => e.getBoundingClientRect();
      const panels = [...document.querySelectorAll('.hud-top > *')].filter((e) => !e.classList.contains('spacer')).map(box).filter((r) => r.width > 0 && r.height > 0);
      // How far a top-bar panel reaches into something below it that it shares width with.
      const covered = (r: DOMRect) => Math.max(0, ...panels.filter((p) => p.right > r.left && p.left < r.right).map((p) => p.bottom - r.top));
      const left = covered(box(document.querySelector('.hud-left')!)), right = covered(box(document.querySelector('.hud-right')!));
      // The notice is on screen for two seconds, and a frame can take longer than that under software rendering:
      // it is measured in the same turn that shows it.
      const w = window as unknown as { reaperwar: { battle: { hud: { toast(text: string): void } } } };
      w.reaperwar.battle.hud.toast('REINFORCEMENTS DETECTED');
      const notice = box(document.querySelector('.toast')!);
      return { left, right, notice: covered(notice), offCentre: Math.abs((notice.left + notice.right) / 2 - window.innerWidth / 2), panels: panels.length };
    });
    expect(measured.panels).toBeGreaterThanOrEqual(5);
    expect(measured.left).toBe(0);
    expect(measured.right).toBe(0);
    expect(measured.notice).toBe(0);
    // Centred from its first frame (it used to start half its width to the right).
    expect(measured.offCentre).toBeLessThan(2);
  });
}
