import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSelectedInitialState } from './academics-fixture';
import { reduceState } from '../../src/runtime/model';
import type { WorldState } from '../../src/frontend/types';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url));
const bundleSha256 = createHash('sha256').update(bundle).digest('hex');
const bundleUrl = 'http://127.0.0.1:5178/__location_services_final_bundle__.js';
const storageKey = 'unread-city-location-services-e2e', callsKey = `${storageKey}-calls`;
const root = (page: Page) => page.locator('[data-unread-city-root]');
const panel = (page: Page) => page.locator('[data-location-services]');
const service = (page: Page, id: string) => panel(page).locator(`[data-use-location-service="${id}"]`);
const composer = (page: Page) => page.getByRole('textbox', { name: '接下来，你想做什么？' });
const saved = async (page: Page): Promise<WorldState> => JSON.parse((await page.locator('body').getAttribute('data-location-state'))!);
const calls = async (page: Page): Promise<{ saves: number; generations: number }> => JSON.parse((await page.locator('body').getAttribute('data-location-calls'))!);
const minutes = (state: WorldState) => state.clock.day * 1440 + state.clock.hour * 60 + state.clock.minute;

function fresh(locationId = 'cafe', hour = 14, minute = 20) {
  const state = reduceState(createSelectedInitialState(), { type: 'novel_travel', locationId });
  state.clock = { day: 2, hour, minute };
  state.player = { energy: 30, balance: 200, morale: 70, health: 90, stress: 60, satiety: 25, foodEnergy: 500 };
  state.airTraffic.nextAmbientAt = Date.now() + 3600000;
  return state;
}

async function host(page: Page, initial?: WorldState) {
  // Serve the exact production IIFE as a bounded local fixture resource. There
  // is no native SillyTavern, remote service or real model connection here.
  await page.unroute(bundleUrl);
  await page.route(bundleUrl, route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: bundle,
    headers: { 'content-length': String(bundle.length), 'x-fixture-bundle-sha256': bundleSha256, 'cache-control': 'no-store' },
  }));
  await page.goto('/');
  if (await root(page).count()) await page.locator('[data-unread-city-rescue]').click();
  await page.evaluate(({ initial, storageKey, callsKey }) => {
    const win = window as unknown as Record<string, unknown>;
    win.SillyTavern = { getContext: () => ({ characterId: 0, groupId: null, chatId: 'location-services-test', mainApi: 'openai', characters: [{ avatar: 'location-services-test.png' }] }) };
    if (initial !== undefined) {
      localStorage.setItem(storageKey, JSON.stringify(initial));
      localStorage.setItem(callsKey, JSON.stringify({ saves: 0, generations: 0 }));
    }
    localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
    const frame = document.createElement('iframe'); frame.id = 'location-helper'; frame.hidden = true;
    frame.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(frame);
    win.STiPhoniePanelHost = { mount() { return { release() {}, sync() {}, focus() {} }; } };
  }, { initial, storageKey, callsKey });
  const frame = await (await page.locator('#location-helper').elementHandle())!.contentFrame();
  await frame!.waitForLoadState();
  await frame!.evaluate(({ storageKey, callsKey }) => {
    const win = window as unknown as Record<string, unknown>, body = window.parent.document.body;
    let variables: Record<string, unknown> = { keep_me: 42, unread_city: JSON.parse(localStorage.getItem(storageKey)!) };
    const counters = JSON.parse(localStorage.getItem(callsKey)!);
    const record = () => { body.dataset.locationCalls = JSON.stringify(counters); localStorage.setItem(callsKey, JSON.stringify(counters)); };
    body.dataset.locationState = JSON.stringify(variables.unread_city); record();
    win.tavern_events = { CHAT_CHANGED: 'chat_id_changed' }; win.eventOn = () => {}; win.eventRemoveListener = () => {};
    win.getButtonEvent = (name: string) => `button:${name}`; win.getVariables = () => variables;
    win.replaceVariables = (next: Record<string, unknown>) => {
      if (body.dataset.failLocationSave === 'true') throw new Error('模拟地点服务保存失败');
      if (next.keep_me !== 42) throw new Error('无关聊天变量被改动');
      variables = next; body.dataset.locationState = JSON.stringify(next.unread_city);
      localStorage.setItem(storageKey, JSON.stringify(next.unread_city)); counters.saves++; record();
    };
    win.generate = async () => { counters.generations++; record(); throw new Error('地点服务不应调用模型'); };
    win.stopGenerationById = () => true;
  }, { storageKey, callsKey });
  const responsePromise = page.waitForResponse(response => response.url() === bundleUrl);
  await frame!.addScriptTag({ url: bundleUrl });
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()['x-fixture-bundle-sha256']).toBe(bundleSha256);
  expect(response.headers()['content-length']).toBe(String(bundle.length));
  expect(await response.finished()).toBeNull();
  await expect(root(page)).toBeVisible();
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-presentation-mode', 'novel');
}

