import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { mountSwitchHost } from './phone-peek-host';
import { selectDockAction } from './tool-dock-helpers';

const output = 'outputs/airport-district';
const bundle = readFileSync(`${output}/build/immersive-shell-lite.js`, 'utf8');
const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 }];

async function fixture(page: Page) {
  await page.route('http://127.0.0.1:5199/', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>',
  }));
  await page.goto('/');
  return page.evaluate(async () => {
    const path = '/src/runtime/model.ts';
    const { createInitialState, reduceState } = await import(path);
    const start = createInitialState();
    // Keep the existing real-time ambient-flight timer outside this map test.
    start.airTraffic.nextAmbientAt = Date.now() + 3_600_000;
    start.academics = { majorId: 'computer-science', subjects: [
      { subjectId: 'cs-programming', points: 0 }, { subjectId: 'cs-algorithms', points: 0 },
      { subjectId: 'cs-networks', points: 0 },
    ], lastGain: null };
    start.story = [{ id: 'airport-fixture', role: 'assistant', text: '南门交通站前，机场接驳车正在候客。' }];
    return reduceState(start, { type: 'novel_travel', locationId: 'bus-stop' });
  });
}

async function settleTravel(page: Page) {
  // Use the existing interaction confirmation if the optional event is offered.
  await expect.poll(async () => {
    const decline = page.getByRole('button', { name: '否，正常进行', exact: true });
    if (await decline.isVisible()) await decline.click();
    return page.getByRole('button', { name: '取消本次交互', exact: true }).count();
  }, { timeout: 15_000 }).toBe(0);
}

for (const viewport of viewports) test(`airport district ${viewport.width}x${viewport.height}`, async ({ page }) => {
  mkdirSync(output, { recursive: true });
  await page.setViewportSize(viewport);
  const { helper, errors } = await mountSwitchHost(page, {
    state: await fixture(page), bundle, installZip: `${output}/build/unread-city-lite-assets.zip`,
  });
  const saved = () => helper.evaluate(() => (window as any).fixtureRead().unread_city);
  const before = await saved();
  await selectDockAction(page, '地图');
  const map = page.locator('.world-map');
  await expect(page.locator('[data-tokyo-sandbox-status]')).toHaveAttribute('data-tokyo-sandbox-status', 'ready', { timeout: 45_000 });
  await expect(page.locator('[data-tokyo-sandbox-model]')).toHaveAttribute('data-tokyo-sandbox-model', 'glb');
  await page.getByRole('navigation', { name: '城市片区' }).getByRole('button', { name: '羽田机场区', exact: true }).click();
  await expect(map).toHaveAttribute('data-map-district', 'haneda-airport');
  await expect(page.locator('[data-tokyo-camera-flight]')).toHaveAttribute('data-tokyo-camera-flight', 'idle');
  const terminal = page.locator('[data-destination="haneda-airport"]');
  await expect(terminal).toBeEnabled();
  await expect(terminal).toContainText('国际航站楼');
  await expect(terminal).toContainText('50 分钟');
  await expect(terminal).toContainText('1200');
  await expect(page.locator('[data-map-location="haneda-airport"]')).toBeVisible();
  expect(await saved()).toEqual(before);
  await page.locator('[data-world-map-viewport]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/airport-${viewport.width}.png` });
  await terminal.click();
  await settleTravel(page);
  await expect.poll(async () => (await saved()).locationId).toBe('haneda-airport');
  const arrived = await saved();
  expect(arrived.player.balance).toBe(before.player.balance - 1200);
  expect(arrived.scene).toBeNull();
  const absolute = (clock: { day: number; hour: number; minute: number }) => clock.day * 1440 + clock.hour * 60 + clock.minute;
  expect(absolute(arrived.clock) - absolute(before.clock)).toBe(50);
  await selectDockAction(page, '地图');
  await expect(map).toHaveAttribute('data-map-layer', 'city');
  await page.getByRole('navigation', { name: '城市片区' }).getByRole('button', { name: '羽田机场区', exact: true }).click();
  await expect(page.locator('[data-tokyo-camera-flight]')).toHaveAttribute('data-tokyo-camera-flight', 'idle');
  await expect(terminal).toBeDisabled();
  await expect(terminal).toContainText('当前');
  await expect(page.locator('.tokyo-sandbox-player')).toBeVisible();
  await expect(page.locator('[data-overseas-to="sfo-airport"]')).toContainText('600 分钟');
  await expect(page.locator('[data-overseas-to="bus-stop"]')).toBeEnabled();
  await page.getByRole('button', { name: '向右旋转地图', exact: true }).click();
  await page.getByRole('button', { name: '复位地图视图', exact: true }).click();
  expect(await saved()).toEqual(arrived);
  await expect(map).not.toContainText(/LLM|world_actions|模型|协议|验收/);
  expect(await page.locator('.uc-shell').evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  await page.locator('[data-overseas-to="bus-stop"]').click();
  await settleTravel(page);
  await expect.poll(async () => (await saved()).locationId).toBe('bus-stop');
  expect((await saved()).player.balance).toBe(before.player.balance - 2400);
  expect(await helper.evaluate(() => (window as any).fixtureCounts().generations)).toBe(0);
  expect(errors).toEqual([]);
});
