import { createSelectedInitialState } from './academics-fixture';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getRouteOutlook, reduceState } from '../../src/runtime/model';
import { getTransitRoutes, transitStops, transitVehicles } from '../../src/runtime/transit';
import type { WorldState } from '../../src/frontend/types';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');
const storageKey = 'unread-city-transit-e2e';
const shellRoot = (page: Page) => page.locator('[data-unread-city-root]');
const scene = (page: Page) => page.locator('[data-unread-city-scene]');
const panel = (page: Page) => page.locator('[data-transit-panel]');

/** Simulated helper variables survive an actual browser reload; no paid model connection is used. */
async function withTransitHost(page: Page, initial?: WorldState) {
  await page.goto('/');
  if (await shellRoot(page).count()) await page.locator('[data-unread-city-rescue]').click();
  await page.evaluate(({ initial, storageKey }) => {
    (window as Window & { __unreadCityShell?: { dispose(): void } }).__unreadCityShell?.dispose();
    const host = window as unknown as Record<string, unknown>;
    host.SillyTavern = { getContext: () => ({ characterId: 0, groupId: null, chatId: 'transit-test', mainApi: 'openai', characters: [{ avatar: 'transit-test.png' }] }) };
    if (initial) localStorage.setItem(storageKey, JSON.stringify(initial));
    const iframe = document.createElement('iframe'); iframe.id = 'transit-helper'; iframe.hidden = true;
    iframe.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(iframe);
  }, { initial, storageKey });
  const frame = await (await page.locator('#transit-helper').elementHandle())!.contentFrame();
  await frame!.waitForLoadState();
  await frame!.evaluate(({ storageKey }) => {
    const host = window as unknown as Record<string, unknown>;
    const body = window.parent.document.body;
    const saved = JSON.parse(localStorage.getItem(storageKey)!);
    let variables: Record<string, unknown> = { keep_me: 42, unread_city: saved };
    body.dataset.transitState = JSON.stringify(saved);
    host.tavern_events = { CHAT_CHANGED: 'chat_id_changed' };
    host.getVariables = () => variables;
    host.replaceVariables = (next: Record<string, unknown>) => {
      variables = next; body.dataset.transitState = JSON.stringify(next.unread_city);
      localStorage.setItem(storageKey, JSON.stringify(next.unread_city));
      body.dataset.transitOtherVariable = String(next.keep_me);
    };
    host.eventOn = () => {}; host.eventRemoveListener = () => {};
    host.getButtonEvent = (name: string) => `button:${name}`;
    host.generate = async (config: { user_input?: string }) => {
      body.dataset.transitGenerations = String(Number(body.dataset.transitGenerations || '0') + 1);
      body.dataset.transitPrompt = config.user_input ?? '';
      return JSON.stringify({ story: '你已下车，眼前的街道与站牌在午后的光线里安静展开。', phone_messages: [] });
    };
    host.stopGenerationById = () => true;
  }, { storageKey });
  await frame!.addScriptTag({ content: bundle });
  await expect(shellRoot(page)).toBeVisible();
  await expect(scene(page)).toHaveAttribute('data-renderer', 'webgl');
}

async function savedState(page: Page): Promise<WorldState> {
  return JSON.parse((await page.locator('body').getAttribute('data-transit-state'))!) as WorldState;
}
function initialAtStop(stopId = 'campus'): WorldState {
  const stop = transitStops.find(stop => stop.id === stopId)!;
  const state = reduceState(createSelectedInitialState(), { type: 'walk', x: stop.x, z: stop.z, yaw: stop.yaw, seed: 'transit-browser-seed' });
  state.clock = { day: 1, hour: 13, minute: 20 };
  state.airTraffic.nextAmbientAt = Date.now() + 3600000;
  return state;
}
const elapsed = (before: WorldState, after: WorldState) => (after.clock.day - before.clock.day) * 1440 + (after.clock.hour - before.clock.hour) * 60 + after.clock.minute - before.clock.minute;
async function explore(page: Page) {
  const button = page.getByRole('button', { name: '自由行走', exact: true });
  if (await button.isVisible()) await button.click();
}
async function openTransit(page: Page) {
  await page.locator('[data-transit-entry]').click();
  await expect(panel(page)).toBeVisible();
}
async function checkGroundModels(page: Page, stopId: string) {
  await expect(scene(page)).toHaveAttribute('data-ground-vehicles', 'ready', { timeout: 20000 });
  await expect(scene(page)).toHaveAttribute('data-vehicle-count', '3');
  await expect(scene(page)).toHaveAttribute('data-active-vehicle-ids', 'btr82a,zbd04a,t84');
  await expect(scene(page)).toHaveAttribute('data-vehicle-stop', stopId === 'campus' ? 'bus-stop' : stopId);
}
async function checkScenePose(page: Page, state: WorldState) {
  await expect.poll(async () => {
    const pose = (await scene(page).getAttribute('data-position'))!.split(',').map(Number);
    const heading = Number((await scene(page).getAttribute('data-view'))!.split(',')[0]);
    return { x: pose[0], z: pose[2], yaw: heading };
  }).toEqual({ x: state.scene!.x, z: state.scene!.z, yaw: state.scene!.yaw });
}
function noOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
}

