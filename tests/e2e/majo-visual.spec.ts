import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createSelectedInitialState } from './academics-fixture';
import { withArtPhone } from './downtown-art-fixture';
import { reduceState } from '../../src/runtime/model';
import type { WorldState } from '../../src/frontend/types';
import { resolveNovelNpcEmotion } from '../../src/frontend/novel-npc-emotions';

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url));
const art = JSON.parse(readFileSync(new URL('../../assets/majo-runtime/manifest.json', import.meta.url), 'utf8')) as {
  assets: { id: string; file: string; sha256: string; bytes: number; width: number; height: number; emotion?: string; personId?: string }[];
};
const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 },
];
const expressions = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'shy', 'thinking', 'serious', 'relieved'];
const labels = ['平静', '开心', '难过', '生气', '惊讶', '害羞', '思考', '严肃', '安心'];
const scene = art.assets.find(row => row.id === 'interiors/timber-courtyard-house-interior-day')!;
const read = (helper: Awaited<ReturnType<typeof withArtPhone>>['helper']) => helper.evaluate(() =>
  (window as unknown as { fixtureRead(): { unread_city: WorldState } }).fixtureRead().unread_city);

function initial(): WorldState {
  const start = createSelectedInitialState();
  start.clock = { day: 1, hour: 10, minute: 0 };
  const state = reduceState(start, { type: 'novel_travel', locationId: 'nikaido-house' });
  state.airTraffic.nextAmbientAt = Date.now() + 3_600_000;
  state.story = [{
    id: 'majo-visual-dialogue', role: 'assistant',
    text: [
      ...expressions.map((expression, index) => `|艾玛|${labels[index]}|这是${labels[index]}表情的受控验收对白，庭院的光落在缘侧。|`),
      '|希罗|平静|三姿态参考图也已经按人物身份登记，这是平静姿态的受控验收对白。|',
      '|希罗|生气|这里没有生气差分，应当回退到同一人物的平常立绘。|',
    ].join('\n'),
  }];
  return state;
}

async function inlineImage(image: Locator, expected: { sha256: string; width: number; height: number }) {
  const actual = await image.evaluate(async element => {
    const picture = element as HTMLImageElement;
    await picture.decode();
    const url = picture.currentSrc;
    const raw = Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), char => char.charCodeAt(0));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { hash, width: picture.naturalWidth, height: picture.naturalHeight, inline: url.startsWith('data:image/webp;base64,') };
  });
  expect(actual).toEqual({ hash: expected.sha256, width: expected.width, height: expected.height, inline: true });
  return actual;
}

