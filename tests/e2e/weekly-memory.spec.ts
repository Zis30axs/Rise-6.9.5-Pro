import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { WorldState } from '../../src/frontend/types';
import { applyStoryActions } from '../../src/runtime/model';
import { enableProtagonists } from '../../src/runtime/protagonist-world';
import { recordWeeklyStory, weeklyMemoryContext } from '../../src/runtime/weekly-memory';
import { createSelectedInitialState } from './academics-fixture';
import { withArtPhone } from './downtown-art-fixture';

for (const viewport of [
  { width: 1440, height: 900 }, { width: 1280, height: 800 },
  { width: 390, height: 844 }, { width: 320, height: 568 },
]) {
  test(`weekly summary retries and reloads at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(viewport);
    const initial = enableProtagonists(createSelectedInitialState());
    recordWeeklyStory(initial, 'soyo', 'soyo-secret', 'SOYO_SECRET：尚未向对方公开的安排。');
    recordWeeklyStory(initial, 'sakiko', 'sakiko-secret', 'SAKIKO_SECRET：尚未向对方公开的信件。');
    const state = applyStoryActions(initial, [{ type: 'rest', kind: 'wait', minutes: 7 * 1440 }], 'close-week');
    const { helper, errors, modelRequests, extensionResources } = await withArtPhone(page, state);
    const read = () => helper.evaluate(() => (window as unknown as {
      fixtureRead(): { unread_city: WorldState };
    }).fixtureRead().unread_city);
    const summary = '素世有私下的安排，祥子保管着信；这些秘密尚未彼此公开。';
    const reply = `<story>新的一周开始，你继续自己的生活。</story><phone_messages>[]</phone_messages><weekly_summary>${JSON.stringify({ week: 1, text: summary })}</weekly_summary>`;
    await helper.evaluate(() => {
      const host = window as unknown as {
        generate(config: { user_input: string; injects: { content: string }[] }): Promise<string>;
        replaceVariables(...args: unknown[]): void;
      };
      const generate = host.generate;
      host.generate = async config => {
        const context = JSON.parse(config.user_input.split('\n')[1]);
        if (!JSON.stringify(context.weeklyMemory.pending).includes('SAKIKO_SECRET')) throw new Error('缺少全知证据');
        delete context.weeklyMemory;
        if (/SOYO_SECRET|SAKIKO_SECRET/.test(JSON.stringify(context))) throw new Error('秘密进入角色知情投影');
        if (!config.injects[0].content.includes('不得把全知信息自动当作任一角色已知事实')) throw new Error('缺少知情边界');
        return generate(config);
      };
      const replace = host.replaceVariables;
      let fail = true;
      host.replaceVariables = (...args) => {
        if (fail) { fail = false; throw new Error('周报写入失败，请重试'); }
        replace(...args);
      };
    });
    const input = page.getByRole('textbox', { name: '接下来，你想做什么？' });
    const send = page.getByRole('button', { name: /^继续故事/ });
    const before = await read();
    for (const attempt of [0, 1]) {
      await helper.evaluate(reply => (window as unknown as { fixtureReply(reply: string): void }).fixtureReply(reply), reply);
      await input.fill('继续我的生活');
      await send.click();
      await expect(page.getByRole('button', { name: /^叙事中/ })).toHaveCount(0);
      if (attempt === 0) {
        await expect(page.getByText('周报写入失败，请重试', { exact: true })).toBeVisible();
        expect(await read()).toEqual(before);
      }
    }
    await expect.poll(async () => weeklyMemoryContext(await read()).summaries).toEqual([{ week: 1, text: summary }]);
    const saved = await read();
    expect(weeklyMemoryContext(saved).pending).toBeNull();
    expect(saved.protagonists!.weeklyMemory!.closed[0].evidence).toEqual([]);
    expect(saved.protagonists!.weeklyMemory!.closed[0].sources).toContain('sakiko:story:sakiko-secret');
    expect(saved.story.filter(row => row.text === '新的一周开始，你继续自己的生活。')).toHaveLength(1);
    expect(JSON.stringify([saved.story, saved.journal])).not.toMatch(/SOYO_SECRET|SAKIKO_SECRET/);
    await mkdir('outputs/weekly-memory-qa', { recursive: true });
    await page.screenshot({ path: `outputs/weekly-memory-qa/${viewport.width}x${viewport.height}.png` });
    await page.getByRole('button', { name: '切换聊天并恢复原生界面' }).click();
    await page.getByRole('button', { name: '重新进入测试角色', exact: true }).click();
    await expect(page.locator('[data-unread-city-root]')).toBeVisible();
    expect(weeklyMemoryContext(await read())).toEqual(weeklyMemoryContext(saved));
    expect(modelRequests).toEqual([]);
    expect(extensionResources).toEqual([]);
    expect(errors).toEqual([]);
  });
}
