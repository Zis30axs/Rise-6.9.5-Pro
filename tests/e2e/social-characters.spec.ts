import { expect, test, type Frame, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createSelectedInitialState } from './academics-fixture';
import { reduceState } from '../../src/runtime/model';
import { getScenePeople } from '../../src/runtime/scene-context';
import { characterForPerson } from '../../src/frontend/character-appearance';
import type { WorldState } from '../../src/frontend/types';

test.use({ screenshot: 'only-on-failure' });

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');
const root = (page: Page) => page.locator('[data-unread-city-root]');
const phone = (page: Page) => page.frameLocator('#sttts-panel iframe');
type Generation = { user_input: string; max_chat_history: number; injects: { content: string }[] };
type Helper = {
  reply(response: string | null, hold?: boolean): void;
  resolve(): void;
  read(chatId?: string): { keep_me: number; unread_city: WorldState };
  generations(): Generation[];
  failSave(): void;
  change(): void;
};

function encounterFixture() {
  const seed = 'social-character-browser';
  let state = reduceState(createSelectedInitialState(), { type: 'walk', x: 0, z: 29, yaw: 0, seed });
  const stranger = getScenePeople(state.scene!).find(person => characterForPerson(person.id) === 'deepseek')!;
  state = reduceState(state, { type: 'walk', x: stranger.x, z: stranger.z, yaw: 0, seed });
  state.airTraffic.nextAmbientAt = Date.now() + 3600000;
  state.phone = [];
  const event = '一张手绘校园地图从书里滑落，你们一起把它捡了起来。';
  const speech = '这是我自己画的地图，图书馆那条小路很安静。';
  state.story.push(
    { id: 'social-related-user', role: 'user', text: `我问${stranger.name}手中的校园地图。`, participantIds: [stranger.id] },
    { id: 'social-related-assistant', role: 'assistant', text: `${event}\n|${stranger.name}|开心|${speech}|`, participantIds: [stranger.id] },
    { id: 'social-unrelated-user', role: 'user', text: '我问林同学昨天的量子谜题。', participantIds: ['lin'] },
    { id: 'social-unrelated-assistant', role: 'assistant', text: '林同学讲起只有他知道的量子谜题。', participantIds: ['lin'] },
  );
  return { state, stranger, event, speech };
}

/** Load the exact production Shell and its actual embedded phone. Only the
 * Tavern host and generation responses are fixtures; no network model exists. */
