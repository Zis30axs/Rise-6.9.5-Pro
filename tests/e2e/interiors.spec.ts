import { createSelectedInitialState } from './academics-fixture';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getCampusInterior, getInteriorMovementWorld } from '../../src/runtime/campus-interiors';
import { getSceneArea, sceneLocationId } from '../../src/runtime/scene-context';
import { isScenePositionWalkable, SCENE_WALK_RADIUS } from '../../src/frontend/scene-movement';
import type { WorldState } from '../../src/frontend/types';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');
const root = (page: Page) => page.locator('[data-unread-city-root]');
const interior = (page: Page) => page.locator('[data-unread-city-interior]');
const storageKey = 'unread-city-campus-e2e';
const studyOptions = [
  { id: 'study-short', label: '短时学习', minMinutes: 15, maxMinutes: 30, range: /15\s*[–—-]\s*30\s*分钟/ },
  { id: 'study-medium', label: '中时学习', minMinutes: 60, maxMinutes: 120, range: /1\s*[–—-]\s*2\s*小时/ },
  { id: 'study-long', label: '长时学习', minMinutes: 120, maxMinutes: 240, range: /2\s*[–—-]\s*4\s*小时/ },
];
const studyActivities = [
  { roomId: 'classroom', id: 'classroom-notes', label: '温习笔记', x: 1.3, z: -1.5 },
  { roomId: 'study-room', id: 'study-focus', label: '专注自习', x: 0, z: -2 },
];
/** The 80% route-event prompt is optional; accept the original interaction when it appears. */
async function finishInteraction(page: Page) {
  const normal = page.getByRole('button', { name: '否，正常进行', exact: true });
  await normal.waitFor({ state: 'visible', timeout: 1500 }).then(() => normal.click()).catch(() => {});
}

/** This host fixture preserves its chat variables across a real browser reload. */
async function withCampusHost(page: Page, initial?: WorldState, deferred = false): Promise<Frame> {
  await page.goto('/');
  if (await root(page).count()) await page.locator('[data-unread-city-rescue]').click();
  await page.evaluate(({ initial, storageKey }) => {
    (window as Window & { __unreadCityShell?: { dispose(): void } }).__unreadCityShell?.dispose();
    const host = window as unknown as Record<string, unknown>;
    host.SillyTavern = { getContext: () => ({ characterId: 0, groupId: null, chatId: 'campus-test', mainApi: 'openai', characters: [{ avatar: 'campus-test.png' }] }) };
    if (initial) localStorage.setItem(storageKey, JSON.stringify(initial));
    const iframe = document.createElement('iframe'); iframe.id = 'campus-helper'; iframe.hidden = true;
    iframe.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(iframe);
    const phone = document.createElement('div'); phone.id = 'campus-phone'; phone.hidden = true;
    phone.style.cssText = 'position:fixed;z-index:2147483500;background:#f5f1e6;';
    phone.textContent = '宿主测试手机'; document.body.append(phone);
    host.STiPhoniePanelHost = { mount(anchor: HTMLElement) {
      const sync = () => { const rect = anchor.getBoundingClientRect(); Object.assign(phone.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }); };
      phone.hidden = false; sync();
      return { release: () => { phone.hidden = true; }, sync, focus() {} };
    } };
  }, { initial, storageKey });
  const frame = await (await page.locator('#campus-helper').elementHandle())!.contentFrame();
  await frame!.waitForLoadState();
  await frame!.evaluate(({ storageKey, deferred }) => {
    const host = window as unknown as Record<string, unknown>;
    const body = window.parent.document.body;
    const saved = JSON.parse(localStorage.getItem(storageKey)!);
    let variables: Record<string, unknown> = { keep_me: 42, unread_city: saved };
    body.dataset.campusState = JSON.stringify(saved);
    host.tavern_events = { CHAT_CHANGED: 'chat_id_changed' };
    host.getVariables = () => variables;
    host.replaceVariables = (next: Record<string, unknown>) => {
      variables = next; body.dataset.campusState = JSON.stringify(next.unread_city);
      localStorage.setItem(storageKey, JSON.stringify(next.unread_city));
      body.dataset.campusOtherVariable = String(next.keep_me);
    };
    host.eventOn = () => {}; host.eventRemoveListener = () => {};
    host.getButtonEvent = (name: string) => `button:${name}`;
    let release: (() => void) | undefined;
    host.releaseCampusGeneration = () => release?.();
    host.generate = async (config: { user_input?: string }) => {
      body.dataset.campusGenerations = String(Number(body.dataset.campusGenerations || '0') + 1);
      body.dataset.campusPrompt = config.user_input ?? '';
      if (deferred) await new Promise<void>(resolve => { release = resolve; });
      return JSON.stringify({ story: '你仍在室内，回想起刚才在校园设施里的活动。', phone_messages: [] });
    };
    host.stopGenerationById = () => true;
  }, { storageKey, deferred });
  await frame!.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
  return frame!;
}

async function savedState(page: Page): Promise<WorldState> {
  return JSON.parse((await page.locator('body').getAttribute('data-campus-state'))!) as WorldState;
}

