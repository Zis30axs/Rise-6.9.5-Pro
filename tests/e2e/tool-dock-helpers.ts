import type { Page } from '@playwright/test';

/** Handles both the collapsible rail and historical packaged fixtures. */
export async function selectDockAction(page: Page, title: string) {
  const entry = page.getByRole('navigation', { name: '世界面板' }).getByRole('button', { name: title, exact: true });
  if (!await entry.isVisible()) await page.getByRole('button', { name: '展开菜单', exact: true }).click();
  await entry.click();
}
