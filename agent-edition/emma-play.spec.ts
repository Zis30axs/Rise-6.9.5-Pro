import { expect, test } from '@playwright/test';
import { AgentSession, type PendingView, type Summary } from './session';

const sleepReply = [
  '<story>夜色安静。樱羽艾玛把台灯关掉，决定先睡一觉，明天一早再去枫庭律师事务所。',
  '',
  '|樱羽艾玛|平静|今天就到这里，明天再看卷宗。|</story>',
  '<phone_messages>[]</phone_messages>',
  '<world_actions>[{"type":"rest","kind":"sleep","minutes":940}]</world_actions>',
].join('\n');

const travelReply = [
  '<story>早班车穿过城区。樱羽艾玛在新宿的商务楼前停下来，推开枫庭律师事务所的玻璃门。',
  '',
  '|樱羽艾玛|认真|我来登记，先熟悉今天的事务。|</story>',
  '<phone_messages>[]</phone_messages>',
  '<world_actions>[{"type":"travel","locationId":"legal-office"}]</world_actions>',
].join('\n');

const meetingReply = [
  '<story>事务所里只有翻页的声音。橘雪莉把核对过的页码推到艾玛面前。',
  '',
  '|橘雪莉|开心|艾玛桑，这些页码对得上。要不要一起看看？|',
  '|樱羽艾玛|认真|我先看你标出来的地方。|</story>',
  '<phone_messages>[{"npcId":"majo-sherry","text":"艾玛桑，左边架子第二层还有一份送达回执。"}]</phone_messages>',
  '<world_actions>[{"type":"relationship","npcId":"majo-sherry","delta":2,"reason":"在枫庭律师事务所当面核对卷宗，雪莉把页码位置告诉了艾玛。"}]</world_actions>',
].join('\n');

const studyReply = [
  '<story>自习室的灯光明亮。樱羽艾玛翻开法律基础的笔记，把今天看到的程序问题记了下来。',
  '',
  '|樱羽艾玛|思考|先把权利和程序分开写清楚。|</story>',
  '<phone_messages>[]</phone_messages>',
  '<world_actions>[{"type":"travel","locationId":"study-room"},{"type":"study","subjectId":"law-foundations","minutes":30}]</world_actions>',
].join('\n');

const shopReply = [
  '<story>便利店门前的灯还亮着。樱羽艾玛买了一份家常饭团，站在路边吃完。',
  '',
  '|樱羽艾玛|平静|先吃一点，再决定下一步。|</story>',
  '<phone_messages>[]</phone_messages>',
  '<world_actions>[{"type":"travel","locationId":"convenience"},{"type":"buy","itemId":"meal-basic","quantity":1},{"type":"use","itemId":"meal-basic"}]</world_actions>',
].join('\n');

function promptJson(pending: PendingView) {
  const start = pending.userInput.indexOf('{');
  const end = pending.userInput.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('上游提示里没有找到状态数据');
  return JSON.parse(pending.userInput.slice(start, end + 1)) as {
    courtroom?: {
      categories?: string[];
      suggestedRandomIds?: string[];
      dailyPreset?: { title?: string; category?: string };
    };
  };
}

