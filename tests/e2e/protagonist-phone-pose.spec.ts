import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInitialState, reduceState } from '../../src/runtime/model';
import { enableProtagonists } from '../../src/runtime/protagonist-world';
import type { WorldState } from '../../src/frontend/types';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');
const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 },
];
const root = (page: Page) => page.locator('[data-unread-city-root]');

function withAcademics(state: WorldState): WorldState {
  state.academics = {
    majorId: 'computer-science',
    subjects: [
      { subjectId: 'cs-programming', points: 0 },
      { subjectId: 'cs-algorithms', points: 0 },
      { subjectId: 'cs-networks', points: 0 },
    ],
    lastGain: null,
  };
  return state;
}

function chatState(target: 'soyo' | 'sakiko' | 'emma'): WorldState {
  const state = enableProtagonists(withAcademics(createInitialState()));
  state.story = [{ id: 'narration-latest', role: 'assistant', text: '傍晚的街道安静下来，路灯一盏一盏亮起，晚风带着凉意。' }];
  return reduceState(state, { type: 'switch_protagonist', target });
}

async function noOverflow(page: Page) {
  const overflow = await page.locator('.uc-shell').evaluate(element => ({
    shell: element.scrollWidth - element.clientWidth,
    document: document.documentElement.scrollWidth - innerWidth,
  }));
  expect(overflow.shell).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

async function mountShell(page: Page, state: WorldState) {
  const errors: string[] = [];
  await page.goto('/');
  await page.evaluate(() => {
    (window as Window & { __unreadCityShell?: { dispose(): void } }).__unreadCityShell?.dispose();
  });
  await page.route('**/api/**', route => route.abort('blockedbyclient'));
  await page.route('https://**', route => route.abort('blockedbyclient'));
  await page.route('**/scripts/personas.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export let user_avatar = "";' }));
  await page.route('**/scripts/extensions/regex/engine.js', route => route.fulfill({ contentType: 'text/javascript', body: 'export const regex_placement = {}; export const getRegexedString = value => value;' }));
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => {
    localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
    document.body.innerHTML = '<main><label>原生输入<input id="native-phone-input"></label><div id="chat"></div><div id="extensions_settings"></div><div id="extensionsMenu"></div></main>';
    document.querySelector<HTMLInputElement>('#native-phone-input')!.focus();
    const host = window as unknown as Record<string, unknown>;
    const listeners = new Map<string, Set<(...args: unknown[]) => unknown>>();
    const eventSource = {
      on(name: string, listener: (...args: unknown[]) => unknown) { const set = listeners.get(name) ?? new Set(); set.add(listener); listeners.set(name, set); },
      removeListener(name: string, listener: (...args: unknown[]) => unknown) { listeners.get(name)?.delete(listener); },
      emit(name: string, ...args: unknown[]) { for (const listener of [...listeners.get(name) ?? []]) listener(...args); },
    };
    const denied = async () => { throw new Error('测试禁止模型调用'); };
    const ctx = {
      characterId: 0, groupId: null, chatId: 'pose-chat', mainApi: 'openai',
      characters: [{ avatar: 'pose-chat.png', name: '手机立绘测试角色', data: {} }],
      groups: [], chat: [], chatMetadata: {}, extensionSettings: {}, name1: '我', name2: '手机立绘测试角色',
      eventSource,
      eventTypes: Object.fromEntries(['CHAT_CHANGED', 'MESSAGE_RECEIVED', 'MESSAGE_SWIPED', 'MESSAGE_EDITED', 'MESSAGE_DELETED', 'CHARACTER_MESSAGE_RENDERED', 'GENERATION_AFTER_COMMANDS'].map(name => [name, name])),
      setExtensionPrompt() {}, updateMessageBlock() {}, messageFormatting: (value: string) => value,
      saveSettingsDebounced() {}, getRequestHeaders: () => ({ 'Content-Type': 'application/json' }),
      getCurrentChatId: () => ctx.chatId,
      generateRaw: denied, generateQuietPrompt: denied, getThumbnailUrl: () => '',
    };
    host.SillyTavern = { getContext: () => ctx };
    host.toastr = { info() {}, warning() {}, error() {}, success() {} };
    const iframe = document.createElement('iframe'); iframe.id = 'pose-helper'; iframe.hidden = true;
    iframe.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(iframe);
  });
  const handle = await page.locator('#pose-helper').elementHandle();
  const helper = (await handle!.contentFrame())!;
  await helper.waitForLoadState();
  await helper.evaluate((chat) => {
    const host = window as unknown as Record<string, unknown>;
    const listeners = new Map<string, Set<() => void>>();
    let variables: Record<string, unknown> = { keep_me: 42, unread_city: structuredClone(chat) };
    host.tavern_events = { CHAT_CHANGED: 'chat_id_changed' };
    host.getVariables = () => variables;
    host.replaceVariables = (next: Record<string, unknown>) => { variables = next; };
    host.eventOn = (event: string, callback: () => void) => { const set = listeners.get(event) ?? new Set(); set.add(callback); listeners.set(event, set); };
    host.eventRemoveListener = (event: string, callback: () => void) => { listeners.get(event)?.delete(callback); };
    host.getButtonEvent = (name: string) => `button:${name}`;
    host.generate = async () => { throw new Error('测试没有设置本地剧情回复；禁止模型调用'); };
    host.fixtureRead = () => structuredClone(variables);
    host.stopGenerationById = () => true;
  }, state);
  await helper.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
  return { errors };
}

