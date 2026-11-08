import { expect, test, type Locator } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const folder = 'outputs/graphics-recovery';
const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 }];
const host = readFileSync('index.html', 'utf8').replace('<script type="module" src="/src/frontend/main.ts"></script>',
  '<script src="/outputs/graphics-recovery/release/immersive-shell-lite.js"></script>');
async function loseContext(canvas: Locator) {
  await canvas.evaluate(element => {
    const view = element as HTMLCanvasElement;
    const gl = view.getContext('webgl2') ?? view.getContext('webgl');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context loss simulation unavailable');
    extension.loseContext();
  });
}
for (const viewport of viewports) {
  test(`packaged graphics recovery ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [], requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('unread-city.presentation-mode.v1', 'novel'));
    await page.route('http://127.0.0.1:5197/', route => route.fulfill({ contentType: 'text/html', body: host }));
    await page.route('**/api/**', route => { requests.push(route.request().url()); return route.abort(); });
    await page.route('https://**', route => { requests.push(route.request().url()); return route.abort(); });
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(`${folder}/release/unread-city-lite-assets.zip`);
    await expect(page.locator('#unread-city-lite-import')).toContainText('已安装', { timeout: 60_000 });
    await page.reload();
    await page.locator('[data-academic-major="computer-science"]').click();
    await page.locator('[data-academic-confirm]').click();
    const noOverflow = async () => {
      expect(await page.locator('.uc-shell').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    };
    const portrait = page.locator('.soyo-live2d');
    await expect(portrait).toHaveAttribute('data-live2d-status', 'ready', { timeout: 30_000 });
    const initialState = await page.evaluate(() => JSON.stringify(localStorage));
    const initialClock = await page.locator('.topbar-world').textContent();
    requests.length = 0;
    await loseContext(portrait.locator('canvas'));
    await expect(portrait).toHaveAttribute('data-live2d-status', 'error');
    const oldPortrait = await portrait.locator('canvas').elementHandle();
    await page.getByRole('button', { name: '刷新画面', exact: true }).click();
    await expect(portrait).toHaveAttribute('data-live2d-status', 'ready', { timeout: 30_000 });
    expect(await oldPortrait!.evaluate(el => el.isConnected)).toBe(false);
    await noOverflow();
    const header = await page.locator('.world-chrome').evaluate(el => {
      const facts = el.querySelector('.topbar-world')!.getBoundingClientRect();
      const actions = el.querySelector('.host-actions')!.getBoundingClientRect();
      const refresh = el.querySelector('.graphics-refresh-button')!.getBoundingClientRect();
      return { overlap: Math.min(facts.right, actions.right) > Math.max(facts.left, actions.left)
        && Math.min(facts.bottom, actions.bottom) > Math.max(facts.top, actions.top),
        refreshWidth: refresh.width, refreshHeight: refresh.height };
    });
    expect(header.overlap).toBe(false);
    expect(header.refreshWidth).toBeGreaterThanOrEqual(44);
    expect(header.refreshHeight).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `${folder}/portrait-${viewport.width}.png` });

    await page.getByRole('button', { name: '地图', exact: true }).click();
    const map = page.locator('[data-tokyo-sandbox-status]');
    await expect(map).toHaveAttribute('data-tokyo-sandbox-status', 'ready', { timeout: 30_000 });
    await expect(map).toHaveAttribute('data-tokyo-sandbox-model', 'glb');
    const camera = await map.getAttribute('data-tokyo-camera');
    await expect(portrait).toHaveAttribute('data-live2d-status', 'idle');
    await loseContext(map.locator('canvas'));
    await expect(map).toHaveAttribute('data-tokyo-sandbox-status', 'fallback');
    for (let i = 0; i < 3; i++) {
      const old = await map.locator('canvas').elementHandle();
      await page.getByRole('button', { name: '刷新沙盘', exact: true }).click();
      await expect(map).toHaveAttribute('data-tokyo-sandbox-status', 'ready', { timeout: 30_000 });
      expect(await old!.evaluate(el => el.isConnected)).toBe(false);
    }
    const oldMap = await map.locator('canvas').elementHandle();
    await page.getByRole('button', { name: '刷新画面', exact: true }).click();
    await expect(map).toHaveAttribute('data-tokyo-sandbox-status', 'ready', { timeout: 30_000 });
    expect(await oldMap!.evaluate(el => el.isConnected)).toBe(false);
    await expect(map).toHaveAttribute('data-tokyo-camera', camera!);
    await noOverflow();
    expect(await page.locator('.wm-map-actions').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${folder}/map-${viewport.width}.png` });
    await page.locator('.window-heading button[aria-label^="关闭"]').click();
    await expect(portrait).toHaveAttribute('data-live2d-status', 'ready', { timeout: 30_000 });
    expect(await page.evaluate(() => JSON.stringify(localStorage))).toEqual(initialState);
    expect(await page.locator('.topbar-world').textContent()).toEqual(initialClock);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    writeFileSync(`${folder}/browser-${viewport.width}.json`, JSON.stringify({ viewport, contextLossRecovery: true,
      repeatedMapRefreshes: 3, globalMapRefresh: true, cameraUnchanged: true, headerOverlap: header.overlap,
      localStorageAndClockUnchanged: true, noApiOrRemoteRequests: true, pageErrors: errors,
      physicalDevice: false }, null, 2));
  });
}
