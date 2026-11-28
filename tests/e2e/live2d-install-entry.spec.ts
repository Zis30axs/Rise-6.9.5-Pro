import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('Lite exposes Live2D installation inside the card settings and clears it on exit', async ({ page }) => {
  test.setTimeout(180_000);
  const html = readFileSync('index.html', 'utf8').replace(
    '<script type="module" src="/src/frontend/main.ts"></script>',
    '<div id="unread-city-live2d-import"></div><script src="/dist/immersive-shell-lite.js"></script>',
  );
  await page.route('http://127.0.0.1:5178/', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.addInitScript(() => localStorage.setItem('unread-city.presentation-mode.v1', 'novel'));
  await page.goto('/');

  const core = page.locator('#unread-city-lite-import');
  const section = page.getByRole('region', { name: 'Live2D 素材' });
  const legacy = page.locator('#unread-city-live2d-import');
  await expect(core).toBeVisible();
  await expect(legacy).toHaveCount(0);
  await expect(section).toHaveCount(0);
  const corePicker = page.waitForEvent('filechooser');
  await core.click();
  await (await corePicker).setFiles('dist/unread-city-lite-assets.zip');
  await expect(core).toHaveText('✅ 已安装，请刷新页面', { timeout: 60_000 });
  await page.reload();
  await page.locator('[data-academic-major="computer-science"]').click();
  await page.locator('[data-academic-confirm]').click();

  for (const viewport of [{ width: 1440, height: 900 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await expect(section).toHaveCount(0);
    await page.getByRole('button', { name: '更多选项' }).click();
    await page.getByRole('button', { name: /叙事与界面设置/ }).click();
    const install = section.getByRole('button', { name: '安装 Live2D 素材 ZIP' });
    await expect(install).toBeInViewport({ ratio: 1 });
    if (viewport.width === 320) {
      const picker = page.waitForEvent('filechooser');
      await install.click();
      await (await picker).setFiles('assets/live2d-ensemble/unread-city-live2d.zip');
      await expect(section.getByRole('button', { name: '更换 Live2D 素材 ZIP' })).toBeEnabled({ timeout: 120_000 });
    }
    await page.getByRole('button', { name: '关闭叙事与界面设置窗口' }).click();
    await expect(section).toHaveCount(0);
  }
  await page.getByRole('button', { name: '更多选项' }).click();
  await page.getByRole('button', { name: '退出到酒馆' }).click();
  await expect(page.locator('#enter-city')).toBeVisible();
  await expect(legacy).toHaveCount(0);
  await expect(section).toHaveCount(0);
});
