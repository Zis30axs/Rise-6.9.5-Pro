import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
  for (const scenario of ['soyo', 'sakiko', 'departed']) {
    test(`${scenario} bands ${viewport.width}x${viewport.height}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.route('https://**', route => route.abort());
      await page.route('**/api/**', route => route.abort());
      await page.goto(`/tests/e2e/established-bands.html?scenario=${scenario}`);
      const society = page.getByTestId('society-panel'), phone = page.getByTestId('band-phone');
      await expect(society).toBeVisible();
      if (scenario === 'departed') {
        await expect(society.locator('.society-card')).toHaveCount(0);
        await expect(phone.locator('.uc-band-member')).toHaveCount(0);
        await expect(society).toContainText('目前没有你正式加入的乐队');
      } else {
        const band = scenario === 'soyo' ? 'MyGO!!!!!' : 'Ave Mujica';
        const leader = scenario === 'soyo' ? '千早爱音' : '丰川祥子';
        await expect(society.locator('.society-card')).toContainText(band);
        await expect(society).toContainText(`Leader：${leader}`);
        await expect(phone).toContainText(`Leader：${leader}`);
        await expect(phone.locator('.uc-band-member')).toHaveCount(5);
        await expect(phone).not.toContainText('到 Live House 登记乐队后');
        for (const select of await society.locator('select').all()) {
          if (scenario === 'soyo') await expect(select).toBeDisabled(); else await expect(select).toBeEnabled();
        }
      }
      for (const panel of [society, phone]) {
        expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await expect(panel).not.toContainText(/world_actions|LLM|写入本地|随机能力|固定能力/);
      }
      const output = `outputs/established-bands-qa/${scenario}-${viewport.width}x${viewport.height}`;
      mkdirSync('outputs/established-bands-qa', { recursive: true });
      await page.screenshot({ path: `${output}.png`, fullPage: true });
      const focus = page.getByTestId('focus-tree-panel');
      const title = scenario === 'sakiko' ? '引领 Ave Mujica' : '延续 CRYCHIC';
      // Both the original and the integrated tree expose the same route description.
      const node = focus.locator('.tno-focus-node').filter({ hasText: title });
      if (await node.count()) {
        await node.click();
        const dialog = focus.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(scenario === 'sakiko' ? '现有成员' : '完成后退出 MyGO!!!!!');
        expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await dialog.getByText(scenario === 'sakiko' ? /现有成员/ : /完成后退出 MyGO!!!!!/).scrollIntoViewIfNeeded();
      } else {
        await expect(focus).toContainText(scenario === 'sakiko' ? '现有成员' : '完成后退出 MyGO!!!!!');
      }
      await page.screenshot({ path: `${output}-focus.png` });
      expect(errors).toEqual([]);
    });
  }
}
