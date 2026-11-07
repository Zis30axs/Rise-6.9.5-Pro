import { expect, test } from '@playwright/test';

for (const [width, height] of [[1440, 900], [1280, 800], [390, 844], [320, 568]]) {
  test(`identity portraits, selection and fallback at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const externalRequests: string[] = [];
    page.on('request', request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(request.url());
    });
    await page.goto('/tests/e2e/identity-avatars.html');
    const sources = new Set<string>();
    for (const id of ['bang-uika', 'bang-umiri', 'bang-nyamu']) {
      const sample = page.locator(`[data-avatar-sample="${id}"] img`);
      const node = page.locator(`[data-mesh-node="${id}"]`);
      const crop = node.locator('img');
      await expect(crop).toBeVisible();
      await expect(crop).toHaveAttribute('src', /^data:image\/svg\+xml;base64,/);
      await crop.evaluate(async (img: HTMLImageElement) => { await img.decode(); });
      expect(await crop.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(256);
      const src = (await crop.getAttribute('src'))!;
      expect(await sample.getAttribute('src')).toBe(src);
      sources.add(src);
      await node.click();
      expect(await page.locator('.idcard-inspector-avatar img').getAttribute('src') === src).toBe(true);
    }
    expect(sources.size).toBe(3);
    await page.locator('.avatar-samples').screenshot({ path: testInfo.outputPath('crops.png') });
    await page.locator('.idcard-mesh-svg').screenshot({ path: testInfo.outputPath('mesh.png') });
    await page.screenshot({ path: testInfo.outputPath('page.png'), fullPage: true });
    const node = page.locator('[data-mesh-node="bang-uika"]');
    await node.locator('img').dispatchEvent('error');
    await expect(node.locator('[data-map-avatar-kind="sprite"]')).toBeVisible();
    await node.locator('img').evaluate(async (img: HTMLImageElement) => { await img.decode(); });
    await node.locator('img').dispatchEvent('error');
    await expect(node.locator('.cms-avatar-initials')).toHaveText('初华');
    await expect(node.locator('img')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });
}
