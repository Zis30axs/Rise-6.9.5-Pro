import { createSelectedInitialState, completeAcademicSetup } from './academics-fixture';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createCampusWorld } from '../../src/frontend/scene-world';
import { isScenePositionWalkable, SCENE_WALK_RADIUS } from '../../src/frontend/scene-movement';
import type { WorldState } from '../../src/frontend/types';
import { getScenePeople } from '../../src/runtime/scene-context';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url), 'utf8');

const root = (page: Page) => page.locator('[data-unread-city-root]');
/** Map travel may offer the optional 80% interaction event; accept the original action. */
async function finishInteraction(page: Page) {
  const normal = page.getByRole('button', { name: '否，正常进行', exact: true });
  await normal.waitFor({ state: 'visible', timeout: 1500 }).then(() => normal.click()).catch(() => {});
}
async function gotoDemo(page: Page) {
  await page.goto('/');
  await completeAcademicSetup(page);
}
async function enter(page: Page) {
  await page.getByRole('button', { name: '进入未读之城', exact: true }).click();
  await expect(root(page)).toBeVisible();
  await completeAcademicSetup(page);
}
async function exit(page: Page) {
  await page.keyboard.press('Escape');
  await expect(root(page)).toHaveCount(0);
}
async function rest15(page: Page) {
  await page.getByRole('button', { name: '状态', exact: true }).click();
  await page.getByRole('region', { name: '个人状态与日记' }).getByRole('button', { name: /休息 15 分钟/ }).click();
  await page.getByRole('button', { name: '场景', exact: true }).click();
}

/** A host-owned phone: its iframe stays in native DOM for the entire test. */
async function withEmbeddedPhone(page: Page) {
  await gotoDemo(page); await exit(page);
  await page.evaluate(() => {
    const dialog = document.createElement('dialog');
    dialog.id = 'sttts-panel'; dialog.hidden = true;
    dialog.style.cssText = 'position:fixed;inset:auto;margin:0;padding:0;border:0;z-index:2147483500;display:none;';
    const frame = document.createElement('iframe');
    frame.id = 'mock-phone-frame'; frame.title = 'ST-iPhonie 测试手机';
    frame.style.cssText = 'width:100%;height:calc(100% - 40px);border:0;';
    frame.srcdoc = '<!doctype html><html><body><label>手机草稿<input aria-label="手机草稿"></label></body></html>';
    const close = document.createElement('button');
    close.id = 'sttts-panel-close'; close.textContent = '插件原有关闭按钮';
    dialog.append(close, frame); document.body.append(dialog);

    let releaseCurrent: (() => void) | undefined;
    let notifyClose: (() => void) | undefined;
    const count = (name: string) => {
      document.body.setAttribute(name, String(Number(document.body.getAttribute(name) || '0') + 1));
    };
    const hide = () => {
      dialog.hidden = true; dialog.removeAttribute('open'); dialog.style.display = 'none';
      document.body.dataset.phoneActive = 'false';
    };
    close.addEventListener('click', () => {
      const notify = notifyClose;
      if (releaseCurrent) releaseCurrent(); else hide();
      notify?.();
    });
    const entry = document.createElement('button');
    entry.id = 'sttts-open'; entry.textContent = '原生手机入口';
    entry.addEventListener('click', () => {
      releaseCurrent?.();
      count('data-phone-native-opens');
      dialog.hidden = false; dialog.setAttribute('open', ''); dialog.style.display = 'block';
      Object.assign(dialog.style, { left: '100px', top: '100px', width: '360px', height: '500px' });
    });
    document.body.append(entry);
    const host = window as unknown as Record<string, unknown>;
    host.STiPhoniePanelHost = {
      mount(anchor: HTMLElement, options: { onClose?: () => void } = {}) {
        if (!anchor.isConnected) throw new Error('手机占位尚未连接');
        releaseCurrent?.();
        count('data-phone-mounts');
        let released = false;
        const sync = () => {
          if (released) return;
          const rect = anchor.getBoundingClientRect();
          Object.assign(dialog.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        };
        const release = () => {
          if (released) return;
          released = true; count('data-phone-releases');
          releaseCurrent = undefined; notifyClose = undefined; hide();
        };
        releaseCurrent = release; notifyClose = options.onClose;
        dialog.hidden = false; dialog.setAttribute('open', ''); dialog.style.display = 'block';
        document.body.dataset.phoneActive = 'true';
        sync();
        return { release, sync, focus: () => frame.focus() };
      },
    };
  });
  await enter(page);
}

async function openEmbeddedPhone(page: Page) {
  await page.getByRole('button', { name: '手机', exact: true }).click();
  await expect(page.locator('[data-unread-city-phone-slot]')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-phone-active', 'true');
  await expect(page.locator('#sttts-panel')).toBeVisible();
  await expect(root(page)).toHaveCount(1);
}

/** Seed a bounded real Bridge save without adding production-only debug APIs. */
async function withLongStory(page: Page, options: { state?: WorldState; deferGeneration?: boolean; generationStory?: string; generationEvents?: { type: 'airliner_pass' }[] } = {}) {
  await gotoDemo(page); await exit(page);
  await page.evaluate(() => {
    (window as Window & { __unreadCityShell?: { dispose(): void } }).__unreadCityShell?.dispose();
    const host = window as unknown as Record<string, unknown>;
    host.SillyTavern = { getContext: () => ({ characterId: 0, groupId: null, chatId: 'reading-test', mainApi: 'openai', characters: [{ avatar: 'reading-test.png' }] }) };
    const iframe = document.createElement('iframe'); iframe.id = 'reading-helper-frame'; iframe.hidden = true;
    iframe.srcdoc = '<!doctype html><html><body></body></html>'; document.body.append(iframe);
  });
  const handle = await page.locator('#reading-helper-frame').elementHandle();
  const frame = await handle!.contentFrame();
  await frame!.waitForLoadState();
  const state = options.state ?? createSelectedInitialState();
  if (!options.state) state.story = Array.from({ length: 12 }, (_, index) => ({
    id: `chapter-${index}`, role: 'assistant' as const,
    text: `第 ${index + 1} 段。` + '窗外的天色慢慢暗下去，书页翻动的声音从走廊另一端传来。'.repeat(18),
  }));
  await frame!.evaluate(({ initial, deferGeneration, generationStory, generationEvents }) => {
    const host = window as unknown as Record<string, unknown>;
    const body = window.parent.document.body;
    const listeners = new Map<string, () => void>();
    let variables: Record<string, unknown> = { keep_me: 42, unread_city: initial };
    body.dataset.fixtureState = JSON.stringify(initial);
    host.tavern_events = { CHAT_CHANGED: 'chat_id_changed' };
    host.getVariables = () => variables;
    host.replaceVariables = (next: Record<string, unknown>) => {
      variables = next;
      body.dataset.fixtureState = JSON.stringify(next.unread_city);
    };
    host.eventOn = (event: string, callback: () => void) => { listeners.set(event, callback); };
    host.eventRemoveListener = (event: string) => { listeners.delete(event); };
    host.getButtonEvent = (name: string) => `button:${name}`;
    let release: (() => void) | undefined;
    host.releaseFixtureGeneration = () => release?.();
    host.generate = async (config: { user_input?: string }) => {
      body.dataset.fixtureGenerations = String(Number(body.dataset.fixtureGenerations || '0') + 1);
      body.dataset.fixturePrompt = config.user_input ?? '';
      if (deferGeneration) await new Promise<void>(resolve => { release = resolve; });
      return JSON.stringify({ story: generationStory ?? '新增的故事段落，应该等待正在阅读旧内容的你。', phone_messages: [], ...(generationEvents ? { world_events: generationEvents } : {}) });
    };
    host.stopGenerationById = () => true;
  }, { initial: state, deferGeneration: options.deferGeneration ?? false, generationStory: options.generationStory, generationEvents: options.generationEvents });
  await frame!.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
}

async function savedFixtureState(page: Page): Promise<WorldState> {
  return JSON.parse((await page.locator('body').getAttribute('data-fixture-state'))!) as WorldState;
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`空中客机：${viewport.width}px 对话事件入档、真实 GLB 经过与重进不重播`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // Install before fixture timers/RAF are created. Advancing the wall clock
    // must also deliver the expiry callback, including when drawing is idle.
    await page.clock.install({ time: Date.now() });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    const initial = createSelectedInitialState();
    initial.airTraffic.nextAmbientAt = Date.now() + 3600000;
    await withLongStory(page, { state: initial, generationStory: '一架客机从树梢上方的远空平稳飞过。', generationEvents: [{ type: 'airliner_pass' }] });
    const scene = page.locator('[data-aircraft-status]');
    await page.getByLabel('接下来，你想做什么？').fill('抬头看一眼天空，再继续刚才的话题。');
    await page.getByRole('button', { name: /继续故事/ }).click();
    await expect(page.getByRole('log')).toContainText('一架客机从树梢上方的远空平稳飞过。');
    await expect(scene).toHaveAttribute('data-aircraft-status', 'ready', { timeout: 10000 });
    const saved = await savedFixtureState(page);
    expect(saved.airTraffic.sequence).toBe(1);
    expect(saved.airTraffic.lastFlight?.source).toBe('story');
    expect(saved.clock).toEqual(initial.clock);
    expect(saved.phone).toEqual(initial.phone);
    expect(saved.player).toEqual(initial.player);
    const id = saved.airTraffic.lastFlight!.id;
    await expect(scene).toHaveAttribute('data-aircraft-id', id);
    const before = Number(await scene.getAttribute('data-aircraft-progress'));
    await page.getByRole('button', { name: '状态', exact: true }).click();
    await expect(page.getByRole('heading', { name: '空中动态', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '个人状态与日记' })).toContainText('剧情触发');
    await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
    await page.evaluate(() => (window as Window & { __unreadCityShell?: { open(): void } }).__unreadCityShell?.open());
    await expect(root(page)).toBeVisible();
    await expect(scene).toHaveAttribute('data-aircraft-status', 'ready', { timeout: 10000 });
    await expect(scene).toHaveAttribute('data-aircraft-id', id);
    expect(Number(await scene.getAttribute('data-aircraft-progress'))).toBeGreaterThanOrEqual(before);
    expect((await savedFixtureState(page)).airTraffic.sequence).toBe(1);
    const expiredAt = saved.airTraffic.lastFlight!.startedAt + 40001;
    const currentTime = await page.evaluate(() => Date.now());
    await page.clock.fastForward(Math.max(0, expiredAt - currentTime));
    const owner = await (await page.locator('#reading-helper-frame').elementHandle())!.contentFrame();
    expect(await page.evaluate(() => Date.now())).toBeGreaterThanOrEqual(expiredAt);
    expect(await owner!.evaluate(() => Date.now())).toBeGreaterThanOrEqual(expiredAt);
    await expect(scene).toHaveAttribute('data-aircraft-id', '');
    expect((await savedFixtureState(page)).airTraffic.sequence).toBe(1);
    expect(errors).toEqual([]);
  });
}

