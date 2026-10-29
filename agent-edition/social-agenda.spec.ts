import { expect, test, type FrameLocator, type Page } from '@playwright/test';
import { AgentSession, type PendingView } from './session';

// Agent Edition supplies the player input and real model output separately.
// There are no direct writes to an invitation, event queue, or game clock.
type Step = { kind: string; at: number; detail: string; done: boolean };
type Event = { id: string; kind: string; at: number; narrated: boolean };
type Invitation = {
  id: string; owner: string; targetId: string; source: string; time: string;
  status: string; messageId: string | null;
  agenda?: { status: string; steps: Step[]; events: Event[] };
};
type Snapshot = {
  clock: { day: number; hour: number; minute: number };
  locationId: string;
  protagonists?: {
    socialInvitations?: Invitation[];
    devices: Record<string, { notifications: { id: string; text: string; read: boolean }[] }>;
    npcPhone?: { messages: { id: string; direction: string; text: string }[] };
  };
};

const envelope = (story: string, actions: unknown[] = []) => [
  `<story>${story}</story>`, '<phone_messages>[]</phone_messages>',
  `<world_actions>${JSON.stringify(actions)}</world_actions>`,
].join('\n');
const waitReply = (minutes: number) => envelope('时间继续流逝，没有人代替玩家作出前往约定地点的决定。',
  [{ type: 'rest', kind: 'wait', minutes }]);
const standardPlan = (arrival = '19:45') => ({
  rationale: arrival === '19:15' ? '提前出发，免得对方久等。' : '先打理私事，决定晚十五分钟到。',
  steps: [
    { kind: 'prepare', day: 2, time: '18:05', detail: '独自整理衣服和随身物品' },
    { kind: 'depart', day: 2, time: arrival === '19:15' ? '18:45' : '19:10', detail: '从咖啡馆出发' },
    { kind: 'arrive', day: 2, time: arrival, detail: '实际到达校园咖啡馆' },
    { kind: 'leave', day: 2, time: '20:15', detail: '约会结束后离开' },
  ],
});
const midnightPlan = {
  rationale: '午夜前后仍愿意见面，但先收拾好工作。',
  steps: [
    { kind: 'prepare', day: 2, time: '23:05', detail: '整理衣物' },
    { kind: 'depart', day: 3, time: '00:10', detail: '动身出门' },
    { kind: 'arrive', day: 3, time: '00:45', detail: '到达约好的地方' },
    { kind: 'leave', day: 3, time: '01:15', detail: '告别后回家' },
  ],
};
const acceptedLine = '|宝生玛格|开心|好啊，十九点半见！|';
const acceptance = (day = 2, time = '19:30', agenda = standardPlan()) => ({
  type: 'social_invite', targetId: 'majo-margo', source: 'meeting', locationId: 'cafe',
  day, time, message: '在校园咖啡馆见面吧。', outcome: 'accepted',
  responseQuote: '好啊，十九点半见！', agenda,
});
const snapshot = async (agent: AgentSession) => await agent.readState() as unknown as Snapshot;
const invitations = (state: Snapshot) => state.protagonists?.socialInvitations ?? [];
const agendaEvents = (row: Invitation, kind: string) => row.agenda?.events.filter(event => event.kind === kind) ?? [];
const stepDone = (row: Invitation, kind: string) => row.agenda?.steps.find(step => step.kind === kind)?.done ?? false;
const latest = (state: Snapshot) => invitations(state).at(-1)!;