async function withProductionPhone(page: Page, initial: WorldState) {
  const errors: string[] = [], network: string[] = [], extensions: string[] = [];
  // Keep the host static: Vite's development page hot-reloads on source edits,
  // which would destroy the controlled Tavern fixture during parallel work.
  await page.route('http://127.0.0.1:5178/', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>' }));
  await page.route('**/*', route => {
    const target = new URL(route.request().url());
    if (target.origin === 'http://127.0.0.1:5178') return route.fallback();
    network.push(target.href); return route.abort('blockedbyclient');
  });
  await page.goto('/');
  await page.evaluate(() => (window as Window & { __unreadCityShell?: { dispose(): void } }).__unreadCityShell?.dispose());
  await page.route('**/api/**', route => { network.push(route.request().url()); return route.abort('blockedbyclient'); });
  await page.route('https://**', route => { network.push(route.request().url()); return route.abort('blockedbyclient'); });
  await page.route('**/scripts/personas.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export let user_avatar = "";' }));
  await page.route('**/scripts/extensions/regex/engine.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const regex_placement = {}; export const getRegexedString = value => value;' }));
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/scripts\/extensions\/third-party\/.*(?:iphonie|st-tts)/i.test(request.url())) extensions.push(request.url()); });
  await page.evaluate(() => {
    document.body.innerHTML = '<main><div id="chat"></div><div id="extensions_settings"></div><div id="extensionsMenu"></div><button id="social-reenter">重新进入</button></main>';
    localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
    const host = window as unknown as Record<string, unknown>;
    const listeners = new Map<string, Set<(...args: unknown[]) => unknown>>();
    const eventSource = {
      on(name: string, listener: (...args: unknown[]) => unknown) { const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set); },
      removeListener(name: string, listener: (...args: unknown[]) => unknown) { listeners.get(name)?.delete(listener); },
      emit(name: string, ...args: unknown[]) { for (const listener of [...listeners.get(name) ?? []]) listener(...args); },
    };
    const denied = async () => { throw new Error('浏览器验证禁止真实模型调用'); };
    const ctx = {
      characterId: 0, groupId: null, chatId: 'social-a', mainApi: 'openai',
      characters: [{ avatar: 'social-a.png', name: '人物受控验证', data: {} }], groups: [], chat: [], chatMetadata: {}, extensionSettings: {}, name1: '我', name2: '人物受控验证',
      eventSource, eventTypes: Object.fromEntries(['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'CHARACTER_MESSAGE_RENDERED', 'GENERATION_AFTER_COMMANDS'].map(name => [name, name])),
      setExtensionPrompt() {}, updateMessageBlock() {}, messageFormatting: (text: string) => text,
      saveSettingsDebounced() {}, getRequestHeaders: () => ({ 'Content-Type': 'application/json' }), getCurrentChatId: () => ctx.chatId,
      generateRaw: denied, generateQuietPrompt: denied, getThumbnailUrl: () => '',
    };
    host.SillyTavern = { getContext: () => ctx };
    host.toastr = { info() {}, warning() {}, error() {}, success() {} };
    host.socialChange = (chatId: string) => { ctx.chatId = chatId; eventSource.emit('CHAT_CHANGED'); };
    document.querySelector('#social-reenter')!.addEventListener('click', () => (host.__unreadCityShell as { open(): void }).open());
    const frame = document.createElement('iframe'); frame.id = 'social-helper'; frame.hidden = true; frame.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(frame);
  });
  const helper = (await (await page.locator('#social-helper').elementHandle())!.contentFrame())!;
  await helper.waitForLoadState();
  await helper.evaluate(initial => {
    const host = window as unknown as Record<string, unknown>;
    const chats = new Map<string, Record<string, unknown>>(), listeners = new Set<() => void>();
    const current = () => (window.parent as unknown as { SillyTavern: { getContext(): { chatId: string } } }).SillyTavern.getContext().chatId;
    const variables = (chatId = current()) => { let value = chats.get(chatId); if (!value) { value = { keep_me: 42, unread_city: structuredClone(initial) }; chats.set(chatId, value); } return value; };
    let response: string | null | undefined, hold = false, finish: (() => void) | undefined, failSave = false;
    const generations: unknown[] = [];
    host.tavern_events = { CHAT_CHANGED: 'chat_id_changed' };
    host.getVariables = () => variables();
    host.replaceVariables = (value: Record<string, unknown>) => { if (failSave) { failSave = false; throw new Error('受控保存失败'); } chats.set(current(), value); };
    host.eventOn = (event: string, callback: () => void) => { if (event === 'chat_id_changed') listeners.add(callback); };
    host.eventRemoveListener = (event: string, callback: () => void) => { if (event === 'chat_id_changed') listeners.delete(callback); };
    host.getButtonEvent = (name: string) => `button:${name}`;
    host.reply = (value: string | null, delayed = false) => { response = value; hold = delayed; };
    host.generate = async (config: unknown) => {
      generations.push(structuredClone(config));
      if (response === undefined) throw new Error('未设置受控回复，禁止真实模型调用');
      const value = response; response = undefined;
      if (hold) { hold = false; await new Promise<void>(resolve => { finish = resolve; }); }
      if (value === null) throw new Error('受控简介生成失败');
      return value;
    };
    host.resolve = () => { finish?.(); finish = undefined; };
    host.read = (chatId?: string) => structuredClone(variables(chatId));
    host.generations = () => structuredClone(generations);
    host.failSave = () => { failSave = true; };
    host.stopGenerationById = () => true;
    host.change = () => { for (const callback of [...listeners]) callback(); };
  }, initial);
  await helper.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
  return { helper, errors, network, extensions };
}