function outsideState(roomId: string): WorldState {
  const room = getCampusInterior(roomId)!;
  const state = createSelectedInitialState();
  const area = getSceneArea(room.entrance.x, room.entrance.z)!;
  state.scene = { ...room.entrance, yaw: 0, areaId: area.id, seed: 'campus-test-seed', encounterId: null };
  state.locationId = sceneLocationId(area.id);
  state.airTraffic.nextAmbientAt = Date.now() + 3600000;
  return state;
}

function insideState(roomId: string, position?: { x: number; z: number }): WorldState {
  const room = getCampusInterior(roomId)!;
  const state = outsideState(roomId);
  state.locationId = roomId;
  state.interior = { roomId, ...room.spawn, ...position, activityId: null, lastRest: null, lastStudy: null };
  return state;
}

async function explore(page: Page) {
  const button = page.getByRole('button', { name: '自由行走', exact: true });
  if (await button.isVisible()) await button.click();
  await page.getByLabel('室内三维场景', { exact: true }).focus();
}

function noOverlap(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
}

for (const id of ['dorm-room', 'classroom', 'study-room']) {
  test(`校园室内：${id} 从建筑门口进入，离开恢复原来的户外位置`, async ({ page }) => {
    const initial = outsideState(id);
    const room = getCampusInterior(id)!;
    await withCampusHost(page, initial);
    await page.getByRole('button', { name: '自由行走', exact: true }).click();
    await page.getByRole('button', { name: `进入${room.label}`, exact: true }).click();
    await expect(interior(page)).toHaveAttribute('data-room-id', id);
    await expect(interior(page)).toHaveAttribute('data-renderer', 'webgl');
    await expect(page.locator('.topbar-world')).toContainText(room.label);
    const entered = await savedState(page);
    expect(entered.interior?.roomId).toBe(id);
    expect(entered.scene).toEqual(initial.scene);
    expect(entered.clock).toEqual(initial.clock);
    expect(entered.player).toEqual(initial.player);
    expect(entered.phone).toEqual(initial.phone);
    expect(entered.story).toEqual(initial.story);
    await page.locator('[data-interior-leave]').click();
    await expect(interior(page)).toHaveCount(0);
    await expect(page.locator('[data-unread-city-scene]')).toHaveAttribute('data-renderer', 'webgl');
    const left = await savedState(page);
    expect(left.interior).toBeNull();
    expect(left.scene).toEqual(initial.scene);
    expect(left.locationId).toBe(initial.locationId);
    expect(left.clock).toEqual(initial.clock);
    await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
    await expect(page.locator('body')).toHaveAttribute('data-campus-other-variable', '42');
  });
}

test('校园室内：教室温习先在本地结算，确认对话才发送房间与活动，生成中保持位置', async ({ page }) => {
  const initial = insideState('classroom', { x: 0, z: -1 });
  initial.player.energy = 60;
  const frame = await withCampusHost(page, initial, true);
  await expect(interior(page)).toHaveAttribute('data-renderer', 'webgl');
  const draft = '温习完成后再决定接下来做什么。';
  await page.getByLabel('接下来，你想做什么？').fill(draft);
  await explore(page);
  await page.getByRole('button', { name: '室内物件', exact: true }).click();
  const rest = page.locator('[data-interior-action="classroom-notes"]');
  await expect(rest).toBeEnabled(); await rest.click();
  await page.locator('[data-study-subject]').selectOption('cs-programming');
  await page.locator('[data-study-option="study-short"]').click();
  const rested = await savedState(page);
  const lastStudy = rested.interior!.lastStudy!;
  expect(lastStudy).toMatchObject({ interactionId: 'classroom-notes', optionId: 'study-short' });
  expect(lastStudy.minutes).toBeGreaterThanOrEqual(15); expect(lastStudy.minutes).toBeLessThanOrEqual(30);
  expect(lastStudy.energyConsumed).toBe(Math.ceil(lastStudy.minutes / 6));
  expect(rested.clock).toEqual({ day: 1, hour: 17, minute: 20 + lastStudy.minutes });
  expect(rested.player).toEqual({ energy: 60 - lastStudy.energyConsumed, balance: initial.player.balance });
  expect(rested.interior?.activityId).toBe('classroom-notes');
  expect(rested.phone).toEqual(initial.phone);
  expect(rested.story).toEqual(initial.story);
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
  await expect(page.locator('[data-local-activity-receipt]')).toContainText('温习笔记');
  await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(draft);
  await expect(page.locator('.uc-shell')).toContainText('已完成活动，无需发送对话。');
  await page.getByLabel('接下来，你想做什么？').fill('温习过后，看一眼教室窗外的光线。');
  await page.getByRole('button', { name: /继续故事/ }).click();
  await expect(page.getByRole('button', { name: /叙事中/ })).toBeDisabled();
  const prompt = (await page.locator('body').getAttribute('data-campus-prompt'))!;
  const summary = JSON.parse(prompt.split('\n')[1]);
  expect(summary.location).toBe('classroom');
  expect(summary.locationDetails.name).toBe('普通教室');
  expect(summary.scene).toMatchObject({ areaId: 'classroom', outdoors: false, skyVisible: false, nearbyPeople: [], encounter: null, lastInteraction: { id: 'classroom-notes', alreadyCommitted: true, minutes: lastStudy.minutes, energyDelta: -lastStudy.energyConsumed } });
  expect(summary.airTraffic).toMatchObject({ active: null, canTriggerPass: false, skyVisible: false });
  const stopped = await interior(page).getAttribute('data-position');
  await page.getByLabel('室内三维场景', { exact: true }).focus();
  await page.keyboard.down('d'); await page.waitForTimeout(220); await page.keyboard.up('d');
  await expect(interior(page)).toHaveAttribute('data-position', stopped!);
  await frame.evaluate(() => (window as unknown as { releaseCampusGeneration(): void }).releaseCampusGeneration());
  await expect(page.getByRole('log', { name: '故事记录' })).toContainText('你仍在室内');
  await expect(page.locator('body')).toHaveAttribute('data-campus-generations', '1');
  const after = await savedState(page);
  expect(after.interior).toEqual(rested.interior);
  expect(after.clock).toEqual(rested.clock);
  expect(after.player).toEqual(rested.player);
  expect(after.phone).toEqual(initial.phone);
});