async function reachable(control: Locator) {
  await control.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const hit = await control.evaluate(node => {
    const box = node.getBoundingClientRect(), surface = node.getRootNode() as ShadowRoot;
    return { hit: node.contains(surface.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)),
      left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight };
  });
  expect(hit.hit).toBe(true); expect(hit.left).toBeGreaterThanOrEqual(0); expect(hit.right).toBeLessThanOrEqual(hit.width + .5);
  expect(hit.top).toBeGreaterThanOrEqual(0); expect(hit.bottom).toBeLessThanOrEqual(hit.height + .5);
}

async function closeWindow(page: Page) {
  const floating = page.locator('[data-window]');
  if (await floating.count()) await floating.getByRole('button', { name: /^关闭.*窗口$/ }).click();
  await expect(floating).toHaveCount(0);
}

async function fullHistory(page: Page) {
  await page.getByRole('button', { name: '全文回看', exact: true }).click();
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'expanded');
}

async function openServices(page: Page) {
  await closeWindow(page);
  const entry = page.locator('.tool-dock [data-location-entry]');
  await reachable(entry); await entry.click();
  await expect(panel(page)).toBeVisible();
}

async function serviceScreenshot(page: Page, path: string) {
  await page.locator('[data-window=location] .window-content').evaluate(node => { node.scrollTop = 0; });
  await expect(panel(page).locator('[data-location-hours]')).toBeInViewport();
  await page.screenshot({ path });
}

async function travel(page: Page, locationId: string) {
  await closeWindow(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const destination = page.locator(`.wm-destination[data-destination="${locationId}"]`);
  await reachable(destination); await destination.click();
  await expect(page.locator('[data-window=map]')).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).locationId).toBe(locationId);
}

async function drinkCoffee(page: Page) {
  const before = await saved(page), beforeCalls = await calls(page);
  const button = service(page, 'drink-coffee');
  await reachable(button); await button.click();
  await expect(panel(page).locator('[data-location-service-receipt]')).toBeVisible();
  const after = await saved(page);
  const hunger = Math.floor((minutes(before) + 10) / 15) - Math.floor(minutes(before) / 15);
  expect(minutes(after) - minutes(before)).toBe(10);
  expect(after.player).toEqual({ ...before.player, balance: before.player.balance - 16,
    energy: Math.min(10000, Math.round(before.player.energy * 100) + 1800) / 100, morale: Math.min(100, before.player.morale + 3),
    stress: Math.max(0, before.player.stress - 3), satiety: Math.max(0, before.player.satiety - hunger),
    foodEnergy: Math.min(3000, Math.max(0, before.player.foodEnergy - 20) + 10) });
  expect(after.journal).toHaveLength(before.journal.length + 1);
  expect(after.journal.at(-1)?.text).toContain('咖啡');
  expect(after.story).toEqual(before.story); expect(after.phone).toEqual(before.phone);
  expect(after.inventory).toEqual(before.inventory); expect(after.scene).toEqual(before.scene);
  expect(after.academics).toEqual(before.academics);
  expect(await calls(page)).toEqual({ saves: beforeCalls.saves + 1, generations: 0 });
  return after;
}

const viewports = [{ label: 'desktop', width: 1280, height: 900 }, { label: '390', width: 390, height: 844 }, { label: '320', width: 320, height: 568 }];
for (const viewport of viewports) {
  test(`${viewport.label} 全文阅读可直接使用咖啡店服务，原子保存并保持草稿与刷新结果`, async ({ page }) => {
    test.setTimeout(90000); await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await host(page, fresh());
    const draft = '喝杯咖啡吧，这段文字还没有发送。'; await composer(page).fill(draft);
    await fullHistory(page);
    await reachable(page.locator('.tool-dock [data-location-entry]'));
    await page.screenshot({ path: `outputs/location-services-${viewport.label}-reading.png` });
    await openServices(page);
    await expect(panel(page)).toContainText('08:00'); await expect(panel(page)).toContainText('22:00');
    await expect(service(page, 'drink-coffee')).toBeEnabled();
    if (viewport.label === 'desktop') {
      const before = await saved(page), beforeCalls = await calls(page);
      await page.locator('body').evaluate(body => { body.dataset.failLocationSave = 'true'; });
      await service(page, 'drink-coffee').click();
      await expect(page.locator('.uc-shell')).toContainText('模拟地点服务保存失败');
      expect(await saved(page)).toEqual(before); expect(await calls(page)).toEqual(beforeCalls);
      await expect(panel(page).locator('[data-location-service-receipt]')).toHaveCount(0);
      await page.locator('body').evaluate(body => { delete body.dataset.failLocationSave; });
    }
    const complete = await drinkCoffee(page);
    expect(await panel(page).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await serviceScreenshot(page, `outputs/location-services-${viewport.label}.png`);
    await closeWindow(page); await expect(composer(page)).toHaveValue(draft);
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'expanded');
    await host(page); expect(await saved(page)).toEqual(complete); expect((await calls(page)).generations).toBe(0);
    if (viewport.label === 'desktop') {
      await page.getByRole('button', { name: '3D 漫游', exact: true }).click();
      await expect(page.locator('.uc-shell')).toHaveAttribute('data-presentation-mode', 'scene');
      await page.getByRole('button', { name: '展开正文', exact: true }).click();
      await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'expanded');
      await openServices(page); await expect(service(page, 'drink-coffee')).toBeEnabled();
      await reachable(service(page, 'drink-coffee'));
      await serviceScreenshot(page, 'outputs/location-services-desktop-3d.png');
      const afterModeChange = await saved(page);
      expect(afterModeChange.player).toEqual(complete.player); expect(afterModeChange.clock).toEqual(complete.clock);
      expect(afterModeChange.story).toEqual(complete.story); expect(afterModeChange.phone).toEqual(complete.phone);
      expect((await calls(page)).generations).toBe(0);
    }
    expect(errors).toEqual([]);
    writeFileSync(`outputs/location-services-${viewport.label}-state.json`, JSON.stringify({ viewport, bundleSha256,
      state: await saved(page), calls: await calls(page), errors, controlledHost: true, realModelCalls: 0 }, null, 2));
  });
}