async function margoScene(agent: AgentSession, page: Page, clock = { day: 2, hour: 18, minute: 0 }) {
  await agent.initScene({ openingMajorId: 'computer-science', locationId: 'margo-cafe-room', clock });
  await agent.clickRole('地点');
  await expect(page.locator('[data-talk-person="majo-margo"]')).toBeVisible();
  await page.locator('[data-window="location"] button[aria-label^="关闭"]').click();
}
async function acceptMargo(agent: AgentSession, plan = standardPlan(), day = 2, time = '19:30') {
  await agent.play('我当面邀请玛格按她自己的时间安排来赴约。', envelope(
    `长崎素世邀请玛格在咖啡馆见面。\n${acceptedLine}`,
    [acceptance(day, time, plan)],
  ));
  const row = latest(await snapshot(agent));
  expect(row.status).toBe('accepted');
  expect(row.agenda?.status).toBe('scheduled');
  return row;
}
function expectNoUnsolicitedGeneration(before: { requests: { id: string }[] }, after: { requests: { id: string }[] }) {
  expect(after.requests.map(row => row.id)).toEqual(before.requests.map(row => row.id));
}
async function switchTo(agent: AgentSession, page: Page, name: string) {
  await agent.select('[data-protagonist-select]', name);
  const skip = page.locator('[data-switch-skip]');
  await expect(page.locator('[data-protagonist-switch]')).toBeVisible({ timeout: 15_000 });
  await skip.click();
  await expect(page.locator('[data-protagonist-switch]')).toHaveCount(0);
  await expect.poll(async () => (await agent.status()).switching).toBe(false);
  if (await page.locator('[data-academic-setup]').isVisible()) {
    await page.locator('[data-academic-major="computer-science"]').click();
    await page.locator('[data-academic-confirm]').click();
    await expect(page.locator('[data-academic-setup]')).toHaveCount(0);
  }
}
async function phoneFrame(page: Page): Promise<FrameLocator> {
  await page.getByRole('button', { name: '手机', exact: true }).click();
  const slot = page.locator('[data-unread-city-phone-slot]');
  await expect.poll(() => slot.getAttribute('data-phone-status'), { timeout: 45_000 }).toBe('ready');
  return page.frameLocator('#sttts-panel iframe');
}
async function openMessages(frame: FrameLocator) {
  const home = frame.locator('.app-nav [data-system="home"]');
  if (await home.isVisible()) await home.click();
  await frame.locator('.app-icon[data-app="worldmessages"]').evaluate((button: Element) => (button as HTMLElement).click());
  await expect(frame.locator('.screen')).toHaveAttribute('data-view', 'app');
}
async function answerMaiInvite(agent: AgentSession, page: Page, row: Invitation, decision: 'accepted' | 'declined') {
  const frame = await phoneFrame(page);
  await openMessages(frame);
  await frame.locator('[data-action="open-thread"][data-recipient="npc:watanare-mai"]').click();
  await frame.getByRole('button', { name: '让对方回复' }).evaluate((button: Element) => (button as HTMLElement).click());
  const turn = await agent.answerPending((pending: PendingView) => {
    expect(pending.kind).toBe('npc_phone_reply');
    expect(pending.userInput).toContain('NPC短信上下文');
    const raw = pending.userInput;
    const context = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as {
      message: { id: string }; invitation: { id: string; status: string } | null;
    };
    expect(context.message.id).toBe(row.messageId);
    expect(context.invitation?.id).toBe(row.id);
    return `<phone_reply>${JSON.stringify({
      messageId: context.message.id,
      text: decision === 'accepted' ? '好的，我自己安排时间，十九点四十五分到。' : '抱歉，今天不方便赴约。',
      inviteDecision: decision,
      ...(decision === 'accepted' ? { inviteAgenda: standardPlan() } : {}),
    })}</phone_reply>`;
  });
  expect(turn.pending.kind).toBe('npc_phone_reply');
  await page.getByRole('button', { name: '关闭手机窗口' }).click();
}

test('当面同意：19:30 到点不发起 LLM，19:45 才实际到场；按钮、叙述与存档一致', async ({ page }) => {
  test.setTimeout(360_000);
  const agent = await AgentSession.open(page, 'agenda-meeting-late');
  try {
    await margoScene(agent, page);
    const invited = await acceptMargo(agent);
    expect(invited.time).toBe('19:30');
    expect(invited.agenda?.steps.find(s => s.kind === 'arrive')?.at).toBe(1440 + 19 * 60 + 45);
    await agent.play('我留在原来的咖啡馆，暂时不赴约，先等九十分钟。', waitReply(90));
    let state = await snapshot(agent), row = latest(state);
    expect(state.clock).toEqual({ day: 2, hour: 19, minute: 30 });
    expect(stepDone(row, 'depart')).toBe(true);
    expect(stepDone(row, 'arrive')).toBe(false);
    expect(agendaEvents(row, 'due')).toHaveLength(1);
    expect(agendaEvents(row, 'due')[0]?.narrated).toBe(false);
    const logBefore = await agent.logs() as { requests: { id: string }[] };
    await page.waitForTimeout(400);
    expect(await agent.pending()).toBeNull();
    expectNoUnsolicitedGeneration(logBefore, await agent.logs() as { requests: { id: string }[] });
    await expect(page.locator(`[data-meeting-invite="${row.id}"]`)).toBeVisible();
    // The actual button uses the existing travel reducer; it is not a forced model reply.
    await agent.click(`[data-meeting-invite="${row.id}"] button:has-text("前往约定地点")`);
    state = await snapshot(agent);
    expect(state.locationId).toBe('cafe');
    expect(stepDone(latest(state), 'arrive')).toBe(true);
    const followup = await agent.play('我查看约会对象是否到场。', pending => {
      expect(pending.userInput).toContain('socialAgendas');
      expect(pending.userInput).toContain('arrive');
      return envelope('长崎素世来到约定的地方。玛格实际晚了十五分钟才到，没有人在十九点半被强制传送。');
    });
    expect(followup.after.storyTail.at(-1)?.text).toContain('晚了十五分钟');
    await agent.saveScenario('agenda-after-arrival');
    const saved = latest(await snapshot(agent));
    await agent.restoreScenario('agenda-after-arrival');
    expect(latest(await snapshot(agent))).toEqual(saved);
    await agent.play('我没有改变时间线，只等四十分钟。', waitReply(40));
    expect(stepDone(latest(await snapshot(agent)), 'leave')).toBe(true);
    agent.writeRecord('agenda-meeting-late.json', { state: await snapshot(agent) });
  } catch (error) {
    agent.writeRecord('agenda-meeting-late-failure.json', { error: String(error), logs: await agent.logs().catch(() => null) });
    throw error;
  }
});

