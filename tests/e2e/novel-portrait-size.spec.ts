import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { mountSwitchHost, noOverflow, switchState, viewports } from './switch-map-fixture';

const oldPortrait = { x: 0.38, y: 0.48, w: 0.22, h: 0.19 };
const unrelatedPart = { x: 0.05, y: 0.03, w: 0.4, h: 0.08 };

for (const viewport of viewports) {
  for (const variant of ['atlas', 'authored'] as const) {
    test(`novel ${variant} portrait is not a thumbnail ${viewport.width}x${viewport.height}`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize(viewport);
      const mobile = viewport.width <= 760;
      const layoutKey = `unread-city-shell-layout-v1:${mobile ? 'mobile' : 'desktop'}:novel`;

      // Simulate a previously saved portrait rectangle like the tiny stage in
      // layout edit mode. Only that obsolete size should be migrated.
      await page.addInitScript(({ key }) => {
        localStorage.setItem(key, JSON.stringify({
          portrait: { x: 0.38, y: 0.48, w: 0.22, h: 0.19 },
          notice: { x: 0.05, y: 0.03, w: 0.4, h: 0.08 },
        }));
      }, { key: layoutKey });

      const state = switchState();
      if (variant === 'atlas') {
        state.contacts.push({
          id: 'portrait-size-test', name: '立绘尺寸测试员', tag: '同学',
          summary: '外观显示回归使用的联系人。', affinity: 10,
          status: '已认识', portraitId: 'deepseek', sourcePersonId: null, isMain: false,
        });
      }
      state.story = [{ id: 'portrait-size-dialogue', role: 'assistant',
        text: variant === 'atlas' ? '|立绘尺寸测试员|开心|今天的天气不错。|' : '|月代雪|开心|欢迎回来。|' }];
      const { errors } = await mountSwitchHost(page, { state, mode: 'novel' });
      const stage = page.locator(variant === 'atlas'
        ? '.novel-npc-portrait[data-npc-portrait="deepseek"]'
        : '.novel-npc-portrait[data-majo-portrait="majo-yuki"]');
      await expect(stage).toBeVisible();

      const geometry = await stage.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const shell = element.closest('.uc-shell')!;
        const panel = shell.querySelector<HTMLElement>('.reading-layer')!;
        const panelRect = panel.getBoundingClientRect();
        return {
          height: rect.height, width: rect.width, top: rect.top,
          panelTop: panelRect.top,
          stageZ: Number(getComputedStyle(element).zIndex),
          panelZ: Number(getComputedStyle(panel).zIndex),
        };
      });
      expect(geometry.height).toBeGreaterThan(viewport.height * 0.60);
      expect(geometry.width).toBeGreaterThan(viewport.width * 0.5);
      expect(geometry.top).toBeGreaterThanOrEqual(0);
      expect(geometry.stageZ).toBeLessThan(geometry.panelZ);
      await noOverflow(page);

      const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), layoutKey);
      expect(stored.portrait).toBeUndefined();
      expect(stored.notice).toEqual(unrelatedPart);
      expect(errors).toEqual([]);
      mkdirSync('outputs/novel-portrait-qa', { recursive: true });
      await page.screenshot({
        path: `outputs/novel-portrait-qa/${viewport.width}x${viewport.height}-${variant}.png`,
      });
    });
  }
}
