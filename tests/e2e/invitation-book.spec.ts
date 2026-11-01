import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`邀约簿入口、详情与草稿 ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/tests/e2e/invitation-book.html');
    await page.getByRole('button', { name: '邀约簿', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '邀约簿窗口' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-invitation-detail]')).toContainText('六点半吧。我会过去的。');
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const dock = await page.locator('.tool-dock').boundingBox();
    expect(dock!.x).toBeGreaterThanOrEqual(0); expect(dock!.x + dock!.width).toBeLessThanOrEqual(viewport.width);
    await dialog.locator('[data-invitation-shelf="pending"]').click();
    await expect(dialog.locator('[data-invitation-detail]')).toContainText('还没有留下回应');
    await dialog.locator('[data-new-invitation]').click();
    await dialog.locator('[data-invite-contact]').first().click();
    await dialog.getByLabel('想一起做的事').fill('一起去看看黄昏的街道。');
    await dialog.locator('[data-compose-invitation]').click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByLabel('接下来，你想做什么？')).toHaveValue(/一起去看看黄昏的街道/);
    expect(await page.evaluate(() => (window as any).invitationFixture.sent.length)).toBe(0);
    await page.getByRole('button', { name: '邀约簿', exact: true }).click();
    await dialog.locator('[data-invitation-travel]').click();
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => (window as any).invitationFixture.dispatched.at(-1))).toEqual({ type: 'novel_travel', locationId: 'cafe' });
  });
}
