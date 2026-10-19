import { expect, test, type Locator, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

test.use({ screenshot: 'only-on-failure' });

const bundle = readFileSync(new URL('../../dist/immersive-shell.js', import.meta.url));
const bundleSha256 = createHash('sha256').update(bundle).digest('hex');
// Public files bypass Vite's JS transformer. This temporary fixture copy is
// also usable by the app's visible browser; every response is checked below.
mkdirSync(new URL('../../public/', import.meta.url), { recursive: true });
writeFileSync(new URL('../../public/remote-loading-production.js', import.meta.url), bundle);
const root = (page: Page) => page.locator('[data-unread-city-root]');
const imageManifest = JSON.parse(readFileSync(new URL('../../assets/store-products/lossless/manifest.json', import.meta.url), 'utf8'));
const portraitManifest = JSON.parse(readFileSync(new URL('../../assets/npc-portraits/expression-atlases-v3/lossless/manifest.json', import.meta.url), 'utf8'));
interface FixtureRow { speaker: string; portraitId: string; emotion: string; key: string; text: string }
interface Fixture { read(): unknown; counters(): { saves: number; generations: number; forbiddenRequests: string[] }; rows: FixtureRow[]; productIds: string[] }
const fixture = (page: Page) => page.evaluate(() => {
  const data = (window as unknown as { remoteLoadingFixture: Fixture }).remoteLoadingFixture;
  return { state: data.read(), calls: data.counters(), rows: data.rows, productIds: data.productIds };
});

async function reachable(control: Locator) {
  await expect(control).toBeVisible();
  await control.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest' }));
  const geometry = await control.evaluate(element => {
    const box = element.getBoundingClientRect(), owner = element.getRootNode() as Document | ShadowRoot;
    const hit = owner.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return { hit: !!hit && element.contains(hit), hitTag: hit?.tagName, hitClass: hit?.getAttribute('class'), hitText: hit?.textContent?.slice(0, 80), label: element.getAttribute('aria-label'), left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: innerWidth, height: innerHeight };
  });
  expect(geometry.hit, JSON.stringify(geometry)).toBe(true);
  expect(geometry.left).toBeGreaterThanOrEqual(-.5); expect(geometry.right).toBeLessThanOrEqual(geometry.width + .5);
  expect(geometry.top).toBeGreaterThanOrEqual(-.5); expect(geometry.bottom).toBeLessThanOrEqual(geometry.height + .5);
}

async function noOverflow(page: Page) {
  const geometry = await page.locator('.uc-shell').evaluate(element => ({ scroll: element.scrollWidth, width: element.clientWidth, body: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport + 1);
}

async function decodedImage(image: Locator, expected: { sha256: string; width: number; height: number }) {
  const detail = await image.evaluate(async element => {
    // Vue creates elements in the helper's realm and adopts them into the host.
    // Attribute access deliberately avoids cross-realm instanceof checks.
    const source = element.getAttribute('href') || (element as HTMLImageElement).currentSrc;
    if (!source) throw new Error(`Image source missing on ${element.tagName}`);
    const probe = new Image(); probe.src = source; await probe.decode();
    const encoded = source.slice(source.indexOf(',') + 1), raw = atob(encoded);
    const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { hash, width: probe.naturalWidth, height: probe.naturalHeight, webp: source.startsWith('data:image/webp;base64,'), bytes: bytes.length };
  });
  expect(detail.webp).toBe(true); expect(detail.hash).toBe(expected.sha256);
  expect(detail.width).toBe(expected.width); expect(detail.height).toBe(expected.height);
  return detail;
}

async function portraitGeometry(portrait: Locator) {
  const shape = await portrait.locator('svg').evaluate(element => {
    const svg = element as SVGSVGElement, matrix = svg.getScreenCTM()!, frame = svg.viewBox.baseVal;
    const a = new DOMPoint(frame.x, frame.y).matrixTransform(matrix), b = new DOMPoint(frame.x + frame.width, frame.y + frame.height).matrixTransform(matrix);
    const wrapper = svg.parentElement!.getBoundingClientRect(), reading = (svg.getRootNode() as ShadowRoot).querySelector('[data-reading-layer]')!.getBoundingClientRect();
    return { viewBox: [frame.x, frame.y, frame.width, frame.height], left: a.x, top: a.y, right: b.x, bottom: b.y,
      wrapper: { left: wrapper.left, right: wrapper.right, top: wrapper.top, bottom: wrapper.bottom }, viewport: { width: innerWidth, height: innerHeight },
      overlapsReading: a.x < reading.right - .5 && b.x > reading.left + .5 && a.y < reading.bottom - .5 && b.y > reading.top + .5 };
  });
  expect(shape.left).toBeGreaterThanOrEqual(Math.max(0, shape.wrapper.left) - .5);
  expect(shape.top).toBeGreaterThanOrEqual(Math.max(0, shape.wrapper.top) - .5);
  expect(shape.right).toBeLessThanOrEqual(Math.min(shape.viewport.width, shape.wrapper.right) + .5);
  expect(shape.bottom).toBeLessThanOrEqual(Math.min(shape.viewport.height, shape.wrapper.bottom) + .5);
  expect(shape.overlapsReading).toBe(false);
  return shape;
}

async function closeWindow(page: Page) {
  const window = page.locator('[data-window]');
  if (await window.count()) await window.getByRole('button', { name: /^关闭.*窗口$/ }).click();
  await expect(window).toHaveCount(0);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  const size = `${viewport.width}x${viewport.height}`;
  test(`${size} 最终生产脚本无损图片、完整立绘和窗口操作`, async ({ page }) => {
    test.setTimeout(180000); await page.setViewportSize(viewport);
    const errors: string[] = [], external: string[] = [], screenshots: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://127.0.0.1:5178' && !url.pathname.startsWith('/api/')) return route.continue();
      if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
      external.push(url.href); return route.abort();
    });
    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/remote-loading-production.js');
    await page.goto('/outputs/remote-loading-preview.html');
    const response = await loaded; expect(response.status()).toBe(200);
    const actualBundle = await response.body(); expect(actualBundle.length).toBe(bundle.length);
    expect(createHash('sha256').update(actualBundle).digest('hex')).toBe(bundleSha256);
    await expect(page.locator('body')).toHaveAttribute('data-fixture-ready', 'true');
    await expect(root(page)).toBeVisible();
    await expect(page.locator('.uc-shell')).toHaveAttribute('data-presentation-mode', 'novel');
    const initial = await fixture(page);
    const screenshot = async (name: string) => { const path = `outputs/remote-loading-${size}-${name}.png`; await page.screenshot({ path }); screenshots.push(path); };
    await noOverflow(page); await screenshot('initial');
    const draft = '这份验收草稿不会发送给模型。';
    const composer = page.getByRole('textbox', { name: '接下来，你想做什么？' });
    await reachable(composer); await composer.fill(draft);
    await page.locator('[data-toggle-dialogue]').click();
    const portrait = page.locator('[data-npc-portrait]');
    const rows = viewport.width === 1440 ? initial.rows : initial.rows.slice(0, 1);
    const frames: Record<string, { viewBox: number[]; pixelHash: string }[]> = {};
    const checkedPortraits = new Set<string>();
    for (const [index, row] of rows.entries()) {
      if (index) await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
      await expect(portrait).toHaveAttribute('data-npc-portrait', row.portraitId);
      await expect(portrait).toHaveAttribute('data-npc-emotion', row.key);
      await expect(page.locator('.novel-speech')).toHaveText(row.text);
      if (!checkedPortraits.has(row.portraitId)) {
        await decodedImage(portrait.locator('image'), portraitManifest.images.find((item: { id: string }) => item.id === row.portraitId));
        checkedPortraits.add(row.portraitId);
      }
      const geometry = await portraitGeometry(portrait);
      const pixels = await portrait.locator('svg').screenshot({ animations: 'disabled',
        style: '* { visibility:hidden!important } [data-npc-portrait], [data-npc-portrait] * { visibility:visible!important }' });
      (frames[row.portraitId] ??= []).push({ viewBox: geometry.viewBox, pixelHash: createHash('sha256').update(pixels).digest('hex') });
    }
    if (viewport.width === 1440) for (const variants of Object.values(frames)) {
      expect(variants).toHaveLength(9); expect(new Set(variants.map(row => row.viewBox.join(','))).size).toBe(9);
      expect(new Set(variants.map(row => row.pixelHash)).size).toBe(9);
    }
    await reachable(page.locator('[data-toggle-dialogue]')); await screenshot('portrait');
    await page.getByRole('button', { name: '全文回看', exact: true }).click();
    const story = page.getByRole('log', { name: '故事记录' });
    await expect(story).toBeVisible();
    const storyScroll = await story.evaluate(element => { element.scrollTop = 0; const start = element.scrollTop; element.scrollTop = element.scrollHeight; return { start, end: element.scrollTop, height: element.clientHeight, total: element.scrollHeight }; });
    expect(storyScroll.end).toBeGreaterThan(storyScroll.start); await screenshot('reading-scroll');
    await reachable(page.getByRole('button', { name: '逐句阅读', exact: true })); await page.getByRole('button', { name: '逐句阅读', exact: true }).click();

    await reachable(page.getByRole('button', { name: '地点', exact: true })); await page.getByRole('button', { name: '地点', exact: true }).click();
    await reachable(page.locator('[data-place-store]')); await page.locator('[data-place-store]').click();
    await expect(page.locator('[data-convenience-store]')).toBeVisible();
    const imageEvidence: Record<string, unknown> = {};
    for (const category of ['meal', 'snack', 'drink', 'cigarette']) {
      await page.locator(`[data-store-category="${category}"]`).scrollIntoViewIfNeeded();
      await page.locator(`[data-store-category="${category}"]`).click();
      for (const tier of ['basic', 'standard', 'premium']) {
        const id = `${category}-${tier}`, card = page.locator(`[data-product-id="${id}"]`), image = card.locator('img');
        await image.scrollIntoViewIfNeeded();
        imageEvidence[id] = await decodedImage(image, imageManifest.images.find((item: { id: string }) => item.id === id));
        expect(await image.evaluate(element => getComputedStyle(element).objectFit)).toBe('contain');
        await reachable(card.getByRole('button', { name: /^购买/ }));
      }
      if (category === 'meal' || category === 'cigarette') {
        await screenshot(`shelf-${category}`);
        await page.locator(`[data-product-id="${category}-standard"] img`).evaluate(element => element.scrollIntoView({ block: 'center' }));
        await screenshot(`shelf-${category}-image`);
      }
    }
    await noOverflow(page); await closeWindow(page);
    await reachable(page.getByRole('button', { name: '背包', exact: true })); await page.getByRole('button', { name: '背包', exact: true }).click();
    await expect(page.locator('[data-inventory-product]')).toHaveCount(12);
    for (const id of ['meal-basic', 'cigarette-premium']) {
      const item = page.locator(`[data-inventory-product="${id}"]`), image = item.locator('img');
      await image.scrollIntoViewIfNeeded();
      const detail = await decodedImage(image, imageManifest.images.find((item: { id: string }) => item.id === id));
      expect(detail).toEqual(imageEvidence[id]); await reachable(item.getByRole('button', { name: /^使用/ }));
    }
    const windowScroll = await page.locator('[data-window=inventory] .window-content').evaluate(element => ({ top: element.scrollTop, max: element.scrollHeight - element.clientHeight }));
    expect(windowScroll.top).toBeGreaterThan(0); await noOverflow(page); await screenshot('inventory-scroll');
    await closeWindow(page); await expect(composer).toHaveValue(draft);

    await reachable(page.getByRole('button', { name: '手机', exact: true })); await page.getByRole('button', { name: '手机', exact: true }).click();
    await expect(page.locator('[data-unread-city-phone-slot]')).toHaveAttribute('data-phone-status', 'ready', { timeout: 30000 });
    const phone = page.frameLocator('#sttts-panel iframe');
    await expect(phone.locator('.device')).toBeVisible();
    await phone.getByRole('button', { name: /^聊天(?:，|$)/ }).click();
    await phone.getByRole('button', { name: '联系人', exact: true }).click();
    await phone.getByRole('button', { name: '添加联系人', exact: true }).click();
    await phone.locator('[data-story-person=""]').click();
    await expect(phone.locator('[data-story-contact-form]')).toBeVisible();
    for (const id of ['claude', 'xiaoyang', 'deepseek']) {
      await phone.locator('[data-field="contact-portrait"]').selectOption(id);
      await expect.poll(() => phone.locator('.story-contact-portrait').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    }
    await reachable(page.getByRole('button', { name: '关闭手机窗口', exact: true })); await screenshot('phone');
    await closeWindow(page); await expect(composer).toHaveValue(draft);
    const final = await fixture(page);
    expect(final.state).toEqual(initial.state); expect(final.calls.generations).toBe(0); expect(final.calls.forbiddenRequests).toEqual([]);
    expect(external).toEqual([]); expect(errors).toEqual([]);
    await reachable(page.locator('[data-unread-city-rescue]')); await page.locator('[data-unread-city-rescue]').click();
    await expect(root(page)).toHaveCount(0); await page.getByRole('textbox', { name: '原生输入', exact: true }).fill('退出后仍可输入');
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden'); await screenshot('restored');
    writeFileSync(`outputs/remote-loading-${size}-evidence.json`, JSON.stringify({ viewport, bundleBytes: bundle.length, bundleSha256,
      imageEvidence, frames, storyScroll, windowScroll, screenshots, calls: final.calls, stateUnchanged: true, errors, external,
      scope: { productionIife: true, controlledHelperHost: true, actualEmbeddedPhone: true, realModelCalls: 0, nativeSillyTavernPage: false, physicalTauriTavern: false } }, null, 2));
  });
}
