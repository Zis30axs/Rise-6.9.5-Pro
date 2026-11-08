import { expect, test, type Locator } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const folder = 'outputs/tool-dock';
const host = readFileSync('index.html', 'utf8').replace('<script type="module" src="/src/frontend/main.ts"></script>',
  '<script src="/outputs/tool-dock/release/immersive-shell-lite.js"></script>');
const viewports = [{ width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 }];

for (const viewport of viewports) {
  test(`collapsible tool dock ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = [], requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('unread-city.presentation-mode.v1', 'novel'));
    await page.route('http://127.0.0.1:5198/', route => route.fulfill({ contentType: 'text/html', body: host }));
    await page.route('**/api/**', route => { requests.push(route.request().url()); return route.abort(); });
    await page.route('https://**', route => { requests.push(route.request().url()); return route.abort(); });
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles(`${folder}/release/unread-city-lite-assets.zip`);
    await expect(page.locator('#unread-city-lite-import')).toContainText('已安装', { timeout: 60_000 });
    await page.reload();
    await page.locator('[data-academic-major="computer-science"]').click();
    await page.locator('[data-academic-confirm]').click();

    const dock = page.getByRole('navigation', { name: '世界面板' });
    const menu = dock.getByRole('group', { name: '更多功能' });
    const expanded = () => dock.getByRole('button', { name: '展开菜单' });
    const collapsed = () => dock.getByRole('button', { name: '收起菜单' });
    const bounds = async (locator: Locator) => {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      const size = page.viewportSize()!;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 1);
    };
    const initialClock = await page.locator('.topbar-world').textContent();
    const unread = await dock.locator('.phone-unread-badge').allTextContents();
    await expect(dock.locator('.tool-dock-shortcuts > button')).toHaveCount(3);
    await expect(menu).toHaveCount(0);
    await bounds(dock);
    await page.screenshot({ path: `${folder}/collapsed-${viewport.width}.png` });

    await expanded().click();
    await expect(collapsed()).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('button')).toHaveCount(10);
    await bounds(menu);
    for (const button of await dock.getByRole('button').all()) {
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await menu.textContent()).not.toMatch(/LLM|Agent|模型请求|工程|存档协议/);
    await page.screenshot({ path: `${folder}/expanded-${viewport.width}.png` });
    await collapsed().click();
    await expect(menu).toHaveCount(0);

    // Keyboard users can tab from the disclosure into the menu and dismiss it safely.
    await expanded().focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(menu.getByRole('button').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(expanded()).toBeFocused();
    await expect(page.locator('.uc-shell')).toBeVisible();

    await expanded().click();
    await page.locator('.wordmark').click();
    await expect(menu).toHaveCount(0);
    await expanded().click();
    await menu.getByRole('button', { name: '状态', exact: true }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('[data-window="status"]')).toBeVisible();
    await expanded().click();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-window="status"]')).toBeVisible();
    await page.getByRole('button', { name: '关闭状态窗口' }).click();
    await dock.getByRole('button', { name: '手机', exact: true }).click();
    await expect(page.locator('[data-window="phone"]')).toBeVisible();
    await expanded().click();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('[data-window="phone"]')).toBeVisible();
    await page.getByRole('button', { name: '关闭手机窗口' }).click();

    // A short viewport and an existing moved dock must still expose every action.
    if (viewport.width === 320) {
      await page.setViewportSize({ width: 320, height: 360 });
      await expanded().click();
      await bounds(menu);
      await menu.getByRole('button', { name: '证件', exact: true }).scrollIntoViewIfNeeded();
      await bounds(menu.getByRole('button', { name: '证件', exact: true }));
      await page.keyboard.press('Escape');
      await page.setViewportSize(viewport);
      await dock.evaluate(el => Object.assign((el as HTMLElement).style,
        { left: '6px', top: '8px', right: 'auto', bottom: 'auto', transform: 'none' }));
      await expanded().click();
      await bounds(menu);
      await collapsed().click();
    }
    expect(await dock.locator('.phone-unread-badge').allTextContents()).toEqual(unread);
    expect(await page.locator('.topbar-world').textContent()).toEqual(initialClock);
    expect(await page.locator('.uc-shell').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    writeFileSync(`${folder}/browser-${viewport.width}.json`, JSON.stringify({ viewport, collapsedButtons: 3,
      secondaryButtons: 10, touchTargetsAtLeast44: true, keyboardAndOutsideDismiss: true,
      opensExistingPanel: true, clockAndUnreadUnchanged: true, noApiOrRemoteRequests: true,
      pageErrors: errors, physicalDeviceTested: false }, null, 2));
  });
}
