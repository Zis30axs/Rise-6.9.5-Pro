import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { worldScenePeople } from '../src/runtime/world-presence';
import { applySocialInvitationReply, parseGamePurchases, parseSocialInvitations, protagonistHomeRooms } from '../src/runtime/natural-interactions';
import { parsePhoneReplyWithScene } from '../src/runtime/phone-reply';
import type { StoryAction, WorldState } from '../src/frontend/types';

const world = () => parseState(enableProtagonists(createInitialState()));
const outcome = (state: WorldState, text: string, actions: StoryAction[], key: string) =>
  commitStoryTurn(state, text, { text, phoneMessages: [], worldActions: actions },
    { userId: key + '-user', assistantId: key + '-assistant' });
const makeMeet = () => {
  const state = world();
  state.locationId = 'promenade';
  state.scene = { x: -2, z: 15, yaw: 0, areaId: 'promenade', seed: 'natural-actions-test', encounterId: null };
  const parsed = parseState(state);
  const person = worldScenePeople(parsed).find(row => !row.protagonistId &&
    Math.hypot(row.x - parsed.scene!.x, row.z - parsed.scene!.z) <= 7)!;
  expect(person).toBeDefined();
  return { state: parsed, person };
};

describe('自然输入与面板操作共用真实状态', () => {
  it('玲奈子在住宅区直接说回家，无需打开地图或先选择住宅区', () => {
    const switched = reduceState(world(), { type: 'switch_protagonist', target: 'renako' });
    expect(switched.locationId).toBe('home');
    const home = outcome(switched, '玲奈子回家了。', [{ type: 'go_home' }], 'renako-go-home');
    expect(protagonistHomeRooms.renako).toBe('amaori-family-home');
    expect(home.locationId).toBe('amaori-family-home');
    expect(home.interior?.roomId).toBe('amaori-family-home');
    expect(parseState(JSON.parse(JSON.stringify(home)))).toEqual(home);
  });

  it('每位主角各自有住所，不把回家误解成共同的 home 区域', () => {
    expect(protagonistHomeRooms).toEqual({
      soyo: 'dorm-room', sakiko: 'toyokawa-house',
      emma: 'emma-yuki-home', renako: 'amaori-family-home',
    });
  });

  it('游戏充值实际扣 Appie Pay，记录买到的虚拟权益且不得重复结算', () => {
    const before = world();
    const purchase: StoryAction = { type: 'game_topup', game: '虚构手游', benefit: '月卡', amountYen: 500 };
    const paid = outcome(before, '买下了这款游戏的月卡。', [purchase], 'game-topup-paid');
    expect(paid.player.balance).toBe(before.player.balance - 500);
    expect(paid.protagonists!.gamePurchases).toMatchObject([{ owner: 'soyo', amountYen: 500, game: '虚构手游', benefit: '月卡' }]);
    expect(paid.protagonists!.accounts.people.soyo.cards.gpt).toBe(before.protagonists!.accounts.people.soyo.cards.gpt - 50000);
    expect(parseState(JSON.parse(JSON.stringify(paid)))).toEqual(paid);
    const replay = commitStoryTurn(paid, '买下了这款游戏的月卡。',
      { text:'买下了这款游戏的月卡。', phoneMessages:[], worldActions:[purchase] },
      { userId:'game-topup-paid-user', assistantId:'game-topup-paid-assistant' });
    expect(replay.player.balance).toBe(paid.player.balance);
    expect(replay.protagonists!.gamePurchases).toHaveLength(1);
  });

  it('充值余额不足时原子拒绝，不生成假消费权益', () => {
    const before = world();
    expect(() => outcome(before, '充值高级礼包。',
      [{ type: 'game_topup', game: '虚构手游', benefit: '豪华礼包', amountYen: 100000 }], 'insufficient-topup')).toThrow();
    expect(before.protagonists?.gamePurchases).toBeUndefined();
  });

  it('当面交换联系方式由真实近距离NPC同意后立即加入，无需先建档', () => {
    const { state, person } = makeMeet();
    const line = '好的，我们交换号码吧。';
    const action: StoryAction = { type: 'exchange_contact', npcId: person.id, consentQuote: line };
    const updated = outcome(state, '|'+person.name+'|开心|'+line+'|', [action], 'exchange-contact');
    const contact = updated.contacts.find(row => row.id === person.id);
    expect(contact).toMatchObject({ name: person.name, status: '已交换联系方式', sourcePersonId: person.id });
    expect(parseState(updated).contacts.some(row => row.id === person.id)).toBe(true);
  });

  it('NPC 没有说出同意的话，不能凭模型自称同意而偷偷加入', () => {
    const { state, person } = makeMeet();
    expect(() => outcome(state, '|'+person.name+'|严肃|现在不方便。|',
      [{ type: 'exchange_contact', npcId: person.id, consentQuote: '好的，我们交换号码吧。' }], 'exchange-rejected')).toThrow(/缺少/);
    expect(state.contacts.some(row => row.id === person.id)).toBe(false);
  });

  it('同一回合先交换联系方式再从正文发短信，落在NPC的真实短信会话', () => {
    const { state, person } = makeMeet();
    const sent = outcome(state, '|'+person.name+'|开心|可以交换号码。|', [
      { type: 'exchange_contact', npcId: person.id, consentQuote: '可以交换号码。' },
      { type: 'send_sms', targetId: person.id, text: '周末一起去公园吗？' },
    ], 'contact-then-sms');
    expect(sent.protagonists!.npcPhone!.messages.some(row => row.direction === 'outgoing' && row.text === '周末一起去公园吗？')).toBe(true);
  });

  it('直接输入短信给祥子，进入另一个可操作主角的收件箱', () => {
    const sent = outcome(world(), '给祥子发短信。',
      [{ type: 'send_sms', targetId: 'protagonist-sakiko', text: '放学后见面吧。' }], 'protagonist-story-sms');
    expect(sent.protagonists?.conversations?.some(row => row.from === 'soyo' && row.to === 'sakiko' && row.text === '放学后见面吧。')).toBe(true);
    expect(sent.protagonists?.inactive.phone.some(message => message.text === '放学后见面吧。')).toBe(true);
  });

  it('当面邀约可以得到明确答复，口头拒绝则不会变成约定成功', () => {
    const { state, person } = makeMeet();
    const tomorrow = state.clock.day + 1;
    const invited = outcome(state, '|'+person.name+'|开心|当然，明天见。|', [{
      type: 'social_invite', targetId: person.id, source: 'meeting', locationId: 'cafe',
      day: tomorrow, time: '18:30', message: '明天一起喝茶吗？',
      outcome: 'accepted', responseQuote: '当然，明天见。',
    }], 'meeting-invite');
    expect(invited.protagonists?.socialInvitations?.[0]?.status).toBe('accepted');
    expect(parseState(invited)).toEqual(invited);
    expect(() => outcome(state, '|'+person.name+'|难过|明天我有事。|', [{
      type: 'social_invite', targetId: person.id, source: 'meeting', locationId: 'cafe',
      day: tomorrow, time: '18:30', message: '明天一起喝茶吗？',
      outcome: 'accepted', responseQuote: '当然，明天见。',
    }], 'meeting-invite-false')).toThrow();
  });

  it('短信邀约先待回复，手机正常回复时可明确同意或拒绝', () => {
    const invited = outcome(world(), '短信邀请祥子明天喝茶。', [{
      type: 'social_invite', targetId: 'protagonist-sakiko', source: 'sms', locationId: 'cafe',
      day: 2, time: '18:30', message: '明天下午一起喝茶吗？', outcome: 'pending',
    }], 'sms-invitation');
    const item = invited.protagonists!.socialInvitations![0]!;
    expect(item.status).toBe('pending');
    expect(item.messageId?.startsWith('dual:')).toBe(true);
    expect(invited.protagonists?.conversations?.some(row => row.id === item.messageId)).toBe(true);
    const reply = parsePhoneReplyWithScene('<phone_reply>'+JSON.stringify({
      messageId: item.messageId, text: '好啊，我们明天见。', inviteDecision: 'accepted',
    })+'</phone_reply>', item.messageId!, false);
    const accepted = applySocialInvitationReply(invited, item.messageId!, reply.inviteDecision, reply.text);
    expect(accepted.protagonists?.socialInvitations?.[0]?.status).toBe('accepted');
    expect(parseState(accepted)).toEqual(accepted);
  });

  it('非法价格、无联系人短信、同地点未发生的接触全部拒绝', () => {
    const s = world();
    expect(() => outcome(s, '随便发短信。',
      [{ type: 'send_sms', targetId: 'unknown-person', text: '你好！' }], 'stranger-sms')).toThrow();
    expect(() => outcome(s, '我想充值。',
      [{ type: 'game_topup', game: '虚构手游', benefit: '钻石', amountYen: -2 }], 'negative-charge')).toThrow();
    expect(() => parseGamePurchases([{ id: 'bad', owner: 'soyo', game: 'A', benefit: 'B', amountYen: 1, at: -1 }], 30)).toThrow();
    expect(() => parseSocialInvitations([{ id: 'bad' }], 30)).toThrow();
  });

  it('状态页显示实际邀约与虚拟购买而非仅正文说明', () => {
    const panel = readFileSync(resolve(process.cwd(), 'src/frontend/WorldPanels.vue'), 'utf8');
    expect(panel).toContain('data-status-section="social"');
    expect(panel).toContain('data-status-section="game-purchases"');
    expect(panel).toContain("emit('invite', contact.name)");
  });
});