test('当面邀约：NPC 提前到场不会被改写成准点到场', async ({ page }) => {
  const agent = await AgentSession.open(page, 'agenda-meeting-early');
  await margoScene(agent, page);
  const invite = await acceptMargo(agent, standardPlan('19:15'));
  await agent.play('我仍在原来的地方等七十五分钟。', waitReply(75));
  let state = await snapshot(agent);
  expect(state.clock).toEqual({ day: 2, hour: 19, minute: 15 });
  expect(stepDone(latest(state), 'arrive')).toBe(true);
  expect(agendaEvents(latest(state), 'due')).toHaveLength(0);
  await agent.play('我再等十五分钟。', waitReply(15));
  state = await snapshot(agent);
  expect(agendaEvents(latest(state), 'due')).toHaveLength(1);
  expect(latest(state).id).toBe(invite.id);
});

test('当面拒绝：没有私人日程、到期按钮或伪造通知', async ({ page }) => {
  const agent = await AgentSession.open(page, 'agenda-declined');
  await margoScene(agent, page);
  await agent.play('我当面问玛格要不要一起去校园咖啡馆。', envelope(
    '玛格今天不想出门。\n|宝生玛格|平静|抱歉，今晚不行。|',
    [{ type: 'social_invite', targetId: 'majo-margo', source: 'meeting', locationId: 'cafe',
      day: 2, time: '19:30', message: '一会儿见面吗？', outcome: 'declined', responseQuote: '抱歉，今晚不行。' }],
  ));
  expect(latest(await snapshot(agent)).status).toBe('declined');
  await agent.play('我接受拒绝，自己等九十分钟。', waitReply(90));
  const state = await snapshot(agent);
  expect(latest(state).agenda).toBeUndefined();
  await expect(page.locator('[data-meeting-invite]')).toHaveCount(0);
  expect(state.protagonists?.devices.soyo.notifications.some(n => n.id.startsWith('social:'))).toBe(false);
});

test('真正的当前剧情事件可以改变赴约决定；故意爽约不能仍被判作实际到场', async ({ page }) => {
  const agent = await AgentSession.open(page, 'agenda-no-show');
  await margoScene(agent, page);
  const row = await acceptMargo(agent);
  await agent.play('玛格突然决定不去了。', envelope(
    '玛格收到消息后改变了主意，决定不再赴约。这是新的事件，不是假造的旧记录。',
    [{ type: 'social_agenda', invitationId: row.id, decision: 'no_show', triggerId: 'current', reason: '本轮收到消息后明确决定爽约' }],
  ));
  expect(latest(await snapshot(agent)).agenda?.status).toBe('no_show');
  await agent.play('我还不知道对方的决定，一直等待到十九点三十五。', waitReply(95));
  const result = latest(await snapshot(agent));
  expect(stepDone(result, 'arrive')).toBe(false);
  expect(agendaEvents(result, 'change')).toHaveLength(1);
  expect(agendaEvents(result, 'arrive')).toHaveLength(0);
});