for (const vehicle of transitVehicles) {
  for (const route of getTransitRoutes('campus')) {
    test(`公交乘车：${vehicle.label} 到 ${route.stop.id} 仅结算一程，保留草稿并在整页刷新后恢复`, async ({ page }) => {
      if (vehicle.id === 'btr82a' && route.stop.id === 'home') await page.setViewportSize({ width: 1100, height: 800 });
      const initial = initialAtStop();
      await withTransitHost(page, initial);
      const draft = '这句话先保留，等到站后再考虑聊天。';
      await page.getByLabel('接下来，你想做什么？').fill(draft);
      await explore(page);
      await checkGroundModels(page, 'campus');
      await checkScenePose(page, initial);
      if (vehicle.id === 'btr82a' && route.stop.id === 'home') await page.screenshot({ path: 'outputs/transit-campus-scene-e2e.png' });
      await openTransit(page);
      await expect(panel(page).locator('[data-transit-target]')).toHaveCount(3);
      expect(await savedState(page)).toEqual(initial);
      await panel(page).locator(`[data-transit-vehicle="${vehicle.id}"]`).click();
      await expect(panel(page).locator(`[data-transit-vehicle="${vehicle.id}"]`)).toHaveAttribute('aria-pressed', 'true');
      const target = panel(page).locator(`[data-transit-target="${route.stop.id}"]`);
      await expect(target).toContainText(vehicle.label);
      await expect(target).toContainText(`${route.minutes} 分钟`);
      await expect(target).toContainText(`¥${route.fare}`);
      await target.click();
      await expect(panel(page)).toHaveCount(0);
      await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
      const arrived = await savedState(page);
      expect(arrived.transit).toMatchObject({ sequence: 1, lastRide: { id: 'transit-ride-1', vehicleId: vehicle.id, fromStopId: 'campus', toStopId: route.stop.id, minutes: route.minutes, fare: route.fare } });
      expect(elapsed(initial, arrived)).toBe(route.minutes);
      expect(arrived.player).toEqual({ ...initial.player, balance: initial.player.balance - route.fare });
      expect(arrived.locationId).toBe(route.stop.locationId);
      expect(arrived.scene).toMatchObject({ x: route.stop.x, z: route.stop.z, yaw: route.stop.yaw, areaId: route.stop.locationId, seed: initial.scene!.seed, encounterId: null });
      expect(arrived.journal).toHaveLength(initial.journal.length + 1);
      expect({ ...arrived, clock: initial.clock, player: initial.player, scene: initial.scene, locationId: initial.locationId, journal: initial.journal, transit: initial.transit }).toEqual(initial);
      const receipt = page.locator('[data-local-activity-receipt]');
      await expect(receipt).toHaveRole('status');
      await expect(receipt).toContainText(vehicle.label);
      await expect(receipt).toContainText(route.stop.label);
      await expect(receipt).toContainText(`${route.minutes} 分钟`);
      await expect(receipt).toContainText(`车费 ¥${route.fare}`);
      await expect(receipt).toContainText(`余额 ¥${arrived.player.balance.toFixed(2)}`);
      await expect(page.locator('body')).not.toHaveAttribute('data-transit-generations');
      await checkScenePose(page, arrived);
      await checkGroundModels(page, route.stop.id);
      if (vehicle.id === 'btr82a' && route.stop.id === 'home') await page.screenshot({ path: 'outputs/transit-home-scene-e2e.png' });
      await page.getByRole('button', { name: '继续阅读', exact: true }).click();
      await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(draft);
      await page.getByRole('button', { name: '状态', exact: true }).click();
      await expect(page.getByRole('article', { name: '公交出行' })).toContainText('已乘坐 1 次');
      await expect(page.getByRole('article', { name: '公交出行' })).toContainText(vehicle.label);
      expect(await savedState(page)).toEqual(arrived);
      await page.getByRole('button', { name: '地图', exact: true }).click();
      await expect(page.locator('.wm-destination')).toHaveCount(12);
      expect(await savedState(page)).toEqual(arrived);
      await page.reload(); await withTransitHost(page);
      expect(await savedState(page)).toEqual(arrived);
      await checkScenePose(page, arrived);
      await expect(page.locator('body')).not.toHaveAttribute('data-transit-generations');
    });
  }
}