for (const viewport of viewports) {
  test(`${viewport.width}x${viewport.height} phone window shows the protagonist phone pose instead of an empty stage`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(viewport);
    mkdirSync('outputs/phone-pose-qa', { recursive: true });
    const { errors } = await mountShell(page, chatState('soyo'));
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-current-protagonist', 'soyo');
    await expect(page.locator('[data-live2d-speaker-visible="true"]')).toHaveCount(1);
    await noOverflow(page);

    // Opening the phone mutes the standing Live2D and shows Soyo's own phone pose.
    await page.locator('.tool-dock .phone-launcher').click();
    await expect(page.locator('[data-protagonist-phone-pose][data-pose-protagonist="soyo"]')).toHaveCount(1);
    await expect(page.locator('.soyo-live2d')).toHaveClass(/is-muted/);
    await expect(page.locator('[data-protagonist-phone-pose] img[src^="data:image/webp;base64,"]')).toHaveCount(1);
    await noOverflow(page);
    await page.screenshot({ path: `outputs/phone-pose-qa/${viewport.width}x${viewport.height}-soyo-phone.png` });

    // Closing the phone restores the standing portrait.
    await page.locator('[aria-label="关闭手机窗口"]').click();
    await expect(page.locator('[data-protagonist-phone-pose]')).toHaveCount(0);
    await expect(page.locator('[data-live2d-speaker-visible="true"]')).toHaveCount(1);

    // Sakiko keeps the same outfit policy as her standing sprite; switching closes the phone first.
    await page.locator('[data-protagonist-select]').selectOption('sakiko');
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-current-protagonist', 'sakiko');
    await expect(page.locator('[data-sakiko-sprite]:not(.is-muted)')).toHaveCount(1);
    await page.locator('.tool-dock .phone-launcher').click();
    await expect(page.locator('[data-protagonist-phone-pose][data-pose-protagonist="sakiko"][data-pose-outfit="casual"]')).toHaveCount(1);
    await expect(page.locator('.novel-npc-portrait[data-sakiko-sprite].is-muted')).toHaveCount(1);
    await noOverflow(page);
    await page.screenshot({ path: `outputs/phone-pose-qa/${viewport.width}x${viewport.height}-sakiko-phone.png` });
    await page.locator('[aria-label="关闭手机窗口"]').click();
    await expect(page.locator('[data-protagonist-phone-pose]')).toHaveCount(0);
    await expect(page.locator('[data-sakiko-sprite]:not(.is-muted)')).toHaveCount(1);

    // Emma's pose likewise replaces her muted sprite while the phone is open.
    await page.locator('[data-protagonist-select]').selectOption('emma');
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-current-protagonist', 'emma');
    await expect(page.locator('[data-majo-portrait="majo-emma"]:not(.is-muted)')).toHaveCount(1);
    await page.locator('.tool-dock .phone-launcher').click();
    await expect(page.locator('[data-protagonist-phone-pose][data-pose-protagonist="emma"]')).toHaveCount(1);
    await expect(page.locator('.novel-npc-portrait[data-majo-portrait].is-muted')).toHaveCount(1);
    await noOverflow(page);
    await page.screenshot({ path: `outputs/phone-pose-qa/${viewport.width}x${viewport.height}-emma-phone.png` });
    await page.locator('[aria-label="关闭手机窗口"]').click();
    await expect(page.locator('[data-protagonist-phone-pose]')).toHaveCount(0);
    await expect(page.locator('[data-majo-portrait="majo-emma"]:not(.is-muted)')).toHaveCount(1);

    expect(errors).toEqual([]);
    writeFileSync(`outputs/phone-pose-qa/${viewport.width}x${viewport.height}.json`, JSON.stringify({
      viewport, soyo: 'pose replaces muted Live2D', sakiko: 'pose outfit casual',
      emma: 'pose replaces muted sprite', closeRestores: true, stage: 'passed',
    }, null, 2) + '\n');
  });
}