test('空中客机：随机经过写入同一状态，WebGL 丢失仍可查看事件与恢复酒馆', async ({ page }) => {
  const initial = createSelectedInitialState(); initial.airTraffic.nextAmbientAt = Date.now() - 1000;
  await withLongStory(page, { state: initial });
  const scene = page.locator('[data-aircraft-status]');
  await expect.poll(async () => (await savedFixtureState(page)).airTraffic.sequence, { timeout: 10000 }).toBe(1);
  await expect(scene).toHaveAttribute('data-aircraft-status', 'ready', { timeout: 10000 });
  const saved = await savedFixtureState(page);
  expect(saved.airTraffic.lastFlight?.source).toBe('ambient');
  expect(saved.story).toEqual(initial.story);
  await scene.locator('canvas').dispatchEvent('webglcontextlost');
  await expect(scene).toHaveAttribute('data-aircraft-status', 'fallback');
  await page.getByRole('button', { name: '状态', exact: true }).click();
  await expect(page.getByRole('region', { name: '个人状态与日记' })).toContainText('随机环境');
  await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
  await expect(root(page)).toHaveCount(0);
  await page.locator('#native-input').fill('飞机经过后继续使用原生聊天');
  await expect(page.locator('#native-input')).toHaveValue('飞机经过后继续使用原生聊天');
  expect(await page.locator('body').getAttribute('data-fixture-generations')).toBeNull();
});

test('六个面板打通阅读、移动、日程、日记，退出后原生输入可用', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await gotoDemo(page);
  await expect(root(page)).toBeVisible();
  await page.getByRole('button', { name: '手机', exact: true }).click();
  await page.getByRole('button', { name: /将 林同学 的消息标为已读/ }).click();
  await expect(page.getByText('已读 ✓', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const outlook = await page.locator('.wm-destination').filter({ hasText: '图书馆' }).innerText();
  const minutes = Number(outlook.match(/预计 (\d+) 分钟/)?.[1]);
  expect(minutes).toBeGreaterThanOrEqual(15);
  const arrival = 17 * 60 + 20 + minutes;
  const arrivalTime = `${Math.floor(arrival / 60)}:${String(arrival % 60).padStart(2, '0')}`;
  await page.getByRole('button', { name: '前往图书馆', exact: true }).click();
  await finishInteraction(page);
  await expect(page.locator('.topbar-world')).toContainText(arrivalTime);
  await page.getByRole('button', { name: '日程', exact: true }).click();
  await page.getByRole('button', { name: '完成这件事', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '已完成 ✓', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '人物', exact: true }).click();
  await expect(page.getByRole('heading', { name: '林同学', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '状态', exact: true }).click();
  await expect(page.getByRole('region', { name: '个人状态与日记' })).toContainText('完成日程');
  await page.getByRole('button', { name: '场景', exact: true }).click();
  await exit(page);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.getByLabel('原生输入框（用于检查恢复后的键盘焦点）').fill('原生输入仍可用');
  await expect(page.locator('#native-input')).toHaveValue('原生输入仍可用');
  await enter(page);
  await expect(page.locator('.topbar-world')).toContainText('图书馆');
  expect(errors).toEqual([]);
});

test('切换聊天后各自保存进度，重新进入不累积挂载节点', async ({ page }) => {
  await gotoDemo(page);
  await rest15(page);
  await expect(page.locator('.topbar-world')).toContainText('17:35');
  await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
  await page.locator('#demo-chat').selectOption('demo-b'); await enter(page);
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await exit(page); await page.locator('#demo-chat').selectOption('demo-a'); await enter(page);
  await expect(page.locator('.topbar-world')).toContainText('17:35');
  for (let i = 0; i < 3; i++) {
    await expect(root(page)).toHaveCount(1);
    await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
    await expect(root(page)).toHaveCount(0);
    await expect(page.locator('[data-unread-city-rescue]')).toHaveCount(0);
    await enter(page);
  }
});

test('生成中切换聊天会退出，旧回复不会进入新聊天', async ({ page }) => {
  await gotoDemo(page);
  await page.getByLabel('接下来，你想做什么？').fill('旧聊天迟到内容');
  await page.getByRole('button', { name: /继续故事/ }).click();
  await expect(page.getByRole('button', { name: /叙事中/ })).toBeDisabled();
  await page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('#demo-chat')!;
    select.value = 'demo-b'; select.dispatchEvent(new Event('change'));
  });
  await expect(root(page)).toHaveCount(0);
  await enter(page);
  await page.waitForTimeout(800); // Let the intentionally delayed old transport resolve.
  await expect(page.getByRole('log')).not.toContainText('旧聊天迟到内容');
  await expect(page.locator('.topbar-world')).toContainText('17:20');
});

test('生成故障保留草稿，允许重试且进度不变', async ({ page }) => {
  await gotoDemo(page); await exit(page);
  await page.locator('#demo-failure').click(); await enter(page);
  const input = page.getByLabel('接下来，你想做什么？');
  await input.fill('去看看公告栏');
  await page.getByRole('button', { name: /继续故事/ }).click();
  await expect(page.locator('.notice')).toContainText('模拟连接失败');
  await expect(input).toHaveValue('去看看公告栏');
  await expect(page.getByRole('log')).not.toContainText('你选择了');
  await page.getByRole('button', { name: /继续故事/ }).click();
  await expect(page.getByRole('log')).toContainText('你选择了');
  await expect(input).toHaveValue('');
});

test('390px 手机布局可导航、可发送，页面不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoDemo(page);
  for (const name of ['手机', '地图', '日程', '人物', '状态', '场景']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeInViewport(); await button.click();
  }
  await page.getByLabel('接下来，你想做什么？').fill('手机操作');
  await page.getByRole('button', { name: /继续故事/ }).click();
  await expect(page.getByRole('log')).toContainText('手机操作');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('[data-reading-layer]').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
  await expect(root(page)).toHaveCount(0);
});

test('发布 IIFE 在同源隐藏脚本 iframe 中运行；移除 iframe 自动恢复', async ({ page }) => {
  await gotoDemo(page); await exit(page);
  const initialState = createSelectedInitialState();
  await page.evaluate(initialState => {
    (window as Window & { __unreadCityShell?: { dispose(): void } }).__unreadCityShell?.dispose();
    const host = window as unknown as Record<string, unknown>;
    host.SillyTavern = { getContext: () => ({ characterId: 0, groupId: null, chatId: 'native-test-a', mainApi: 'openai', characters: [{ avatar: 'unread-city.png' }] }) };
    host.__helperInitialState = initialState;
    host.__helperGenerationError = new Error('Not Found');
    let attempts = 0;
    // Real Helper functions belong to the parent page, so their errors cross
    // realms when awaited by the character script's hidden iframe.
    host.__helperGenerate = async () => {
      if (++attempts === 1) throw host.__helperGenerationError;
      return JSON.stringify({ story: '真实桥接路径的模拟回应', phone_messages: [{ npcId: 'lin', text: '重试后的手机消息。' }] });
    };
    const iframe = document.createElement('iframe'); iframe.id = 'mock-helper-frame'; iframe.hidden = true;
    iframe.srcdoc = `<!doctype html><html><body><script>
      window.tavern_events={CHAT_CHANGED:'chat_id_changed'};
      const listeners=new Map(); let variables={keep_me:42,unread_city:JSON.parse(JSON.stringify(window.parent.__helperInitialState))};
      window.getVariables=()=>variables;
      window.replaceVariables=(v)=>{variables=v};
      window.eventOn=(type,callback)=>{listeners.set(type,callback)};
      window.eventRemoveListener=(type)=>{listeners.delete(type)};
      window.getButtonEvent=(name)=>'button:'+name;
      window.generate=window.parent.__helperGenerate;
      window.stopGenerationById=()=>true;
      <\/script></body></html>`;
    const helperPanel = document.createElement('div'); helperPanel.id = 'mock-helper-panel';
    helperPanel.append(iframe); document.body.append(helperPanel);
  }, initialState);
  const iframe = await page.locator('#mock-helper-frame').elementHandle();
  const frame = await iframe!.contentFrame();
  await frame!.waitForLoadState();
  expect(bundle).toContain('UNREAD_CITY_IMMERSIVE_BUNDLE');
  expect(bundle).not.toContain('process.env');
  await frame!.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
  await expect(page.locator('.topbar-world')).toContainText('校园南门');
  expect(await frame!.evaluate(() => (parent as unknown as Record<string, unknown>).__helperGenerationError instanceof Error)).toBe(false);
  const savedVariables = () => frame!.evaluate(() => JSON.stringify((window as unknown as { getVariables(): unknown }).getVariables()));
  const before = await savedVariables();
  const input = page.getByLabel('接下来，你想做什么？');
  await input.fill('bridge验证');
  await page.getByRole('button', { name: /继续故事/ }).click();
  await expect(root(page).locator('.notice')).toHaveText('Not Found');
  await expect(input).toHaveValue('bridge验证');
  await expect(page.getByRole('log')).not.toContainText('bridge验证');
  expect(await savedVariables()).toBe(before);

  await page.getByRole('button', { name: /继续故事/ }).click();
  await expect(page.getByRole('log')).toContainText('真实桥接路径的模拟回应');
  await expect(root(page).locator('.notice')).toHaveCount(0);
  await expect(input).toHaveValue('');
  const saved = JSON.parse(await savedVariables());
  expect(saved.keep_me).toBe(42);
  expect(saved.unread_city.story).toHaveLength(initialState.story.length + 2);
  expect(saved.unread_city.story.slice(-2)).toEqual([
    expect.objectContaining({ role: 'user', text: 'bridge验证' }),
    expect.objectContaining({ role: 'assistant', text: '真实桥接路径的模拟回应' }),
  ]);
  expect(saved.unread_city.phone).toHaveLength(initialState.phone.length + 1);
  expect(saved.unread_city.phone.at(-1)).toEqual(expect.objectContaining({ npcId: 'lin', text: '重试后的手机消息。', read: false }));
  expect(saved.unread_city.clock).toEqual(initialState.clock);
  await page.evaluate(() => document.getElementById('mock-helper-frame')!.remove());
  await expect(root(page)).toHaveCount(0);
  await expect(page.locator('[data-unread-city-rescue]')).toHaveCount(0);
  expect(await page.evaluate(() => '__unreadCityShell' in window)).toBe(false);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.locator('#native-input').fill('脚本卸载后可输入');
});

