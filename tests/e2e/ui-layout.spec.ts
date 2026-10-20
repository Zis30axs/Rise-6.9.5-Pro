import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { completeAcademicSetup } from './academics-fixture';

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
];

for (const viewport of viewports) {
  test('HUD editing and dock-safe panel scrolling at ' + viewport.width + 'x' + viewport.height, async ({ page }) => {
    test.setTimeout(120_000);
    // Layout-only test: the renderer's own WebGL fallback is covered separately.
    // Keep this run responsive on CI workers with software-only 3D acceleration.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: function (type: string, ...args: unknown[]) {
          if (type.startsWith('webgl')) return null;
          return Reflect.apply(original, this, [type, ...args]);
        },
      });
    });
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.goto('/');
    await completeAcademicSetup(page);
    await mkdir('outputs/ui-layout-qa', { recursive: true });
    await page.screenshot({ path: 'outputs/ui-layout-qa/' + viewport.width + 'x' + viewport.height + '-initial.png' });

    const shell = page.locator('.uc-shell');
    const switchChat = page.getByRole('button', { name: '切换聊天并恢复原生界面' });
    await expect(switchChat).toBeVisible();
    await expect(page.locator('[data-unread-city-rescue]')).toHaveCount(0);
    const chatRect = await switchChat.boundingBox();
    expect(chatRect).not.toBeNull();
    expect(chatRect!.x).toBeGreaterThanOrEqual(0);
    expect(chatRect!.x + chatRect!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(chatRect!.y).toBeGreaterThanOrEqual(0);
    expect(chatRect!.y + chatRect!.height).toBeLessThanOrEqual(viewport.height + 1);

    const dock = page.locator('.tool-dock');
    for (const menu of ['地图', '地点', '背包', '状态', '日程']) {
      await page.getByRole('button', { name: menu, exact: true }).click();
      const panel = page.locator('.floating-window:not(.phone-window)');
      await expect(panel).toBeVisible();
      const bounds = await panel.boundingBox();
      const dockBounds = await dock.boundingBox();
      expect(bounds).not.toBeNull();
      expect(dockBounds).not.toBeNull();

      if (viewport.width <= 760) {
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(dockBounds!.y - 5);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
      } else {
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(dockBounds!.x - 4);
      }

      if (menu === '地点') await page.screenshot({ path: 'outputs/ui-layout-qa/' + viewport.width + 'x' + viewport.height + '-location-menu.png' });
      const contents = panel.locator('.window-content');
      await expect(contents).toBeVisible();
      await contents.evaluate(node => { node.scrollTop = node.scrollHeight; });
      const scroll = await contents.evaluate(node => ({
        top: node.scrollTop, height: node.scrollHeight, viewport: node.clientHeight,
      }));
      if (scroll.height > scroll.viewport + 2) expect(scroll.top).toBeGreaterThan(0);
    }

    await page.getByRole('button', { name: '日程', exact: true }).click();
    const reading = page.locator('.reading-layer');
    await expect(reading).toBeVisible();
    const before = await reading.boundingBox();
    const grip = page.getByRole('button', { name: '上下拖动调整正文高度' });
    await expect(grip).toBeVisible();
    const gripRect = await grip.boundingBox();
    expect(before).not.toBeNull();
    expect(gripRect).not.toBeNull();
    const centerX = gripRect!.x + gripRect!.width / 2;
    const centerY = gripRect!.y + gripRect!.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX, centerY + 35, { steps: 6 });
    await page.mouse.up();

    await expect.poll(async () => (await reading.boundingBox())?.height ?? 0).toBeLessThan(before!.height - 10);
    const preference = await page.evaluate(() => {
      const key = 'unread-city-shell-layout-v1:' +
        (window.innerWidth <= 760 ? 'mobile' : 'desktop') + ':scene';
      return window.localStorage.getItem(key);
    });
    expect(preference).toContain('"reading"');

    await page.getByRole('button', { name: '编辑界面布局' }).click();
    await expect(shell).toHaveAttribute('data-layout-edit', 'true');
    await expect(reading.locator('.uc-layout-handle')).toHaveCount(2);
    await page.getByRole('button', { name: '重置界面布局' }).click();
    await expect.poll(async () => (await reading.boundingBox())?.height ?? 0).toBeGreaterThan(before!.height - 10);
    await page.getByRole('button', { name: '完成界面布局编辑' }).click();
    await expect(shell).toHaveAttribute('data-layout-edit', 'false');
    await page.screenshot({ path: 'outputs/ui-layout-qa/' + viewport.width + 'x' + viewport.height + '-restored.png' });

    expect(errors).toEqual([]);
  });
}

test('narrow software keyboard viewport keeps scrolling panels clear of dock', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 440 });
  await page.goto('/');
  await completeAcademicSetup(page);
  await page.getByRole('button', { name: '地点', exact: true }).click();
  const panel = page.locator('.floating-window:not(.phone-window)');
  const dock = page.locator('.tool-dock');
  await expect(panel).toBeVisible();
  const panelBounds = await panel.boundingBox();
  const dockBounds = await dock.boundingBox();
  expect(panelBounds!.y + panelBounds!.height).toBeLessThanOrEqual(dockBounds!.y - 5);
  await panel.locator('.window-content').evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(page.locator('[data-unread-city-rescue]')).toHaveCount(0);
});
