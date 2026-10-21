import { expect, test } from '@playwright/test';
import { createSelectedInitialState } from './academics-fixture';
import { withArtPhone } from './downtown-art-fixture';
import { gameDateISO } from '../../src/runtime/game-calendar';

for (const scenario of [
  { day: 1, iso: '2025-08-28', label: '2025年8月28日', weekday: '周四', viewport: { width: 1280, height: 800 } },
  { day: 4, iso: '2025-08-31', label: '2025年8月31日', weekday: '周日', viewport: { width: 390, height: 844 } },
  { day: 5, iso: '2025-09-01', label: '2025年9月1日', weekday: '周一', viewport: { width: 320, height: 568 } },
]) {
  test(`calendar, day ${scenario.day}, ${scenario.viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(scenario.viewport);
    const state = createSelectedInitialState();
    state.clock = { day: scenario.day, hour: 17, minute: 20 };
    const originalClock = structuredClone(state.clock);
    const { helper, errors, modelRequests, extensionResources } = await withArtPhone(page, state);
    const topbar = page.locator('.topbar-world');
    await expect(topbar).toContainText(scenario.label);
    await expect(topbar).toContainText(scenario.weekday);
    await expect(topbar).toContainText('17:20');

    await page.getByRole('button', { name: '状态', exact: true }).click();
    const status = page.locator('[data-window="status"]');
    await expect(status).toContainText(scenario.label);
    await expect(status).toContainText(scenario.weekday);
    if (scenario.day < 5) await expect(status).toContainText('距离大一报到还有');
    if (scenario.day === 5) await expect(status).toContainText('今天是大一报到日');
    await page.getByRole('button', { name: '状态', exact: true }).click();

    await page.getByRole('button', { name: '日程', exact: true }).click();
    const schedule = page.locator('[data-window="schedule"]');
    await expect(schedule).toContainText(scenario.label);
    if (scenario.day <= 5) {
      await expect(schedule).toContainText('正式课程尚未开始');
      await expect(schedule.locator('[data-academic-timetable-view="today"]')).toBeVisible();
      await expect(schedule.locator('.academic-lesson')).toHaveCount(0);
    }
    const stored = await helper.evaluate(() => (window as unknown as {
      fixtureRead(): { unread_city: { clock: { day: number; hour: number; minute: number } } };
    }).fixtureRead().unread_city.clock);
    expect(stored).toEqual(originalClock);
    expect(gameDateISO(stored.day)).toBe(scenario.iso);
    expect(errors).toEqual([]);
    expect(modelRequests).toEqual([]);
    expect(extensionResources).toEqual([]);
  });
}
