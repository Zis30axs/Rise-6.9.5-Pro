import { expect, test } from '@playwright/test';
import { selectDockAction } from './tool-dock-helpers';

for (const width of [320, 390, 1440]) {
  test(`flat map region menu and theme control at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.addInitScript(() => localStorage.setItem('unread-city.presentation-mode.v1', 'novel'));
    await page.goto('/');
    await page.locator('[data-academic-major="computer-science"]').click();
    await page.locator('[data-academic-confirm]').click();
    await selectDockAction(page, '地图');

    const map = page.locator('.fm');
    await map.locator('.fm-fold-trigger').click();
    await map.locator('.fm-region-opt').filter({ hasText: '伦敦' }).click();
    await map.getByRole('searchbox').fill('卡尔福德学校');
    await map.locator('[data-place="london-anon-school"]').click();
    await expect(map.locator('.fm-detail')).toContainText('仅供浏览');

    // A long region name used to wrap the header and push the drawer offscreen.
    await map.locator('.fm-fold-trigger').click();
    const drawer = map.locator('.fm-region-drawer');
    const box = await drawer.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    await map.locator('.fm-region-opt').filter({ hasText: '巴黎' }).click();

    await map.getByRole('button', { name: '切换日夜主题' }).click();
    await expect(map).toHaveAttribute('data-fm-theme', 'day');
    await expect(map.locator('canvas')).toHaveCount(0);
  });
}