for (const activity of [
  { roomId: 'dorm-room', id: 'dorm-desk', label: '整理书桌', x: 2, z: -2, minutes: 20, energy: 3 },
  { roomId: 'study-room', id: 'study-shelf', label: '浏览书架', x: -3.4, z: 1.8, minutes: 10, energy: 1 },
]) {
  test(`校园室内：${activity.label}仅本地结算、保留草稿，整页刷新不重复扣时或精力`, async ({ page }) => {
    const initial = insideState(activity.roomId, { x: activity.x, z: activity.z });
    initial.player.energy = 60;
    initial.clock = { day: 1, hour: 23, minute: 55 };
    await withCampusHost(page, initial);
    const draft = '我原本想问的话仍留在输入框里。';
    await page.getByLabel('接下来，你想做什么？').fill(draft);
    await explore(page);
    await page.getByRole('button', { name: '室内物件', exact: true }).click();
    const action = page.locator(`[data-interior-action="${activity.id}"]`);
    await expect(action).toBeEnabled(); await action.click();
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
    const settled = await savedState(page);
    const elapsed = (settled.clock.day - initial.clock.day) * 1440 + (settled.clock.hour - initial.clock.hour) * 60 + settled.clock.minute - initial.clock.minute;
    expect(elapsed).toBe(activity.minutes);
    expect(settled.clock.day).toBe(2);
    expect(settled.player).toEqual({ ...initial.player, energy: initial.player.energy - activity.energy });
    expect(settled.interior).toEqual({ ...initial.interior!, activityId: activity.id, lastRest: null });
    expect(settled.journal).toHaveLength(initial.journal.length + 1);
    expect({ ...settled, clock: initial.clock, player: initial.player, interior: initial.interior, journal: initial.journal }).toEqual(initial);
    const receipt = page.locator('[data-local-activity-receipt]');
    await expect(receipt).toHaveRole('status');
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText(activity.label);
    await expect(receipt).toContainText(`${activity.minutes} 分钟`);
    await expect(receipt).toContainText(`${String(settled.clock.hour).padStart(2, '0')}:${String(settled.clock.minute).padStart(2, '0')}`);
    await expect(receipt).toContainText(`精力 ${settled.player.energy}`);
    await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
    await expect(page.locator('body')).toHaveAttribute('data-campus-other-variable', '42');
    await page.getByRole('button', { name: '继续阅读', exact: true }).click();
    await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(draft);
    await expect(page.locator('.uc-shell')).toContainText('已完成活动，无需发送对话。');
    await page.reload(); await withCampusHost(page);
    await expect(interior(page)).toHaveAttribute('data-room-id', activity.roomId);
    expect(await savedState(page)).toEqual(settled);
    await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
  });
}

