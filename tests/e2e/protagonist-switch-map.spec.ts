import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { getCampusInterior } from '../../src/runtime/campus-interiors';
import { personState } from '../../src/runtime/protagonist-world';
import { mountSwitchHost, switchState, viewports, counts, readState, failSave, resolveGeneration, changeChat, noOverflow } from './switch-map-fixture';

const out = 'outputs/switch-map-qa';
const overlay = (page: Page) => page.locator('[data-protagonist-switch]');
const shell = (page: Page) => page.locator('.uc-shell');
test.beforeEach(() => { mkdirSync(out, { recursive: true }); test.setTimeout(150_000); });

for (const viewport of viewports) {
  const size = `${viewport.width}x${viewport.height}`;
  test(`${size} progressive novel switch and five district sandtables`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { helper, errors } = await mountSwitchHost(page);
    const before = await readState(helper), baseline = await counts(helper);
    await shell(page).evaluate(element => {
      let started = 0;
      const observer = new MutationObserver(() => {
        const active = element.querySelector('[data-protagonist-switch]');
        if (active && !started) started = performance.now();
        if (!active && started) { element.setAttribute('data-fixture-switch-elapsed', String(performance.now() - started)); observer.disconnect(); }
      });
      observer.observe(element, { childList: true, subtree: true });
    });
    await page.locator('[data-protagonist-select]').selectOption('emma');
    await expect(overlay(page)).toHaveAttribute('data-switch-phase', 'ascent');
    await expect(page.locator('[data-protagonist-select]')).toBeDisabled();
    await expect(overlay(page)).toHaveAttribute('data-switch-progress', /0\.[3-8]/);
    await page.screenshot({ path: `${out}/${size}-ascent.png` });
    await expect(overlay(page)).toHaveAttribute('data-switch-phase', 'traverse');
    expect((await readState(helper)).unread_city.protagonists!.accounts.active).toBe('soyo');
    expect((await counts(helper)).switchSaves).toBe(baseline.switchSaves);
    await page.screenshot({ path: `${out}/${size}-traverse.png` });
    await expect(overlay(page)).toHaveAttribute('data-switch-phase', 'descent');
    await expect(shell(page)).toHaveAttribute('data-current-protagonist', 'emma');
    await page.screenshot({ path: `${out}/${size}-descent.png` });
    await expect(overlay(page)).toHaveCount(0);
    const elapsed = Number(await shell(page).getAttribute('data-fixture-switch-elapsed'));
    expect(elapsed).toBeGreaterThanOrEqual(3900);
    expect(elapsed).toBeLessThan(9000);
    expect((await counts(helper)).switchSaves).toBe(baseline.switchSaves + 1);
    const after = await readState(helper);
    expect(after.unread_city.clock).toEqual(before.unread_city.clock);
    expect(personState(after.unread_city, 'soyo').player).toEqual(before.unread_city.player);
    await expect(page.locator('[data-majo-portrait="majo-emma"]')).toHaveCount(1);
    await noOverflow(page);
    await page.screenshot({ path: `${out}/${size}-arrived.png` });

    await page.locator('.tool-dock button').filter({ hasText: '地图' }).click();
    const map = page.locator('.world-map[data-map-layer]');
    const viewportMap = page.locator('[data-world-map-viewport]');
    await expect(map).toHaveAttribute('data-map-layer', 'city');
    await expect(page.locator('.wm-layers button')).toHaveText(['城市', '所在区域', '世界']);
    await page.screenshot({ path: `${out}/${size}-city.png` });
    const mapSaves = (await counts(helper)).saves;
    for (const id of ['campus', 'home', 'commercial', 'downtown', 'city-park']) {
      await page.locator(`[data-map-plane="city"] [data-map-target="city:${id}"]`).click();
      await expect(map).toHaveAttribute('data-map-layer', 'district');
      await expect(map).toHaveAttribute('data-map-district', id);
      await expect(viewportMap).toHaveAttribute('data-map-depth', '0.000');
      await expect(page.locator('[data-map-back]')).toBeVisible();
      if (id !== 'campus') await expect(page.locator('[data-destination="library"]')).toHaveCount(0);
      await noOverflow(page);
      await page.screenshot({ path: `${out}/${size}-${id}.png` });
      const last = page.locator('.wm-destination').last();
      await last.scrollIntoViewIfNeeded(); await expect(last).toBeVisible();
      await page.locator('[data-map-back]').click();
      await expect(map).toHaveAttribute('data-map-layer', 'city');
    }
    expect((await counts(helper)).saves).toBe(mapSaves);

    // A district visit must return to the user's city camera, including pan.
    await page.getByRole('button', { name: '放大地图', exact: true }).click();
    await page.getByRole('button', { name: '向右旋转地图' }).click();
    const box = (await viewportMap.boundingBox())!;
    await page.mouse.move(box.x + box.width * .45, box.y + box.height * .75);
    await page.mouse.down(); await page.mouse.move(box.x + box.width * .45 + 18, box.y + box.height * .75 - 15, { steps: 4 }); await page.mouse.up();
    const camera = await page.locator('.wm-stage').getAttribute('style');
    const scale = await viewportMap.getAttribute('data-map-scale');
    await page.locator('.wm-district-list button').filter({ hasText: '杂司谷' }).click();
    await expect(viewportMap).toHaveAttribute('data-map-depth', '0.000');
    await page.getByRole('button', { name: '向左旋转地图' }).click();
    await page.getByRole('button', { name: '缩小地图', exact: true }).click();
    await page.locator('[data-map-back]').click();
    await expect(viewportMap).toHaveAttribute('data-map-bearing', '30.000');
    await expect(viewportMap).toHaveAttribute('data-map-scale', scale!);
    await expect(page.locator('.wm-stage')).toHaveAttribute('style', camera!);
    await page.locator('.wm-layers button').filter({ hasText: '所在区域' }).click();
    await expect(map).toHaveAttribute('data-map-layer', 'province');
    await page.locator('.wm-layers button').filter({ hasText: '世界' }).click();
    await expect(map).toHaveAttribute('data-map-layer', 'world');
    await page.locator('.wm-layers button').filter({ hasText: '城市' }).click();
    await expect(map).toHaveAttribute('data-map-layer', 'city');
    expect(errors).toEqual([]);
    writeFileSync(`${out}/${size}.json`, JSON.stringify({ viewport, elapsed, switchSaves: 1, districtIds: ['campus', 'home', 'commercial', 'downtown', 'city-park'], cameraRestored: true, overflow: false, errors }, null, 2));
  });
}

