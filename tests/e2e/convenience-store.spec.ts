import { createSelectedInitialState, completeAcademicSetup } from './academics-fixture';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { reduceState } from '../../src/runtime/model';
import type { WorldState } from '../../src/frontend/types';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');
const storageKey = 'unread-city-store-e2e';
const statsKey = `${storageKey}-calls`;
const root = (page: Page) => page.locator('[data-unread-city-root]');
const store = (page: Page) => page.locator('[data-convenience-store]');
const product = (page: Page, id: string) => store(page).locator(`[data-product-id="${id}"]`);
const inventory = (page: Page, id: string) => page.locator(`[data-inventory-product="${id}"]`);
const composer = (page: Page) => page.getByRole('textbox', { name: '接下来，你想做什么？' });
const saved = async (page: Page): Promise<WorldState> => JSON.parse((await page.locator('body').getAttribute('data-store-state'))!);
const calls = async (page: Page): Promise<{ saves: number; generations: number }> => JSON.parse((await page.locator('body').getAttribute('data-store-calls'))!);
const owned = (state: WorldState, itemId: string) => state.inventory.find(item => item.itemId === itemId)?.quantity ?? 0;
const absoluteMinutes = (state: WorldState) => state.clock.day * 1440 + state.clock.hour * 60 + state.clock.minute;
const clamp = (value: number) => Math.min(100, Math.max(0, value));

function initialState(atStore = false) {
  let state = createSelectedInitialState();
  if (atStore) state = reduceState(state, { type: 'novel_travel', locationId: 'convenience' });
  state.player = { energy: 30, balance: 200, morale: 70, health: 90, stress: 60, satiety: 25, foodEnergy: 500 };
  state.airTraffic.nextAmbientAt = Date.now() + 3600000;
  return state;
}

async function host(page: Page, initial?: unknown) {
  await page.goto('/');
  if (await root(page).count()) await page.locator('[data-unread-city-rescue]').click();
  await page.evaluate(({ initial, storageKey, statsKey }) => {
    const win = window as unknown as Record<string, unknown>;
    win.SillyTavern = { getContext: () => ({ characterId: 0, groupId: null, chatId: 'store-test', mainApi: 'openai', characters: [{ avatar: 'store-test.png' }] }) };
    if (initial !== undefined) {
      localStorage.setItem(storageKey, JSON.stringify(initial));
      localStorage.setItem(statsKey, JSON.stringify({ saves: 0, generations: 0 }));
      localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
    }
    const frame = document.createElement('iframe'); frame.id = 'store-helper'; frame.hidden = true;
    frame.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(frame);
    // The real phone is independently covered by embedded-phone.spec.ts.
    win.STiPhoniePanelHost = { mount() { return { release() {}, sync() {}, focus() {} }; } };
  }, { initial, storageKey, statsKey });
  const frame = await (await page.locator('#store-helper').elementHandle())!.contentFrame();
  await frame!.waitForLoadState();
  await frame!.evaluate(({ storageKey, statsKey }) => {
    const win = window as unknown as Record<string, unknown>, body = window.parent.document.body;
    let variables: Record<string, unknown> = { keep_me: 42, unread_city: JSON.parse(localStorage.getItem(storageKey)!) };
    const counters = JSON.parse(localStorage.getItem(statsKey)!);
    const record = () => { body.dataset.storeCalls = JSON.stringify(counters); localStorage.setItem(statsKey, JSON.stringify(counters)); };
    body.dataset.storeState = JSON.stringify(variables.unread_city); record();
    win.tavern_events = { CHAT_CHANGED: 'chat_id_changed' }; win.eventOn = () => {}; win.eventRemoveListener = () => {};
    win.getButtonEvent = (name: string) => `button:${name}`;
    win.getVariables = () => variables;
    win.replaceVariables = (next: Record<string, unknown>) => {
      if (body.dataset.failStoreSave === 'true') throw new Error('模拟便利店保存失败');
      variables = next; body.dataset.storeState = JSON.stringify(next.unread_city);
      localStorage.setItem(storageKey, JSON.stringify(next.unread_city)); counters.saves++; record();
    };
    win.generate = async () => { counters.generations++; record(); throw new Error('购物与背包操作不应调用模型'); };
    win.stopGenerationById = () => true;
  }, { storageKey, statsKey });
  await frame!.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-presentation-mode', 'novel');
}