for (const activity of studyActivities) {
  for (const option of studyOptions) {
    test(`学习三档：${activity.label}的${option.label}随机结算一次，保留草稿，跨日后刷新完整恢复`, async ({ page }) => {
      if (activity.id === 'classroom-notes' && option.id === 'study-short') await page.setViewportSize({ width: 390, height: 844 });
      const initial = insideState(activity.roomId, { x: activity.x, z: activity.z });
      initial.player.energy = 60;
      initial.clock = { day: 1, hour: 23, minute: 55 };
      await withCampusHost(page, initial);
      const draft = '这句话先留着，完成学习之后再决定是否交谈。';
      await page.getByLabel('接下来，你想做什么？').fill(draft);
      await explore(page);
      await page.getByRole('button', { name: '室内物件', exact: true }).click();
      await page.locator(`[data-interior-action="${activity.id}"]`).click();
      const picker = page.locator('[data-study-picker]');
      await picker.locator('[data-study-subject]').selectOption('cs-programming');
      await expect(picker).toHaveRole('dialog');
      await expect(picker).toHaveAccessibleName('选择学习科目与时长');
      await expect(picker.locator('[data-study-option]')).toHaveCount(3);
      expect(await savedState(page)).toEqual(initial);
      const choice = picker.locator(`[data-study-option="${option.id}"]`);
      await expect(choice).toContainText(option.label);
      await expect(choice).toContainText(option.range);
      await choice.click();
      await expect(picker).toHaveCount(0);
      await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
      const studied = await savedState(page);
      const lastStudy = studied.interior!.lastStudy!;
      expect(lastStudy).toMatchObject({ interactionId: activity.id, optionId: option.id });
      expect(Number.isInteger(lastStudy.minutes)).toBe(true);
      expect(lastStudy.minutes).toBeGreaterThanOrEqual(option.minMinutes);
      expect(lastStudy.minutes).toBeLessThanOrEqual(option.maxMinutes);
      expect(lastStudy.energyConsumed).toBe(Math.ceil(lastStudy.minutes / 6));
      const elapsed = (studied.clock.day - initial.clock.day) * 1440 + (studied.clock.hour - initial.clock.hour) * 60 + studied.clock.minute - initial.clock.minute;
      expect(elapsed).toBe(lastStudy.minutes);
      expect(studied.clock.day).toBe(2);
      expect(studied.player).toEqual({ ...initial.player, energy: initial.player.energy - lastStudy.energyConsumed });
      expect(studied.interior).toEqual({ ...initial.interior!, activityId: activity.id, lastRest: null, lastStudy });
      expect(studied.journal).toHaveLength(initial.journal.length + 1);
      expect(studied.academics).toEqual({
        ...initial.academics!,
        subjects: initial.academics!.subjects.map(subject => ({ ...subject, points: subject.subjectId === 'cs-programming' ? lastStudy.minutes : subject.points })),
        lastGain: {
          subjectId: 'cs-programming', minutes: lastStudy.minutes,
          points: lastStudy.minutes, totalPoints: lastStudy.minutes,
          outcome: 'normal', channel: activity.roomId, interactionId: activity.id,
          energyConsumed: lastStudy.energyConsumed,
          moraleChange: Math.max(0, initial.player.morale - Math.ceil(lastStudy.minutes / 15)) - initial.player.morale,
          stressChange: Math.min(100, initial.player.stress + Math.ceil(lastStudy.minutes / 30)) - initial.player.stress,
          at: `第 ${studied.clock.day} 天 ${String(studied.clock.hour).padStart(2, '0')}:${String(studied.clock.minute).padStart(2, '0')}`,
        },
      });
      expect({ ...studied, clock: initial.clock, player: initial.player, interior: initial.interior, journal: initial.journal, academics: initial.academics }).toEqual(initial);
      const receipt = page.locator('[data-local-activity-receipt]');
      await expect(receipt).toHaveRole('status');
      await expect(receipt).toBeVisible();
      await expect(receipt).toContainText(activity.label);
      await expect(receipt).toContainText(`${lastStudy.minutes} 分钟`);
      await expect(receipt).toContainText(`精力 ${studied.player.energy}`);
      if (activity.id === 'classroom-notes' && option.id === 'study-short') await page.screenshot({ path: 'outputs/study-activity-390-e2e.png' });
      await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
      await expect(page.locator('body')).toHaveAttribute('data-campus-other-variable', '42');
      await page.getByRole('button', { name: '继续阅读', exact: true }).click();
      await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(draft);
      await expect(page.locator('.uc-shell')).toContainText('已完成活动，无需发送对话。');
      await page.reload(); await withCampusHost(page);
      await expect(interior(page)).toHaveAttribute('data-room-id', activity.roomId);
      expect(await savedState(page)).toEqual(studied);
      await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
    });
  }
}

test('学习三档：打开与取消都不结算，Esc 仅关闭选择器，学习选择时暂停行走', async ({ page }) => {
  const initial = insideState('classroom', { x: 1.3, z: -1.5 });
  await withCampusHost(page, initial);
  const draft = '先保存想说的话，暂时不开始学习。';
  await page.getByLabel('接下来，你想做什么？').fill(draft);
  await explore(page);
  await page.getByRole('button', { name: '室内物件', exact: true }).click();
  await page.locator('[data-interior-action="classroom-notes"]').click();
  const picker = page.locator('[data-study-picker]');
  await picker.locator('[data-study-subject]').selectOption('cs-programming');
  await expect(picker).toHaveRole('dialog');
  expect(await savedState(page)).toEqual(initial);
  const stopped = await interior(page).getAttribute('data-position');
  await page.keyboard.down('d'); await page.waitForTimeout(180); await page.keyboard.up('d');
  await expect(interior(page)).toHaveAttribute('data-position', stopped!);
  await picker.getByRole('button', { name: '取消', exact: true }).click();
  await expect(picker).toHaveCount(0);
  expect(await savedState(page)).toEqual(initial);
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(draft);
  await explore(page);
  await page.getByRole('button', { name: '室内物件', exact: true }).click();
  await page.locator('[data-interior-action="classroom-notes"]').click();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(root(page)).toBeVisible();
  expect(await savedState(page)).toEqual(initial);
  await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`学习三档：${viewport.width}px 学习范围与取消按钮完整可触控`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const initial = insideState('study-room', { x: 0, z: -2 });
    await withCampusHost(page, initial); await explore(page);
    await page.getByRole('button', { name: '室内物件', exact: true }).click();
    await page.locator('[data-interior-action="study-focus"]').click();
    const picker = page.locator('[data-study-picker]');
    await picker.locator('[data-study-subject]').selectOption('cs-programming');
    await expect(picker).toBeInViewport({ ratio: 1 });
    const options = picker.locator('[data-study-option]');
    await expect(options).toHaveCount(3);
    for (const option of studyOptions) {
      await expect(picker.locator(`[data-study-option="${option.id}"]`)).toContainText(option.range);
    }
    const controls = [...await options.all(), picker.getByRole('button', { name: '取消', exact: true })];
    const boxes = [];
    for (const control of controls) {
      await expect(control).toBeInViewport({ ratio: 1 });
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      boxes.push(box);
    }
    for (let index = 0; index < boxes.length; index++) {
      for (let other = index + 1; other < boxes.length; other++) expect(noOverlap(boxes[index], boxes[other])).toBe(true);
    }
    const rescueBox = (await page.locator('[data-unread-city-rescue]').boundingBox())!;
    for (const box of boxes) expect(noOverlap(box, rescueBox)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `outputs/study-picker-${viewport.width}-e2e.png` });
    await picker.getByRole('button', { name: '取消', exact: true }).click();
    expect(await savedState(page)).toEqual(initial);
    await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
  });
}