async function read(helper: Frame, chatId?: string) {
  return helper.evaluate(chatId => (window as unknown as Helper).read(chatId), chatId);
}
async function generationCount(helper: Frame) {
  return helper.evaluate(() => (window as unknown as Helper).generations().length);
}
async function openPhone(page: Page) {
  await page.getByRole('button', { name: '手机', exact: true }).click();
  await expect(page.locator('[data-unread-city-phone-slot]')).toHaveAttribute('data-phone-status', 'ready', { timeout: 20000 });
  await expect(phone(page).locator('.device')).toBeVisible();
}
async function encounter(page: Page, personId: string) {
  await page.getByRole('button', { name: '地点', exact: true }).click();
  await page.locator(`[data-talk-person="${personId}"]`).click();
  await expect(page.locator('[data-current-encounter]')).toHaveAttribute('data-person-id', personId);
}
async function openStrangerEditor(page: Page, personId: string) {
  await encounter(page, personId);
  await page.locator('[data-encounter-contact]').click();
  await expect(phone(page).locator('[data-story-contact-form]')).toBeVisible({ timeout: 20000 });
}
async function fillProfile(page: Page, name: string, portrait: string, summary: string) {
  const frame = phone(page);
  await frame.locator('[data-field="contact-name"]').fill(name);
  await frame.locator('[data-field="contact-portrait"]').selectOption(portrait);
  await frame.locator('[data-field="contact-persona"]').fill(summary);
}
async function saveProfile(page: Page, name: string) {
  await phone(page).getByRole('button', { name: '保存为主要人物', exact: true }).click();
  await expect(phone(page).locator('[data-story-contact-form]')).toHaveCount(0);
  await phone(page).getByRole('button', { name: '联系人', exact: true }).click();
  await expect(phone(page).locator(`[data-action="profile"][data-name="${name}"]`)).toHaveCount(1);
}
function onlyLocal(fixture: Awaited<ReturnType<typeof withProductionPhone>>) {
  expect(fixture.errors).toEqual([]); expect(fixture.network).toEqual([]); expect(fixture.extensions).toEqual([]);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`${viewport.width}px 陌生人交流立即显示立绘，原显示框内默认只留事件且可展开对白`, async ({ page }) => {
    test.setTimeout(90000); await page.setViewportSize(viewport);
    const data = encounterFixture();
    // Make this person's encounter the most recent scene in the reader.
    data.state.story = data.state.story.filter(entry => !entry.id.startsWith('social-unrelated'));
    const fixture = await withProductionPhone(page, data.state);
    await encounter(page, data.stranger.id);
    await expect(page.locator('[data-npc-portrait]')).toHaveAttribute('data-npc-portrait', 'deepseek');
    await expect(page.locator('[data-npc-portrait]')).toHaveAttribute('data-npc-speaker', `陌生${data.stranger.identity}`);
    await expect(page.locator('[data-event-reading]')).toContainText(data.event);
    await expect(page.locator('[data-event-reading]')).not.toContainText(data.speech);
    await expect(page.locator('[data-toggle-dialogue]')).toHaveAttribute('aria-expanded', 'false');
    expect(await generationCount(fixture.helper)).toBe(0);
    await page.locator('[data-toggle-dialogue]').click();
    await expect(page.locator('[data-toggle-dialogue]')).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
    await expect(page.locator('.novel-speech')).toContainText(data.speech);
    await page.getByRole('button', { name: '全文回看', exact: true }).click();
    const fold = page.locator('[data-story-dialogue]').filter({ hasText: data.speech });
    await expect(fold).not.toHaveAttribute('open');
    await expect(fold.locator('p')).not.toBeVisible();
    await fold.locator('summary').click();
    await expect(fold.locator('p')).toBeVisible();
    const shape = await page.locator('[data-reading-layer]').boundingBox();
    expect(shape!.x).toBeGreaterThanOrEqual(0); expect(shape!.x + shape!.width).toBeLessThanOrEqual(viewport.width + 1);
    await page.screenshot({ path: `outputs/social-dialogue-${viewport.width}.png` });
    onlyLocal(fixture);
  });
}