test('Bridge 缺失时发布 IIFE 保留原生界面，不锁定滚动', async ({ page }) => {
  await gotoDemo(page); await exit(page);
  await page.evaluate(() => {
    (window as Window & { __unreadCityShell?: { dispose(): void } }).__unreadCityShell?.dispose();
    document.documentElement.removeAttribute('data-unread-city-demo');
  });
  await page.addScriptTag({ content: bundle });
  await expect(root(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '未检测到兼容' })).toBeVisible();
  await page.locator('#native-input').fill('Bridge缺失也可操作');
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('局域网 HTTP 风格缺少 randomUUID 时仍可完成行动并保存', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window.crypto, 'randomUUID', { value: undefined, configurable: true }));
  await gotoDemo(page);
  await page.getByLabel('接下来，你想做什么？').fill('局域网手机行动');
  await page.getByRole('button', { name: /继续故事/ }).click();
  await expect(page.getByRole('log')).toContainText('你选择了');
  await exit(page); await enter(page);
  await expect(page.getByRole('log')).toContainText('局域网手机行动');
});

test('真实手机嵌入 Shell，收起返回场景并复用原有 iframe 与草稿', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await withEmbeddedPhone(page);
  await rest15(page);
  await openEmbeddedPhone(page);
  await expect(page.getByRole('button', { name: /将 林同学 的消息标为已读/ })).toHaveCount(0);
  await page.frameLocator('#mock-phone-frame').getByLabel('手机草稿').fill('打开前的草稿仍在');
  await expect(page.frameLocator('#mock-phone-frame').getByLabel('手机草稿')).toBeFocused();
  expect(await page.locator('#mock-phone-frame').evaluate(element => document.activeElement === element)).toBe(true);
  await page.keyboard.type('，继续写');
  expect(await page.locator('#mock-phone-frame').evaluate(element => element.parentElement?.id)).toBe('sttts-panel');
  const bounds = await page.locator('[data-unread-city-phone-slot]').boundingBox();
  const phoneBounds = await page.locator('#sttts-panel').boundingBox();
  expect(bounds).not.toBeNull(); expect(phoneBounds).not.toBeNull();
  expect(Math.abs(phoneBounds!.x - bounds!.x)).toBeLessThan(2);
  expect(Math.abs(phoneBounds!.width - bounds!.width)).toBeLessThan(2);
  const heading = page.getByRole('dialog', { name: '手机窗口', exact: true }).locator('.window-heading');
  const headingBounds = await heading.boundingBox();
  await page.mouse.move(headingBounds!.x + 70, headingBounds!.y + 20);
  await page.mouse.down();
  await page.mouse.move(headingBounds!.x + 25, headingBounds!.y + 35, { steps: 3 });
  await page.mouse.up();
  const movedSlot = await page.locator('[data-unread-city-phone-slot]').boundingBox();
  const movedPhone = await page.locator('#sttts-panel').boundingBox();
  expect(movedSlot!.x).toBeLessThan(bounds!.x - 30);
  expect(Math.abs(movedPhone!.x - movedSlot!.x)).toBeLessThan(2);
  expect(Math.abs(movedPhone!.y - movedSlot!.y)).toBeLessThan(2);

  await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
  await expect(root(page)).toBeVisible();
  await expect(page.getByLabel('接下来，你想做什么？')).toBeVisible();
  await expect(page.locator('.topbar-world')).toContainText('17:35');
  await expect(page.locator('#sttts-panel')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-phone-releases', '1');

  await openEmbeddedPhone(page);
  await expect(page.locator('#mock-phone-frame')).toHaveCount(1);
  await expect(page.frameLocator('#mock-phone-frame').getByLabel('手机草稿')).toHaveValue('打开前的草稿仍在，继续写');
  await page.locator('#sttts-panel-close').click();
  await expect(page.getByLabel('接下来，你想做什么？')).toBeVisible();
  await expect(root(page)).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-phone-releases', '2');
  expect(errors).toEqual([]);
});