test('玩家主动不赴约：NPC 完成自己的到场和离开，事件留给下一次正常叙述', async ({ page }) => {
  const agent = await AgentSession.open(page, 'agenda-player-absent');
  await margoScene(agent, page);
  await acceptMargo(agent);
  await agent.play('我故意不去约定地点，在原处坐一百五十分钟。', waitReply(150));
  const state = await snapshot(agent), row = latest(state);
  expect(state.locationId).toBe('margo-cafe-room');
  expect(state.clock).toEqual({ day: 2, hour: 20, minute: 30 });
  expect(stepDone(row, 'arrive')).toBe(true);
  expect(stepDone(row, 'leave')).toBe(true);
  expect(agendaEvents(row, 'due').some(e => !e.narrated)).toBe(true);
  const after = await agent.play('我终于想起自己没有赴约。', pending => {
    expect(pending.userInput).toContain('socialAgendas');
    expect(pending.userInput).toContain('unreported');
    return envelope('长崎素世仍在玛格咖啡馆。她想起自己错过了约定，对方曾去过约定地点，已经离开。');
  });
  expect(after.after.storyTail.at(-1)?.text).toContain('错过了约定');
  expect(latest(await snapshot(agent)).agenda?.events.every(e => e.narrated)).toBe(true);
});

test('跨日：第2天23:00 的邀请在第3天00:30 到期、00:45 到场', async ({ page }) => {
  const agent = await AgentSession.open(page, 'agenda-midnight');
  await margoScene(agent, page, { day: 2, hour: 23, minute: 0 });
  await agent.play('我当面约玛格明天凌晨零点半见面。', envelope(
    '玛格答应了午夜的邀约。\n|宝生玛格|开心|好，凌晨零点半见！|',
    [{...acceptance(3, '00:30', midnightPlan), responseQuote: '好，凌晨零点半见！'}],
  ));
  await agent.play('我先安静等待九十分钟。', waitReply(90));
  let state = await snapshot(agent);
  expect(state.clock).toEqual({ day: 3, hour: 0, minute: 30 });
  expect(agendaEvents(latest(state), 'due')).toHaveLength(1);
  expect(stepDone(latest(state), 'arrive')).toBe(false);
  await agent.play('继续再等十五分钟。', waitReply(15));
  state = await snapshot(agent);
  expect(state.clock).toEqual({ day: 3, hour: 0, minute: 45 });
  expect(stepDone(latest(state), 'arrive')).toBe(true);
  await agent.saveScenario('agenda-after-midnight');
  await agent.restoreScenario('agenda-after-midnight');
  expect(latest(await snapshot(agent))).toEqual(latest(state));
});

test('冲突的第二场邀约整轮拒绝，不留下半个日程或第二条承诺', async ({ page }) => {
  const agent = await AgentSession.open(page, 'agenda-conflict');
  await margoScene(agent, page);
  await acceptMargo(agent);
  const before = invitations(await snapshot(agent));
  const second = { ...acceptance(), time: '20:00', agenda: {
    rationale: '第二个相冲突的约定', steps: [
      { kind: 'prepare', day: 2, time: '18:20', detail: '再次准备' },
      { kind: 'depart', day: 2, time: '19:30', detail: '前往第二场约会' },
      { kind: 'arrive', day: 2, time: '20:05', detail: '抵达另一场邀约' },
      { kind: 'leave', day: 2, time: '20:40', detail: '离开' },
    ],
  } };
  const rejected = await agent.playRejected('我又邀请玛格参加时间冲突的另一场邀约。', envelope(
    `玛格不加思索地答应了第二场。\n${acceptedLine}`, [second],
  ));
  expect(rejected.rejected).toBe(true);
  expect(invitations(await snapshot(agent))).toEqual(before);
});

test('四主角切换：共同邀约仍指向真实所有者，私人日程不因视角转换而丢失', async ({ page }) => {
  const agent = await AgentSession.open(page, 'agenda-four-viewpoints');
  await margoScene(agent, page);
  const original = await acceptMargo(agent);
  for (const owner of ['sakiko', 'emma', 'renako', 'soyo']) {
    await switchTo(agent, page, owner);
    expect((await agent.summary()).protagonist).toBe(owner);
    const invitationsNow = invitations(await snapshot(agent));
    expect(invitationsNow.find(row => row.id === original.id)?.agenda).toEqual(original.agenda);
    expect(invitationsNow.find(row => row.id === original.id)?.owner).toBe('soyo');
  }
  expect(await agent.pending()).toBeNull();
});

