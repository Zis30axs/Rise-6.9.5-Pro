import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { AgentSession, type PendingView, type Summary } from './session';

test.beforeAll(() => {
  const result = spawnSync('node', ['agent-edition/prepare-phone.mjs'], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('内置手机未能按记录中的源码构建');
});

const travelCafe = [
  '<story>傍晚的街边还亮着。长崎素世推开玛格咖啡馆的门，柜台后有咖啡的气味。',
  '',
  '|长崎素世|平静|我进来坐一下。|</story>',
  '<phone_messages>[]</phone_messages>',
  '<world_actions>[{"type":"travel","locationId":"margo-cafe-room"}]</world_actions>',
].join('\n');

const friendReply = [
  '<story>宝生玛格把杯子放下，语气仍旧从容。',
  '',
  '|宝生玛格|开心|要不要交换联系方式，加个好友？|',
  '|长崎素世|平静|可以，我看看手机。|</story>',
  '<phone_messages>[]</phone_messages>',
  '<contact_requests>[{"kind":"contact","npcId":"majo-margo","evidenceId":"current","quote":"要不要交换联系方式，加个好友？"}]</contact_requests>',
].join('\n');

const introReply = [
  '<story>宝生玛格经营街边咖啡馆，说话从容，眼下和素世只是刚认识，还没有更私密的交往。</story>',
  '<phone_messages>[]</phone_messages>',
].join('\n');

function waitReply(minutes: number) {
  return [
    '<story>时间安静地过去，长崎素世没有离开原地。</story>',
    '<phone_messages>[]</phone_messages>',
    `<world_actions>[{"type":"rest","kind":"wait","minutes":${minutes}}]</world_actions>`,
  ].join('\n');
}

function smsAnswer(pending: PendingView) {
  if (pending.kind !== 'autonomous_sms' && !pending.userInput.includes('主动短信子任务上下文')) return null;
  const start = pending.userInput.indexOf('{');
  const end = pending.userInput.lastIndexOf('}');
  const data = JSON.parse(pending.userInput.slice(start, end + 1)) as { id?: string; actor?: { name?: string } };
  if (!data.id) throw new Error('主动短信请求没有任务编号');
  const sender = data.actor?.name || '朋友';
  return `<autonomous_sms>${JSON.stringify({ id: data.id, text: `${sender}这边没有急事，只是想问你今晚是否还方便。` })}</autonomous_sms>`;
}

function npcReply(pending: PendingView) {
  const start = pending.userInput.indexOf('{');
  const end = pending.userInput.lastIndexOf('}');
  const data = JSON.parse(pending.userInput.slice(start, end + 1)) as { message?: { id?: string }; actor?: { name?: string } };
  const messageId = data.message?.id;
  if (!messageId) throw new Error('短信回复请求没有消息编号');
  const name = data.actor?.name || '对方';
  return `<phone_reply>${JSON.stringify({ messageId, text: `${name}收到了。我先把手头的事做完，晚点再聊。` })}</phone_reply>`;
}

async function chooseMajor(page: Page, majorId: string) {
  await page.locator(`[data-academic-major="${majorId}"]`).click();
  await page.locator('[data-academic-confirm]').click();
  await expect(page.locator('[data-academic-setup]')).toHaveCount(0);
}

async function becomeEmma(page: Page, agent: AgentSession) {
  await chooseMajor(page, 'computer-science');
  await agent.select('[data-protagonist-select]', 'emma');
  await page.locator('[data-switch-skip]').click({ timeout: 15_000 });
  await expect(page.locator('[data-protagonist-switch]')).toHaveCount(0);
  await expect.poll(async () => (await agent.status()).switching).toBe(false);
  await chooseMajor(page, 'law');
  expect((await agent.summary()).protagonist).toBe('emma');
}

async function phoneFrame(page: Page) {
  const slot = page.locator('[data-unread-city-phone-slot]');
  if (!(await slot.isVisible())) await page.getByRole('button', { name: '手机', exact: true }).click();
  await expect(slot).toBeVisible();
  await expect.poll(async () => slot.getAttribute('data-phone-status'), { timeout: 45_000 }).toBe('ready');
  const frame = page.frameLocator('#sttts-panel iframe');
  await expect(frame.locator('[data-app="appie"]')).toBeVisible({ timeout: 20_000 });
  return frame;
}

async function openPhoneApp(frame: FrameLocator, id: string) {
  await frame.locator(`.app-icon[data-app="${id}"]`).evaluate((button: HTMLButtonElement) => button.click());
  await expect(frame.locator('.screen')).toHaveAttribute('data-view', 'app', { timeout: 10_000 });
}

test('手机里的短信、钱包、好友申请和人物简介', async ({ page }) => {
  test.setTimeout(240_000);
  const agent = await AgentSession.open(page, 'phone-gap');
  try {
    expect(agent.phoneModule).not.toBe('stub');
    await chooseMajor(page, 'computer-science');
    const arrived = await agent.play('我去玛格咖啡馆。', travelCafe);
    expect(arrived.after.locationId).toBe('margo-cafe-room');
    await agent.clickRole('地点');
    const talk = page.locator('[data-talk-person="majo-margo"]');
    await expect(talk).toBeVisible();
    await talk.click();
    const met = await agent.play('我和宝生玛格打个招呼。', friendReply);
    const saved = await agent.readState() as { protagonists?: { npcPhone?: { requests?: { npcId: string; status: string; quote: string }[] } } };
    const request = saved.protagonists?.npcPhone?.requests?.find(row => row.npcId === 'majo-margo' && row.status === 'pending');
    expect(request?.quote).toBe('要不要交换联系方式，加个好友？');
    expect(met.after.affinities.some(row => row.id === 'majo-margo')).toBe(false);

    if (await page.locator('[data-window="location"]').isVisible()) {
      await page.locator('[data-window="location"] button[aria-label^="关闭"]').click();
    }
    await page.locator('[data-encounter-contact]').click();
    const frame = await phoneFrame(page);
    const introButton = frame.getByRole('button', { name: '允许 LLM 生成简介' });
    await expect(introButton).toBeVisible({ timeout: 20_000 });
    await introButton.click();
    const intro = await agent.answerPending(introReply);
    expect(intro.after.storyCount).toBe(met.after.storyCount);
    await expect(frame.locator('[data-field="contact-persona"]')).toHaveValue(/宝生玛格经营街边咖啡馆/);
    await agent.shot('05-introduction.jpg');
    await frame.locator('.app-nav [data-system="home"]').click();

    await openPhoneApp(frame, 'worldmessages');
    await expect(frame.getByText('要不要交换联系方式，加个好友？')).toBeVisible();
    await frame.locator('[data-action="accept-contact"]').click();
    await expect.poll(async () => {
      const state = await agent.readState() as { contacts?: { id: string; sourcePersonId?: string | null }[] };
      return state.contacts?.some(row => row.id === 'majo-margo' || row.sourcePersonId === 'majo-margo') ?? false;
    }).toBe(true);
    await frame.locator('[data-action="open-thread"][data-recipient="npc:majo-margo"]').click();
    await frame.locator('[data-field="draft"]').fill('玛格，我是素世，已经加上了。');
    await frame.locator('[data-action="send"]').evaluate((button: HTMLButtonElement) => button.click());
    await frame.getByRole('button', { name: '让对方回复' }).evaluate((button: HTMLButtonElement) => button.click());
    const reply = await agent.answerPending(npcReply);
    expect(reply.pending.kind === 'npc_phone_reply' || reply.pending.userInput.includes('NPC短信上下文')).toBe(true);
    await expect(frame.locator('.chat-bubble').filter({ hasText: '晚点再聊' })).toBeVisible();
    await frame.locator('.app-nav [data-system="home"]').click();
    await openPhoneApp(frame, 'appie');
    const balance = (await agent.summary()).balance;
    await expect(frame.locator('.wallet-card strong')).toContainText(String(Math.trunc(balance)));
    await agent.shot('06-wallet.jpg');
    agent.writeRecord('phone-contacts.json', { summary: await agent.summary() });
  } catch (error) {
    agent.writeRecord('phone-contacts-failure.json', {
      message: error instanceof Error ? error.message : String(error),
      summary: await agent.summary().catch(() => null),
    });
    throw error;
  }
});

test('游戏抽中的主动短信按真实请求注入', async ({ page }) => {
  test.setTimeout(180_000);
  const agent = await AgentSession.open(page, 'sms-gap');
  try {
    await chooseMajor(page, 'computer-science');
    let delivered: Summary | null = null;
    let raw = '';
    for (let index = 0; index < 16 && !delivered; index += 1) {
      const turn = await agent.play(`我在原地再等一百分钟。`, waitReply(100), { followup: smsAnswer });
      const hit = turn.followups.find(item => item.rawText.includes('<autonomous_sms>') && item.rawText.includes('"text":'));
      if (hit && hit.after.phone.length > turn.after.phone.length) {
        delivered = hit.after;
        raw = hit.rawText;
      }
    }
    expect(delivered, '多次推进游戏时间后仍没有抽中主动短信').not.toBeNull();
    expect(delivered!.phone.at(-1)?.text).toContain('今晚是否还方便');
    expect(raw).toContain('<autonomous_sms>');
    await agent.shot('07-autonomous-sms.jpg');
    agent.writeRecord('autonomous-sms.json', { raw, phone: delivered!.phone, clock: delivered!.clock });
  } catch (error) {
    agent.writeRecord('autonomous-sms-failure.json', {
      message: error instanceof Error ? error.message : String(error),
      summary: await agent.summary().catch(() => null),
      logs: await agent.logs().catch(() => null),
    });
    throw error;
  }
});

test('自由庭审从受理、开庭到结案', async ({ page }) => {
  test.setTimeout(240_000);
  const agent = await AgentSession.open(page, 'court-gap');
  try {
    await becomeEmma(page, agent);
    await agent.play('我先睡到明天早上。', [
      '<story>樱羽艾玛决定先休息，明天再去事务所。</story>',
      '<phone_messages>[]</phone_messages>',
      '<world_actions>[{"type":"rest","kind":"sleep","minutes":940}]</world_actions>',
    ].join('\n'));
    const office = await agent.play('我去枫庭律师事务所。', [
      '<story>樱羽艾玛走进枫庭律师事务所。</story>',
      '<phone_messages>[]</phone_messages>',
      '<world_actions>[{"type":"travel","locationId":"legal-office"}]</world_actions>',
    ].join('\n'));
    expect(office.after.locationId).toBe('legal-office');
    const balanceBeforeTravel = office.before.balance;
    expect(office.after.balance).toBeLessThan(balanceBeforeTravel);
    await agent.clickRole('地点');
    await page.locator('[data-place-law]').click();
    await page.locator('[data-court-enroll]').click();
    await agent.clickAndReply('[data-court-docket]', pending => {
      const start = pending.userInput.indexOf('{');
      const end = pending.userInput.lastIndexOf('}');
      const data = JSON.parse(pending.userInput.slice(start, end + 1)) as {
        courtroom?: { categories?: string[]; suggestedRandomIds?: string[]; dailyPreset?: { title?: string; category?: string } };
      };
      const court = data.courtroom;
      const ids = court?.suggestedRandomIds ?? [];
      const preset = court?.dailyPreset;
      const categories = court?.categories ?? [];
      const chosen = categories.filter(category => category !== preset?.category).slice(0, 2);
      const titles: Record<string, string> = { civil: '雨天打翻的画具', administrative: '迟到的摊位许可', 'minor-criminal': '钥匙扣与监控空档' };
      const offers = chosen.map((category, index) => ({
        id: ids[index], category, title: titles[category], client: '临时委托人',
        summary: '只包含当事人已经说明的经过。', difficulty: 'easy', rewardYen: 6000, experience: 80, preset: false,
      }));
      return [
        '<story>樱羽艾玛先看完今天的委托目录。</story>',
        '<phone_messages>[]</phone_messages>',
        `<world_actions>${JSON.stringify([{ type: 'court_docket', offers }])}</world_actions>`,
      ].join('\n');
    });
    const preset = page.locator('[data-court-offer^="preset-"] button').first();
    await preset.click();
    await expect.poll(async () => (await agent.summary()).locationId).toBe('court-hearing');
    const opened = await agent.summary();
    const state = await agent.readState() as {
      courtroom?: { active?: { title?: string; evidence?: { title: string }[]; rewardYen?: number; white?: string } };
      player?: { balance: number };
    };
    const evidence = state.courtroom?.active?.evidence?.map(item => item.title) ?? [];
    expect(evidence.length).toBeGreaterThanOrEqual(2);
    const reward = state.courtroom?.active?.rewardYen ?? 0;
    const affinityBefore = opened.affinities.find(row => row.id === 'majo-sherry')?.affinity;
    const step = await agent.play('我根据已经提交的证据问一句。', [
      `<story>庭上只讨论已经提交的材料。樱羽艾玛提到「${evidence[0]}」。</story>`,
      '<phone_messages>[]</phone_messages>',
      `<world_actions>${JSON.stringify([{ type: 'court_step', key: 'testimony-1', kind: 'testimony', summary: `当事人确认了${evidence[0]}的内容。` }])}</world_actions>`,
    ].join('\n'));
    expect(step.after.clock.day).toBe(opened.clock.day);
    expect(step.after.clock.hour * 60 + step.after.clock.minute).toBe(opened.clock.hour * 60 + opened.clock.minute + 5);
    const finished = await agent.play('我请求法庭根据现有证据结案。', [
      `<story>樱羽艾玛只依据已提交的「${evidence.join('」「')}」说明结论，没有引入卷宗以外的事实。</story>`,
      '<phone_messages>[]</phone_messages>',
      `<world_actions>${JSON.stringify([{ type: 'court_finish', verdict: 'win', summary: `法庭采信已提交的${evidence.join('、')}，委托成立。` }])}</world_actions>`,
    ].join('\n'));
    expect(finished.after.locationId).toBe('legal-office');
    expect(finished.after.balance - step.after.balance).toBe(reward);
    expect(finished.after.affinities.find(row => row.id === 'majo-sherry')?.affinity).toBe(affinityBefore);
    expect(finished.after.clock.day).toBe(opened.clock.day);
    const closed = await agent.readState() as { courtroom?: { active?: unknown; results?: { id: string }[] } };
    expect(closed.courtroom?.active ?? null).toBeNull();
    expect(closed.courtroom?.results).toHaveLength(1);
    await agent.playRejected('我想用同样的结论再结一次案。', [
      '<story>樱羽艾玛想再宣布一次同样的结论。</story>',
      '<phone_messages>[]</phone_messages>',
      '<world_actions>[{"type":"court_finish","verdict":"win","summary":"重复宣布同一结论。"}]</world_actions>',
    ].join('\n'));
    const unchanged = await agent.readState() as { courtroom?: { results?: unknown[] } };
    expect(unchanged.courtroom?.results).toHaveLength(1);
    await agent.shot('08-court.jpg');
    agent.writeRecord('courtroom.json', {
      evidence, reward, opened: opened.clock, finished: finished.after.clock,
      balanceBefore: step.after.balance, balanceAfter: finished.after.balance,
    });
  } catch (error) {
    agent.writeRecord('courtroom-failure.json', {
      message: error instanceof Error ? error.message : String(error),
      summary: await agent.summary().catch(() => null),
      state: await agent.readState().catch(() => null),
    });
    throw error;
  }
});
