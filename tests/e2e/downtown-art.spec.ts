import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createSelectedInitialState } from './academics-fixture';
import { withArtPhone } from './downtown-art-fixture';
import { reduceState } from '../../src/runtime/model';
import type { WorldState } from '../../src/frontend/types';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url));
const manifest = JSON.parse(readFileSync(new URL('../../integration/downtown-art/manifest.json', import.meta.url), 'utf8'));
const expressions = ['neutral', 'smile', 'troubled', 'surprised', 'annoyed', 'sad'];
const dialogue = expressions.map(expression => `|丰川祥子|${expression}|这是${expression}表情的受控验收对白。|`).join('\n');
const read = (helper: Awaited<ReturnType<typeof withArtPhone>>['helper']) => helper.evaluate(() =>
  (window as unknown as { fixtureRead(): { unread_city: WorldState } }).fixtureRead().unread_city);

function initial(hour = 10, entrance = true) {
  const state = reduceState(createSelectedInitialState(), { type: 'walk', x: entrance ? 50 : -20, z: entrance ? 222 : 185, yaw: 0, seed: 'downtown-art-review' });
  state.clock = { day: 1, hour, minute: 0 };
  state.airTraffic.nextAmbientAt = Date.now() + 3600000;
  state.story = [
    { id: 'art-history', role: 'assistant', text: Array.from({ length: 50 }, (_, index) => `受控历史第${index + 1}段：窗外的光线照着庭院，既有故事和手机记录继续保留。`).join('\n\n') },
    { id: 'art-dialogue', role: 'assistant', text: dialogue },
  ];
  return state;
}

async function imageBytes(image: Locator, id: string) {
  const expected = manifest.assets.find((item: { id: string }) => item.id === id);
  const actual = await image.evaluate(async element => {
    const image = element as HTMLImageElement;
    await image.decode();
    const url = image.currentSrc;
    const raw = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), char => char.charCodeAt(0));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { hash, size: [image.naturalWidth, image.naturalHeight], inline: url.startsWith('data:image/webp;base64,') };
  });
  expect(actual).toEqual({ hash: expected.sha256, size: expected.size, inline: true });
  return actual;
}

async function visibleControl(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 1 });
  await control.click({ trial: true });
}