test('切换面板与退出释放手机托管，原生手机入口随后仍可使用', async ({ page }) => {
  await withEmbeddedPhone(page); await openEmbeddedPhone(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  await expect(page.getByRole('region', { name: '探索地图' })).toBeVisible();
  await expect(page.locator('#sttts-panel')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-phone-releases', '1');
  await openEmbeddedPhone(page);
  await page.getByRole('button', { name: '退出沉浸界面，恢复酒馆原生界面', exact: true }).click();
  await expect(root(page)).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-phone-releases', '2');
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.locator('#sttts-open').click();
  await expect(page.locator('#sttts-panel')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-phone-native-opens', '1');
  await expect(page.locator('#mock-phone-frame')).toHaveCount(1);
  await page.locator('#sttts-panel-close').click();
  await enter(page); await openEmbeddedPhone(page);
  await expect(page.locator('body')).toHaveAttribute('data-phone-mounts', '3');
});

test('Esc 先收起嵌入手机，再退出 Shell 恢复原生输入', async ({ page }) => {
  await withEmbeddedPhone(page); await openEmbeddedPhone(page);
  // Parent-document keyboard behavior; iframe-local Escape is the plugin's own test.
  await page.getByRole('button', { name: '手机', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(root(page)).toBeVisible();
  await expect(page.locator('#sttts-panel')).toBeHidden();
  await expect(page.getByLabel('接下来，你想做什么？')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-phone-releases', '1');
  await exit(page);
  await expect(page.locator('[data-unread-city-rescue]')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.locator('#native-input').fill('收起手机后仍能退出');
  await expect(page.locator('#native-input')).toHaveValue('收起手机后仍能退出');
});

test('手机打开时切换聊天释放托管，各世界进度保持独立', async ({ page }) => {
  await withEmbeddedPhone(page);
  await rest15(page);
  await openEmbeddedPhone(page);
  await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
  await expect(root(page)).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-phone-releases', '1');
  await page.locator('#demo-chat').selectOption('demo-b'); await enter(page);
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await openEmbeddedPhone(page);
  await page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('#demo-chat')!;
    select.value = 'demo-a'; select.dispatchEvent(new Event('change'));
  });
  await expect(root(page)).toHaveCount(0);
  await expect(page.locator('body')).toHaveAttribute('data-phone-releases', '2');
  await expect(page.locator('#sttts-panel')).toBeHidden();
  await enter(page);
  await expect(page.locator('.topbar-world')).toContainText('17:35');
  await openEmbeddedPhone(page);
  await expect(page.locator('#mock-phone-frame')).toHaveCount(1);
  await expect(page.locator('body')).toHaveAttribute('data-phone-mounts', '3');
});

test('390px 嵌入手机保留 Shell 的退出与导航空间', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withEmbeddedPhone(page); await openEmbeddedPhone(page);
  const phone = await page.locator('#sttts-panel').boundingBox();
  const exitButton = page.getByRole('button', { name: '退出沉浸界面，恢复酒馆原生界面', exact: true });
  const mapButton = page.getByRole('button', { name: '地图', exact: true });
  await expect(exitButton).toBeInViewport(); await expect(mapButton).toBeInViewport();
  const exitBounds = await exitButton.boundingBox(); const mapBounds = await mapButton.boundingBox();
  expect(phone).not.toBeNull(); expect(exitBounds).not.toBeNull(); expect(mapBounds).not.toBeNull();
  expect(phone!.y).toBeGreaterThanOrEqual(exitBounds!.y + exitBounds!.height);
  expect(phone!.y + phone!.height).toBeLessThanOrEqual(mapBounds!.y);
  expect(phone!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mapButton.click();
  await expect(page.locator('#sttts-panel')).toBeHidden();
  await expect(page.getByRole('region', { name: '探索地图' })).toBeVisible();
});

test('390px 宿主根元素 transform 且高度为零时，Shell 与右上角切换聊天仍完整可见', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    // SillyTavern themes can turn html into a zero-height fixed containing block.
    document.documentElement.style.transform = 'translateZ(0)';
    document.documentElement.style.height = '0px';
  });
  await withEmbeddedPhone(page); await openEmbeddedPhone(page);
  await expect(root(page)).toBeInViewport({ ratio: 1 });
  const shellBounds = await root(page).boundingBox();
  expect(shellBounds).not.toBeNull();
  expect(shellBounds!.height).toBeGreaterThanOrEqual(843);
  const chat = page.getByRole('button', { name: '切换聊天并恢复原生界面' });
  await expect(page.locator('[data-unread-city-rescue]')).toHaveCount(0);
  await expect(chat).toBeInViewport({ ratio: 1 });
  const chatBounds = await chat.boundingBox();
  expect(chatBounds).not.toBeNull();
  expect(chatBounds!.y).toBeGreaterThanOrEqual(0);
  expect(chatBounds!.y + chatBounds!.height).toBeLessThanOrEqual(844);
  await chat.click();
  await expect(root(page)).toHaveCount(0);
  await expect(page.locator('[data-unread-city-rescue]')).toHaveCount(0);
  await expect(page.locator('#sttts-panel')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-phone-releases', '1');
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await page.locator('#native-input').fill('宿主变换后仍能恢复原生输入');
  await expect(page.locator('#native-input')).toHaveValue('宿主变换后仍能恢复原生输入');
});

test('小说正文可展开、收起和继续，切换浮窗保留草稿及阅读模式', async ({ page }) => {
  await withEmbeddedPhone(page);
  const shell = page.locator('.uc-shell');
  const input = page.getByLabel('接下来，你想做什么？');
  await input.fill('这是一段尚未发送的行动');
  await page.getByRole('button', { name: '展开正文', exact: true }).click();
  await expect(shell).toHaveAttribute('data-reading-mode', 'expanded');
  await page.getByRole('button', { name: '地图', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '地图窗口', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭地图窗口', exact: true }).click();
  await expect(shell).toHaveAttribute('data-reading-mode', 'expanded');
  await expect(input).toHaveValue('这是一段尚未发送的行动');
  await openEmbeddedPhone(page);
  await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
  await expect(shell).toHaveAttribute('data-reading-mode', 'expanded');
  await expect(input).toHaveValue('这是一段尚未发送的行动');
  await page.keyboard.press('Escape');
  await expect(shell).toHaveAttribute('data-reading-mode', 'compact');
  await expect(root(page)).toBeVisible();
  await page.getByRole('button', { name: '收起正文', exact: true }).click();
  await expect(shell).toHaveAttribute('data-reading-mode', 'hidden');
  await expect(page.getByRole('region', { name: '小说正文' })).toBeHidden();
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await expect(shell).toHaveAttribute('data-reading-mode', 'compact');
  await expect(input).toHaveValue('这是一段尚未发送的行动');
  await page.getByRole('button', { name: '地图', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '地图窗口', exact: true })).toHaveCount(0);
  await expect(root(page)).toBeVisible();
  await exit(page);
});

test('阅读旧段落时新回复保持位置，提示后可跳到最新，切浮窗不丢位置', async ({ page }) => {
  await withLongStory(page);
  await page.getByRole('button', { name: '往前读', exact: true }).click();
  const story = page.getByRole('log', { name: '故事记录' });
  await expect(story).toHaveAttribute('aria-live', 'off');
  expect(await story.evaluate(element => element.scrollHeight > element.clientHeight * 3)).toBe(true);
  await story.evaluate(element => { element.scrollTop = 120; element.dispatchEvent(new Event('scroll')); });
  const position = await story.evaluate(element => element.scrollTop);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  await page.getByRole('button', { name: '关闭地图窗口', exact: true }).click();
  expect(await story.evaluate(element => element.scrollTop)).toBeCloseTo(position, 0);
  await page.getByRole('button', { name: '收起正文', exact: true }).click();
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  expect(await story.evaluate(element => element.scrollTop)).toBeCloseTo(position, 0);
  await page.getByRole('button', { name: '展开正文', exact: true }).click();
  expect(await story.evaluate(element => element.scrollTop)).toBeCloseTo(position, 0);
  await page.getByLabel('接下来，你想做什么？').fill('继续这段故事');
  await page.getByRole('button', { name: /继续故事/ }).click();
  await expect(story).toContainText('新增的故事段落');
  await expect(page.getByRole('button', { name: /有新内容/ })).toBeVisible();
  expect(await story.evaluate(element => element.scrollTop)).toBeCloseTo(position, 0);
  await page.getByRole('button', { name: /有新内容/ }).click();
  await expect(story).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByRole('button', { name: /有新内容/ })).toHaveCount(0);
  expect(await story.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(4);
  await expect(page.locator('body')).toHaveAttribute('data-fixture-generations', '1');
});

test('收起正文等待回复时保留新内容提示，继续阅读后主动跳到最新', async ({ page }) => {
  await gotoDemo(page);
  await page.getByLabel('接下来，你想做什么？').fill('在背景中等待故事');
  await page.getByRole('button', { name: /继续故事/ }).click();
  await page.getByRole('button', { name: '收起正文', exact: true }).click();
  const resume = page.getByRole('button', { name: '继续阅读', exact: true });
  await expect(resume).toContainText('有新内容');
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'hidden');
  await resume.click();
  await expect(page.getByRole('log', { name: '故事记录' })).toContainText('在背景中等待故事');
  await page.getByRole('button', { name: /有新内容/ }).click();
  await expect(page.getByRole('button', { name: /有新内容/ })).toHaveCount(0);
  await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue('');
});

test('三维自由行走支持 WASD 和环视，停止与恢复阅读保留位置和草稿，图形失效仍可退出', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await withLongStory(page);
  const scene = page.locator('[data-unread-city-scene]');
  await expect(scene).toHaveAttribute('data-renderer', 'webgl');
  await page.getByLabel('接下来，你想做什么？').fill('走走再继续写');
  const initialView = await scene.getAttribute('data-view');
  await page.getByRole('button', { name: '自由行走', exact: true }).click();
  const canvas = page.getByLabel('可交互三维场景', { exact: true });
  await expect(canvas).toBeFocused();
  await expect(page.getByRole('log', { name: '故事记录' })).toBeHidden();
  const start = await scene.getAttribute('data-position');
  await page.keyboard.down('w');
  await expect.poll(async () => Number((await scene.getAttribute('data-position'))!.split(',')[2])).toBeLessThan(17.5);
  await page.keyboard.down('d'); await page.keyboard.press('ArrowRight');
  await expect.poll(async () => Number((await scene.getAttribute('data-position'))!.split(',')[0])).toBeGreaterThan(.3);
  await page.keyboard.up('w'); await page.keyboard.up('d');
  const stopped = await scene.getAttribute('data-position');
  expect(stopped).not.toBe(start);
  await page.waitForTimeout(180);
  await expect(scene).toHaveAttribute('data-position', stopped!);
  await expect(scene).not.toHaveAttribute('data-view', initialView!);
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue('走走再继续写');
  await page.getByLabel('接下来，你想做什么？').fill('wasd 不应带着主角走');
  await expect(scene).toHaveAttribute('data-position', stopped!);
  await page.getByRole('button', { name: '自由行走', exact: true }).click();
  await expect(scene).toHaveAttribute('data-position', stopped!);
  // Opening a phone while a movement key is held must cancel that input.
  await page.keyboard.down('w');
  await expect(scene).not.toHaveAttribute('data-position', stopped!);
  await page.getByRole('button', { name: '手机', exact: true }).click();
  const paused = await scene.getAttribute('data-position');
  await page.waitForTimeout(180);
  await expect(scene).toHaveAttribute('data-position', paused!);
  await page.keyboard.up('w');
  await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
  await expect(scene).toHaveAttribute('data-position', paused!);
  await canvas.focus(); await page.keyboard.down('w');
  await expect(scene).not.toHaveAttribute('data-position', paused!);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurred = await scene.getAttribute('data-position');
  await page.waitForTimeout(180);
  await expect(scene).toHaveAttribute('data-position', blurred!);
  await page.keyboard.up('w');
  await canvas.focus(); await page.keyboard.down('w');
  await expect(scene).not.toHaveAttribute('data-position', blurred!);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await scene.getAttribute('data-position');
  await page.keyboard.up('w');
  await page.evaluate(() => {
    delete (document as unknown as { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(180);
  await expect(scene).toHaveAttribute('data-position', hidden!);
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
  await page.getByLabel('可交互三维场景', { exact: true }).dispatchEvent('webglcontextlost');
  await expect(scene).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('group', { name: '移动摇杆' })).toHaveCount(0);
  await page.getByRole('button', { name: '继续阅读', exact: true }).click();
  await expect(page.getByRole('log', { name: '故事记录' })).toBeVisible();
  await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
  await expect(root(page)).toHaveCount(0);
  await page.locator('#native-input').fill('三维场景失效后仍可使用原生界面');
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`${viewport.width}px 自由行走双手同时移动环视，松手和取消停步，手机与恢复入口不被遮挡`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await withEmbeddedPhone(page);
    await page.getByRole('button', { name: '自由行走', exact: true }).click();
    const scene = page.locator('[data-unread-city-scene]');
    await expect(scene).toHaveAttribute('data-renderer', 'webgl');
    const joystick = page.getByRole('group', { name: '移动摇杆' });
    await expect(joystick).toBeInViewport({ ratio: 1 });
    const rect = (await joystick.boundingBox())!;
    const lookPad = page.getByRole('group', { name: '视角环视区域' });
    await expect(lookPad).toBeInViewport({ ratio: 1 });
    const lookRect = (await lookPad.boundingBox())!;
    const guideButton = page.getByRole('button', { name: '展开步行导览', exact: true });
    await expect(guideButton).toBeInViewport({ ratio: 1 });
    expect((await guideButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const beforeGuide = await scene.getAttribute('data-position');
    await guideButton.click();
    const guide = page.locator('#uc-walk-guide');
    await expect(guide).toBeInViewport({ ratio: 1 });
    await page.getByLabel('步行导览目的地', { exact: true }).selectOption({ label: '运动场' });
    await expect(guide.locator('p')).toContainText('运动场');
    await expect(guide.locator('p')).toContainText('直线');
    await expect(scene).toHaveAttribute('data-position', beforeGuide!);
    const guideBox = (await guide.boundingBox())!;
    for (const control of [rect, lookRect]) {
      expect(guideBox.x + guideBox.width <= control.x || guideBox.x >= control.x + control.width || guideBox.y + guideBox.height <= control.y || guideBox.y >= control.y + control.height).toBe(true);
    }
    const guidePlayer = await page.locator('.guide-player').getAttribute('transform');
    await page.getByRole('button', { name: '收起步行导览', exact: true }).click();
    for (const spot of await page.locator('.campus-hotspot:visible').all()) {
      const box = (await spot.boundingBox())!;
      for (const control of [rect, lookRect]) {
        expect(box.x + box.width <= control.x || box.x >= control.x + control.width || box.y + box.height <= control.y || box.y >= control.y + control.height).toBe(true);
      }
    }
    expect(rect.width).toBeGreaterThanOrEqual(100);
    const start = await scene.getAttribute('data-position');
    const view = await scene.getAttribute('data-view');
    const session = await page.context().newCDPSession(page);
    const move = { id: 11, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 - 30 };
    const look = { id: 12, x: lookRect.x + lookRect.width / 2, y: lookRect.y + lookRect.height / 2 };
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move] });
    await expect(scene).not.toHaveAttribute('data-position', start!);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, look] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move, { ...look, x: look.x - 70, y: look.y - 15 }] });
    await expect(scene).not.toHaveAttribute('data-view', view!);
    const walking = await scene.getAttribute('data-position');
    await expect(scene).not.toHaveAttribute('data-position', walking!);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const stopped = await scene.getAttribute('data-position');
    await page.waitForTimeout(180);
    await expect(scene).toHaveAttribute('data-position', stopped!);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move] });
    await expect(scene).not.toHaveAttribute('data-position', stopped!);
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    const canceled = await scene.getAttribute('data-position');
    await page.waitForTimeout(180);
    await expect(scene).toHaveAttribute('data-position', canceled!);
    await page.getByRole('button', { name: '展开步行导览', exact: true }).click();
    await expect(page.locator('.guide-player')).not.toHaveAttribute('transform', guidePlayer!);
    await expect(page.getByLabel('步行导览目的地', { exact: true })).toHaveValue(/.+/);
    await openEmbeddedPhone(page);
    await expect(joystick).toHaveCount(0);
    await page.frameLocator('#mock-phone-frame').getByLabel('手机草稿').fill('wasd');
    await expect(scene).toHaveAttribute('data-position', canceled!);
    await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
    await expect(joystick).toBeVisible();
    await expect(scene).toHaveAttribute('data-position', canceled!);
    await page.getByRole('button', { name: '继续阅读', exact: true }).click();
    await expect(page.getByRole('log', { name: '故事记录' })).toBeVisible();
    await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
    await expect(root(page)).toHaveCount(0);
    await page.locator('#native-input').fill('行走退出后仍能输入');
    await session.detach();
  });
}

test('校园穿过南门连续走到街区，导览与剧情位置同步而不消耗出行时间', async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await withLongStory(page);
  const scene = page.locator('[data-unread-city-scene]');
  await expect(scene).toHaveAttribute('data-renderer', 'webgl');
  const initial = await savedFixtureState(page);
  await page.getByRole('button', { name: '自由行走', exact: true }).click();
  const positions: number[] = [];
  await page.keyboard.down('s');
  await expect.poll(async () => {
    const z = Number((await scene.getAttribute('data-position'))!.split(',')[2]);
    positions.push(z); return z;
  }, { timeout: 25_000, intervals: [200] }).toBeGreaterThan(57);
  await page.keyboard.up('s');
  const stopped = await scene.getAttribute('data-position');
  expect(positions.length).toBeGreaterThan(20);
  for (let index = 1; index < positions.length; index++) {
    expect(positions[index] - positions[index - 1]).toBeGreaterThanOrEqual(0);
    expect(positions[index] - positions[index - 1]).toBeLessThan(2);
  }
  await page.getByRole('button', { name: '展开步行导览', exact: true }).click();
  await expect(page.locator('.walk-mode-caption')).toContainText(/街|路口/);
  await expect(page.locator('.campus-hotspot:visible')).toHaveCount(0);
  await expect(page.locator('.guide-player')).toHaveAttribute('transform', /translate\(0 5[7-9]/);
  await page.waitForTimeout(180);
  await expect(scene).toHaveAttribute('data-position', stopped!);
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await expect(page.locator('.topbar-world')).toContainText('十字路口');
  const saved = await savedFixtureState(page);
  expect(saved.locationId).toBe('junction');
  expect(saved.clock).toEqual(initial.clock);
  expect(saved.player.energy).toBe(initial.player.energy);
  await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
});