test('公交乘车：远离站牌时先步行到站，再单独结算车程，远地可搭另一车型返程', async ({ page }) => {
  const initial = createSelectedInitialState(); initial.airTraffic.nextAmbientAt = Date.now() + 3600000;
  await withTransitHost(page, initial);
  await expect(page.locator('[data-transit-entry]')).toHaveCount(0);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  await expect(page.locator('.wm-destination')).toHaveCount(12);
  await page.locator('[data-transit-open]').click();
  await expect(panel(page).locator('[data-transit-target]')).toHaveCount(0);
  await expect(panel(page).locator('[data-transit-approach]')).toBeEnabled();
  expect(await savedState(page)).toEqual(initial);
  const approachMinutes = 15 + getRouteOutlook(initial, 'bus-stop').extraMinutes;
  await expect(panel(page).locator('[data-transit-approach]')).toContainText(`${approachMinutes} 分钟`);
  await panel(page).locator('[data-transit-approach]').click();
  await expect(panel(page).locator('[data-transit-target]')).toHaveCount(3);
  const atStop = await savedState(page);
  expect(atStop.locationId).toBe('bus-stop');
  expect(atStop.scene).toBeNull();
  expect(elapsed(initial, atStop)).toBe(approachMinutes);
  expect(atStop.player).toEqual({ ...initial.player, energy: initial.player.energy - 5 });
  expect(atStop.transit).toEqual(initial.transit);
  expect(atStop.journal).toHaveLength(initial.journal.length + 1);
  await panel(page).locator('[data-transit-target="commercial"]').click();
  const outward = await savedState(page);
  expect(elapsed(atStop, outward)).toBe(25);
  expect(outward.player).toEqual({ ...atStop.player, balance: atStop.player.balance - 3 });
  expect(outward.scene).toMatchObject({ x: 180, z: 150, areaId: 'commercial' });
  expect(outward.transit.lastRide).toMatchObject({ fromStopId: 'campus', toStopId: 'commercial', vehicleId: 'btr82a' });
  await openTransit(page);
  await expect(panel(page).locator('[data-transit-target]')).toHaveCount(1);
  await panel(page).locator('[data-transit-vehicle="zbd04a"]').click();
  await panel(page).locator('[data-transit-target="campus"]').click();
  const returned = await savedState(page);
  expect(returned.transit).toMatchObject({ sequence: 2, lastRide: { fromStopId: 'commercial', toStopId: 'campus', vehicleId: 'zbd04a' } });
  expect(elapsed(outward, returned)).toBe(25);
  expect(returned.player).toEqual({ ...outward.player, balance: outward.player.balance - 3 });
  expect(returned.scene).toMatchObject({ x: 46, z: 38, yaw: 3.141, areaId: 'bus-stop' });
  await checkScenePose(page, returned);
  await page.reload(); await withTransitHost(page);
  expect(await savedState(page)).toEqual(returned);
  await expect(page.locator('body')).not.toHaveAttribute('data-transit-generations');
});

test('公交乘车：余额不足禁用路线，选择车型、取消窗口、查看状态均不收费', async ({ page }) => {
  const initial = initialAtStop(); initial.player.balance = 2;
  await withTransitHost(page, initial); await explore(page); await openTransit(page);
  for (const button of await panel(page).locator('[data-transit-target]').all()) {
    await expect(button).toBeDisabled(); await expect(button).toContainText('余额不足');
  }
  await panel(page).locator('[data-transit-vehicle="zbd04a"]').click();
  expect(await savedState(page)).toEqual(initial);
  await page.getByRole('button', { name: '关闭公交站窗口', exact: true }).click();
  await page.getByRole('button', { name: '状态', exact: true }).click();
  await expect(page.getByRole('article', { name: '公交出行' })).toContainText('已乘坐 0 次');
  expect(await savedState(page)).toEqual(initial);
  await page.reload(); await withTransitHost(page);
  expect(await savedState(page)).toEqual(initial);
  await expect(page.locator('body')).not.toHaveAttribute('data-transit-generations');
});