async function noOverflow(page: Page) {
  const overflow = await page.locator('.uc-shell').evaluate(element => ({
    shell: element.scrollWidth - element.clientWidth,
    document: document.documentElement.scrollWidth - innerWidth,
  }));
  expect(overflow.shell).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

async function fullBody(page: Page) {
  const image = page.locator('[data-sakiko-sprite] img');
  const geometry = await image.evaluate(element => {
    const image = element as HTMLImageElement, box = image.getBoundingClientRect();
    const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight);
    const left = box.left + (box.width - image.naturalWidth * scale) / 2;
    const top = box.bottom - image.naturalHeight * scale;
    const frame = { left, top, right: left + image.naturalWidth * scale, bottom: box.bottom };
    const reading = (image.getRootNode() as ShadowRoot).querySelector('[data-reading-layer]')!.getBoundingClientRect();
    return { frame, reading: { top: reading.top, bottom: reading.bottom }, fit: getComputedStyle(image).objectFit, w: innerWidth, h: innerHeight,
      overlapsReading: frame.left < reading.right && frame.right > reading.left && frame.top < reading.bottom && frame.bottom > reading.top };
  });
  expect(geometry.fit).toBe('contain');
  expect(geometry.frame.left).toBeGreaterThanOrEqual(-.5);
  expect(geometry.frame.top).toBeGreaterThanOrEqual(-.5);
  expect(geometry.frame.right).toBeLessThanOrEqual(geometry.w + .5);
  expect(geometry.frame.bottom).toBeLessThanOrEqual(geometry.h + .5);
  // Large transparent sprites may continue behind the reading/composer panel.
  // Keep the head and upper torso visible above it on every supported viewport.
  const renderedHeight = geometry.frame.bottom - geometry.frame.top;
  expect(renderedHeight).toBeGreaterThanOrEqual(geometry.h * .65);
  expect(geometry.frame.top + renderedHeight * .27).toBeLessThan(geometry.reading.top);
  expect(geometry.overlapsReading).toBe(true);
  return geometry;
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`${viewport.width}x${viewport.height} actual sprites, backgrounds, real embedded phone and recovery`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize(viewport);
    mkdirSync('outputs/downtown-art-qa', { recursive: true });
    const prefix = `outputs/downtown-art-qa/${viewport.width}x${viewport.height}`;
    const screenshots: string[] = [];
    const screenshot = async (name: string) => { const file = `${prefix}-${name}.png`; await page.screenshot({ path: file }); screenshots.push(file); };
    const evidence: Record<string, unknown> = { viewport, bundleSha256: createHash('sha256').update(bundle).digest('hex'), images: {}, screenshots };
    const images = evidence.images as Record<string, unknown>;
    const source = initial();
    const fixture = await withArtPhone(page, source);
    await fixture.helper.evaluate(() => { Math.random = () => .99; });
    await noOverflow(page);
    const backdrop = page.locator('[data-background-source="downtown-art"]');
    await expect(backdrop).toHaveAttribute('data-background-id', 'toyokawa_mansion_day');
    images.toyokawa_mansion_day = await imageBytes(backdrop.locator('img'), 'toyokawa_mansion_day');
    await page.locator('[data-toggle-dialogue]').click();

    for (const outfit of ['casual', 'home']) {
      if (outfit === 'home') {
        await page.getByRole('button', { name: '地点', exact: true }).click();
        await page.locator('[data-adjacent-place="toyokawa-house"]').click();
        await expect(backdrop).toHaveAttribute('data-background-id', 'toyokawa_living_room');
        images.toyokawa_living_room = await imageBytes(backdrop.locator('img'), 'toyokawa_living_room');
        await expect.poll(async () => (await read(fixture.helper)).locationId).toBe('toyokawa-house');
        // Rewind the existing dialogue; changing outfit must not create another story.
        for (let i = 1; i < expressions.length; i++) await page.getByRole('button', { name: '上一句剧情', exact: true }).click();
      }
      for (const [index, expression] of expressions.entries()) {
        if (index) await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
        const id = `sakiko_${outfit}_${expression}`;
        const portrait = page.locator('[data-sakiko-sprite]');
        await expect(portrait).toHaveAttribute('data-sakiko-sprite', id);
        await screenshot(`${outfit}-${expression}`);
        images[id] = { ...await imageBytes(portrait.locator('img'), id), geometry: await fullBody(page) };
      }
    }
    const afterArt = await read(fixture.helper);
    expect(afterArt.story).toEqual(source.story);
    expect(afterArt.phone).toEqual(source.phone);
    expect(afterArt.player).toEqual(source.player);
    await page.getByRole('button', { name: '地点', exact: true }).click();
    await page.locator('[data-adjacent-place="downtown"]').click();
    await expect(backdrop).toHaveAttribute('data-background-id', 'toyokawa_mansion_day');
    await expect(page.locator('[data-sakiko-sprite]')).toHaveAttribute('data-sakiko-outfit', 'casual');

    await page.getByRole('button', { name: '全文回看', exact: true }).click();
    const log = page.getByRole('log', { name: '故事记录' });
    const scroll = await log.evaluate(element => { element.scrollTop = element.scrollHeight; return { end: element.scrollTop, total: element.scrollHeight, visible: element.clientHeight }; });
    expect(scroll.total).toBeGreaterThan(scroll.visible);
    expect(scroll.end).toBeGreaterThan(0);
    await screenshot('scroll');
    await page.getByRole('button', { name: '逐句阅读', exact: true }).click();
    const input = page.getByRole('textbox', { name: '接下来，你想做什么？' });
    await visibleControl(input); await input.fill('验收输入与发送，不使用真实模型。');
    await fixture.helper.evaluate(() => (window as unknown as { fixtureReply(reply: string): void }).fixtureReply(JSON.stringify({ story: '|丰川祥子|smile|输入已经收到。|', phone_messages: [] })));
    const send = page.getByRole('button', { name: '继续故事', exact: true });
    await visibleControl(send); await send.click();
    await expect.poll(async () => (await read(fixture.helper)).story.length).toBe(source.story.length + 2);
    await page.getByRole('button', { name: '手机', exact: true }).click();
    await expect(page.locator('[data-unread-city-phone-slot]')).toHaveAttribute('data-phone-status', 'ready', { timeout: 20000 });
    await expect(page.locator('script[data-unread-city-embedded-phone]')).toHaveCount(1);
    const phone = page.frameLocator('#sttts-panel iframe');
    await phone.getByRole('button', { name: '备忘录', exact: true }).click();
    await phone.getByRole('button', { name: '新增备忘录', exact: true }).click();
    const draft = phone.locator('textarea[data-field="text"]');
    await draft.fill(`素材卡草稿 ${viewport.width}`);
    const phoneNode = await page.locator('#sttts-panel iframe').elementHandle();
    await screenshot('phone');
    await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();
    await page.getByRole('button', { name: '手机', exact: true }).click();
    await expect(draft).toHaveValue(`素材卡草稿 ${viewport.width}`);
    expect(await phoneNode!.evaluate(element => element === document.querySelector('#sttts-panel iframe'))).toBe(true);
    const beforeExit = await read(fixture.helper);
    await visibleControl(page.locator('[data-unread-city-rescue]'));
    await page.locator('[data-unread-city-rescue]').click();
    await expect(page.locator('[data-unread-city-root]')).toHaveCount(0);
    await expect(page.locator('#native-phone-input')).toBeFocused();
    await page.locator('#fixture-reenter').click();
    await expect(page.locator('[data-unread-city-root]')).toBeVisible();
    expect(await read(fixture.helper)).toEqual(beforeExit);
    expect(fixture.errors).toEqual([]); expect(fixture.modelRequests).toEqual([]); expect(fixture.extensionResources).toEqual([]);

    for (const [hour, entrance, id] of [[17, true, 'toyokawa_mansion_dusk'], [20, true, 'toyokawa_mansion_night'], [10, false, 'downtown_day'], [20, false, 'downtown_night']] as const) {
      const phaseFixture = await withArtPhone(page, initial(hour, entrance));
      await expect(backdrop).toHaveAttribute('data-background-id', id);
      images[id] = await imageBytes(backdrop.locator('img'), id);
      await noOverflow(page); await screenshot(id);
      expect(phaseFixture.errors).toEqual([]); expect(phaseFixture.modelRequests).toEqual([]);
    }
    evidence.status = 'passed'; evidence.physicalTauriDevice = 'not tested';
    writeFileSync(`${prefix}.json`, JSON.stringify(evidence, null, 2) + '\n');
  });
}