test('陌生人经真实手机确认姓名、立绘和简介，稳定人物ID与主要人物事件随聊天刷新保留', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const data = encounterFixture(), fixture = await withProductionPhone(page, data.state);
  await openStrangerEditor(page, data.stranger.id);
  await expect(phone(page).locator('[data-field="contact-name"]')).toHaveValue(data.stranger.name);
  expect(await generationCount(fixture.helper)).toBe(0);
  await fillProfile(page, '顾知遥', 'xiaoyang', '喜欢绘制校园小地图，交谈时会认真听完你的话。');
  await page.screenshot({ path: 'outputs/social-contact-form-390.png' });
  await saveProfile(page, '顾知遥');
  const saved = await read(fixture.helper), contact = saved.unread_city.contacts.find(contact => contact.sourcePersonId === data.stranger.id)!;
  expect(contact).toMatchObject({ id: data.stranger.id, name: '顾知遥', portraitId: 'xiaoyang', isMain: true });
  expect(contact.summary).toContain('校园小地图');
  expect(saved.unread_city.clock).toEqual(data.state.clock);
  expect(saved.unread_city.story.at(-1)).toMatchObject({ role: 'assistant', participantIds: [data.stranger.id] });
  expect(saved.unread_city.story.at(-1)!.text).toContain('人物档案已记录：顾知遥');
  expect(saved.keep_me).toBe(42);
  await phone(page).locator('[data-action="profile"][data-name="顾知遥"]').click();
  const edit = phone(page).getByRole('button', { name: '编辑姓名、立绘和简介', exact: true });
  await expect(edit).toHaveAttribute('data-id', data.stranger.id);
  await expect(phone(page).locator('.qq-card')).toContainText(contact.summary);
  await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
  await expect(page.locator('[data-current-encounter]')).toContainText('顾知遥');
  await expect(page.locator('[data-npc-portrait]')).toHaveAttribute('data-npc-portrait', 'xiaoyang');
  await fixture.helper.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(root(page)).toHaveCount(0);
  await fixture.helper.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible(); await openPhone(page);
  await phone(page).getByRole('button', { name: /^聊天(?:，|$)/ }).click();
  await phone(page).getByRole('button', { name: '联系人', exact: true }).click();
  await expect(phone(page).locator('[data-action="profile"][data-name="顾知遥"]')).toHaveCount(1);
  expect(await read(fixture.helper)).toEqual(saved);
  expect(await generationCount(fixture.helper)).toBe(0);
  onlyLocal(fixture);
});

test('手机联系人可手动扩展新主要人物，编辑资料沿用同一个ID', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 320, height: 568 });
  const data = encounterFixture(), fixture = await withProductionPhone(page, data.state);
  await openPhone(page);
  await phone(page).getByRole('button', { name: /^聊天(?:，|$)/ }).click();
  await phone(page).getByRole('button', { name: '联系人', exact: true }).click();
  await phone(page).getByRole('button', { name: '添加联系人', exact: true }).click();
  await phone(page).locator('[data-story-person=""]').click();
  await expect(phone(page).locator('[data-story-contact-form]')).toBeVisible();
  await fillProfile(page, '许星河', 'claude', '校园电台的志愿者，喜欢收集寻常生活里的声音。');
  await page.screenshot({ path: 'outputs/social-contact-form-320.png' });
  await saveProfile(page, '许星河');
  const first = (await read(fixture.helper)).unread_city.contacts.find(contact => contact.name === '许星河')!;
  expect(first).toMatchObject({ portraitId: 'claude', sourcePersonId: null, isMain: true });
  await phone(page).locator('[data-action="profile"][data-name="许星河"]').click();
  await phone(page).getByRole('button', { name: '编辑姓名、立绘和简介', exact: true }).click();
  await fillProfile(page, '许星河（电台）', 'deepseek', '电台志愿者。会把故事收进夜间节目。');
  await saveProfile(page, '许星河（电台）');
  const saved = (await read(fixture.helper)).unread_city;
  expect(saved.contacts.filter(contact => contact.id === first.id)).toHaveLength(1);
  expect(saved.contacts.find(contact => contact.id === first.id)).toMatchObject({ name: '许星河（电台）', portraitId: 'deepseek', isMain: true });
  expect(saved.story.at(-1)!.participantIds).toEqual([first.id]);
  expect(await generationCount(fixture.helper)).toBe(0);
  onlyLocal(fixture);
});