test('短信邀约：真实手机回复同意或拒绝、到期通知中心、存档恢复', async ({ page }) => {
  test.setTimeout(360_000);
  const agent = await AgentSession.open(page, 'agenda-sms');
  test.skip(agent.phoneModule === 'stub', '需要先在本地构建 ST-iPhonie；占位手机不是实际通知中心');
  try {
    await agent.initScene({ openingMajorId: 'computer-science', protagonist: 'renako', majorId: 'computer-science',
      clock: { day: 2, hour: 18, minute: 0 } });
    await agent.play('我给真唯发短信，问她今晚是否有空在咖啡馆见面。', envelope(
      '甘织玲奈子发出邀约短信，尚不知道真唯是否会同意。',
      [{ type: 'social_invite', targetId: 'watanare-mai', source: 'sms', locationId: 'cafe',
        day: 2, time: '19:30', message: '十九点半在咖啡馆见吗？', outcome: 'pending' }],
    ));
    const pending = latest(await snapshot(agent));
    expect(pending.source).toBe('sms');
    expect(pending.status).toBe('pending');
    expect(pending.messageId?.startsWith('npc:')).toBe(true);
    await agent.saveScenario('agenda-sms-pending');
    await answerMaiInvite(agent, page, pending, 'accepted');
    let state = await snapshot(agent);
    expect(latest(state).status).toBe('accepted');
    expect(latest(state).agenda?.steps.find(s => s.kind === 'arrive')?.at).toBe(1440 + 19 * 60 + 45);
    await agent.play('我留在家里，等到约定时间。', waitReply(90));
    state = await snapshot(agent);
    expect(state.protagonists?.devices.renako.notifications.filter(n => n.id.startsWith('social:'))).toHaveLength(1);
    expect(agendaEvents(latest(state), 'due')).toHaveLength(1);
    const frame = await phoneFrame(page);
    await openMessages(frame);
    await expect(frame.getByRole('status', { name: '见面提醒' })).toContainText('19:30');
    await page.getByRole('button', { name: '关闭手机窗口' }).click();
    await agent.saveScenario('agenda-sms-accepted-due');
    await agent.restoreScenario('agenda-sms-accepted-due');
    expect(latest(await snapshot(agent)).agenda).toEqual(latest(state).agenda);
    expect((await snapshot(agent)).protagonists?.devices.renako.notifications.filter(n => n.id.startsWith('social:'))).toHaveLength(1);
    // Replay the real *pending* phone message to test the refusal branch independently.
    await agent.restoreScenario('agenda-sms-pending');
    expect(latest(await snapshot(agent)).status).toBe('pending');
    await answerMaiInvite(agent, page, pending, 'declined');
    expect(latest(await snapshot(agent)).status).toBe('declined');
    await agent.play('我尊重真唯的拒绝，自己等九十分钟。', waitReply(90));
    state = await snapshot(agent);
    expect(latest(state).agenda).toBeUndefined();
    expect(state.protagonists?.devices.renako.notifications.some(n => n.id.startsWith('social:'))).toBe(false);
    agent.writeRecord('agenda-sms.json', { state });
  } catch (error) {
    agent.writeRecord('agenda-sms-failure.json', { error: String(error), logs: await agent.logs().catch(() => null) });
    throw error;
  }
});

test('不可伪造旧事件来将真实邀约改成爽约', async ({ page }) => {
  const agent = await AgentSession.open(page, 'agenda-forged-trigger');
  await margoScene(agent, page);
  const agreed = await acceptMargo(agent);
  const before = latest(await snapshot(agent));
  const rejected = await agent.playRejected('我只是回顾已有的约定，什么新事情也没有发生。', envelope(
    '长崎素世想起已有的约定，但没有得到新的消息。',
    [{ type: 'social_agenda', invitationId: agreed.id, decision: 'no_show',
      triggerId: 'forged-previous-receipt', reason: '伪造旧事件来改变私人决定' }],
  ));
  expect(rejected.rejected).toBe(true);
  expect(latest(await snapshot(agent))).toEqual(before);
});

test('到期前执行过的准备和出发步骤不可由 LLM 倒写', async ({ page }) => {
  const agent = await AgentSession.open(page, 'agenda-immutable-past');
  await margoScene(agent, page);
  const agreed = await acceptMargo(agent);
  await agent.play('我等待到约定的十九点半。', waitReply(90));
  const before = latest(await snapshot(agent));
  expect(stepDone(before, 'prepare')).toBe(true);
  expect(stepDone(before, 'depart')).toBe(true);
  const altered = standardPlan();
  altered.steps[0]!.detail = '现在才假称以前已经买好了礼物';
  const rejected = await agent.playRejected('我继续观察，没有允许改写旧日程。', envelope(
    '已发生的准备不能被本轮的新故事重新编造。',
    [{ type: 'social_agenda', invitationId: agreed.id, decision: 'revise', triggerId: 'current',
      reason: '试图用现在的故事覆盖过去的准备', agenda: altered }],
  ));
  expect(rejected.rejected).toBe(true);
  expect(latest(await snapshot(agent))).toEqual(before);
});