async function closeWindow(page: Page) {
  const window = page.locator('[data-window]');
  if (await window.count()) await window.getByRole('button', { name: /^关闭.*窗口$/ }).click();
  await expect(window).toHaveCount(0);
}

async function openStore(page: Page) {
  await closeWindow(page);
  await page.locator('[data-place-store]').click();
  await expect(store(page)).toBeVisible();
}

async function travel(page: Page, name: string, locationId: string) {
  await closeWindow(page);
  await page.getByRole('button', { name: '打开地图切换地点', exact: true }).click();
  await page.locator(`.wm-destination[data-destination="${locationId}"]`).click();
  await expect(page.locator('[data-window=map]')).toHaveCount(0);
  await expect.poll(async () => (await saved(page)).locationId).toBe(locationId);
}

async function reachable(control: Locator) {
  await control.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const hit = await control.evaluate(element => {
    const bounds = element.getBoundingClientRect(), surface = element.getRootNode() as Document | ShadowRoot;
    const target = surface.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    return { reachable: !!target && element.contains(target), left: bounds.left, right: bounds.right, width: innerWidth };
  });
  expect(hit.reachable).toBe(true);
  expect(hit.left).toBeGreaterThanOrEqual(0);
  expect(hit.right).toBeLessThanOrEqual(hit.width + .5);
}

async function buy(page: Page, id: string, price: number, units: number) {
  const before = await saved(page), beforeCalls = await calls(page);
  const button = product(page, id).getByRole('button', { name: /^购买/ });
  await reachable(button); await button.click();
  await expect(store(page).locator('[data-purchase-receipt]')).toBeVisible();
  const after = await saved(page);
  expect(after.player).toEqual({ ...before.player, balance: before.player.balance - price });
  expect(after.clock).toEqual(before.clock);
  expect(owned(after, id)).toBe(owned(before, id) + units);
  expect(after.story).toEqual(before.story); expect(after.phone).toEqual(before.phone);
  expect(after.journal).toHaveLength(before.journal.length + 1);
  expect((await calls(page)).saves).toBe(beforeCalls.saves + 1);
  expect((await calls(page)).generations).toBe(0);
  return after;
}

async function use(page: Page, id: 'cigarette-standard' | 'meal-standard') {
  const before = await saved(page), beforeCalls = await calls(page);
  const button = inventory(page, id).getByRole('button', { name: /^使用/ });
  await reachable(button); await button.click();
  await expect(page.locator('[data-use-receipt]')).toBeVisible();
  const after = await saved(page), smoke = id === 'cigarette-standard';
  // Independent expectations for the two fixed catalog entries, including timed nutrition.
  const minutes = smoke ? 5 : 15, kcal = smoke ? 0 : 650;
  const hunger = Math.floor((absoluteMinutes(before) + minutes) / 15) - Math.floor(absoluteMinutes(before) / 15);
  expect(absoluteMinutes(after) - absoluteMinutes(before)).toBe(minutes);
  expect(after.player).toEqual({ ...before.player,
    energy: Math.min(10000, Math.round(before.player.energy * 100) + (smoke ? 3500 : 3000)) / 100,
    stress: clamp(before.player.stress - (smoke ? 30 : 6)),
    health: clamp(before.player.health + (smoke ? -6 : 2)),
    satiety: clamp(Math.max(0, before.player.satiety - hunger) + (smoke ? 0 : 45)),
    foodEnergy: Math.min(3000, Math.max(0, before.player.foodEnergy - minutes * 2) + kcal),
  });
  expect(owned(after, id)).toBe(owned(before, id) - 1);
  expect(after.story).toEqual(before.story); expect(after.phone).toEqual(before.phone);
  expect(after.journal).toHaveLength(before.journal.length + 1);
  expect((await calls(page)).saves).toBe(beforeCalls.saves + 1);
  expect((await calls(page)).generations).toBe(0);
  return after;
}