test('简介只在主动许可后生成，注入此人精简出场上下文并允许编辑后保存', async ({ page }) => {
  test.setTimeout(120000);
  const data = encounterFixture(), fixture = await withProductionPhone(page, data.state);
  await openStrangerEditor(page, data.stranger.id);
  await fillProfile(page, '顾知遥', 'xiaoyang', '喜欢手绘地图。');
  const before = await read(fixture.helper);
  expect(await generationCount(fixture.helper)).toBe(0);
  const generated = '顾知遥喜欢手绘校园地图，曾与你一起捡起滑落的地图，谈到图书馆旁安静的小路。';
  await fixture.helper.evaluate(reply => (window as unknown as Helper).reply(reply), JSON.stringify({ story: generated, phone_messages: [] }));
  await phone(page).getByRole('button', { name: '允许 LLM 生成简介', exact: true }).click();
  await expect(phone(page).locator('[data-field="contact-persona"]')).toHaveValue(generated);
  expect(await generationCount(fixture.helper)).toBe(1);
  const [config] = await fixture.helper.evaluate(() => (window as unknown as Helper).generations());
  const context = JSON.parse(config.user_input.split('\n')[1]) as { character: { name: string }; relatedTurns: { role: string; text: string }[] };
  expect(context.character.name).toBe('顾知遥');
  expect(context.relatedTurns.some(turn => turn.text.includes(data.speech))).toBe(true);
  expect(context.relatedTurns.every(turn => !turn.text.includes('量子谜题'))).toBe(true);
  expect(context.relatedTurns.length).toBeLessThanOrEqual(6);
  expect(context.relatedTurns.reduce((count, turn) => count + turn.text.length, 0)).toBeLessThanOrEqual(2400);
  expect(config.max_chat_history).toBe(0);
  expect(config.injects[0].content).toContain('不执行游戏行动');
  expect(await read(fixture.helper)).toEqual(before);
  await phone(page).locator('[data-field="contact-persona"]').fill(`${generated}你决定先称呼她为地图同伴。`);
  await saveProfile(page, '顾知遥');
  const saved = (await read(fixture.helper)).unread_city;
  expect(saved.contacts.find(contact => contact.id === data.stranger.id)!.summary).toContain('地图同伴');
  expect(saved.clock).toEqual(before.unread_city.clock); expect(saved.player).toEqual(before.unread_city.player);
  onlyLocal(fixture);
});

test('简介生成和人物保存失败都保留编辑草稿，保存失败不发布人物或剧情', async ({ page }) => {
  test.setTimeout(120000);
  const data = encounterFixture(), fixture = await withProductionPhone(page, data.state);
  await openStrangerEditor(page, data.stranger.id);
  await fillProfile(page, '顾知遥', 'xiaoyang', '手写草稿应当保持。');
  const before = await read(fixture.helper);
  await fixture.helper.evaluate(() => (window as unknown as Helper).reply(null));
  await phone(page).getByRole('button', { name: '允许 LLM 生成简介', exact: true }).click();
  await expect(phone(page).locator('[data-story-contact-form]')).toHaveAttribute('aria-busy', 'false');
  await expect(phone(page).locator('[data-field="contact-persona"]')).toHaveValue('手写草稿应当保持。');
  expect(await read(fixture.helper)).toEqual(before);
  await fixture.helper.evaluate(() => (window as unknown as Helper).failSave());
  await phone(page).getByRole('button', { name: '保存为主要人物', exact: true }).click();
  await expect(phone(page).locator('[data-story-contact-form]')).toHaveAttribute('aria-busy', 'false');
  await expect(phone(page).locator('[data-field="contact-name"]')).toHaveValue('顾知遥');
  await expect(phone(page).locator('[data-field="contact-persona"]')).toHaveValue('手写草稿应当保持。');
  expect(await read(fixture.helper)).toEqual(before);
  await saveProfile(page, '顾知遥');
  expect((await read(fixture.helper)).unread_city.contacts.find(contact => contact.id === data.stranger.id)!.summary).toBe('手写草稿应当保持。');
  expect(await generationCount(fixture.helper)).toBe(1);
  onlyLocal(fixture);
});