test('连续走入图书馆前庭会同步剧情地点，继续步行与脚本重挂载保持坐标', async ({ page }) => {
  test.setTimeout(40_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await withLongStory(page);
  const scene = page.locator('[data-unread-city-scene]');
  await expect(scene).toHaveAttribute('data-renderer', 'webgl');
  const initial = await savedFixtureState(page);
  await page.getByRole('button', { name: '自由行走', exact: true }).click();
  const samples: number[] = [];
  await page.keyboard.down('w');
  // Prove movement before any entrance or wall can stop the player.
  await expect.poll(async () => Number((await scene.getAttribute('data-position'))!.split(',')[2])).toBeLessThan(17.5);
  await expect.poll(async () => {
    const z = Number((await scene.getAttribute('data-position'))!.split(',')[2]);
    samples.push(z); return z;
  }, { timeout: 18_000, intervals: [150] }).toBeLessThan(-6.3);
  await expect(page.locator('.topbar-world')).toContainText('图书馆');
  const campus = createCampusWorld(new THREE.Scene());
  const movementWorld = campus.movementWorld;
  const door = movementWorld.colliders.find(collider => collider.id === 'library-door');
  campus.dispose();
  if (!door || door.kind !== 'box') throw new Error('图书馆入口缺少门碰撞体');
  const wallZ = door.maxZ + SCENE_WALK_RADIUS;
  // Polling may first observe the player already at the doorway; compare with
  // the real collision boundary instead of asking for another unreachable step.
  await expect.poll(async () => Number((await scene.getAttribute('data-position'))!.split(',')[2])).toBeCloseTo(wallZ, 2);
  await page.waitForTimeout(180);
  expect(Number((await scene.getAttribute('data-position'))!.split(',')[2])).toBeCloseTo(wallZ, 2);
  await page.keyboard.up('w');
  const stopped = (await scene.getAttribute('data-position'))!.split(',').map(Number);
  expect(isScenePositionWalkable(stopped[0], stopped[2], movementWorld)).toBe(true);
  expect(samples.length).toBeGreaterThan(20);
  for (let index = 1; index < samples.length; index++) {
    expect(samples[index] - samples[index - 1]).toBeLessThanOrEqual(0);
    expect(samples[index - 1] - samples[index]).toBeLessThan(1.7);
  }
  await expect.poll(async () => Math.abs((await savedFixtureState(page)).scene!.z - stopped[2])).toBeLessThan(.15);
  const saved = await savedFixtureState(page);
  expect(saved.locationId).toBe('library');
  expect(saved.scene?.areaId).toBe('library');
  expect(saved.clock).toEqual(initial.clock);
  expect(saved.player).toEqual(initial.player);
  expect(saved.phone).toEqual(initial.phone);
  expect(saved.story).toEqual(initial.story);
  await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
  await expect(root(page)).toHaveCount(0);
  const helper = await (await page.locator('#reading-helper-frame').elementHandle())!.contentFrame();
  await helper!.addScriptTag({ content: bundle });
  await expect(root(page)).toBeVisible();
  const restored = (await scene.getAttribute('data-position'))!.split(',').map(Number);
  expect(Math.abs(restored[0] - stopped[0])).toBeLessThan(.15);
  expect(Math.abs(restored[2] - stopped[2])).toBeLessThan(.15);
  await page.getByRole('button', { name: '自由行走', exact: true }).click();
  await expect(page.locator('.topbar-world')).toContainText('图书馆');
  expect((await savedFixtureState(page)).scene?.seed).toBe(saved.scene?.seed);
  await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`${viewport.width}px 街边搭话先准备行动，确认后将原位置与同一行人送给模型，生成中停步`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const initial = createSelectedInitialState();
    initial.locationId = 'bookshop';
    initial.scene = { x: -22, z: 56.5, yaw: 0, areaId: 'bookshop', seed: 'e2e-scene-link', encounterId: null };
    const person = getScenePeople(initial.scene)
      .filter(person => Math.hypot(person.x - initial.scene!.x, person.z - initial.scene!.z) <= 6)
      .sort((a, b) => Math.hypot(a.x + 22, a.z - 56.5) - Math.hypot(b.x + 22, b.z - 56.5))[0]!;
    const reply = `${person.name}停下脚步，朝书店橱窗示意：“想找哪一类书？”`;
    await withLongStory(page, { state: initial, deferGeneration: true, generationStory: reply });
    const scene = page.locator('[data-unread-city-scene]');
    await expect(scene).toHaveAttribute('data-renderer', 'webgl');
    await page.getByRole('button', { name: '自由行走', exact: true }).click();
    const talk = page.locator(`[data-scene-person-id="${person.id}"]`);
    await expect(talk).toHaveAccessibleName(`与${person.name}搭话`);
    await expect(talk).toContainText(person.identity);
    await expect(talk).toBeInViewport({ ratio: 1 });
    const box = (await talk.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    for (const name of ['移动摇杆', '视角环视区域']) {
      const control = (await page.getByRole('group', { name, exact: true }).boundingBox())!;
      expect(box.x + box.width <= control.x || box.x >= control.x + control.width || box.y + box.height <= control.y || box.y >= control.y + control.height).toBe(true);
    }
    const reading = (await page.getByRole('button', { name: '继续阅读', exact: true }).boundingBox())!;
    expect(box.x + box.width <= reading.x || box.x >= reading.x + reading.width || box.y + box.height <= reading.y || box.y >= reading.y + reading.height).toBe(true);
    await page.getByRole('button', { name: '展开步行导览', exact: true }).click();
    await expect(page.locator('.scene-nearby-people')).toHaveCount(0);
    await page.getByRole('button', { name: '收起步行导览', exact: true }).click();
    await expect(talk).toBeVisible();
    const start = await scene.getAttribute('data-position');
    await talk.click();
    await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(new RegExp(person.name));
    await expect(page.getByRole('log', { name: '故事记录' })).toBeVisible();
    await expect(scene).toHaveAttribute('data-position', start!);
    await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
    await expect.poll(async () => (await savedFixtureState(page)).scene?.encounterId).toBe(person.id);
    await page.getByRole('button', { name: /继续故事/ }).click();
    await expect(page.getByRole('button', { name: /叙事中/ })).toBeDisabled();
    const prompt = (await page.locator('body').getAttribute('data-fixture-prompt'))!;
    expect(prompt).toContain('街角书店');
    expect(prompt).toContain('橱窗');
    expect(prompt).toContain(person.name);
    expect(prompt).toContain(person.identity);
    expect(prompt).toContain(person.id);
    await page.getByLabel('可交互三维场景', { exact: true }).focus();
    await page.keyboard.down('d');
    await page.waitForTimeout(200);
    await expect(scene).toHaveAttribute('data-position', start!);
    await page.keyboard.up('d');
    const helper = await (await page.locator('#reading-helper-frame').elementHandle())!.contentFrame();
    await helper!.evaluate(() => (window as unknown as { releaseFixtureGeneration(): void }).releaseFixtureGeneration());
    await expect(page.getByRole('log', { name: '故事记录' })).toContainText(reply);
    await expect(scene).toHaveAttribute('data-position', start!);
    await expect(page.locator('body')).toHaveAttribute('data-fixture-generations', '1');
    expect((await savedFixtureState(page)).phone).toEqual(initial.phone);
    expect((await savedFixtureState(page)).scene?.x).toBe(initial.scene.x);
    expect((await savedFixtureState(page)).scene?.z).toBe(initial.scene.z);
    await page.getByRole('button', { name: '自由行走', exact: true }).click();
    await page.keyboard.down('d');
    await expect(scene).not.toHaveAttribute('data-position', start!);
    await page.keyboard.up('d');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('旧语音标记只在小说显示层去重，存档原文保留', async ({ page }) => {
  const initial = createSelectedInitialState();
  const text = '“你好，你也是刚下课吗？”<tts>沈景行|friendly|你好，你也是刚下课吗？</tts>';
  initial.story = [{ id: 'voice-metadata', role: 'assistant', text }];
  await withLongStory(page, { state: initial });
  const story = page.getByRole('log', { name: '故事记录' });
  await expect(story).toContainText('你好，你也是刚下课吗？');
  await expect(story).not.toContainText('<tts>');
  await expect(story).not.toContainText('friendly');
  expect((await story.innerText()).match(/你好，你也是刚下课吗？/g)).toHaveLength(1);
  expect((await savedFixtureState(page)).story[0].text).toBe(text);
});

test('禁用 WebGL 时390px静态背景仍能探索、使用浮窗与阅读，热点只准备行动', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value(type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return Reflect.apply(original, this, [type, ...args]);
    } });
  });
  await withLongStory(page);
  const scene = page.locator('[data-unread-city-scene]');
  await expect(scene).toHaveAttribute('data-renderer', 'fallback');
  await page.getByRole('button', { name: '收起正文', exact: true }).click();
  for (const [hotspot, title] of [['路牌 · 地图', '地图'], ['公告栏 · 日程', '日程'], ['打开手机', '手机']]) {
    await page.getByRole('button', { name: hotspot, exact: true }).click();
    const window = page.getByRole('dialog', { name: `${title}窗口`, exact: true });
    await expect(window).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: `关闭${title}窗口`, exact: true }).click();
  }
  const node = await scene.getAttribute('data-scene-node');
  await page.getByRole('button', { name: '向前走', exact: true }).click();
  await expect(scene).not.toHaveAttribute('data-scene-node', node!);
  await page.getByRole('button', { name: '返回上个位置', exact: true }).click();
  await expect(scene).toHaveAttribute('data-scene-node', node!);
  await page.getByRole('button', { name: '看看周围', exact: true }).click();
  await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue('观察一下周围的环境。');
  await expect(page.locator('.uc-shell')).toHaveAttribute('data-reading-mode', 'compact');
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
  await expect(root(page)).toHaveCount(0);
});

