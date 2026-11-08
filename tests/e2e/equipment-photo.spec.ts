import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { selectDockAction } from './tool-dock-helpers';

const output = 'outputs/equipment-photo';
const host = readFileSync('index.html', 'utf8').replace('<script type="module" src="/src/frontend/main.ts"></script>',
  '<script src="/outputs/equipment-photo/release/immersive-shell-lite.js"></script>');
const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 }];

for (const viewport of viewports) test(`CRYCHIC backpack photo ${viewport.width}x${viewport.height}`, async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await page.setViewportSize(viewport);
  const errors: string[] = [], unexpectedRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => { unexpectedRequests.push(route.request().url()); return route.abort(); });
  await page.route('https://**', route => { unexpectedRequests.push(route.request().url()); return route.abort(); });
  await page.addInitScript(() => localStorage.setItem('unread-city.presentation-mode.v1', 'novel'));
  await page.route('http://127.0.0.1:5204/', route => route.fulfill({ contentType: 'text/html', body: host }));
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles(`${output}/release/unread-city-lite-assets.zip`);
  await expect(page.locator('#unread-city-lite-import')).toContainText('已安装', { timeout: 60_000 });
  await page.reload();
  await page.locator('[data-academic-major="music"]').click();
  await page.locator('[data-academic-confirm]').click();
  await selectDockAction(page, '背包');
  const panel = page.locator('[data-inventory-panel]');
  const item = panel.locator('[data-equipment-item="crychic-photo"]');
  const photo = item.locator('img[data-product-image="crychic-photo"]');
  await expect(photo).toBeVisible();
  await item.scrollIntoViewIfNeeded();
  const image = await photo.evaluate(async (element: HTMLImageElement) => {
    await element.decode();
    return { width: element.naturalWidth, height: element.naturalHeight, inline: element.src.startsWith('data:image/webp;base64,') };
  });
  expect(image).toEqual({ width: 384, height: 384, inline: true });
  const bounds = await photo.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  const windowBounds = await page.locator('[data-window="inventory"]').boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(windowBounds!.y);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(windowBounds!.y + windowBounds!.height);
  expect(await panel.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${output}/photo-${viewport.width}.png` });
  await item.getByRole('button', { name: '装备CRYCHIC 合照', exact: true }).click();
  await expect(item.locator('[data-equipment-status]')).toHaveText('使用中');
  await expect(photo).toBeVisible();
  await item.getByRole('button', { name: '卸下CRYCHIC 合照', exact: true }).click();
  await expect(item.locator('[data-equipment-status]')).toHaveText('已收起');

  // Trigger a real browser decoding failure through the actual shared component.
  // The handler deliberately ignores stale src values, so retain the registered
  // src attribute while overriding this image's decoded resource with srcset.
  await photo.evaluate(element => { element.setAttribute('srcset', 'data:image/webp;base64,AA== 1x'); });
  await expect(photo).toHaveCount(0);
  await expect(item.locator('[data-photo-placeholder]')).toBeVisible();
  await expect(item.getByRole('img', { name: 'CRYCHIC 合照', exact: true })).toBeVisible();
  await expect(panel).not.toContainText(/LLM|Agent|模型请求|工程|协议|解码/);
  await item.getByRole('button', { name: '装备CRYCHIC 合照', exact: true }).click();
  await expect(item.locator('[data-equipment-status]')).toHaveText('使用中');
  await page.screenshot({ path: `${output}/fallback-${viewport.width}.png` });
  expect(errors).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
  writeFileSync(`${output}/browser-${viewport.width}.json`, JSON.stringify({ viewport, image,
    equipmentToggles: true, decodeFailureFallback: true, horizontalOverflow: false,
    pageErrors: errors, unexpectedRequests, physicalTauriTavernTested: false }, null, 2));
});
