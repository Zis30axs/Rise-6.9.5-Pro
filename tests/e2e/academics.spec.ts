import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { academicMajors } from '../../src/runtime/academics';
import { createInitialState, reduceState } from '../../src/runtime/model';
import type { WorldState } from '../../src/frontend/types';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url));
const bundleSha256 = createHash('sha256').update(bundle).digest('hex');
const bundleUrl = 'http://127.0.0.1:5178/__academic_fixture_final_bundle__.js';
const storageKey = 'unread-city-academics-e2e', callsKey = `${storageKey}-calls`;
const setup = (page: Page) => page.locator('[data-academic-setup]');
const composer = (page: Page) => page.getByRole('textbox', { name: '接下来，你想做什么？' });
const saved = async (page: Page): Promise<WorldState> => JSON.parse((await page.locator('body').getAttribute('data-academic-state'))!);
const calls = async (page: Page): Promise<{ saves: number; generations: number }> => JSON.parse((await page.locator('body').getAttribute('data-academic-calls'))!);
const minutes = (state: WorldState) => state.clock.day * 1440 + state.clock.hour * 60 + state.clock.minute;
function fresh() { const state = createInitialState(); state.player.energy = 100; state.airTraffic.nextAmbientAt = Date.now() + 3600000; return state; }

async function host(page: Page, initial?: unknown) {
  // Load the same IIFE as a script resource instead of sending 58 MB as executable
  // DevTools text on every refresh. This exact local path has no external fallback.
  await page.unroute(bundleUrl);
  await page.route(bundleUrl, route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: bundle,
    headers: { 'content-length': String(bundle.length), 'x-fixture-bundle-sha256': bundleSha256, 'cache-control': 'no-store' },
  }));
  await page.goto('/');
  if (await page.locator('[data-unread-city-root]').count()) await page.locator('[data-unread-city-rescue]').click();
  await page.evaluate(({ initial, storageKey, callsKey }) => {
    const win = window as unknown as Record<string, unknown>;
    win.SillyTavern = { getContext: () => ({ characterId: 0, groupId: null, chatId: 'academics-test', mainApi: 'openai', characters: [{ avatar: 'academics-test.png' }] }) };
    if (initial !== undefined) { localStorage.setItem(storageKey, JSON.stringify(initial)); localStorage.setItem(callsKey, JSON.stringify({ saves: 0, generations: 0 })); }
    localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
    const frame = document.createElement('iframe'); frame.id = 'academic-helper'; frame.hidden = true; frame.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(frame);
    win.STiPhoniePanelHost = { mount() { return { release() {}, sync() {}, focus() {} }; } };
  }, { initial, storageKey, callsKey });
  const frame = await (await page.locator('#academic-helper').elementHandle())!.contentFrame();
  await frame!.waitForLoadState();
  await frame!.evaluate(({ storageKey, callsKey }) => {
    const win = window as unknown as Record<string, unknown>, body = window.parent.document.body;
    let variables: Record<string, unknown> = { keep_me: 42, unread_city: JSON.parse(localStorage.getItem(storageKey)!) };
    const counters = JSON.parse(localStorage.getItem(callsKey)!);
    const record = () => { body.dataset.academicCalls = JSON.stringify(counters); localStorage.setItem(callsKey, JSON.stringify(counters)); };
    body.dataset.academicState = JSON.stringify(variables.unread_city); record();
    win.tavern_events = { CHAT_CHANGED: 'chat_id_changed' }; win.eventOn = () => {}; win.eventRemoveListener = () => {}; win.getButtonEvent = (name: string) => `button:${name}`;
    win.getVariables = () => variables;
    win.replaceVariables = (next: Record<string, unknown>) => {
      if (body.dataset.failAcademicSave === 'true') throw new Error('模拟学业选择保存失败');
      variables = next; body.dataset.academicState = JSON.stringify(next.unread_city); localStorage.setItem(storageKey, JSON.stringify(next.unread_city)); counters.saves++; record();
    };
    win.generate = async () => { counters.generations++; record(); throw new Error('学业选择和学习不应调用模型'); };
    win.stopGenerationById = () => true;
  }, { storageKey, callsKey });
  const responsePromise = page.waitForResponse(response => response.url() === bundleUrl);
  await frame!.addScriptTag({ url: bundleUrl });
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()['x-fixture-bundle-sha256']).toBe(bundleSha256);
  expect(response.headers()['content-length']).toBe(String(bundle.length));
  expect(await response.finished()).toBeNull();
  await expect(page.locator('[data-unread-city-root]')).toBeVisible();
}