for (const viewport of [{ label: 'desktop', width: 1280, height: 900 }, { label: '390', width: 390, height: 844 }, { label: '320', width: 320, height: 568 }]) {
  test(`${viewport.label}便利店购买入包与使用独立结算，状态和草稿保持`, async ({ page }) => {
    test.setTimeout(90000); await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await host(page, initialState(viewport.label !== 'desktop'));
    const draft = '先买点东西，这段草稿还没有发送。'; await composer(page).fill(draft);
    if (viewport.label === 'desktop') await travel(page, '便利店门前', 'convenience');
    const arrived = await saved(page);
    await openStore(page);
    await store(page).locator('[data-store-category=cigarette]').click();
    await expect(store(page).locator('[data-product-id]')).toHaveCount(3);
    for (const tier of ['basic', 'standard', 'premium']) await expect(product(page, `cigarette-${tier}`)).toHaveCount(1);
    const standard = product(page, 'cigarette-standard');
    await expect(standard).toContainText('标准款'); await expect(standard).toContainText('¥50.00');
    await expect(standard).toContainText('20 支'); await expect(standard).toContainText('健康 −6');
    if (viewport.label === 'desktop') {
      const beforeCalls = await calls(page);
      await page.locator('body').evaluate(body => { body.dataset.failStoreSave = 'true'; });
      await standard.getByRole('button', { name: /^购买/ }).click();
      await expect(page.locator('.uc-shell')).toContainText('模拟便利店保存失败');
      expect(await saved(page)).toEqual(arrived); expect(await calls(page)).toEqual(beforeCalls);
      await expect(store(page).locator('[data-purchase-receipt]')).toHaveCount(0);
      await page.locator('body').evaluate(body => { delete body.dataset.failStoreSave; });
    }
    await buy(page, 'cigarette-standard', 50, 20);
    await standard.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `outputs/store-${viewport.label}-shelf.png` });
    if (viewport.label === 'desktop') {
      const before = await saved(page), beforeCalls = await calls(page);
      await page.locator('body').evaluate(body => { body.dataset.failStoreSave = 'true'; });
      await inventory(page, 'cigarette-standard').getByRole('button', { name: /^使用/ }).click();
      expect(await saved(page)).toEqual(before); expect(await calls(page)).toEqual(beforeCalls);
      await expect(page.locator('[data-use-receipt]')).toHaveCount(0);
      await page.locator('body').evaluate(body => { delete body.dataset.failStoreSave; });
    }
    await use(page, 'cigarette-standard');
    await expect(inventory(page, 'cigarette-standard').locator('[data-inventory-quantity]')).toHaveText('19 支');
    await page.screenshot({ path: `outputs/store-${viewport.label}-inventory.png` });
    await store(page).locator('[data-store-category=meal]').click();
    await expect(product(page, 'meal-standard')).toContainText('650 kcal');
    await buy(page, 'meal-standard', 18, 1);
    await use(page, 'meal-standard');
    await expect(inventory(page, 'meal-standard')).toHaveCount(0);
    await closeWindow(page); await expect(composer(page)).toHaveValue(draft);
    await page.getByRole('button', { name: '状态', exact: true }).click();
    const complete = await saved(page);
    for (const key of ['energy', 'health', 'stress', 'satiety', 'foodEnergy'] as const) {
      await expect(page.locator(`[data-player-stat="${key}"]`)).toHaveText(new RegExp(`^${complete.player[key]}\\s*(?:/\\s*100|kcal)$`));
    }
    await expect(page.locator('[data-window=status]')).toContainText('食物能量储备');
    await expect(page.locator('[data-window=status] [data-status-open-inventory]')).toBeVisible();
    expect(await page.locator('[data-window=status]').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.locator('[data-player-stat=energy]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `outputs/store-${viewport.label}-status.png` });
    if (viewport.label === 'desktop') {
      await travel(page, '校园南门', 'gate');
      await expect(page.getByRole('button', { name: '逛便利店', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: '状态', exact: true }).click();
      await expect(page.locator('[data-window=status]').locator('[data-open-store]')).toHaveCount(0);
      await page.locator('[data-status-open-inventory]').click();
      await use(page, 'cigarette-standard');
      const finished = await saved(page), beforeReloadCalls = await calls(page);
      await closeWindow(page); await expect(composer(page)).toHaveValue(draft);
      await host(page);
      expect(await saved(page)).toEqual(finished);
      // Mount may write an identical hydration snapshot; only state changes would repeat settlement.
      expect((await calls(page)).generations).toBe(beforeReloadCalls.generations);
      await page.getByRole('button', { name: '背包', exact: true }).click();
      await expect(inventory(page, 'cigarette-standard').locator('[data-inventory-quantity]')).toHaveText('18 支');
    } else {
      await closeWindow(page); await expect(composer(page)).toHaveValue(draft);
    }
    expect((await calls(page)).generations).toBe(0); expect(errors).toEqual([]);
    writeFileSync(`outputs/store-${viewport.label}-state.json`, JSON.stringify({ viewport, state: await saved(page), calls: await calls(page), errors }, null, 2));
  });
}

test('旧1.6存档迁移补充状态，零余额禁买且刷新不重复结算', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 1280, height: 900 });
  const current = initialState(true), { inventory: ignoredInventory, academics: ignoredAcademics, ...existing } = current;
  const legacy = { ...existing, schema_version: '1.6.0', player: { energy: 40, balance: 0 } };
  await host(page, legacy); await completeAcademicSetup(page); await openStore(page);
  const before = await saved(page), beforeCalls = await calls(page);
  for (const category of ['meal', 'snack', 'drink', 'cigarette']) {
    await store(page).locator(`[data-store-category="${category}"]`).click();
    await expect(store(page).locator('[data-product-id]')).toHaveCount(3);
    for (const button of await store(page).getByRole('button', { name: /^购买/ }).all()) await expect(button).toBeDisabled();
  }
  expect(await saved(page)).toEqual(before); expect(await calls(page)).toEqual(beforeCalls);
  await closeWindow(page); await page.getByRole('button', { name: '状态', exact: true }).click();
  for (const [key, value] of Object.entries({ health: 90, stress: 25, satiety: 70, foodEnergy: 1200 })) {
    await expect(page.locator(`[data-player-stat="${key}"]`)).toHaveText(new RegExp(`^${value}\\s*(?:/\\s*100|kcal)$`));
  }
  await page.locator('[data-status-open-inventory]').click();
  await expect(page.locator('[data-inventory-panel]')).toContainText('背包还是空的');
  await closeWindow(page); await page.getByRole('button', { name: '状态', exact: true }).click();
  await page.getByRole('button', { name: /休息 15 分钟/ }).click();
  const migrated = await saved(page);
  expect(migrated.schema_version).toBe('1.10.0'); expect(migrated.inventory).toEqual([]);
  expect(migrated.player).toEqual({ energy: 42, balance: 0, morale: 71, health: 90, stress: 24, satiety: 69, foodEnergy: 1170 });
  expect(migrated.story).toEqual(legacy.story); expect(migrated.phone).toEqual(legacy.phone); expect(migrated.contacts).toEqual(legacy.contacts);
  const afterCalls = await calls(page); expect(afterCalls.saves).toBe(beforeCalls.saves + 1);
  await host(page); expect(await saved(page)).toEqual(migrated);
  expect((await calls(page)).generations).toBe(afterCalls.generations);
  expect((await calls(page)).generations).toBe(0);
  writeFileSync('outputs/store-migration-state.json', JSON.stringify({ fromVersion: '1.6.0', toVersion: migrated.schema_version, state: migrated, calls: await calls(page) }, null, 2));
});