test('地图保持本地工具行为，沙盘等四个范围入口与同一个全球画布衔接', async ({ page }) => {
  await withLongStory(page);
  const clock = await page.locator('.topbar-world').textContent();
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const map = page.locator('.world-map');
  const viewport = page.locator('[data-world-map-viewport]');
  await expect(viewport).toHaveAttribute('data-map-depth', '0.000');
  await page.getByRole('button', { name: '放大地图', exact: true }).click();
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-scale'))).toBeCloseTo(1.3, 2);
  await viewport.focus(); await page.keyboard.press('+');
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-scale'))).toBeCloseTo(1.69, 2);
  await page.getByRole('button', { name: '复位地图视图', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-scale', '1.000');
  const layers = page.getByRole('navigation', { name: '地图范围', exact: true });
  await expect(layers.getByRole('button')).toHaveCount(4);
  await expect(layers.getByRole('button', { name: '校园', exact: true })).toHaveCount(0);
  await expect(layers.getByRole('button', { name: '中国', exact: true })).toHaveCount(0);
  const atlasCanvas = await map.locator('.atlas-canvas').elementHandle();
  for (const [depth, label, id] of [[0, '沙盘', 'sandtable'], [2, '城市', 'city'], [3, '所在区域', 'province'], [5, '世界', 'world']] as const) {
    await layers.getByRole('button', { name: label, exact: true }).click();
    await expect(map).toHaveAttribute('data-map-layer', id);
    await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(depth, 2);
    if (depth >= 3) await expect(map.locator('.atlas-canvas')).toBeVisible();
    expect(await atlasCanvas!.evaluate(element => element.isConnected)).toBe(true);
  }
  await layers.getByRole('button', { name: '沙盘', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-depth', '0.000');
  const people = page.getByRole('checkbox', { name: '显示演示人物定位', exact: true });
  await expect(people).not.toBeChecked();
  await expect(map.locator('.wm-person-pin')).toHaveCount(0);
  await people.check();
  await expect(map.locator('.wm-person-pin')).toHaveCount(1);
  await expect(map.locator('.wm-person-pin')).toContainText('林同学');
  await page.getByRole('button', { name: '查看街角咖啡店路线特殊事件', exact: true }).click();
  await expect(map.locator('.wm-event-detail')).toContainText('预计耗时 20 分钟');
  await expect(page.locator('.topbar-world')).toHaveText(clock!);
  await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
  await page.setViewportSize({ width: 390, height: 844 });
  await layers.getByRole('button', { name: '所在区域', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-depth', '3.000');
  await expect(page.getByRole('dialog', { name: '地图窗口', exact: true })).toBeInViewport({ ratio: 1 });
  expect((await viewport.boundingBox())!.width).toBeLessThanOrEqual(366);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(map.locator('.wm-watermark')).toContainText('Open AI Map');
  await page.getByRole('button', { name: '关闭地图窗口', exact: true }).click();
  await expect(page.getByLabel('接下来，你想做什么？')).toBeVisible();
});

test('路线事件预览可重复查看，确认出行后才结算额外时间并写入日记', async ({ page }) => {
  await withLongStory(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const marker = () => page.getByRole('button', { name: '查看街角咖啡店路线特殊事件', exact: true });
  await marker().click();
  const detail = await page.locator('.wm-event-detail').innerText();
  expect(detail).toContain('临时校园活动');
  expect(detail).toContain('预计耗时 20 分钟');
  await page.getByRole('button', { name: '关闭地图窗口', exact: true }).click();
  await page.getByRole('button', { name: '地图', exact: true }).click();
  await marker().click();
  expect(await page.locator('.wm-event-detail').innerText()).toBe(detail);
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await page.getByRole('button', { name: '前往街角咖啡店', exact: true }).click();
  await finishInteraction(page);
  await expect(page.locator('.topbar-world')).toContainText('街角咖啡店');
  await expect(page.locator('.topbar-world')).toContainText('17:40');
  await page.getByRole('button', { name: '状态', exact: true }).click();
  await expect(page.locator('.wp-journal-list').first()).toContainText('临时校园活动');
  await expect(page.locator('.wp-journal-list').first()).toContainText('耗时 20 分钟');
  await expect(page.locator('.wp-journal-list').first()).toContainText('额外停留 5 分钟');
  await expect(page.locator('[data-player-stat="energy"]').first()).toContainText('75');
  await expect(page.locator('[data-player-stat="balance"]').first()).toContainText('328.00');
  await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
});

test('全球直接缩放自动显现省界，同一画布保留所在区域标记、比例尺与水印', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withLongStory(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const map = page.locator('.world-map');
  const viewport = page.locator('[data-world-map-viewport]');
  const atlas = map.locator('[data-atlas-renderer]');
  await page.getByRole('navigation', { name: '地图范围', exact: true }).getByRole('button', { name: '世界', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-depth', '5.000');
  await expect(atlas).toHaveAttribute('data-atlas-renderer', 'webgl');
  const canvas = await atlas.locator('canvas').elementHandle();
  await expect(atlas).toHaveAttribute('data-atlas-division-count', '0');
  const originalSpan = Number(await atlas.getAttribute('data-atlas-camera-scale'));
  const originalScale = await atlas.locator('.atlas-scale').textContent();
  for (let step = 0; step < 4; step++) {
    await viewport.scrollIntoViewIfNeeded();
    const home = atlas.locator('[data-atlas-home-marker]');
    await expect(home).toBeVisible();
    const position = await home.boundingBox();
    await page.mouse.move(position!.x + position!.width / 2, position!.y + position!.height / 2);
    const beforeSpan = Number(await atlas.getAttribute('data-atlas-camera-scale'));
    await page.mouse.wheel(0, -240);
    await expect.poll(async () => beforeSpan / Number(await atlas.getAttribute('data-atlas-camera-scale'))).toBeCloseTo(Math.exp(.6), 2);
  }
  await expect.poll(async () => Number(await atlas.getAttribute('data-atlas-division-count'))).toBeGreaterThan(3);
  expect(Number(await atlas.getAttribute('data-atlas-camera-scale'))).toBeLessThan(originalSpan / 2);
  await expect(atlas.locator('.atlas-scale')).not.toHaveText(originalScale!);
  await expect(atlas.locator('.atlas-scale')).toContainText(/(?:km|m)/);
  await expect(atlas.locator('[data-atlas-home-marker]')).toBeVisible();
  const markerColor = await atlas.locator('[data-atlas-home-marker] i').evaluate(element => getComputedStyle(element).backgroundColor);
  const [red, green] = markerColor.match(/\d+/g)!.map(Number);
  expect(red).toBeGreaterThan(green * 1.5);
  await expect(map.locator('.wm-watermark')).toBeVisible();
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
});

test('390px 沙盘持续立体并连续缩放融入城市，反向缩放还原同一场景', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withLongStory(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const map = page.locator('.world-map');
  const viewport = page.locator('[data-world-map-viewport]');
  await viewport.scrollIntoViewIfNeeded();
  const scene = map.locator('[data-campus-map-scene][data-map-scope="campus"]');
  const originalScene = await scene.elementHandle();
  const wall = scene.locator('[data-building-id="building:residence-building"] [data-wall-face="front"]');
  const wallHeight = async () => wall.evaluate(element => {
    const points = (element.getAttribute('points') ?? '').split(' ').map(pair => pair.split(',').map(Number));
    return Math.abs(points[0][1] - points[3][1]);
  });
  const originalHeight = await wallHeight();
  expect(originalHeight).toBeGreaterThan(8);
  await expect(scene).toHaveAttribute('data-map-rise', '1.000');
  const originalRenderedHeight = (await wall.boundingBox())!.height;
  const bounds = await viewport.boundingBox();
  const centerX = bounds!.x + bounds!.width / 2;
  await page.mouse.move(centerX, bounds!.y + bounds!.height * .4);
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(.361, 2);
  const firstHeight = await wallHeight();
  expect(firstHeight).toBeCloseTo(originalHeight, 1);
  expect((await wall.boundingBox())!.height).toBeLessThan(originalRenderedHeight);
  await expect(scene).toHaveAttribute('data-map-rise', '1.000');
  await page.mouse.wheel(0, 100);
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(.721, 2);
  const midHeight = await wallHeight();
  expect(midHeight).toBeCloseTo(originalHeight, 1);
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(1.154, 2);
  const fullHeight = await wallHeight();
  expect(fullHeight).toBeCloseTo(originalHeight, 1);
  await expect(scene).toHaveAttribute('data-map-rise', '1.000');
  await page.mouse.wheel(0, 200);
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(1.876, 2);
  await expect(map).toHaveAttribute('data-map-layer', 'city');
  const campusPlane = map.locator('[data-map-plane="campus"]');
  const cityPlane = map.locator('[data-map-plane="city"]');
  const opacity = async (selector: typeof campusPlane) => selector.evaluate(element => Number(getComputedStyle(element).opacity));
  expect(await opacity(campusPlane)).toBeLessThan(.2);
  expect(await opacity(cityPlane)).toBeGreaterThan(.8);
  await page.mouse.wheel(0, -140);
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(1.371, 2);
  expect(await opacity(campusPlane)).toBeGreaterThan(.2);
  expect(await opacity(campusPlane)).toBeLessThan(.9);
  expect(await opacity(cityPlane)).toBeGreaterThan(.1);
  expect(await opacity(cityPlane)).toBeLessThan(.8);
  for (const delta of [-180, -60]) {
    await page.mouse.wheel(0, delta);
    await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeLessThan(delta === -180 ? .73 : .52);
  }
  await page.mouse.wheel(0, -140);
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(0, 2);
  await expect(map).toHaveAttribute('data-map-layer', 'sandtable');
  expect(await wallHeight()).toBeCloseTo(originalHeight, 1);
  expect((await wall.boundingBox())!.height).toBeCloseTo(originalRenderedHeight, 0);
  expect(await originalScene!.evaluate(element => element.isConnected)).toBe(true);
  await expect(page.locator('.topbar-world')).toContainText('校园南门');
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
});

test('320px 从地点起手的双指可连续跨层和返回，拖动不误旅行且控件可触达', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.addInitScript(() => {
    document.documentElement.style.transform = 'translateZ(0)';
    document.documentElement.style.height = '0px';
  });
  await withLongStory(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const map = page.locator('.world-map');
  const viewport = page.locator('[data-world-map-viewport]');
  await viewport.scrollIntoViewIfNeeded();
  await expect(page.getByRole('dialog', { name: '地图窗口', exact: true })).toBeInViewport({ ratio: 1 });
  let bounds = await viewport.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(296);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const label of ['放大地图', '缩小地图', '复位地图视图', '向左旋转地图', '向右旋转地图']) {
    const control = page.getByRole('button', { name: label, exact: true });
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
    const box = await control.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await viewport.scrollIntoViewIfNeeded();
  bounds = await viewport.boundingBox();
  const marker = map.locator('[data-map-target="library"]');
  await expect(marker).toBeInViewport();
  const markerBounds = await marker.boundingBox();
  expect(markerBounds!.height).toBeGreaterThanOrEqual(44);
  const first = { x: markerBounds!.x + markerBounds!.width / 2, y: markerBounds!.y + markerBounds!.height / 2, id: 1 };
  const second = { x: Math.min(bounds!.x + bounds!.width - 30, first.x + 110), y: Math.min(bounds!.y + bounds!.height - 35, first.y + 140), id: 2 };
  const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
  const points = (factor: number) => [first, second].map(point => ({ x: center.x + (point.x - center.x) * factor, y: center.y + (point.y - center.y) * factor, id: point.id }));
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(1) });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(.75) });
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(.415, 1);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(.5) });
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(1, 1);
  await expect(map).toHaveAttribute('data-map-layer', 'sandtable');
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(.25) });
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(2, 1);
  await expect(map).toHaveAttribute('data-map-layer', 'city');
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(.5) });
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(1, 1);
  await expect(map).toHaveAttribute('data-map-layer', 'sandtable');
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(1) });
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(0, 1);
  await expect(map).toHaveAttribute('data-map-layer', 'sandtable');
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.topbar-world')).toContainText('校园南门');
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await page.getByRole('button', { name: '复位地图视图', exact: true }).click();
  const afterBounds = await marker.boundingBox();
  const dragStart = { x: afterBounds!.x + afterBounds!.width / 2, y: afterBounds!.y + afterBounds!.height / 2, id: 1 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [dragStart] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...dragStart, x: dragStart.x + 45, y: dragStart.y + 25 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.topbar-world')).toContainText('校园南门');
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await session.detach();
  await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(page.locator('[data-unread-city-rescue]')).toHaveCount(0);
  const dockBounds = await page.locator('.tool-dock').boundingBox();
  const windowBounds = await page.getByRole('dialog', { name: '地图窗口', exact: true }).boundingBox();
  expect(windowBounds!.y + windowBounds!.height).toBeLessThanOrEqual(dockBounds!.y - 4);
  for (const label of ['放大地图', '缩小地图', '复位地图视图', '向左旋转地图', '向右旋转地图']) {
    const control = page.getByRole('button', { name: label, exact: true });
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(dockBounds!.y - 1);
  }
  await page.getByRole('button', { name: '向右旋转地图', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-bearing', '30.000');
  await page.getByRole('button', { name: '向左旋转地图', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-bearing', '0.000');
  await page.getByRole('button', { name: '缩小地图', exact: true }).click();
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeGreaterThan(.3);
  await page.getByRole('button', { name: '复位地图视图', exact: true }).click();
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(0, 2);
  await page.getByRole('button', { name: '放大地图', exact: true }).click();
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeLessThan(-.3);
  await page.getByRole('button', { name: '复位地图视图', exact: true }).click();
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(0, 2);
  await page.getByRole('button', { name: '关闭地图窗口', exact: true }).click();
  await expect(page.getByLabel('接下来，你想做什么？')).toBeVisible();
});


test('手机双指旋转实际建筑，越过角度边界仍连续，可同时缩放并复位朝北', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withLongStory(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const viewport = page.locator('[data-world-map-viewport]');
  const scene = page.locator('[data-campus-map-scene][data-map-scope="campus"]');
  await page.getByRole('navigation', { name: '地图范围', exact: true }).getByRole('button', { name: '沙盘', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-depth', '0.000');
  const building = scene.locator('[data-building-id="building:residence-building"]');
  const originalPoints = await building.locator('[data-wall-face="front"]').getAttribute('points');
  const originalHeight = Number(await building.getAttribute('data-building-height'));
  await page.getByRole('button', { name: '向右旋转地图', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-bearing', '30.000');
  await expect(building.locator('[data-wall-face="front"]')).not.toHaveAttribute('points', originalPoints!);
  // The rotated slab is fitted into the viewport, so pixel height can vary;
  // the actual facade must remain upright and return after a full turn.
  expect(Number(await building.getAttribute('data-building-height'))).toBeGreaterThan(originalHeight * .55);
  await page.getByRole('button', { name: '复位地图视图', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-bearing', '0.000');
  await viewport.scrollIntoViewIfNeeded();
  const bounds = await viewport.boundingBox();
  const center = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
  const radius = Math.min(bounds!.width, bounds!.height) * .25;
  const points = (angle: number, factor = 1) => [-1, 1].map((sign, index) => ({ id: index + 1, x: center.x + sign * Math.cos(angle * Math.PI / 180) * radius * factor, y: center.y + sign * Math.sin(angle * Math.PI / 180) * radius * factor }));
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(170) });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(179) });
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-bearing'))).toBeCloseTo(9, 0);
  const beforeSeam = Number(await viewport.getAttribute('data-map-bearing'));
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(-179) });
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-bearing')) - beforeSeam).toBeGreaterThan(0);
  const afterSeam = Number(await viewport.getAttribute('data-map-bearing'));
  expect(afterSeam - beforeSeam).toBeGreaterThan(0);
  expect(afterSeam - beforeSeam).toBeLessThan(5);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(-140, .25) });
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(2, 1);
  expect(Number(await viewport.getAttribute('data-map-bearing'))).toBeGreaterThan(40);
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(170) });
  await expect.poll(async () => Number(await viewport.getAttribute('data-map-depth'))).toBeCloseTo(0, 1);
  let previousBearing = Number(await viewport.getAttribute('data-map-bearing'));
  for (let angle = 200; angle <= 530; angle += 30) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(angle) });
    await expect.poll(async () => Number(await viewport.getAttribute('data-map-bearing')) - previousBearing).toBeGreaterThan(20);
    const currentBearing = Number(await viewport.getAttribute('data-map-bearing'));
    expect(currentBearing - previousBearing).toBeGreaterThan(20);
    expect(currentBearing - previousBearing).toBeLessThan(40);
    previousBearing = currentBearing;
    expect(Number(await building.getAttribute('data-building-height'))).toBeGreaterThan(originalHeight * .55);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await session.detach();
  expect(previousBearing).toBeCloseTo(360, 0);
  await expect(building.locator('[data-wall-face="front"]')).toHaveAttribute('points', originalPoints!);
  await expect(page.locator('.topbar-world')).toContainText('校园南门');
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await page.getByRole('button', { name: '复位地图视图', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-bearing', '0.000');
});