function docketReply(pending: PendingView) {
  const court = promptJson(pending).courtroom;
  const ids = court?.suggestedRandomIds ?? [];
  const categories = court?.categories ?? [];
  const preset = court?.dailyPreset;
  if (ids.length !== 2 || !preset?.title || !preset.category || categories.length < 2) {
    throw new Error('委托提示缺少编号或预设：' + JSON.stringify(court).slice(0, 500));
  }
  const titles: Record<string, { title: string; client: string }> = {
    civil: { title: '雨天打翻的画具', client: '画材店学徒' },
    administrative: { title: '迟到的摊位许可', client: '周末市集摊主' },
    'minor-criminal': { title: '钥匙扣与监控空档', client: '展台值班学生' },
  };
  const chosen = categories.filter(category => category !== preset.category).slice(0, 2);
  if (chosen.length !== 2 || chosen.some(category => !titles[category]) || titles[chosen[0]!]?.title === preset.title) {
    throw new Error('无法为今日筛选配齐两份不重复的委托');
  }
  const offers = chosen.map((category, index) => ({
    id: ids[index], category, title: titles[category]!.title, client: titles[category]!.client,
    summary: '公开内容只包括当事人已经说明的经过。', difficulty: 'easy', rewardYen: 6000 + index * 1500,
    experience: 80, preset: false,
  }));
  return [
    '<story>公告栏上留出了三份委托的位置。樱羽艾玛先把目录看完，没有立刻签字。',
    '',
    '|樱羽艾玛|认真|我先看完今天的三份委托，再决定接不接。|</story>',
    '<phone_messages>[]</phone_messages>',
    `<world_actions>${JSON.stringify([{ type: 'court_docket', offers }])}</world_actions>`,
  ].join('\n');
}

function affinity(summary: Summary, id: string) {
  return summary.affinities.find(contact => contact.id === id)?.affinity;
}
function subjectPoints(summary: Summary, id: string) {
  return summary.subjects.find(subject => subject.subjectId === id)?.points ?? 0;
}

