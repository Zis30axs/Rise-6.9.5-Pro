import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const demo = pathToFileURL(path.resolve(import.meta.dirname, '../../outputs/kaguya-live-3d-demo.html')).href;
const viewports = [
  { width: 1440, height: 900 }, { width: 390, height: 844 },
];

for (const viewport of viewports) {
  test(`${viewport.width}x${viewport.height} standalone kaguya 3D demo loads and renders`, async ({ page }) => {
    test.setTimeout(180_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto(demo);
    await page.waitForFunction(() => (window as { __kaguyaDemoReady?: boolean }).__kaguyaDemoReady === true
      || (window as { __kaguyaDemoError?: string }).__kaguyaDemoError !== undefined, undefined, { timeout: 150_000 });
    const failure = await page.evaluate(() => (window as { __kaguyaDemoError?: string }).__kaguyaDemoError);
    expect(failure, failure ? 'demo reported an error' : undefined).toBeUndefined();
    await expect(page.locator('canvas#cv')).toBeVisible();
    await expect(page.locator('#status')).toHaveClass(/done/);
    await page.waitForTimeout(1200);
    mkdirSync('outputs/kaguya-live-qa', { recursive: true });
    await page.screenshot({ path: `outputs/kaguya-live-qa/demo-${viewport.width}x${viewport.height}.png` });
    expect(errors).toEqual([]);
  });
}