const imageCategories = ['meal', 'snack', 'drink', 'cigarette'] as const;
async function productImage(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  await image.evaluate(async (node: HTMLImageElement) => {
    await node.decode();
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const detail = await image.evaluate((node: HTMLImageElement) => {
    const box = node.getBoundingClientRect(), parent = node.parentElement!.getBoundingClientRect();
    const style = getComputedStyle(node);
    return { src: node.currentSrc, width: node.naturalWidth, height: node.naturalHeight,
      contain: style.objectFit, left: box.left, right: box.right, viewport: innerWidth,
      insideParent: box.left >= parent.left - .5 && box.right <= parent.right + .5,
      boxWidth: box.width, boxHeight: box.height };
  });
  expect(detail.src).toMatch(/^data:image\/webp;base64,/);
  expect(detail.contain).toBe('contain'); expect(detail.insideParent).toBe(true);
  expect(detail.left).toBeGreaterThanOrEqual(0); expect(detail.right).toBeLessThanOrEqual(detail.viewport + .5);
  expect(detail.boxWidth).toBeGreaterThan(40); expect(detail.boxHeight).toBeGreaterThan(50);
  return createHash('sha256').update(detail.src).digest('hex');
}

for (const viewport of [{ label: 'desktop', width: 1280, height: 900 }, { label: '390', width: 390, height: 844 }, { label: '320', width: 320, height: 568 }]) {
  test(`novel-energy ${viewport.label} 十二商品图完整显示、精力小数结算与库存图片保持`, async ({ page }) => {
    test.setTimeout(90000); await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const fixture = initialState(viewport.label !== 'desktop');
    fixture.player = { ...fixture.player, energy: 10, morale: 70, health: 50, stress: 50, satiety: 50 };
    await host(page, fixture);
    const draft = '商品图片和购物不会发送这段草稿。'; await composer(page).fill(draft);
    if (viewport.label === 'desktop') {
      await page.getByRole('button', { name: '打开地图切换地点', exact: true }).click();
      await expect(page.locator('[data-novel-energy-rule]').first()).toContainText('50% 为中性线');
      const destination = page.locator('[data-destination="convenience"]');
      await expect(destination.locator('[data-novel-energy-quote]')).toHaveText('5 × 0.1 × 状态倍率 1 ≈ 0.5 点精力');
      await expect(destination).toContainText('精力 −0.5');
      await destination.scrollIntoViewIfNeeded();
      await page.screenshot({ path: 'outputs/novel-energy-desktop-map.png' });
      const beforeTravel = await calls(page);
      await destination.click(); await expect(page.locator('[data-window=map]')).toHaveCount(0);
      expect((await saved(page)).locationId).toBe('convenience');
      expect((await saved(page)).player.energy).toBe(9.5);
      expect((await calls(page)).saves).toBe(beforeTravel.saves + 1);
    }
    await openStore(page);
    await expect(page.locator('[data-store-player-stat=morale]')).toHaveText(/^70\s*\/\s*100$/);
    const hashes: Record<string, string> = {};
    for (const category of imageCategories) {
      await store(page).locator(`[data-store-category="${category}"]`).click();
      await expect(store(page).locator('[data-product-id]')).toHaveCount(3);
      for (const tier of ['basic', 'standard', 'premium']) {
        const id = `${category}-${tier}`, image = product(page, id).locator(`[data-product-image="${id}"]`);
        await image.evaluate(node => node.scrollIntoView({ block: 'center' }));
        hashes[id] = await productImage(image);
        await reachable(product(page, id).getByRole('button', { name: /^购买/ }));
      }
      await product(page, `${category}-standard`).locator('img').evaluate(node => node.scrollIntoView({ block: 'center' }));
      await page.screenshot({ path: `outputs/novel-energy-${viewport.label}-${category}.png` });
    }
    expect(new Set(Object.values(hashes)).size).toBe(12);
    await buy(page, 'cigarette-standard', 50, 20);
    await expect(inventory(page, 'cigarette-standard')).toBeVisible();
    expect(await productImage(inventory(page, 'cigarette-standard').locator('img'))).toBe(hashes['cigarette-standard']);
    await use(page, 'cigarette-standard');
    await store(page).locator('[data-store-category=meal]').click();
    await buy(page, 'meal-standard', 18, 1);
    expect(await productImage(inventory(page, 'meal-standard').locator('img'))).toBe(hashes['meal-standard']);
    await inventory(page, 'meal-standard').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `outputs/novel-energy-${viewport.label}-inventory.png` });
    await use(page, 'meal-standard');
    const completed = await saved(page);
    expect(completed.player.energy).toBe(viewport.label === 'desktop' ? 74.5 : 75);
    expect(completed.player.morale).toBe(70);
    await closeWindow(page); await expect(composer(page)).toHaveValue(draft);
    await page.getByRole('button', { name: '状态', exact: true }).click();
    await expect(page.locator('[data-player-stat=energy]')).toHaveText(new RegExp(`^${completed.player.energy}\\s*/\\s*100$`));
    await expect(page.locator('[data-player-stat=morale]')).toHaveText(/^70\s*\/\s*100$/);
    await page.locator('[data-player-stat=morale]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `outputs/novel-energy-${viewport.label}-status.png` });
    await closeWindow(page); await host(page); expect(await saved(page)).toEqual(completed);
    expect((await calls(page)).generations).toBe(0); expect(errors).toEqual([]);
    writeFileSync(`outputs/novel-energy-${viewport.label}-state.json`, JSON.stringify({ viewport, imageHashes: hashes, state: completed, calls: await calls(page), errors }, null, 2));
  });
}

async function activity(page: Page, name: RegExp) {
  const menu = page.locator('[data-place-actions]');
  await expect(menu).toBeVisible();
  return menu.getByRole('button', { name });
}

test('novel-energy 320 低精力可出行，免费观察、日程公交、休息与学习正确结算', async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 320, height: 568 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const fixture = initialState(); fixture.player = { ...fixture.player, energy: .01, morale: 40, health: 50, stress: 50, satiety: 50 };
  await host(page, fixture);
  await page.getByRole('button', { name: '打开地图切换地点', exact: true }).click();
  const classroom = page.locator('[data-destination=classroom]');
  await expect(classroom).toBeEnabled(); await expect(classroom).toContainText('精力不足仍可前往，实际扣除 0.01');
  await classroom.click(); await expect(page.locator('[data-window=map]')).toHaveCount(0);
  expect((await saved(page)).locationId).toBe('classroom'); expect((await saved(page)).player.energy).toBe(0);
  const beforeObserve = await saved(page);
  await (await activity(page, /^查看黑板/)).click();
  expect((await saved(page)).player).toEqual(beforeObserve.player); expect((await saved(page)).clock).toEqual(beforeObserve.clock);
  const draft = '低精力出行和休息学习不额外请求故事。'; await composer(page).fill(draft);
  await (await activity(page, /^温习笔记/)).click();
  await page.locator('[data-study-subject]').selectOption('cs-programming');
  const studyPicker = page.locator('[data-study-picker]');
  for (const option of await studyPicker.locator('[data-study-option]').all()) await expect(option).toBeDisabled();
  await expect(studyPicker).toContainText('精神'); await expect(studyPicker).toContainText('压力');
  expect(await studyPicker.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'outputs/novel-energy-320-study-insufficient.png' });
  await studyPicker.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '日程', exact: true }).click();
  await page.locator('[data-schedule-destination=library]').click();
  await expect(page.locator('[data-window]')).toHaveCount(0);
  expect((await saved(page)).locationId).toBe('library'); expect((await saved(page)).player.energy).toBe(0);
  await page.getByRole('button', { name: '打开地图切换地点', exact: true }).click();
  await page.locator('[data-transit-open]').click();
  await expect(page.locator('[data-transit-approach]')).toBeEnabled();
  await page.locator('[data-transit-approach]').click();
  expect((await saved(page)).locationId).toBe('bus-stop'); expect((await saved(page)).player.energy).toBe(0);
  await travel(page, '学生宿舍', 'dorm-room');
  await expect(await activity(page, /^整理书桌/)).toBeDisabled();
  await (await activity(page, /^床边休息/)).click();
  const restPicker = page.locator('[data-bed-rest-picker]');
  await expect(restPicker).toContainText('精神'); await expect(restPicker).toContainText('压力');
  expect(await restPicker.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  for (const option of await restPicker.locator('[data-rest-option]').all()) { await expect(option).toBeEnabled(); await reachable(option); }
  await restPicker.locator('[data-rest-option=dorm-rest-medium]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'outputs/novel-energy-320-rest-picker.png' });
  const beforeRest = await saved(page);
  await restPicker.locator('[data-rest-option=dorm-rest-medium]').click();
  const rested = await saved(page), restMinutes = absoluteMinutes(rested) - absoluteMinutes(beforeRest);
  expect(restMinutes).toBeGreaterThanOrEqual(60); expect(restMinutes).toBeLessThanOrEqual(120);
  expect(rested.player.energy).toBe(Math.floor(restMinutes * .4));
  expect(rested.player.morale).toBe(clamp(beforeRest.player.morale + Math.floor(restMinutes / 15) * 2));
  expect(rested.player.stress).toBe(clamp(beforeRest.player.stress - Math.floor(restMinutes / 15) * 2));
  await expect(page.locator('[data-room-activity-receipt]')).toContainText('精神');
  await (await activity(page, /^整理书桌/)).click();
  const organized = await saved(page);
  expect(organized.player.energy).toBe(rested.player.energy - 3);
  expect(organized.player.morale).toBe(clamp(rested.player.morale + 3));
  expect(organized.player.stress).toBe(clamp(rested.player.stress - 4));
  await expect(page.locator('[data-room-activity-receipt]')).toContainText('压力');
  await travel(page, '教学楼教室', 'classroom');
  await (await activity(page, /^温习笔记/)).click();
  await page.locator('[data-study-subject]').selectOption('cs-programming');
  await expect(studyPicker.locator('[data-study-option=study-short]')).toBeEnabled();
  await reachable(studyPicker.locator('[data-study-option=study-short]'));
  await page.screenshot({ path: 'outputs/novel-energy-320-study-picker.png' });
  const beforeStudy = await saved(page);
  await studyPicker.locator('[data-study-option=study-short]').click();
  const studied = await saved(page), studyMinutes = absoluteMinutes(studied) - absoluteMinutes(beforeStudy);
  expect(studyMinutes).toBeGreaterThanOrEqual(15); expect(studyMinutes).toBeLessThanOrEqual(30);
  expect(studied.player.energy).toBe((Math.round(beforeStudy.player.energy * 100) - Math.ceil(studyMinutes / 6) * 100) / 100);
  expect(studied.player.morale).toBe(clamp(beforeStudy.player.morale - Math.ceil(studyMinutes / 15)));
  expect(studied.player.stress).toBe(clamp(beforeStudy.player.stress + Math.ceil(studyMinutes / 30)));
  await expect(page.locator('[data-room-activity-receipt]')).toContainText('精神');
  await expect(composer(page)).toHaveValue(draft);
  await page.screenshot({ path: 'outputs/novel-energy-320-activity-receipt.png' });
  await host(page); expect(await saved(page)).toEqual(studied);
  expect((await calls(page)).generations).toBe(0); expect(errors).toEqual([]);
  writeFileSync('outputs/novel-energy-320-activity-state.json', JSON.stringify({ state: studied, restMinutes, studyMinutes, calls: await calls(page), errors }, null, 2));
});
