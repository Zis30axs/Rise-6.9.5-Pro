import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { counts, mountSwitchHost, noOverflow, readState, switchState, viewports } from './switch-map-fixture';

for (const viewport of viewports) {
  test('novel click-through and Renako angry sprite ' + viewport.width + 'x' + viewport.height, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    const state = switchState();
    state.story = [{
      id: 'renako-dialogue-regression', role: 'assistant', text: [
        '游戏音效从耳机里传来。',
        '甘織玲奈子|生气|“因为这个战争雷霆真的太让人火大了，不管怎么玩都是这种莫名其妙的结局。”',
        '|甘织玲奈子|开心|好吧，再玩一局。|',
      ].join('\n'),
    }];
    const { helper, errors } = await mountSwitchHost(page, { state, mode: 'novel' });
    const initial = await readState(helper);
    const reader = page.locator('[data-novel-dialogue]');

    await expect(page.locator('.novel-speech')).toHaveText('游戏音效从耳机里传来。');
    await expect(reader).not.toContainText('战争雷霆');
    await expect(reader).toHaveAttribute('data-emotion', '平静');
    await expect(reader.locator('.novel-speaker-avatar')).toHaveCount(0);

    await page.getByRole('button', { name: '下一句剧情', exact: true }).click();
    await expect(reader).toHaveAttribute('data-speaker', '甘織玲奈子');
    await expect(reader).toHaveAttribute('data-emotion', '生气');
    await expect(page.locator('.novel-speech')).toHaveText('“因为这个战争雷霆真的太让人火大了，不管怎么玩都是这种莫名其妙的结局。”');
    await expect(reader).not.toContainText('|生气|');
    const portrait = page.locator('[data-majo-portrait="watanare-renako"]');
    await expect(portrait).toHaveAttribute('data-npc-emotion', 'angry');
    await expect(portrait).toHaveAttribute('data-majo-exact', 'true');

    const avatar = page.getByRole('button', { name: '查看甘織玲奈子的衣着与内心戏', exact: true });
    await expect(avatar.locator('img')).toBeVisible();
    await expect(reader.locator('.novel-speaker')).toHaveText('甘織玲奈子');
    const line = await reader.getAttribute('data-segment');
    await avatar.click();
    const profile = page.getByRole('dialog', { name: '甘織玲奈子的人物详情' });
    await expect(profile).toHaveText(/暂无衣着或内心戏记录。/);
    await expect(reader).toHaveAttribute('data-segment', line!);
    await page.keyboard.press('Escape');
    await expect(profile).toBeHidden();
    await expect(avatar).toBeFocused();
    await expect(reader).toHaveAttribute('data-segment', line!);

    await page.getByRole('button', { name: '点击推进剧情', exact: true }).click();
    await expect(reader).toHaveAttribute('data-speaker', '甘织玲奈子');
    await expect(page.locator('.novel-speech')).toHaveText('好吧，再玩一局。');
    await expect(portrait).toHaveAttribute('data-npc-emotion', 'happy');

    await page.getByRole('button', { name: '全文回看', exact: true }).click();
    const dialogue = page.locator('[data-story-dialogue]').last();
    await dialogue.locator('summary').click();
    await expect(page.locator('.story-list')).not.toContainText('|生气|');
    await dialogue.locator('p').first().click();
    await expect(portrait).toHaveAttribute('data-npc-emotion', 'angry');
    await page.getByRole('button', { name: '逐句阅读', exact: true }).click();
    await expect(page.locator('.novel-speech')).toHaveText('好吧，再玩一局。');
    await expect(portrait).toHaveAttribute('data-npc-emotion', 'happy');

    await expect(page.getByRole('button', { name: '下一句剧情', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '查看甘织玲奈子的衣着与内心戏', exact: true }).click();
    await page.getByRole('button', { name: '关闭人物详情', exact: true }).click();
    await noOverflow(page);
    const after = await readState(helper);
    expect(after).toEqual(initial);
    expect((await counts(helper)).generations).toBe(0);
    expect(errors).toEqual([]);
    mkdirSync('outputs/novel-click-qa', { recursive: true });
    await page.screenshot({ path: 'outputs/novel-click-qa/' + viewport.width + 'x' + viewport.height + '.png' });
  });
}