async function noOverflow(page: Page) {
  const overflow = await page.locator('.uc-shell').evaluate(element => ({
    shell: element.scrollWidth - element.clientWidth,
    document: document.documentElement.scrollWidth - innerWidth,
  }));
  expect(overflow.shell).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

for (const viewport of viewports) {
  test(`${viewport.width}x${viewport.height} Emma expressions, Nikaido backdrop, Twiitch phone and save stability`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    mkdirSync('outputs/majo-visual-qa', { recursive: true });
    const prefix = `outputs/majo-visual-qa/${viewport.width}x${viewport.height}`;
    const source = initial();
    const fixture = await withArtPhone(page, source);
    await noOverflow(page);

    const backdrop = page.locator('.novel-backdrop[data-novel-background="nikaido-house"]');
    await expect(backdrop).toHaveAttribute('data-background-id', 'majo-nikaido-house');
    await expect(backdrop).toHaveAttribute('data-background-source', 'majo-art');
    const sceneBytes = await inlineImage(backdrop.locator('img'), scene);

    // The collapsed reader previews the last spoken line: the semi-main Hiro
    // transparent sprite. Expanding rewinds to the first line of the entry (Emma).
    const portrait = page.locator('[data-majo-portrait]');
    await expect(portrait).toHaveAttribute('data-majo-portrait', 'majo-hiro');
    await expect(portrait).toHaveAttribute('data-npc-emotion', 'angry');
    await expect(portrait).toHaveAttribute('data-majo-exact', 'false');
    const hiroBytes = await inlineImage(portrait.locator('img'), art.assets.find(row => row.personId === 'majo-hiro' && row.emotion === 'neutral')!);
    await page.screenshot({ path: `${prefix}-hiro-sprite.png` });
    await page.locator('[data-toggle-dialogue]').click();
    const images: Record<string, unknown> = {};
    for (const [index, expression] of expressions.entries()) {
      if (index) await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
      await expect(portrait).toHaveAttribute('data-majo-portrait', 'majo-emma');
      await expect(portrait).toHaveAttribute('data-npc-emotion', resolveNovelNpcEmotion(labels[index]!));
      await expect(portrait).toHaveAttribute('data-npc-speaker', '艾玛');
      images[expression] = await inlineImage(portrait.locator('img'), art.assets.find(row => row.personId === 'majo-emma' && row.emotion === expression)!);
      if (index === 0 || index === 4 || index === 8) await page.screenshot({ path: `${prefix}-${expression}.png` });
    }
    await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
    await expect(portrait).toHaveAttribute('data-majo-portrait', 'majo-hiro');
    await expect(portrait).toHaveAttribute('data-npc-speaker', '希罗');
    await expect(portrait).toHaveAttribute('data-npc-emotion', 'neutral');
    // Missing semi-main emotions must show this person's neutral sprite, never a generic face.
    await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
    await expect(portrait).toHaveAttribute('data-majo-portrait', 'majo-hiro');
    await expect(portrait).toHaveAttribute('data-npc-emotion', 'angry');
    await expect(portrait).toHaveAttribute('data-majo-exact', 'false');
    await inlineImage(portrait.locator('img'), art.assets.find(row => row.personId === 'majo-hiro' && row.emotion === 'neutral')!);
    await page.screenshot({ path: `${prefix}-hiro-neutral-fallback.png` });
    await noOverflow(page);

    // The real embedded phone must expose the recovered Twiitch artwork as a local app.
    await page.getByRole('button', { name: '手机', exact: true }).click();
    await expect(page.locator('[data-unread-city-phone-slot]')).toHaveAttribute('data-phone-status', 'ready', { timeout: 20_000 });
    await expect(page.locator('script[data-unread-city-embedded-phone]')).toHaveCount(1);
    const phone = page.frameLocator('#sttts-panel iframe');
    await phone.getByRole('button', { name: 'Twiitch', exact: true }).click();
    const channel = phone.getByRole('region', { name: 'Twiitch 频道' });
    await expect(channel).toBeVisible();
    await expect(channel.getByText('泽渡可可 · 夜间频道')).toBeVisible();
    await expect(channel.getByText('离线', { exact: true })).toBeVisible();
    await expect(channel.locator('.tp-reactions figure')).toHaveCount(4);
    const cover = channel.locator('.tp-cover img').first();
    await expect(cover).toHaveJSProperty('complete', true);
    expect(await cover.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await channel.scrollIntoViewIfNeeded();
    const phoneOverflow = await phone.locator('.app-content').evaluate(element => element.scrollWidth - element.clientWidth);
    expect(phoneOverflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${prefix}-phone-twiitch.png` });
    await page.getByRole('button', { name: '关闭手机窗口', exact: true }).click();

    const saved = await read(fixture.helper);
    expect(saved.story).toEqual(source.story);
    expect(saved.phone).toEqual(source.phone);
    expect(saved.player).toEqual(source.player);
    expect(saved.locationId).toBe('nikaido-house');
    expect(fixture.errors).toEqual([]);
    expect(fixture.modelRequests).toEqual([]);
    expect(fixture.extensionResources).toEqual([]);
    writeFileSync(`${prefix}.json`, JSON.stringify({
      viewport, bundleSha256: createHash('sha256').update(bundle).digest('hex'),
      scene: sceneBytes, images, hiroCard: hiroBytes, stage: 'passed', physicalTauriDevice: 'not tested',
    }, null, 2) + '\n');
  });
}