test('关闭手机后迟到简介不修改草稿或世界，再次打开仍可手动编辑', async ({ page }) => {
  test.setTimeout(120000);
  const data = encounterFixture(), fixture = await withProductionPhone(page, data.state);
  await openStrangerEditor(page, data.stranger.id);
  await fillProfile(page, '顾知遥', 'deepseek', '关闭前保留的草稿。');
  const before = await read(fixture.helper);
  await fixture.helper.evaluate(() => (window as unknown as Helper).reply(JSON.stringify({ story: '迟到结果不应进入草稿。', phone_messages: [] }), true));
  await phone(page).getByRole('button', { name: '允许 LLM 生成简介', exact: true }).click();
  await expect(phone(page).locator('[data-story-contact-form]')).toHaveAttribute('aria-busy', 'true');
  await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
  await fixture.helper.evaluate(() => (window as unknown as Helper).resolve());
  await openPhone(page);
  await expect(phone(page).locator('[data-story-contact-form]')).toHaveAttribute('aria-busy', 'false');
  await expect(phone(page).locator('[data-field="contact-persona"]')).toHaveValue('关闭前保留的草稿。');
  expect(await read(fixture.helper)).toEqual(before);
  await phone(page).locator('[data-field="contact-persona"]').fill('重新打开后仍可继续编辑。');
  await saveProfile(page, '顾知遥');
  onlyLocal(fixture);
});

test('切换聊天会丢弃迟到简介，当前聊天的人物、正文和时钟都不受污染', async ({ page }) => {
  test.setTimeout(120000);
  const data = encounterFixture(), fixture = await withProductionPhone(page, data.state);
  await openStrangerEditor(page, data.stranger.id);
  await fillProfile(page, '只属于A的人物', 'deepseek', 'A的编辑草稿。');
  const before = await read(fixture.helper);
  await fixture.helper.evaluate(() => (window as unknown as Helper).reply(JSON.stringify({ story: 'A的迟到简介不得进入B。', phone_messages: [] }), true));
  await phone(page).getByRole('button', { name: '允许 LLM 生成简介', exact: true }).click();
  await expect(phone(page).locator('[data-story-contact-form]')).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => (window as unknown as { socialChange(chatId: string): void }).socialChange('social-b'));
  await fixture.helper.evaluate(() => (window as unknown as Helper).change());
  await expect(root(page)).toHaveCount(0);
  await page.locator('#social-reenter').click(); await expect(root(page)).toBeVisible();
  await fixture.helper.evaluate(() => (window as unknown as Helper).resolve());
  await openPhone(page);
  // The actual retained phone is already in its chat app after a chat switch.
  await phone(page).getByRole('button', { name: '联系人', exact: true }).click();
  await expect(phone(page).locator('[data-action="profile"][data-name="只属于A的人物"]')).toHaveCount(0);
  expect(await read(fixture.helper, 'social-a')).toEqual(before);
  const b = await read(fixture.helper, 'social-b');
  expect(b.unread_city.contacts).toEqual(data.state.contacts);
  expect(b.unread_city.clock).toEqual(data.state.clock);
  expect(b.unread_city.story.every(entry => !entry.text.includes('迟到简介'))).toBe(true);
  onlyLocal(fixture);
});