for (const energy of [4, 20]) {
test(`学习三档：精力 ${energy} 时只开放能承担整个区间的档位，取消不改变存档或草稿`, async ({ page }) => {
  const initial = insideState('classroom', { x: 1.3, z: -1.5 });
  initial.player.energy = energy;
  await withCampusHost(page, initial);
  const draft = '精力恢复后，再继续这段对话。';
  await page.getByLabel('接下来，你想做什么？').fill(draft);
  await explore(page);
  await page.getByRole('button', { name: '室内物件', exact: true }).click();
  await page.locator('[data-interior-action="classroom-notes"]').click();
  const picker = page.locator('[data-study-picker]');
  await picker.locator('[data-study-subject]').selectOption('cs-programming');
  await expect(picker).toBeVisible();
  for (const option of [{ id: 'study-short', cost: 5 }, { id: 'study-medium', cost: 20 }, { id: 'study-long', cost: 40 }]) {
    const button = picker.locator(`[data-study-option="${option.id}"]`);
    if (energy < option.cost) await expect(button).toBeDisabled();
    else await expect(button).toBeEnabled();
  }
  expect(await savedState(page)).toEqual(initial);
  await picker.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
  await expect(page.locator('[data-local-activity-receipt]')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(draft);
  await page.reload(); await withCampusHost(page);
  expect(await savedState(page)).toEqual(initial);
});
}

test('校园室内：零耗时观察仍准备场景对话，点击观察不调用模型', async ({ page }) => {
  const initial = insideState('classroom', { x: 0, z: -2.9 });
  await withCampusHost(page, initial); await explore(page);
  await page.getByRole('button', { name: '室内物件', exact: true }).click();
  await page.locator('[data-interior-action="classroom-board"]').click();
  const observed = await savedState(page);
  expect(observed.clock).toEqual(initial.clock);
  expect(observed.player).toEqual(initial.player);
  expect(observed.interior?.activityId).toBe('classroom-board');
  expect(observed.journal).toHaveLength(initial.journal.length + 1);
  expect(observed.phone).toEqual(initial.phone); expect(observed.story).toEqual(initial.story);
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'compact');
  await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(getCampusInterior('classroom')!.interactions.find(action => action.id === 'classroom-board')!.prompt);
  await expect(page.locator('[data-local-activity-receipt]')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
});

test('校园长椅：休息十五分钟由程序结算、保留草稿，刷新不再次恢复精力', async ({ page }) => {
  const initial = createSelectedInitialState();
  initial.player.energy = 60;
  initial.airTraffic.nextAmbientAt = Date.now() + 3600000;
  await withCampusHost(page, initial);
  const draft = '歇好以后，再决定要不要与人聊天。';
  await page.getByLabel('接下来，你想做什么？').fill(draft);
  await page.getByRole('button', { name: '自由行走', exact: true }).click();
  const bench = page.locator('[data-hotspot="rest"]');
  await expect(bench).toHaveAccessibleName('长椅 · 休息15分钟');
  await expect(bench).toBeVisible(); await bench.click();
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
  const settled = await savedState(page);
  expect(settled.clock).toEqual({ day: 1, hour: 17, minute: 35 });
  expect(settled.player).toEqual({ ...initial.player, energy: 62 });
  expect(settled.journal).toHaveLength(initial.journal.length + 1);
  expect({ ...settled, clock: initial.clock, player: initial.player, journal: initial.journal }).toEqual(initial);
  const receipt = page.locator('[data-local-activity-receipt]');
  await expect(receipt).toHaveRole('status'); await expect(receipt).toBeVisible();
  await expect(receipt).toContainText('15 分钟'); await expect(receipt).toContainText('精力 62');
  await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(draft);
  await page.reload(); await withCampusHost(page);
  expect(await savedState(page)).toEqual(settled);
  await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
});

test('宿舍床铺：选择前与取消后不结算，不覆盖行动草稿、不触发对话', async ({ page }) => {
  const initial = insideState('dorm-room', { x: -1, z: -1 });
  await withCampusHost(page, initial);
  const draft = '先把刚才想说的话留在这里。';
  await page.getByLabel('接下来，你想做什么？').fill(draft);
  await explore(page);
  await page.getByRole('button', { name: '室内物件', exact: true }).click();
  await page.locator('[data-interior-action="dorm-rest"]').click();
  const picker = page.locator('[data-bed-rest-picker]');
  await expect(picker).toHaveRole('dialog');
  await expect(picker).toHaveAccessibleName('选择休息时长');
  await expect(picker.locator('[data-rest-option]')).toHaveCount(3);
  expect(await savedState(page)).toEqual(initial);
  const stopped = await interior(page).getAttribute('data-position');
  await page.keyboard.down('d'); await page.waitForTimeout(180); await page.keyboard.up('d');
  await expect(interior(page)).toHaveAttribute('data-position', stopped!);
  await picker.getByRole('button', { name: '取消', exact: true }).click();
  await expect(picker).toHaveCount(0);
  expect(await savedState(page)).toEqual(initial);
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
  await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(draft);
  await explore(page);
  await page.getByRole('button', { name: '室内物件', exact: true }).click();
  await page.locator('[data-interior-action="dorm-rest"]').click();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(root(page)).toBeVisible();
  expect(await savedState(page)).toEqual(initial);
});

for (const option of [
  { id: 'dorm-rest-short', label: '短休', minMinutes: 15, maxMinutes: 30, range: /15\s*[–—-]\s*30\s*分钟/ },
  { id: 'dorm-rest-medium', label: '中休', minMinutes: 60, maxMinutes: 120, range: /1\s*[–—-]\s*2\s*小时/ },
  { id: 'dorm-rest-long', label: '长休', minMinutes: 420, maxMinutes: 540, range: /7\s*[–—-]\s*9\s*小时/ },
]) {
  test(`宿舍床铺：${option.label}仅本地结算一次，保留草稿，整页刷新不再结算`, async ({ page }) => {
    const initial = insideState('dorm-room', { x: -1, z: -1 });
    initial.player.energy = 60;
    if (option.id === 'dorm-rest-long') initial.clock = { day: 1, hour: 23, minute: 50 };
    await withCampusHost(page, initial);
    const draft = '休息后再决定接下来的行动。';
    await page.getByLabel('接下来，你想做什么？').fill(draft);
    await explore(page);
    await page.getByRole('button', { name: '室内物件', exact: true }).click();
    await page.locator('[data-interior-action="dorm-rest"]').click();
    const picker = page.locator('[data-bed-rest-picker]');
    expect(await savedState(page)).toEqual(initial);
    const button = picker.locator(`[data-rest-option="${option.id}"]`);
    await expect(button).toContainText(option.label);
    await expect(button).toContainText(option.range);
    await button.click();
    await expect(picker).toHaveCount(0);
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
    const rested = await savedState(page);
    const lastRest = rested.interior!.lastRest!;
    expect(lastRest.optionId).toBe(option.id);
    expect(Number.isInteger(lastRest.minutes)).toBe(true);
    expect(lastRest.minutes).toBeGreaterThanOrEqual(option.minMinutes);
    expect(lastRest.minutes).toBeLessThanOrEqual(option.maxMinutes);
    const elapsed = (rested.clock.day - initial.clock.day) * 1440 + (rested.clock.hour - initial.clock.hour) * 60 + rested.clock.minute - initial.clock.minute;
    expect(elapsed).toBe(lastRest.minutes);
    const expectedEnergy = Math.min(100, initial.player.energy + (option.id === 'dorm-rest-long' ? 100 : Math.floor(lastRest.minutes * .4)));
    expect(lastRest.energyRecovered).toBe(expectedEnergy - initial.player.energy);
    expect(rested.player).toEqual({ ...initial.player, energy: expectedEnergy });
    expect(rested.interior).toEqual({ ...initial.interior!, activityId: option.id, lastRest });
    if (option.id === 'dorm-rest-long') expect(rested.clock.day).toBe(2);
    expect(rested.journal).toHaveLength(initial.journal.length + 1);
    expect({ ...rested, clock: initial.clock, player: initial.player, interior: initial.interior, journal: initial.journal }).toEqual(initial);
    const receipt = page.locator('[data-bed-rest-receipt]');
    await expect(receipt).toHaveRole('status');
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText(`${String(rested.clock.hour).padStart(2, '0')}:${String(rested.clock.minute).padStart(2, '0')}`);
    await expect(receipt).toContainText(String(expectedEnergy));
    await expect(receipt).toContainText(`${lastRest.minutes} 分钟`);
    await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
    await expect(page.locator('body')).toHaveAttribute('data-campus-other-variable', '42');
    await page.getByRole('button', { name: '继续阅读', exact: true }).click();
    await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(draft);
    await page.reload(); await withCampusHost(page);
    await expect(interior(page)).toHaveAttribute('data-room-id', 'dorm-room');
    expect(await savedState(page)).toEqual(rested);
    await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`宿舍床铺：${viewport.width}px 三档选项与取消按钮均完整可触控`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const initial = insideState('dorm-room', { x: -1, z: -1 });
    await withCampusHost(page, initial); await explore(page);
    await page.getByRole('button', { name: '室内物件', exact: true }).click();
    await page.locator('[data-interior-action="dorm-rest"]').click();
    const picker = page.locator('[data-bed-rest-picker]');
    await expect(picker).toBeInViewport({ ratio: 1 });
    const options = picker.locator('[data-rest-option]');
    await expect(options).toHaveCount(3);
    const controls = [...await options.all(), picker.getByRole('button', { name: '取消', exact: true })];
    const boxes = [];
    for (const control of controls) {
      await expect(control).toBeInViewport({ ratio: 1 });
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      boxes.push(box);
    }
    for (let index = 0; index < boxes.length; index++) {
      for (let other = index + 1; other < boxes.length; other++) expect(noOverlap(boxes[index], boxes[other])).toBe(true);
    }
    const rescueBox = (await page.locator('[data-unread-city-rescue]').boundingBox())!;
    for (const box of boxes) expect(noOverlap(box, rescueBox)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `outputs/bed-rest-picker-${viewport.width}-e2e.png` });
    await picker.getByRole('button', { name: '取消', exact: true }).click();
    expect(await savedState(page)).toEqual(initial);
    await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
  });
}

