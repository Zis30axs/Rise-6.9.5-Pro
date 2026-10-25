import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { mountSwitchHost, noOverflow, counts } from './switch-map-fixture';

test('320x568 packaged Lite ZIP supplies images for progressive switch and district map', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 320, height: 568 });
  const script = readFileSync('outputs/switch-map-20261025/immersive-shell-lite.js', 'utf8');
  const { helper, errors } = await mountSwitchHost(page, {
    bundle: script, installZip: 'outputs/switch-map-20261025/unread-city-lite-assets.zip',
  });
  const before = await counts(helper);
  await page.locator('[data-protagonist-select]').selectOption('emma');
  await expect(page.locator('[data-protagonist-switch]')).toHaveAttribute('data-switch-phase', 'traverse');
  await expect(page.locator('[data-protagonist-switch]')).toHaveCount(0);
  await expect(page.locator('[data-majo-portrait="majo-emma"] img')).toHaveAttribute('src', /^blob:/);
  expect(await page.locator('[data-majo-portrait="majo-emma"] img').evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect((await counts(helper)).switchSaves).toBe(before.switchSaves + 1);
  await page.locator('.tool-dock button').filter({ hasText: '地图' }).click();
  await page.locator('[data-map-plane="city"] [data-map-target="city:home"]').click();
  await expect(page.locator('.world-map[data-map-district]')).toHaveAttribute('data-map-district', 'home');
  await expect(page.locator('[data-map-back]')).toBeVisible();
  await noOverflow(page);
  mkdirSync('outputs/switch-map-qa', { recursive: true });
  await page.screenshot({ path: 'outputs/switch-map-qa/320x568-packaged-lite.png' });
  expect(errors).toEqual([]);
});
