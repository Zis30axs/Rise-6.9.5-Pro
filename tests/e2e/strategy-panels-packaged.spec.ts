import { expect, test } from '@playwright/test';
import { selectDockAction } from './tool-dock-helpers';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const viewports = [
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 },
];
const host = readFileSync('index.html', 'utf8').replace(
  '<script type="module" src="/src/frontend/main.ts"></script>',
  '<script src="/dist/immersive-shell-lite.js"></script>',
);
if (host.includes('/src/frontend/main.ts') || !host.includes('src="/dist/immersive-shell-lite.js"')) {
  throw new Error('The regression host must load the packaged IIFE without external component CSS.');
}
const output = 'outputs/strategy-panels-qa';

for (const viewport of viewports) {
  for (const panelName of ['国策', '阵营', '状态'] as const) {
    test(`${panelName} packaged styles ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => localStorage.setItem('unread-city.presentation-mode.v1', 'novel'));
      await page.route('http://127.0.0.1:5178/', route => route.fulfill({ contentType: 'text/html', body: host }));
      await page.route('http://127.0.0.1:5178/unread-city-lite-assets.zip', route => route.continue({ url: 'http://127.0.0.1:5178/dist/unread-city-lite-assets.zip' }));
      await page.route('**/api/**', route => route.abort());
      await page.route('https://**', route => route.abort());
      await page.goto('/');
      const chooser = page.waitForEvent('filechooser');
      await page.locator('#unread-city-lite-import').click();
      await (await chooser).setFiles('dist/unread-city-lite-assets.zip');
      await expect(page.locator('#unread-city-lite-import')).toHaveText('✅ 已安装，请刷新页面', { timeout: 60_000 });
      await page.reload();
      await page.locator('[data-academic-major="computer-science"]').click();
      await page.locator('[data-academic-confirm]').click();
      if (panelName === '状态') {
        // Initialize a real active focus and traits through the same controls as a player.
        await selectDockAction(page, '国策');
        const focus = page.getByTestId('focus-tree-panel');
        await focus.locator('[data-focus-id="soyo_face_past"]').click();
        await focus.getByTestId('focus-detail-modal').getByRole('button', { name: '开始国策', exact: true }).click();
      }
      await selectDockAction(page, panelName);
      const id = panelName === '国策' ? 'focus-tree-panel' : panelName === '阵营' ? 'society-panel' : 'strategy-status-hero';
      const panel = page.getByTestId(id);
      await expect(panel).toBeVisible();
      const styles = await panel.evaluate(el => {
        const root = el.getRootNode() as ShadowRoot;
        const css = [...root.querySelectorAll('style')].map(style => style.textContent).join('\n');
        const computed = getComputedStyle(el);
        return {
          shadow: root instanceof ShadowRoot,
          display: computed.display, background: computed.backgroundImage,
          border: computed.borderTopWidth,
          embeddedPanelStyle: css.includes(`.${el.classList[1]}`),
          externalStylesheets: document.querySelectorAll('link[rel="stylesheet"]').length,
        };
      });
      mkdirSync(output, { recursive: true });
      const filename = `${output}/${id}-${viewport.width}x${viewport.height}`;
      writeFileSync(`${filename}.json`, JSON.stringify(styles, null, 2));
      await page.screenshot({ path: `${filename}.png` });
      expect(styles).toMatchObject({ shadow: true, display: 'grid', border: '1px', embeddedPanelStyle: true, externalStylesheets: 0 });
      expect(styles.background).toContain('linear-gradient');
      await expect(panel).not.toContainText(/LLM|world_actions|不额外请求模型|本地 AI|写入本地|本地组织管理/);

      if (panelName === '国策') {
        const tree = panel.getByTestId('focus-tree-viewport');
        await expect(tree.locator('[data-focus-id]')).toHaveCount(7);
        await expect(tree.locator('path[data-from][data-to]')).toHaveCount(6);
        const artwork = tree.locator('.tno-focus-node img');
        await expect(artwork).toHaveCount(2);
        for (const img of await artwork.all()) {
          await expect.poll(() => img.evaluate(el => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0)).toBe(true);
        }
        const edge = tree.locator('path[data-from="soyo_mygo_bass"][data-to="soyo_mygo_rehearsal"]');
        expect(await edge.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(0);
        const detail = panel.getByTestId('focus-detail-modal');
        const followUp = tree.locator('[data-focus-id="soyo_mygo_rehearsal"]');
        await followUp.click();
        await expect(detail).toContainText('需要完成：重写贝斯声部');
        await expect(detail.getByRole('button', { name: '开始国策', exact: true })).toBeDisabled();
        await expect(detail).not.toContainText(/soyo_|world_actions|LLM/);
        await detail.getByRole('button', { name: '关闭国策详情' }).click();
        await expect(followUp).toBeFocused();

        const rootFocus = tree.locator('[data-focus-id="soyo_face_past"]');
        await panel.getByRole('button', { name: '放大国策树' }).click();
        await panel.getByRole('button', { name: '重置视图' }).click();
        await expect.poll(() => tree.evaluate(el => el.scrollLeft + el.scrollTop)).toBe(0);
        await page.screenshot({ path: `${filename}-tree.png` });
        await rootFocus.click();
        await detail.getByRole('button', { name: '开始国策', exact: true }).click();
        await expect(detail.getByRole('button', { name: '取消国策', exact: true })).toBeVisible();
        await detail.getByRole('button', { name: '取消国策', exact: true }).click();
        await expect(detail.getByRole('button', { name: '开始国策', exact: true })).toBeEnabled();
      } else if (panelName === '阵营') {
        const tabs = panel.getByRole('navigation', { name: '组织管理分类' });
        expect(await tabs.evaluate(el => getComputedStyle(el).display)).toBe('grid');
        for (const label of ['社交圈', '广域联合体', '竞争决议', '阵营与顾问']) {
          const button = tabs.getByRole('button', { name: new RegExp(label) });
          await button.click();
          await expect(button).toHaveAttribute('aria-current', 'page');
          if (label === '社交圈') {
            await panel.getByPlaceholder('为新的社交圈取名').fill('放学后的同伴');
            await panel.getByRole('button', { name: '建立社交圈', exact: true }).click();
            await expect(panel.locator('.society-card')).toContainText('放学后的同伴');
          }
          expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
          await page.screenshot({ path: `${filename}-${label}.png` });
        }
      } else {
        const portrait = panel.locator('.uc-hero-portrait');
        await expect(panel.getByRole('progressbar')).toBeVisible();
        await expect(panel.locator('.tno-spirit-badge')).not.toHaveCount(0);
        expect(await portrait.evaluate(el => getComputedStyle(el).overflow)).toBe('hidden');
        expect(await portrait.evaluate(el => el.getBoundingClientRect().width)).toBeLessThan(viewport.width);
        await panel.locator('.uc-hero-traits').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${filename}-traits.png` });
      }
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(await page.locator('.uc-shell').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}
