import { expect, test } from '@playwright/test';
import { selectDockAction } from './tool-dock-helpers';

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`能力独立入口、分类与状态页分离 ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    // Reuse the existing novel Shell fixture; no story generation is involved.
    await page.goto('/tests/e2e/invitation-book.html');
    const stateBefore = await page.evaluate(() => JSON.stringify((window as any).invitationFixture.model.state));
    await selectDockAction(page, '能力');

    const dialog = page.getByRole('dialog', { name: '能力窗口', exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: '展开菜单' })).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog.getByRole('heading', { name: '能力体系 · 星盘与专长', exact: true })).toBeVisible();
    await expect(dialog.locator('[data-abilities-panel]')).toHaveAttribute('data-skills-owner', 'soyo');
    await expect(dialog.locator('[data-radar-node]')).toHaveCount(6);
    await expect(dialog).toContainText('长崎素世 · ISFJ');
    await expect(dialog).not.toContainText(/演示内容|LLM|world_actions|不调用模型|不触发正文/);
    await expect(dialog.locator('[data-status-section="body"]')).toHaveCount(0);

    const panels = dialog.locator('.world-panels');
    expect(await panels.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    for (const button of await page.locator('.tool-dock-shortcuts > button').all()) {
      const bounds = await button.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    }
    const dialogBounds = await dialog.boundingBox();
    const dockBounds = await page.locator('.tool-dock').boundingBox();
    if (viewport.width <= 760) expect(dialogBounds!.y + dialogBounds!.height).toBeLessThanOrEqual(dockBounds!.y);
    await page.screenshot({ path: testInfo.outputPath('abilities.png') });

    await dialog.getByRole('button', { name: /专业学识/ }).click();
    await expect(dialog).toContainText('程序设计');
    await dialog.getByRole('button', { name: '实务与见闻', exact: true }).click();
    await expect(dialog).toContainText('程序设计工作台');
    await dialog.getByText('家常料理与厨艺手记', { exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByText('家常料理与厨艺手记', { exact: true })).toBeVisible();

    await selectDockAction(page, '状态');
    const status = page.getByRole('dialog', { name: '状态窗口', exact: true });
    await expect(status).toBeVisible();
    await expect(status.locator('[data-status-section="body"]')).toBeVisible();
    await expect(status.locator('[data-abilities-panel]')).toHaveCount(0);
    await expect(status).not.toContainText('能力体系 · 星盘与专长');

    await selectDockAction(page, '能力');
    await expect(status).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '关闭能力窗口', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await selectDockAction(page, '能力');
    await selectDockAction(page, '能力');
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => JSON.stringify((window as any).invitationFixture.model.state))).toBe(stateBefore);
    expect(await page.evaluate(() => (window as any).invitationFixture.dispatched.length)).toBe(0);
    expect(await page.evaluate(() => (window as any).invitationFixture.sent.length)).toBe(0);
  });
}