test('skip, Escape, reduced motion and save failure release the input lock', async ({ page }) => {
  const { helper, errors } = await mountSwitchHost(page);
  const before = await counts(helper);
  await page.locator('[data-protagonist-select]').selectOption('sakiko');
  await page.locator('[data-switch-skip]').click();
  await expect(overlay(page)).toHaveCount(0);
  await expect(shell(page)).toHaveAttribute('data-current-protagonist', 'sakiko');
  await page.locator('[data-protagonist-select]').selectOption('emma');
  await page.keyboard.press('Escape');
  await expect(overlay(page)).toHaveCount(0);
  await expect(shell(page)).toHaveAttribute('data-current-protagonist', 'emma');
  expect((await counts(helper)).switchSaves).toBe(before.switchSaves + 2);
  await failSave(helper, true);
  await page.locator('[data-protagonist-select]').selectOption('soyo');
  await page.locator('[data-switch-skip]').click();
  await expect(overlay(page)).toHaveCount(0);
  await expect(shell(page)).toHaveAttribute('data-current-protagonist', 'emma');
  await expect(page.locator('.notice')).toContainText('保存失败');
  await expect(page.locator('[data-protagonist-select]')).toBeEnabled();
  await failSave(helper, false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const started = Date.now();
  await page.locator('[data-protagonist-select]').selectOption('soyo');
  await expect(overlay(page)).toHaveCount(0);
  expect(Date.now() - started).toBeLessThan(1500);
  await expect(shell(page)).toHaveAttribute('data-current-protagonist', 'soyo');
  expect((await counts(helper)).switchSaves).toBe(before.switchSaves + 3);
  expect(errors).toEqual([]);
});

test('old generation is cancelled at ascent and its late reply cannot save', async ({ page }) => {
  const { helper, errors } = await mountSwitchHost(page);
  const before = await counts(helper);
  await page.locator('textarea').fill('看看周围。');
  await page.locator('button[type="submit"]').click();
  await expect.poll(async () => (await counts(helper)).generations).toBe(1);
  await page.locator('[data-protagonist-select]').selectOption('emma');
  await expect(overlay(page)).toHaveAttribute('data-switch-phase', 'ascent');
  expect((await counts(helper)).cancellations).toBeGreaterThan(before.cancellations);
  await resolveGeneration(helper);
  await page.locator('[data-switch-skip]').click();
  await expect(overlay(page)).toHaveCount(0);
  expect((await counts(helper)).switchSaves).toBe(before.switchSaves + 1);
  expect(JSON.stringify(await readState(helper))).not.toContain('迟到旧回复');
  expect(errors).toEqual([]);
});

for (const cancel of ['exit', 'chat', 'hidden'] as const) {
  test(`${cancel} during ascent cancels without saving and permits reentry`, async ({ page }) => {
    const { helper, errors } = await mountSwitchHost(page);
    const before = await counts(helper);
    await page.locator('[data-protagonist-select]').selectOption('emma');
    if (cancel === 'exit') await page.getByRole('button', { name: '切换动画中恢复酒馆' }).click();
    else if (cancel === 'chat') await changeChat(page, helper);
    else await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await expect(overlay(page)).toHaveCount(0);
    expect((await counts(helper)).switchSaves).toBe(before.switchSaves);
    if (cancel === 'hidden') await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    else { await expect(shell(page)).toHaveCount(0); await page.locator('#fixture-reenter').click(); }
    await expect(page.locator('[data-protagonist-select]')).toBeEnabled();
    await expect(shell(page)).toHaveAttribute('data-current-protagonist', 'soyo');
    expect(errors).toEqual([]);
  });
}

for (const { fallback, viewport } of [
  ...viewports.map(viewport => ({ fallback: false, viewport })),
  { fallback: true, viewport: { width: 390, height: 844 } },
]) {
  const size = `${viewport.width}x${viewport.height}`;
  test(`${fallback ? 'fallback' : 'WebGL'} ${size} outdoor to indoor and back preserves world poses`, async ({ page }) => {
    const state = switchState(), room = getCampusInterior('toyokawa-house')!;
    const target = personState(state, 'sakiko');
    target.locationId = room.id;
    target.scene = { ...target.scene!, x: room.entrance.x, z: room.entrance.z };
    target.interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
    await page.setViewportSize(viewport);
    const { helper, errors } = await mountSwitchHost(page, { mode: 'scene', state, fallback });
    await expect(page.locator('[data-unread-city-scene]')).toHaveAttribute('data-renderer', fallback ? 'fallback' : 'webgl');
    const before = await readState(helper);
    await page.locator('[data-protagonist-select]').selectOption('sakiko');
    await expect(overlay(page)).toHaveAttribute('data-switch-progress', /0\.[4-8]/);
    if (!fallback) expect(Number(await page.locator('[data-unread-city-scene]').getAttribute('data-switch-camera-height'))).toBeGreaterThan(40);
    await page.screenshot({ path: `${out}/${size}-${fallback ? 'fallback' : 'webgl'}-ascent.png` });
    await expect(overlay(page)).toHaveAttribute('data-switch-phase', 'traverse');
    await page.screenshot({ path: `${out}/${size}-${fallback ? 'fallback' : 'webgl'}-bridge.png` });
    await expect(overlay(page)).toHaveCount(0);
    await expect(shell(page)).toHaveAttribute('data-current-protagonist', 'sakiko');
    expect((await readState(helper)).unread_city.interior).toEqual(target.interior);
    await page.screenshot({ path: `${out}/${size}-${fallback ? 'fallback' : 'webgl'}-indoor.png` });
    await page.locator('[data-protagonist-select]').selectOption('soyo');
    await expect(overlay(page)).toHaveAttribute('data-switch-phase', 'descent');
    if (!fallback) expect(Number(await page.locator('[data-unread-city-scene]').getAttribute('data-switch-camera-height'))).toBeGreaterThan(40);
    await page.screenshot({ path: `${out}/${size}-${fallback ? 'fallback' : 'webgl'}-descent.png` });
    await expect(overlay(page)).toHaveCount(0);
    const after = (await readState(helper)).unread_city;
    expect(after.scene).toEqual(before.unread_city.scene);
    expect(after.clock).toEqual(before.unread_city.clock);
    await expect(page.locator('[data-unread-city-scene]')).toHaveAttribute('data-renderer', fallback ? 'fallback' : 'webgl');
    await expect(page.locator('[data-unread-city-scene]')).toHaveAttribute('data-switch-camera-height', '');
    await noOverflow(page);
    expect(errors).toEqual([]);
  });
}