async function reachable(control: Locator) {
  await control.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const hit = await control.evaluate(node => {
    const bounds = node.getBoundingClientRect(), surface = node.getRootNode() as ShadowRoot;
    return { hit: node.contains(surface.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)), left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: innerWidth, height: innerHeight };
  });
  expect(hit.hit).toBe(true); expect(hit.left).toBeGreaterThanOrEqual(0); expect(hit.right).toBeLessThanOrEqual(hit.width + .5);
  expect(hit.top).toBeGreaterThanOrEqual(0); expect(hit.bottom).toBeLessThanOrEqual(hit.height + .5);
}
async function clearOfRescue(page: Page, control: Locator) {
  const box = (await control.boundingBox())!, rescue = (await page.locator('[data-unread-city-rescue]').boundingBox())!;
  expect(box.x + box.width <= rescue.x || box.x >= rescue.x + rescue.width || box.y + box.height <= rescue.y || box.y >= rescue.y + rescue.height).toBe(true);
}
async function closeWindow(page: Page) {
  const window = page.locator('[data-window]');
  if (await window.count()) await window.getByRole('button', { name: /^关闭.*窗口$/ }).click();
}
async function choose(page: Page, majorIndex: number) {
  const major = academicMajors[majorIndex];
  await setup(page).locator(`[data-academic-major="${major.id}"]`).click();
  await expect(setup(page).locator('[data-academic-preview-subject]')).toHaveCount(3);
  for (const subject of major.subjects) {
    const card = setup(page).locator(`[data-academic-preview-subject="${subject.id}"]`);
    await expect(card).toContainText(subject.stageGoals[0]);
    await expect(card).toContainText(subject.stageGoals[2]);
  }
  await expect(setup(page).locator('[data-academic-lesson]')).toHaveCount(6);
  for (const subject of major.subjects) await expect(setup(page).locator(`[data-academic-lesson-subject="${subject.id}"]`)).toHaveCount(2);
  return major;
}
async function travel(page: Page, destination: string) {
  await closeWindow(page);
  await page.getByRole('button', { name: '打开地图切换地点', exact: true }).click();
  await page.locator(`[data-destination="${destination}"]`).click();
  expect((await saved(page)).locationId).toBe(destination);
}
async function openStudy(page: Page, activity = /^温习笔记/) {
  const menu = page.locator('[data-place-actions]');
  await expect(menu).toBeVisible();
  const control = menu.getByRole('button', { name: activity });
  if (page.viewportSize()?.width === 320) {
    await page.screenshot({ path: 'outputs/academic-curriculum-320-activities.png' });
  }
  await reachable(control);
  await control.click({ timeout: 10000 });
  await expect(page.locator('[data-study-picker]')).toBeVisible();
}
async function randomAction(page: Page, sample: number, action: () => Promise<unknown>) {
  const frame = await (await page.locator('#academic-helper').elementHandle())!.contentFrame();
  await frame!.evaluate(value => {
    const win = window as Window & { academicOriginalRandom?: () => number };
    win.academicOriginalRandom = Math.random; Math.random = () => value;
  }, sample);
  try { await action(); } finally {
    await frame!.evaluate(() => {
      const win = window as Window & { academicOriginalRandom?: () => number };
      Math.random = win.academicOriginalRandom!; delete win.academicOriginalRandom;
    });
  }
}
function points(state: WorldState, subjectId: string) { return state.academics!.subjects.find(item => item.subjectId === subjectId)?.points ?? 0; }
async function showStatus(page: Page) { await closeWindow(page); await page.getByRole('button', { name: '状态', exact: true }).click(); }
async function subjectProgress(page: Page, subjectId: string, expected: number) {
  const card = page.locator(`[data-academic-progress] [data-academic-subject="${subjectId}"]`);
  await expect(card.locator('[data-academic-points]')).toHaveText(String(expected));
  expect(await card.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  return card;
}
async function commitShort(page: Page, subjectId: string, sample: number) {
  await page.locator('[data-study-subject]').selectOption(subjectId);
  const before = await saved(page), beforeCalls = await calls(page);
  await randomAction(page, sample, () => page.locator('[data-study-option=study-short]').click());
  await expect(page.locator('[data-study-picker]')).toHaveCount(0);
  const after = await saved(page), gain = after.academics!.lastGain!;
  expect(gain.minutes).toBe(minutes(after) - minutes(before));
  expect(gain.totalPoints).toBe(points(after, subjectId));
  expect(points(after, subjectId)).toBe(points(before, subjectId) + gain.points);
  expect((await calls(page)).saves).toBe(beforeCalls.saves + 1);
  return { before, after, gain };
}
function evidence(label: string, state: WorldState, counters: { saves: number; generations: number }, errors: string[]) {
  expect(counters.generations).toBe(0); expect(errors).toEqual([]);
  writeFileSync(`outputs/academic-curriculum-${label}-state.json`, JSON.stringify({ state, calls: counters, errors, bundle: { bytes: bundle.length, sha256: bundleSha256 } }, null, 2));
}

test('academic curriculum desktop 专业三科独立成长与六节周课表', async ({ page }) => {
  test.setTimeout(150000); await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await host(page, fresh()); await expect(setup(page)).toBeVisible();
  const initial = await saved(page), initialCalls = await calls(page);
  await expect(setup(page).locator('[data-academic-major]')).toHaveCount(8);
  await expect(setup(page).locator('[aria-pressed=true]')).toHaveCount(0);
  await expect(setup(page).locator('[data-academic-confirm]')).toBeDisabled();
  await expect(setup(page).locator('[data-academic-major]').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(setup(page).getByRole('button', { name: '退出酒馆' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(setup(page).locator('[data-academic-major]').first()).toBeFocused();
  const other = await choose(page, 1), major = await choose(page, 0);
  await expect(setup(page).locator(`[data-academic-preview-subject="${other.subjects[0].id}"]`)).toHaveCount(0);
  await expect(setup(page).locator('[data-academic-confirm]')).toBeEnabled();
  expect(await saved(page)).toEqual(initial); expect(await calls(page)).toEqual(initialCalls);
  await reachable(setup(page).locator('[data-academic-confirm]')); await clearOfRescue(page, setup(page).locator('[data-academic-confirm]'));
  await page.screenshot({ path: 'outputs/academic-curriculum-desktop-setup.png' });
  await setup(page).locator('[data-academic-confirm]').click(); await expect(setup(page)).toHaveCount(0);
  const selected = await saved(page);
  expect(selected.academics).toEqual({ majorId: major.id, subjects: major.subjects.map(subject => ({ subjectId: subject.id, points: 0 })), lastGain: null });
  for (const field of ['player', 'clock', 'inventory', 'story', 'phone', 'schedule'] as const) expect(selected[field]).toEqual(initial[field]);
  expect((await calls(page)).saves).toBe(initialCalls.saves + 1);
  const draft = '这段课程草稿暂时保留。'; await composer(page).fill(draft);
  await page.getByRole('button', { name: '日程', exact: true }).click();
  const table = page.locator('[data-academic-timetable]');
  await expect(table.locator('[data-academic-lesson]')).toHaveCount(1);
  await expect(table).toContainText('周一');
  await table.locator('[data-academic-timetable-view=week]').click();
  await expect(table.locator('[data-academic-lesson]')).toHaveCount(6);
  for (const subject of major.subjects) await expect(table.locator(`[data-academic-lesson-subject="${subject.id}"]`)).toHaveCount(2);
  expect((await saved(page)).clock).toEqual(selected.clock); expect((await saved(page)).academics).toEqual(selected.academics); expect((await saved(page)).schedule).toEqual(initial.schedule);
  await page.screenshot({ path: 'outputs/academic-curriculum-desktop-timetable.png' });
  await table.locator('[data-academic-course-travel=classroom]').first().click();
  expect((await saved(page)).locationId).toBe('classroom');
  const expected = [15, 18, 0];
  for (let index = 0; index < 2; index++) {
    await openStudy(page);
    await expect(page.locator('[data-study-subject]')).toHaveValue('');
    await expect(page.locator('[data-study-subject] option[value]:not([value=""])')).toHaveCount(3);
    await expect(page.locator('[data-study-option=study-short]')).toBeDisabled();
    const result = await commitShort(page, major.subjects[index].id, index === 0 ? 0 : .2);
    expect(result.gain).toMatchObject({ minutes: expected[index], points: expected[index], outcome: 'normal', channel: 'classroom', interactionId: 'classroom-notes' });
    for (let prior = 0; prior <= index; prior++) expect(points(result.after, major.subjects[prior].id)).toBe(expected[prior]);
    expect(points(result.after, major.subjects[2].id)).toBe(0);
  }
  const studied = await saved(page); await expect(composer(page)).toHaveValue(draft);
  await showStatus(page);
  await expect(page.locator('[data-academic-total-points]')).toHaveText('33');
  for (let index = 0; index < 3; index++) {
    const card = await subjectProgress(page, major.subjects[index].id, expected[index]);
    await expect(card.locator('[data-academic-goal]')).toHaveText(major.subjects[index].stageGoals[0]);
  }
  await page.screenshot({ path: 'outputs/academic-curriculum-desktop-progress.png' });
  await host(page); await expect(setup(page)).toHaveCount(0); expect(await saved(page)).toEqual(studied);
  await expect(page.locator('[data-room-activity-receipt]')).toContainText(major.subjects[1].name);
  evidence('desktop', await saved(page), await calls(page), errors);
});

test('academic curriculum 320 跨专业图书馆灵感与书店困惑按次保存', async ({ page }) => {
  test.setTimeout(150000); await page.setViewportSize({ width: 320, height: 568 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await host(page, fresh());
  const major = await choose(page, 0), external = academicMajors[5].subjects[0];
  await clearOfRescue(page, setup(page).locator('[data-academic-confirm]'));
  await page.screenshot({ path: 'outputs/academic-curriculum-320-setup.png' });
  await setup(page).locator('[data-academic-confirm]').click();
  await travel(page, 'study-room'); await openStudy(page, /^选书阅读/);
  await expect(page.locator('[data-study-subject] option[value]:not([value=""])')).toHaveCount(24);
  await page.locator('[data-study-subject]').selectOption(external.id);
  await expect(page.locator('[data-study-goal]')).toContainText(external.stageGoals[0]);
  const outcomes = page.locator('[data-cross-outcomes]');
  await expect(outcomes).toContainText('25% 灵感'); await expect(outcomes).toContainText('25% 困惑'); await expect(outcomes).toContainText('50% 普通');
  await expect(outcomes).toContainText('额外精力 −3');
  await reachable(page.locator('[data-study-subject]'));
  await reachable(page.locator('[data-study-picker]').getByRole('button', { name: '取消', exact: true }));
  await clearOfRescue(page, page.locator('[data-study-picker]').getByRole('button', { name: '取消', exact: true }));
  await outcomes.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'outputs/academic-curriculum-320-cross-quote.png' });
  const inspired = await commitShort(page, external.id, .13);
  expect(inspired.gain).toMatchObject({ minutes: 17, points: 25.5, totalPoints: 25.5, outcome: 'inspiration', channel: 'study-room', interactionId: 'study-reading', energyConsumed: 3, moraleChange: 1, stressChange: -1 });
  expect(inspired.after.player.energy).toBe(Number((inspired.before.player.energy - 3).toFixed(2)));
  expect(inspired.after.player.morale).toBe(inspired.before.player.morale + 1); expect(inspired.after.player.stress).toBe(inspired.before.player.stress - 1);
  for (const subject of major.subjects) expect(points(inspired.after, subject.id)).toBe(0);
  await travel(page, 'bookshop'); await page.locator('[data-book-reading-entry]').click();
  await expect(page.locator('[data-study-subject] option[value]:not([value=""])')).toHaveCount(24);
  const confused = await commitShort(page, external.id, .3);
  expect(confused.gain).toMatchObject({ minutes: 19, points: 9.5, totalPoints: 35, outcome: 'confusion', channel: 'bookshop', interactionId: null, energyConsumed: 7, moraleChange: -6, stressChange: 6 });
  expect(confused.after.player.energy).toBe(Number((confused.before.player.energy - 7).toFixed(2)));
  expect(confused.after.player.morale).toBe(confused.before.player.morale - 6); expect(confused.after.player.stress).toBe(confused.before.player.stress + 6);
  await expect(page.locator('[data-local-activity-receipt]')).toContainText('理解受挫');
  await page.screenshot({ path: 'outputs/academic-curriculum-320-reading-receipt.png' });
  await showStatus(page); const externalCard = await subjectProgress(page, external.id, 35);
  await expect(page.locator('[data-academic-group=major] [data-academic-subject]')).toHaveCount(3);
  await expect(page.locator('[data-academic-group=explored] [data-academic-subject]')).toHaveCount(1);
  await externalCard.scrollIntoViewIfNeeded(); await page.screenshot({ path: 'outputs/academic-curriculum-320-external-progress.png' });
  await page.locator('[data-academic-last-gain]').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'outputs/academic-curriculum-320-random-result.png' });
  await host(page); expect(await saved(page)).toEqual(confused.after); await expect(setup(page)).toHaveCount(0);
  await expect(page.locator('[data-local-activity-receipt]')).toContainText('理解受挫'); await expect(page.locator('[data-local-activity-receipt]')).toContainText('9.5');
  evidence('320', await saved(page), await calls(page), errors);
});

test('academic curriculum 390 旧1.9单科迁移与第二科保存失败重试', async ({ page }) => {
  test.setTimeout(150000); await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const major = academicMajors[0];
  let history = reduceState(fresh(), { type: 'choose_academics', majorId: major.id });
  history = reduceState(history, { type: 'novel_travel', locationId: 'classroom' });
  history = reduceState(history, { type: 'novel_approach', interactionId: 'classroom-notes' });
  history = reduceState(history, { type: 'interior_study', interactionId: 'classroom-notes', optionId: 'study-short', subjectId: major.subjects[0].id });
  history.player.energy = 67.25; history.inventory = [{ itemId: 'meal-standard', quantity: 2 }];
  const gain = history.academics!.lastGain!;
  const oldGain = { subjectId: gain.subjectId, minutes: gain.minutes, points: gain.points, totalPoints: gain.totalPoints, at: gain.at };
  const legacy = { ...history, schema_version: '1.9.0', academics: { majorId: major.id, subjectId: gain.subjectId, points: gain.totalPoints, lastGain: oldGain } };
  await host(page, legacy); await expect(setup(page)).toHaveCount(0);
  const migrated = await saved(page);
  expect(migrated.schema_version).toBe('1.10.0');
  expect(migrated.academics!.subjects).toEqual(major.subjects.map((subject, index) => ({ subjectId: subject.id, points: index === 0 ? gain.totalPoints : 0 })));
  expect(migrated.academics!.lastGain).toEqual({ ...oldGain, outcome: null, channel: null, interactionId: null, energyConsumed: null, moraleChange: null, stressChange: null });
  for (const field of ['player', 'inventory', 'clock', 'interior', 'story', 'phone', 'contacts', 'schedule', 'transit', 'scene'] as const) expect(migrated[field]).toEqual(history[field]);
  await showStatus(page); await page.locator('[data-academic-last-gain]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-academic-last-gain]')).toContainText('历史学习');
  await page.screenshot({ path: 'outputs/academic-curriculum-390-migrated-progress.png' });
  await closeWindow(page); const draft = '迁移后的草稿保留。'; await composer(page).fill(draft);
  await openStudy(page); await page.locator('[data-study-subject]').selectOption(major.subjects[1].id);
  const before = await saved(page), beforeCalls = await calls(page);
  await page.locator('body').evaluate(node => { node.dataset.failAcademicSave = 'true'; });
  await randomAction(page, 0, () => page.locator('[data-study-option=study-short]').click());
  await expect(page.locator('[data-study-picker]')).toBeVisible(); await expect(page.locator('[data-study-subject]')).toHaveValue(major.subjects[1].id);
  await expect(page.locator('[data-study-picker] [data-study-error]')).toContainText('模拟学业选择保存失败');
  await expect(page.locator('[data-study-picker] [data-study-error]')).toContainText('重试');
  expect(await saved(page)).toEqual(before); expect(await calls(page)).toEqual(beforeCalls);
  await reachable(page.locator('[data-study-picker]').getByRole('button', { name: '取消', exact: true }));
  await clearOfRescue(page, page.locator('[data-study-picker]').getByRole('button', { name: '取消', exact: true }));
  await page.locator('[data-study-subject]').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'outputs/academic-curriculum-390-save-failure.png' });
  await page.locator('body').evaluate(node => { delete node.dataset.failAcademicSave; });
  const retried = await commitShort(page, major.subjects[1].id, 0);
  expect(retried.gain).toMatchObject({ subjectId: major.subjects[1].id, minutes: 15, points: 15, totalPoints: 15, outcome: 'normal', channel: 'classroom' });
  expect(points(retried.after, major.subjects[0].id)).toBe(gain.totalPoints); expect(points(retried.after, major.subjects[2].id)).toBe(0);
  expect(retried.after.player.energy).toBe(64.25); expect(retried.after.inventory).toEqual(history.inventory);
  await expect(composer(page)).toHaveValue(draft);
  await showStatus(page); await subjectProgress(page, major.subjects[1].id, 15);
  await page.locator('[data-academic-last-gain]').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'outputs/academic-curriculum-390-retried-progress.png' });
  await host(page); await expect(setup(page)).toHaveCount(0); expect(await saved(page)).toEqual(retried.after);
  await expect(page.locator('[data-room-activity-receipt]')).toContainText(major.subjects[1].name);
  evidence('390', await saved(page), await calls(page), errors);
});
