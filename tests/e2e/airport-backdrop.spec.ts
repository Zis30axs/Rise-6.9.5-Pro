import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { mountSwitchHost } from './phone-peek-host';

const output = 'outputs/airport-backgrounds';
const bundle = readFileSync(`${output}/build/immersive-shell-lite.js`, 'utf8');
const provenance = JSON.parse(readFileSync('assets/backgrounds/haneda-airport-source.json', 'utf8'));
const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 }];

async function fixture(page: Page, hour: number) {
  await page.goto('/');
  return page.evaluate(async (hour) => {
    const path = '/src/runtime/model.ts';
    const { createInitialState } = await import(path);
    const start = createInitialState();
    start.locationId = 'haneda-airport';
    start.clock.hour = hour;
    start.clock.minute = 0;
    start.airTraffic.nextAmbientAt = Date.now() + 3_600_000;
    start.academics = { majorId: 'computer-science', subjects: [
      { subjectId: 'cs-programming', points: 0 }, { subjectId: 'cs-algorithms', points: 0 },
      { subjectId: 'cs-networks', points: 0 },
    ], lastGain: null };
    start.story = [{ id: 'airport-backdrop-fixture', role: 'assistant',
      text: '羽田机场的候机大厅里，座椅朝向宽阔的落地窗。远处的客机静静停在廊桥旁。' }];
    return start;
  }, hour);
}

for (const viewport of viewports) test(`airport pictures ${viewport.width}x${viewport.height}`, async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await page.setViewportSize(viewport);
  await page.route('http://127.0.0.1:5201/', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
  }));
  for (const [phase, hour] of [['day', 12], ['dusk', 18], ['night', 22]] as const) {
    const { helper, errors } = await mountSwitchHost(page, {
      state: await fixture(page, hour), bundle,
      installZip: phase === 'day' ? `${output}/build/unread-city-lite-assets.zip` : undefined,
    });
    const backdrop = page.locator('[data-novel-background="haneda-airport"]');
    await expect(backdrop).toHaveAttribute('data-background-id', `haneda-airport-${phase}`);
    await expect(backdrop).toHaveAttribute('data-background-phase', phase);
    await expect(backdrop).toHaveAttribute('data-background-image-phase', phase);
    await expect(backdrop).toHaveAttribute('data-background-source', 'user-art');
    await expect(backdrop).toHaveAttribute('data-background-status', 'image');
    const image = backdrop.locator('img');
    await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
      element.complete && element.naturalWidth === 1672 && element.naturalHeight === 941)).toBe(true);
    const digest = await image.evaluate(async (element: HTMLImageElement) => {
      const bytes = await (await fetch(element.currentSrc)).arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
    });
    expect(digest).toBe(provenance.images[phase].derived.sha256);
    const box = await image.boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);
    expect(await page.locator('.uc-shell').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect(backdrop).toHaveText('');
    await page.screenshot({ path: `${output}/airport-${phase}-${viewport.width}.png` });
    const saved = await helper.evaluate(() => (window as any).fixtureRead().unread_city);
    expect(saved.locationId).toBe('haneda-airport');
    expect(saved.clock).toEqual({ day: 1, hour, minute: 0 });
    expect(await helper.evaluate(() => (window as any).fixtureCounts().generations)).toBe(0);
    expect(errors).toEqual([]);
  }
});