test('公交乘车：远郊连接道路只提示走回远站，不提供校园低价传送', async ({ page }) => {
  const initial = reduceState(initialAtStop('home'), { type: 'walk', x: 120, z: 100, yaw: 0, seed: 'ignored' });
  await withTransitHost(page, initial);
  await expect(page.locator('[data-transit-entry]')).toHaveCount(0);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  await expect(page.locator('.wm-destination')).toHaveCount(12);
  for (const button of await page.locator('.wm-destination').all()) await expect(button).toBeDisabled();
  await page.locator('[data-transit-open]').click();
  await expect(panel(page).locator('[data-transit-approach]')).toHaveCount(0);
  await expect(panel(page).locator('[data-transit-target]')).toHaveCount(0);
  await expect(panel(page)).toContainText('请走回');
  expect(await savedState(page)).toEqual(initial);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
  test(`公交乘车：${viewport.width}px 车型和路线按钮可触控，取消不结算`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const initial = initialAtStop();
    await withTransitHost(page, initial); await explore(page);
    await page.getByRole('button', { name: '地图', exact: true }).click();
    const entry = page.locator('[data-window="map"] .window-heading [data-transit-open]');
    await expect(entry).toBeInViewport({ ratio: 1 });
    const entryBox = (await entry.boundingBox())!;
    expect(entryBox.width).toBeGreaterThanOrEqual(44); expect(entryBox.height).toBeGreaterThanOrEqual(44);
    const closeBox = (await page.getByRole('button', { name: '关闭地图窗口', exact: true }).boundingBox())!;
    expect(noOverlap(entryBox, closeBox)).toBe(true);
    expect(await savedState(page)).toEqual(initial);
    await entry.click();
    await expect(panel(page)).toBeVisible();
    const controls = [...await panel(page).locator('[data-transit-vehicle]').all(), ...await panel(page).locator('[data-transit-target]').all()];
    const boxes = [];
    for (const control of controls) {
      // Centre the control in the scrollable panel; nearest scrolling may leave a fractional border clipped.
      await control.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
      await expect(control).toBeInViewport({ ratio: 1 });
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      const parentBox = (await panel(page).boundingBox())!;
      boxes.push({ ...box, x: box.x - parentBox.x, y: box.y - parentBox.y });
    }
    for (let index = 0; index < boxes.length; index++) for (let other = index + 1; other < boxes.length; other++) expect(noOverlap(boxes[index], boxes[other])).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `outputs/transit-picker-${viewport.width}-e2e.png` });
    await page.getByRole('button', { name: '关闭公交站窗口', exact: true }).click();
    expect(await savedState(page)).toEqual(initial);
  });
}

test('公交乘车：到站可步行，主动对话携带已结算车程而不重扣时间票价', async ({ page }) => {
  const initial = initialAtStop();
  await withTransitHost(page, initial); await explore(page); await openTransit(page);
  await panel(page).locator('[data-transit-vehicle="zbd04a"]').click();
  await panel(page).locator('[data-transit-target="city-park"]').click();
  const arrived = await savedState(page);
  await checkGroundModels(page, 'city-park');
  await scene(page).getByLabel('可交互三维场景', { exact: true }).focus();
  await page.keyboard.down('d'); await page.waitForTimeout(220); await page.keyboard.up('d');
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  const walked = await savedState(page);
  expect(walked.scene!.x).toBeGreaterThan(arrived.scene!.x);
  expect(walked.scene!.z).toBeCloseTo(arrived.scene!.z, 2);
  for (const key of ['clock', 'player', 'transit', 'journal'] as const) expect(walked[key]).toEqual(arrived[key]);
  await page.getByLabel('接下来，你想做什么？').fill('下车后看看公园四周。');
  await page.getByRole('button', { name: /继续故事/ }).click();
  await expect(page.getByRole('log', { name: '故事记录' })).toContainText('你已下车');
  const prompt = (await page.locator('body').getAttribute('data-transit-prompt'))!;
  const summary = JSON.parse(prompt.split('\n')[1]);
  expect(summary.location).toBe('city-park');
  expect(summary.scene).toMatchObject({ areaId: 'city-park', outdoors: true, position: { x: walked.scene!.x, z: walked.scene!.z } });
  expect(summary.transit.lastRide).toMatchObject({ vehicleId: 'zbd04a', fromStopId: 'campus', toStopId: 'city-park', minutes: 35, fare: 4, alreadyCommitted: true });
  const after = await savedState(page);
  for (const key of ['clock', 'player', 'scene', 'transit', 'journal'] as const) expect(after[key]).toEqual(walked[key]);
  expect(after.story).toHaveLength(initial.story.length + 2);
  await expect(page.locator('body')).toHaveAttribute('data-transit-generations', '1');
  await page.reload(); await withTransitHost(page);
  expect(await savedState(page)).toEqual(after);
});

test('公交车辆：稍远的街道观察点能展示三种真实模型，截图不推进存档', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const initial = reduceState(initialAtStop(), { type: 'walk', x: 95, z: 78, yaw: -0.65, seed: 'ignored' });
  await withTransitHost(page, initial); await explore(page);
  await checkGroundModels(page, 'campus');
  await checkScenePose(page, initial);
  await page.screenshot({ path: 'outputs/transit-three-models-panorama-e2e.png' });
  expect(await savedState(page)).toEqual(initial);
  await expect(page.locator('body')).not.toHaveAttribute('data-transit-generations');
});