test('校园室内：围墙碰撞、开窗停步，整页刷新恢复同一室内位置', async ({ page }) => {
  const room = getCampusInterior('classroom')!;
  const world = getInteriorMovementWorld(room);
  const initial = insideState(room.id, { x: world.bounds.maxX - SCENE_WALK_RADIUS - .4, z: 3.8 });
  await withCampusHost(page, initial); await explore(page);
  const scene = interior(page);
  await page.keyboard.down('d');
  await expect.poll(async () => Number((await scene.getAttribute('data-position'))!.split(',')[0])).toBeGreaterThan(initial.interior!.x + .2);
  await page.waitForTimeout(500);
  const wall = await scene.getAttribute('data-position');
  await page.waitForTimeout(200); await expect(scene).toHaveAttribute('data-position', wall!);
  await page.keyboard.up('d');
  const [x, , z] = wall!.split(',').map(Number);
  expect(x).toBeLessThanOrEqual(world.bounds.maxX - SCENE_WALK_RADIUS + .001);
  expect(isScenePositionWalkable(x, z, world)).toBe(true);
  await page.keyboard.down('a'); await expect(scene).not.toHaveAttribute('data-position', wall!);
  await page.getByRole('button', { name: '状态', exact: true }).click();
  const paused = await scene.getAttribute('data-position');
  await page.waitForTimeout(200); await expect(scene).toHaveAttribute('data-position', paused!);
  await page.keyboard.up('a');
  await page.getByRole('button', { name: '关闭状态窗口', exact: true }).click();
  await expect.poll(async () => {
    const saved = (await savedState(page)).interior!;
    return Math.abs(saved.x - Number(paused!.split(',')[0]));
  }).toBeLessThan(.01);
  const saved = await savedState(page);
  await page.reload(); await withCampusHost(page);
  await expect(interior(page)).toHaveAttribute('data-room-id', room.id);
  await expect(interior(page)).toHaveAttribute('data-renderer', 'webgl');
  const restored = (await interior(page).getAttribute('data-position'))!.split(',').map(Number);
  expect(Math.abs(restored[0] - saved.interior!.x)).toBeLessThan(.01);
  expect(Math.abs(restored[2] - saved.interior!.z)).toBeLessThan(.01);
  expect(await savedState(page)).toEqual(saved);
  await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`校园设施地图：${viewport.width}px 十二处地点触控区分离，教学楼前往后可进入教室`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const initial = createSelectedInitialState(); initial.airTraffic.nextAmbientAt = Date.now() + 3600000;
    await withCampusHost(page, initial);
    await page.getByRole('button', { name: '地图', exact: true }).click();
    const map = page.locator('.world-map');
    const layers = page.getByRole('navigation', { name: '地图范围', exact: true });
    const targets = map.locator('.cms-place-pin');
    for (const label of ['沙盘']) {
      await layers.getByRole('button', { name: label, exact: true }).click();
      await expect(map).toHaveAttribute('data-map-layer', 'sandtable');
      await expect(page.locator('[data-world-map-viewport]')).toHaveAttribute('data-map-depth', '0.000');
      await expect(targets).toHaveCount(6);
      await expect(map.locator('.cms-place-dot')).toHaveCount(viewport.width >= 330 ? 6 : 0);
      for (const target of await targets.all()) {
        await expect(target).toBeInViewport({ ratio: 1 });
      }
      // Inspect the same settled sandtable projection for all twelve targets.
      const boxes = await map.locator('.cms-place-pin, .cms-place-dot').evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect();
        return { id: element.getAttribute('data-map-target'), x: box.x, y: box.y, width: box.width, height: box.height };
      }));
      for (const box of boxes) { expect(box.height).toBeGreaterThanOrEqual(44); expect(box.width).toBeGreaterThanOrEqual(44); }
      for (let index = 0; index < boxes.length; index++) {
        for (let other = index + 1; other < boxes.length; other++) expect(noOverlap(boxes[index], boxes[other]), `${label}: ${JSON.stringify([boxes[index], boxes[other]])}`).toBe(true);
      }
    }
    await map.locator('[data-map-target="teaching"]').click();
    await finishInteraction(page);
    await expect(page.locator('.topbar-world')).toContainText('教学楼');
    const travelled = await savedState(page);
    expect(travelled.locationId).toBe('teaching'); expect(travelled.interior).toBeNull();
    expect(travelled.player.energy).toBe(initial.player.energy - 5);
    expect(travelled.clock).not.toEqual(initial.clock);
    expect(travelled.phone).toEqual(initial.phone); expect(travelled.story).toEqual(initial.story);
    await page.getByRole('button', { name: '关闭地图窗口', exact: true }).click();
    await page.getByRole('button', { name: '自由行走', exact: true }).click();
    await page.getByRole('button', { name: '进入普通教室', exact: true }).click();
    await finishInteraction(page);
    await expect(interior(page)).toHaveAttribute('data-room-id', 'classroom');
    await expect(interior(page)).toHaveAttribute('data-renderer', 'webgl');
    await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
  });

  test(`校园室内：${viewport.width}px 双手控制可操作，手机停步并可恢复酒馆`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await withCampusHost(page, insideState('study-room')); await explore(page);
    const scene = interior(page);
    const stick = page.getByRole('group', { name: '移动摇杆', exact: true });
    const look = page.getByRole('group', { name: '视角环视区域', exact: true });
    for (const control of [stick, look, page.locator('[data-interior-leave]'), page.getByRole('button', { name: '室内物件', exact: true }), page.getByRole('button', { name: '手机', exact: true })]) {
      await expect(control).toBeInViewport({ ratio: 1 });
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator('[data-unread-city-rescue]')).toBeInViewport({ ratio: 1 });
    const a = (await stick.boundingBox())!; const b = (await look.boundingBox())!;
    expect(noOverlap(a, b)).toBe(true);
    for (const control of [page.locator('[data-interior-leave]'), page.getByRole('button', { name: '室内物件', exact: true })]) {
      const box = (await control.boundingBox())!;
      expect(noOverlap(a, box)).toBe(true); expect(noOverlap(b, box)).toBe(true);
    }
    const session = await page.context().newCDPSession(page);
    const move = { id: 11, x: a.x + a.width / 2, y: a.y + a.height / 2 - 30 };
    const turn = { id: 12, x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const before = await scene.getAttribute('data-position'); const view = await scene.getAttribute('data-view');
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move] });
    await expect(scene).not.toHaveAttribute('data-position', before!);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, turn] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move, { ...turn, x: turn.x - 45, y: turn.y - 10 }] });
    await expect(scene).not.toHaveAttribute('data-view', view!);
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const stopped = await scene.getAttribute('data-position');
    await page.waitForTimeout(180); await expect(scene).toHaveAttribute('data-position', stopped!);
    await page.getByRole('button', { name: '手机', exact: true }).click();
    await expect(page.locator('[data-unread-city-phone-slot]')).toBeVisible();
    await expect(stick).toHaveCount(0);
    await page.waitForTimeout(180); await expect(scene).toHaveAttribute('data-position', stopped!);
    await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
    await expect(stick).toBeVisible(); await expect(scene).toHaveAttribute('data-position', stopped!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('[data-unread-city-rescue]').click(); await expect(root(page)).toHaveCount(0);
    await page.locator('#native-input').fill('室内退出后继续原生聊天');
    await expect(page.locator('#native-input')).toHaveValue('室内退出后继续原生聊天');
    await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
    await session.detach();
  });
}

test('校园室内：禁用 WebGL 后仍可走近物件、执行本地活动和离开房间', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value(type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return Reflect.apply(original, this, [type, ...args]);
    } });
  });
  const initial = insideState('study-room');
  await withCampusHost(page, initial);
  await expect(interior(page)).toHaveAttribute('data-renderer', 'fallback');
  await page.getByRole('button', { name: '自由行走', exact: true }).click();
  await page.locator('[data-interior-approach="study-shelf"]').click();
  const action = page.locator('[data-interior-action="study-shelf"]');
  await expect(action).toBeEnabled(); await action.click();
  const saved = await savedState(page);
  expect(saved.interior?.activityId).toBe('study-shelf');
  expect(saved.clock).toEqual({ day: 1, hour: 17, minute: 30 });
  expect(saved.player.energy).toBe(initial.player.energy - 1);
  expect(saved.phone).toEqual(initial.phone); expect(saved.story).toEqual(initial.story);
  await page.locator('[data-interior-leave]').click(); await expect(interior(page)).toHaveCount(0);
  expect((await savedState(page)).interior).toBeNull();
  await expect(page.locator('body')).not.toHaveAttribute('data-campus-generations');
});