test('统一全球地图中台湾属中国，外省与外国省份聚焦正确且缩放不会跳回家乡', async ({ page }) => {
  await withLongStory(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const map = page.locator('.world-map');
  const viewport = page.locator('[data-world-map-viewport]');
  const atlas = map.locator('[data-atlas-renderer]');
  const layers = page.getByRole('navigation', { name: '地图范围', exact: true });
  await layers.getByRole('button', { name: '世界', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-depth', '5.000');
  const canvas = await atlas.locator('canvas').elementHandle();
  await page.getByRole('searchbox', { name: '查找国家或地区', exact: true }).fill('台湾');
  await expect(map.locator('.wm-region-list button')).toHaveCount(0);
  await page.getByRole('searchbox', { name: '查找国家或地区', exact: true }).fill('中国');
  await map.locator('[data-atlas-feature-id="CHN"]').click();
  await expect(atlas).toHaveAttribute('data-atlas-country', 'CHN');
  await expect(atlas).toHaveAttribute('data-atlas-maritime-parts', '10');
  await expect(atlas).toHaveAttribute('data-atlas-maritime-visible', '10');
  await expect(page.getByRole('searchbox', { name: '查找地图地区', exact: true })).toBeVisible();
  await map.locator('[data-atlas-feature-id="710000"]').click();
  await expect(atlas).toHaveAttribute('data-atlas-region', '710000');
  await expect(atlas).toHaveAttribute('data-atlas-country', 'CHN');
  await expect(map.locator('.wm-selected-region')).toContainText('台湾省');
  await expect.poll(async () => {
    const [lon, lat] = (await atlas.getAttribute('data-atlas-center'))!.split(',').map(Number);
    return lon > 119 && lon < 123 && lat > 21 && lat < 26;
  }).toBe(true);
  await page.getByRole('button', { name: /主角所在区域 · 浙江/ }).click();
  await expect(atlas).toHaveAttribute('data-atlas-region', '330000');
  await page.getByRole('searchbox', { name: '查找地图地区', exact: true }).fill('广东');
  await map.locator('[data-atlas-feature-id="440000"]').click();
  await expect(atlas).toHaveAttribute('data-atlas-region', '440000');
  for (let step = 0; step < 2; step++) await page.getByRole('button', { name: '放大地图', exact: true }).click();
  await expect(atlas).toHaveAttribute('data-atlas-country', 'CHN');
  await expect(atlas).toHaveAttribute('data-atlas-region', '440000');
  await layers.getByRole('button', { name: '世界', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-depth', '5.000');
  await page.getByRole('searchbox', { name: '查找国家或地区', exact: true }).fill('美国');
  await map.locator('[data-atlas-feature-id="USA"]').click();
  await expect(atlas).toHaveAttribute('data-atlas-country', 'USA');
  await page.getByRole('searchbox', { name: '查找地图地区', exact: true }).fill('加利福尼亚');
  await map.locator('[data-atlas-feature-id="USA-3521"]').click();
  await expect(atlas).toHaveAttribute('data-atlas-region', 'USA-3521');
  for (let step = 0; step < 2; step++) await page.getByRole('button', { name: '放大地图', exact: true }).click();
  await expect(atlas).toHaveAttribute('data-atlas-country', 'USA');
  await expect(atlas).toHaveAttribute('data-atlas-region', 'USA-3521');
  const [longitude, latitude] = (await atlas.getAttribute('data-atlas-center'))!.split(',').map(Number);
  expect(longitude).toBeGreaterThan(-125); expect(longitude).toBeLessThan(-114);
  expect(latitude).toBeGreaterThan(32); expect(latitude).toBeLessThan(43);
  await page.getByRole('button', { name: '计划访问', exact: true }).click();
  await expect(map.locator('.wm-draft')).toContainText('尚未启程');
  await layers.getByRole('button', { name: '世界', exact: true }).click();
  await expect(viewport).toHaveAttribute('data-map-depth', '5.000');
  await page.getByRole('searchbox', { name: '查找国家或地区', exact: true }).fill('科索沃');
  await expect(map.locator('.wm-region-list button')).toHaveCount(0);
  await page.getByRole('searchbox', { name: '查找国家或地区', exact: true }).fill('塞尔维亚');
  await map.locator('[data-atlas-feature-id="SRB"]').click();
  await expect(atlas).toHaveAttribute('data-atlas-country', 'SRB');
  const kosovoRegion = map.locator('[data-atlas-feature-id^="KOS-"]').first();
  await expect(kosovoRegion).toBeVisible();
  const kosovoId = await kosovoRegion.getAttribute('data-atlas-feature-id');
  await kosovoRegion.click();
  await expect(atlas).toHaveAttribute('data-atlas-country', 'SRB');
  await expect(atlas).toHaveAttribute('data-atlas-region', kosovoId!);
  expect(await canvas!.evaluate(element => element.isConnected)).toBe(true);
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
});

test('全球图形上下文丢失后仍可浏览与复位，多次开关地图清理资源并可恢复酒馆', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; const warnings: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (/too many active webgl contexts/i.test(message.text())) warnings.push(message.text()); });
  await withLongStory(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  await page.getByRole('navigation', { name: '地图范围', exact: true }).getByRole('button', { name: '所在区域', exact: true }).click();
  const atlas = page.locator('[data-atlas-renderer]');
  await expect(atlas).toHaveAttribute('data-atlas-renderer', 'webgl');
  await atlas.locator('canvas').dispatchEvent('webglcontextlost');
  await expect(atlas).toHaveAttribute('data-atlas-renderer', 'fallback');
  const fallback = atlas.locator('.atlas-fallback');
  await expect(fallback).toBeVisible();
  expect(await fallback.locator('path').count()).toBeGreaterThan(200);
  await expect(fallback.locator('.atlas-maritime')).toHaveCount(1);
  await expect(fallback.locator('.atlas-maritime')).not.toHaveAttribute('data-map-target');
  await expect(fallback.locator('.atlas-home-outline')).toHaveCount(2);
  for (const outline of await fallback.locator('.atlas-home-outline').all()) {
    await expect(outline).toHaveCSS('fill', 'none');
    await expect(outline).toHaveCSS('stroke', 'rgb(255, 72, 91)');
  }
  await expect(fallback.locator('[data-atlas-home-marker]')).toBeVisible();
  await expect(fallback.locator('[data-atlas-home-marker] circle')).toHaveCSS('fill', 'rgb(255, 72, 91)');
  const originalPath = await fallback.locator('[data-map-target="country:CHN"]').getAttribute('d');
  await page.getByRole('button', { name: '向右旋转地图', exact: true }).click();
  await expect(fallback.locator('[data-map-target="country:CHN"]')).not.toHaveAttribute('d', originalPath!);
  const viewport = page.locator('[data-world-map-viewport]');
  await viewport.scrollIntoViewIfNeeded();
  const bounds = await viewport.boundingBox();
  const x = bounds!.x + bounds!.width / 2, y = bounds!.y + bounds!.height / 2;
  const centerBeforePan = await atlas.getAttribute('data-atlas-center');
  const province = fallback.locator('[data-map-target="division:330000"]');
  const provinceBeforePan = await province.boundingBox();
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 35, y + 20, { steps: 3 }); await page.mouse.up();
  await expect(atlas).not.toHaveAttribute('data-atlas-center', centerBeforePan!);
  await expect.poll(async () => (await province.boundingBox())!.x - provinceBeforePan!.x).toBeCloseTo(35, 0);
  await expect.poll(async () => (await province.boundingBox())!.y - provinceBeforePan!.y).toBeCloseTo(20, 0);
  await page.mouse.move(x + 35, y + 20); await page.mouse.down(); await page.mouse.move(x, y, { steps: 3 }); await page.mouse.up();
  await expect(atlas).toHaveAttribute('data-atlas-center', centerBeforePan!);
  await page.getByRole('button', { name: '放大地图', exact: true }).click();
  await page.getByRole('button', { name: '复位地图视图', exact: true }).click();
  await expect(page.locator('[data-world-map-viewport]')).toHaveAttribute('data-map-bearing', '0.000');
  await page.getByRole('button', { name: '关闭地图窗口', exact: true }).click();
  for (let index = 0; index < 18; index++) {
    await page.getByRole('button', { name: '地图', exact: true }).click();
    await expect(page.locator('[data-atlas-renderer]')).toHaveCount(1);
    await page.getByRole('button', { name: '关闭地图窗口', exact: true }).click();
    await expect(page.locator('[data-atlas-renderer]')).toHaveCount(0);
  }
  await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
  await expect(root(page)).toHaveCount(0);
  await page.locator('#native-input').fill('地图关闭后继续原生输入');
  await expect(page.locator('#native-input')).toHaveValue('地图关闭后继续原生输入');
  expect(errors).toEqual([]); expect(warnings).toEqual([]);
});

test('小国聚焦后按钮、滚轮与双指按实际比例连续缩放，中心不跳回家乡', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withLongStory(page);
  await page.getByRole('button', { name: '地图', exact: true }).click();
  const atlas = page.locator('[data-atlas-renderer]');
  const viewport = page.locator('[data-world-map-viewport]');
  const span = async () => Number(await atlas.getAttribute('data-atlas-camera-scale'));
  const center = async () => (await atlas.getAttribute('data-atlas-center'))!.split(',').map(Number);
  for (const [id, name] of [['SRB', '塞尔维亚'], ['JPN', '日本']]) {
    await page.getByRole('navigation', { name: '地图范围', exact: true }).getByRole('button', { name: '世界', exact: true }).click();
    await expect(viewport).toHaveAttribute('data-map-depth', '5.000');
    await page.getByRole('searchbox', { name: '查找国家或地区', exact: true }).fill(name);
    await page.locator(`[data-atlas-feature-id="${id}"]`).click();
    await expect(atlas).toHaveAttribute('data-atlas-country', id);
    await expect(viewport).toHaveAttribute('data-map-depth', '4.000');
    await expect.poll(span).toBeLessThan(90);
    const originalSpan = await span(); const originalCenter = await center();
    await page.getByRole('button', { name: '放大地图', exact: true }).click();
    await expect.poll(async () => originalSpan / await span()).toBeCloseTo(1.3, 2);
    await page.getByRole('button', { name: '缩小地图', exact: true }).click();
    await expect.poll(async () => await span() / originalSpan).toBeCloseTo(1, 2);
    for (const [axis, value] of (await center()).entries()) expect(value).toBeCloseTo(originalCenter[axis], 2);
    await viewport.scrollIntoViewIfNeeded();
    const bounds = await viewport.boundingBox();
    const x = bounds!.x + bounds!.width / 2, y = bounds!.y + bounds!.height / 2;
    await page.mouse.move(x, y); await page.mouse.wheel(0, -120);
    await expect.poll(async () => originalSpan / await span()).toBeCloseTo(Math.exp(.3), 2);
    await page.mouse.wheel(0, 120);
    await expect.poll(async () => await span() / originalSpan).toBeCloseTo(1, 2);
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
    const points = (distance: number, dx = 0, dy = 0) => [{ id: 1, x: x - distance + dx, y: y + dy }, { id: 2, x: x + distance + dx, y: y + dy }];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(50) });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(65) });
    await expect.poll(async () => originalSpan / await span()).toBeCloseTo(1.3, 2);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(50) });
    await expect.poll(async () => await span() / originalSpan).toBeCloseTo(1, 2);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(50, 20, 15) });
    await expect.poll(async () => Math.hypot(...(await center()).map((value, axis) => value - originalCenter[axis]))).toBeGreaterThan(.05);
    await expect.poll(async () => await span() / originalSpan).toBeCloseTo(1, 2);
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(50) });
    await expect.poll(async () => Math.hypot(...(await center()).map((value, axis) => value - originalCenter[axis]))).toBeLessThan(.01);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await session.detach();
    await expect(atlas).toHaveAttribute('data-atlas-country', id);
    for (const [axis, value] of (await center()).entries()) expect(value).toBeCloseTo(originalCenter[axis], 2);
  }
  await expect(page.locator('.topbar-world')).toContainText('17:20');
  await expect(page.locator('body')).not.toHaveAttribute('data-fixture-generations');
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`布局编辑与底栏无遮挡：${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(90000);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize(viewport); await gotoDemo(page);
    await expect(page.locator('[data-unread-city-rescue]')).toHaveCount(0);
    const switchChat = page.getByRole('button', { name: '切换聊天并恢复原生界面' });
    await expect(switchChat).toBeInViewport({ ratio: 1 });
    const titleBox = await page.locator('.wordmark').boundingBox(), chatBox = await switchChat.boundingBox();
    expect(chatBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width - 2);
    expect(chatBox!.x + chatBox!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(await page.locator('.uc-shell').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const reading = page.locator('[data-reading-layer]'), before = await reading.boundingBox();
    const grip = await reading.getByRole('button', { name: '上下拖动调整正文高度' }).boundingBox();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2); await page.mouse.down();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2 - 35, { steps: 5 }); await page.mouse.up();
    const after = await reading.boundingBox();
    expect(after!.height).toBeGreaterThan(before!.height + 18);
    expect(Math.abs(after!.y + after!.height - before!.y - before!.height)).toBeLessThan(3);
    await page.getByRole('button', { name: '编辑界面布局' }).click();
    const mode = page.locator('.presentation-switch'), modeBefore = await mode.boundingBox();
    const move = await mode.locator('[data-layout-handle="move"]').boundingBox();
    expect(move).not.toBeNull();
    await page.mouse.move(move!.x + 18, move!.y + 18); await page.mouse.down();
    await page.mouse.move(move!.x + 36, move!.y + 36, { steps: 4 }); await page.mouse.up();
    const modeAfter = await mode.boundingBox();
    expect(Math.abs(modeAfter!.x - modeBefore!.x) + Math.abs(modeAfter!.y - modeBefore!.y)).toBeGreaterThan(9);
    await page.getByRole('button', { name: '完成界面布局编辑' }).click();
    for (const [name, id] of [['地图', 'map'], ['地点', 'location'], ['背包', 'inventory']] as const) {
      await page.locator('.tool-dock').getByRole('button', { name, exact: true }).click();
      const panel = page.locator(`.floating-window[data-window="${id}"]`);
      await expect(panel).toBeVisible();
      if (viewport.width <= 760) {
        const a = await panel.boundingBox(), b = await page.locator('.tool-dock').boundingBox();
        expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y - 4);
      }
      const content = panel.locator('.window-content');
      await content.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect(content.locator(':scope > :last-child')).toBeVisible();
      await page.locator('.tool-dock').getByRole('button', { name, exact: true }).click();
    }
    await switchChat.click(); await expect(root(page)).toHaveCount(0); await enter(page);
    const restored = await reading.boundingBox();
    expect(Math.abs(restored!.height - after!.height)).toBeLessThan(3);
    await page.getByRole('button', { name: '编辑界面布局' }).click();
    await page.getByRole('button', { name: '重置界面布局' }).click();
    const reset = await reading.boundingBox(), modeReset = await mode.boundingBox();
    expect(Math.abs(reset!.height - before!.height)).toBeLessThan(5);
    expect(Math.abs(modeReset!.x - modeBefore!.x)).toBeLessThan(5);
    await page.getByRole('button', { name: '完成界面布局编辑' }).click();
    expect(errors).toEqual([]);
  });
}
