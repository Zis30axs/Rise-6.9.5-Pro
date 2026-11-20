import { expect, test } from '@playwright/test';
import type { WorldState } from '../../src/frontend/types';
import { selectDockAction } from './tool-dock-helpers';

for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`饭菜使用后可关闭提示，地点用餐回执自动收起 ${size.width}×${size.height}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto('/');
    await page.addScriptTag({ type: 'module', url: '/tests/e2e/meal-receipts-fixture.ts' });
    const savedState = () => page.evaluate(() => (window as unknown as { readMealState(): WorldState }).readMealState());
    const dish = 'dish-egg-fried-rice-normal';
    const reject = page.locator('[data-interaction-reject]');
    await page.addLocatorHandler(reject, () => reject.click());

    await selectDockAction(page, '背包');
    const servings = page.locator(`[data-inventory-product="${dish}"]`);
    await servings.getByRole('button').click();
    const inventoryReceipt = page.locator('[data-use-receipt]');
    await expect(inventoryReceipt).toContainText('蛋炒饭');
    await inventoryReceipt.getByRole('button', { name: '关闭提示' }).click();
    await expect(inventoryReceipt).toBeHidden();
    expect((await savedState()).inventory.find(row => row.itemId === dish)?.quantity).toBe(1);
    await servings.getByRole('button').click();
    await expect(inventoryReceipt).toContainText('蛋炒饭');
    await expect(inventoryReceipt).toBeHidden({ timeout: 9000 });
    expect((await savedState()).inventory.some(row => row.itemId === dish)).toBe(false);

    await page.keyboard.press('Escape');
    await selectDockAction(page, '地点');
    await page.locator('[data-quick-service="eat-meal"]').click();
    await expect(page.locator('[data-quick-service-receipt]')).toContainText('吃简餐');
    await page.keyboard.press('Escape');
    const chatReceipt = page.locator('[data-reading-layer] [data-local-activity-receipt]');
    await expect(chatReceipt).toBeVisible();
    await chatReceipt.getByRole('button', { name: '关闭提示' }).click();
    await expect(chatReceipt).toBeHidden();

    await selectDockAction(page, '地点');
    await page.locator('[data-quick-service="eat-meal"]').click();
    await expect(page.locator('[data-quick-service-receipt]')).toContainText('吃简餐');
    await page.keyboard.press('Escape');
    await expect(chatReceipt).toBeVisible();
    const saved = (await savedState());
    await expect(chatReceipt).toBeHidden({ timeout: 9000 });
    const after = (await savedState());
    expect(after.player).toEqual(saved.player);
    expect(after.clock).toEqual(saved.clock);
    expect(after.journal).toEqual(saved.journal);
    await expect(page.locator('#uc-action-input')).toBeEditable();
  });
}