test('午夜校园咖啡店明确打烊，地图展示时间并可前往营业至次日两点的街边咖啡馆', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 390, height: 844 });
  await host(page, fresh('cafe', 0, 20)); await fullHistory(page); await openServices(page);
  await expect(panel(page)).toContainText(/休息|打烊|未营业/);
  await expect(panel(page)).toContainText('08:00'); await expect(panel(page)).toContainText('22:00');
  await expect(service(page, 'drink-coffee')).toBeDisabled();
  await closeWindow(page); await page.getByRole('button', { name: '地图', exact: true }).click();
  const campus = page.locator('[data-destination="cafe"]'), street = page.locator('[data-destination="street-cafe"]');
  await expect(campus).toContainText('08:00'); await expect(campus).toContainText('22:00');
  await expect(street).toContainText('10:00'); await expect(street).toContainText('02:00');
  await reachable(street); await page.screenshot({ path: 'outputs/location-services-midnight-map.png' });
  await street.click(); await expect(page.locator('[data-window=map]')).toHaveCount(0);
  expect((await saved(page)).locationId).toBe('street-cafe');
  await openServices(page); await expect(service(page, 'drink-coffee')).toBeEnabled();
  await drinkCoffee(page); await serviceScreenshot(page, 'outputs/location-services-midnight-coffee.png');
  expect((await calls(page)).generations).toBe(0);
  writeFileSync('outputs/location-services-midnight-state.json', JSON.stringify({ bundleSha256, state: await saved(page), calls: await calls(page) }, null, 2));
});

test('零精力运动受限但公园休憩可结算，便利店和书店保留各自功能入口', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 320, height: 568 });
  const initial = fresh('sports'); initial.player.energy = 0;
  await host(page, initial); await openServices(page);
  await expect(service(page, 'jog')).toBeDisabled(); await expect(panel(page)).toContainText('精力');
  await travel(page, 'pocket-park'); await openServices(page);
  await expect(service(page, 'park-rest')).toBeEnabled();
  const before = await saved(page), beforeCalls = await calls(page);
  await reachable(service(page, 'park-rest')); await service(page, 'park-rest').click();
  await expect(panel(page).locator('[data-location-service-receipt]')).toBeVisible();
  const rested = await saved(page);
  expect(minutes(rested) - minutes(before)).toBe(20); expect(rested.player.energy).toBe(6);
  expect(rested.player.balance).toBe(before.player.balance); expect(rested.journal).toHaveLength(before.journal.length + 1);
  expect(await calls(page)).toEqual({ saves: beforeCalls.saves + 1, generations: 0 });
  await page.screenshot({ path: 'outputs/location-services-zero-energy.png' });
  await travel(page, 'convenience'); await openServices(page);
  await panel(page).locator('[data-location-store]').click();
  await expect(page.locator('[data-convenience-store]')).toBeVisible();
  await travel(page, 'bookshop'); await openServices(page);
  await panel(page).locator('[data-location-books]').click();
  await expect(page.locator('[data-study-picker]')).toBeVisible();
  await expect(page.locator('[data-study-subject]')).toBeVisible();
  expect((await calls(page)).generations).toBe(0);
  writeFileSync('outputs/location-services-activities-state.json', JSON.stringify({ bundleSha256, state: await saved(page), calls: await calls(page) }, null, 2));
});