test('艾玛从新存档连续游玩地图、手机、职业与人物', async ({ page }) => {
  test.setTimeout(360_000);
  const agent = await AgentSession.open(page);
  try {
    const initialized = await agent.initScene({
      openingMajorId: 'computer-science',
      protagonist: 'emma',
      majorId: 'law',
      locationId: 'legal-office',
      clock: { day: 3, hour: 10, minute: 0 },
      relationships: [{ npcId: 'majo-sherry', delta: 1, reason: '测试场景初始化时的见面' }],
    });
    expect(initialized.protagonist).toBe('emma');
    expect(initialized.majorId).toBe('law');
    expect(initialized.locationId).toBe('legal-office');
    expect(initialized.interior).toBe('legal-office');
    expect(initialized.clock).toEqual({ day: 3, hour: 10, minute: 0 });
    expect(affinity(initialized, 'majo-sherry')).toBe(1);

    await agent.newGame();
    await page.locator('[data-academic-major="computer-science"]').click();
    await page.locator('[data-academic-confirm]').click();
    await expect(page.locator('[data-academic-setup]')).toHaveCount(0);
    await agent.select('[data-protagonist-select]', 'emma');
    await page.locator('[data-switch-skip]').click({ timeout: 15_000 });
    await expect(page.locator('[data-protagonist-switch]')).toHaveCount(0);
    await expect.poll(async () => (await agent.status()).switching).toBe(false);
    await page.locator('[data-academic-major="law"]').click();
    await page.locator('[data-academic-confirm]').click();
    await expect(page.locator('[data-academic-setup]')).toHaveCount(0);
    const ready = await agent.summary();
    expect(ready.protagonist).toBe('emma');
    expect(ready.majorId).toBe('law');
    expect(ready.clock).toEqual({ day: 1, hour: 17, minute: 20 });
    await agent.saveScenario('emma-ready');
    await agent.shot('01-emma-ready.jpg');

    const rejected = await agent.playRejected('我在家门口站一会儿。', '她只是站着，没有按协议回答。');
    expect(rejected.notice).toContain('剧情回复格式不正确');

    const slept = await agent.play('我先睡到明天早上，再去律师事务所。', sleepReply);
    expect(slept.after.clock).toEqual({ day: 2, hour: 9, minute: 0 });
    expect(slept.after.energy).toBeGreaterThanOrEqual(slept.before.energy);

    const travelled = await agent.play('我去枫庭律师事务所。', travelReply);
    expect(travelled.after.locationId).toBe('legal-office');
    expect(travelled.after.interior).toBe('legal-office');
    expect(travelled.after.balance).toBeLessThan(travelled.before.balance);

    await agent.clickRole('地点');
    await expect(page.locator('[data-place-law]')).toBeVisible();
    await agent.click('[data-place-law]');
    await agent.click('[data-court-enroll]');
    await expect.poll(async () => (await agent.summary()).enrolled).toBe(true);
    expect((await agent.summary()).qualification).toBe('student');

    const docket = await agent.clickAndReply('[data-court-docket]', docketReply);
    expect(docket.after.boardTitles).toHaveLength(3);
    await expect(page.locator('[data-court-offer]')).toHaveCount(3);
    await page.locator('[data-window="law"] button[aria-label^="关闭"]').click();

    const met = await agent.play('我和橘雪莉打个招呼，一起看她标出的页码。', meetingReply);
    expect(affinity(met.after, 'majo-sherry')).toBe(2);
    expect(met.after.phone.some(message => message.npcId === 'majo-sherry' && message.text.includes('送达回执'))).toBe(true);
    await expect(page.getByRole('button', { name: '点击推进剧情' })).toContainText('事务所里只有翻页的声音');
    await page.getByRole('button', { name: '下一句剧情' }).click();
    await expect(page.getByRole('button', { name: '点击推进剧情' })).toContainText('这些页码对得上');

    await agent.clickRole('手机');
    await expect(page.locator('[data-window="phone"]')).toBeVisible();
    await agent.shot('02-phone.jpg');
    await page.getByRole('button', { name: '关闭手机窗口' }).click();

    await agent.clickRole('地图');
    await expect(page.locator('.world-map')).toBeVisible();
    await page.locator('.wm-district-list button').first().click();
    await expect(page.locator('.world-map')).not.toHaveAttribute('data-map-district', '');
    await agent.shot('03-map.jpg');
    await page.getByRole('button', { name: '关闭地图窗口' }).click();

    const studied = await agent.play('我去图书馆自习室，学习三十分钟法律基础。', studyReply);
    expect(studied.after.locationId).toBe('study-room');
    expect(subjectPoints(studied.after, 'law-foundations')).toBe(30);

    const beforeShop = studied.after;
    const shopped = await agent.play('我去便利店买一份家常饭团并吃掉。', shopReply);
    expect(shopped.after.locationId).toBe('convenience');
    expect(shopped.after.inventory).toEqual([]);
    expect(beforeShop.balance - shopped.after.balance).toBeGreaterThanOrEqual(160);

    await agent.clickRole('状态');
    await expect(page.locator('[data-testid="protagonist-recap"]')).toContainText('樱羽艾玛');
    await expect(page.locator('[data-player-stat="energy"]')).toBeVisible();
    const overflow = await page.locator('[data-unread-city-root]').evaluate(element => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await agent.shot('04-mobile.jpg');
    await page.setViewportSize({ width: 1440, height: 900 });

    const names = await agent.databaseNames();
    expect(names).toContain('unread-city-agent-emma-play');
    expect(names).not.toContain('unread-city-memory-v1');

    const playedSteps = agent.steps.slice();
    const sleepSteps = playedSteps.filter(step => step.op === 'say' && step.text.includes('睡到明天') || step.op === 'inject' && step.rawText.includes('"kind":"sleep"'));
    await agent.restoreScenario('emma-ready');
    const restored = await agent.summary();
    expect(restored.protagonist).toBe('emma');
    expect(restored.majorId).toBe('law');
    expect(restored.clock).toEqual({ day: 1, hour: 17, minute: 20 });
    expect(restored.locationId).not.toBe('legal-office');
    expect(restored.storyCount).toBeLessThan(shopped.after.storyCount);

    await agent.replay(sleepSteps);
    const replayed = await agent.summary();
    expect(replayed.clock).toEqual({ day: 2, hour: 9, minute: 0 });

    agent.writeRecord('emma-play.json', {
      final: shopped.after,
      restored,
      replayed,
      databases: names,
      overflow,
    });
  } catch (error) {
    agent.writeRecord('emma-play-failure.json', {
      message: error instanceof Error ? error.message : String(error),
      summary: await agent.summary().catch(() => null),
      logs: await agent.logs().catch(() => null),
    });
    throw error;
  }
});
