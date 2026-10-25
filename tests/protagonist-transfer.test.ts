import { describe, expect, it } from 'vitest';
import { applyStoryActions, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { appiePayBalance } from '../src/runtime/dual-protagonists';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import type { WorldState } from '../src/frontend/types';

function contact(id: string, name: string): WorldState['contacts'][number] {
  return { id, name, tag: '测试联系人', summary: '单元测试用联系人。', affinity: 0, status: '已互加好友', portraitId: 'deepseek', sourcePersonId: id, isMain: true };
}

function base(): WorldState {
  const state = enableProtagonists(createInitialState());
  state.contacts.push(contact('test-npc', '测试朋友'), contact('test-npc-2', '测试朋友二'));
  return state;
}

const phoneCmd = (requestId: string, to: string, cents: number, from: 'gpt' | 'claude' | 'gemini' = 'gpt') =>
  ({ type: 'phone_app' as const, requestId, owner: 'soyo' as const, command: { type: 'send_transfer' as const, to, from, cents } });

const totalMoney = (s: WorldState): number => {
  const p = s.protagonists!;
  return Object.values(p.accounts.people).reduce((sum, person) => sum + appiePayBalance(p.accounts, person.id), 0)
    + Object.values(p.npcWallets ?? {}).reduce((a, b) => a + b, 0);
};

describe('Appie Pay 联系人转账', () => {
  it('转给联系人时双边记账且总金额守恒', () => {
    const before = base(), payerBefore = appiePayBalance(before.protagonists!.accounts, 'soyo');
    const after = reduceState(before, phoneCmd('t1', 'test-npc', 50_000));
    expect(after.protagonists!.npcWallets?.['test-npc']).toBe(50_000);
    expect(appiePayBalance(after.protagonists!.accounts, 'soyo')).toBe(payerBefore - 50_000);
    expect(totalMoney(after)).toBe(totalMoney(before));
    expect(after.journal.some(row => row.id === 'transfer:t1' && row.text.includes('测试朋友'))).toBe(true);
  });

  it('指定卡余额不足时整笔拒绝且不产生账目', () => {
    const before = base();
    expect(() => reduceState(before, phoneCmd('t2', 'test-npc', 1, 'claude'))).toThrow(/余额不足/);
    expect(before.protagonists!.npcWallets).toBeUndefined();
    expect(appiePayBalance(before.protagonists!.accounts, 'soyo')).toBe(656_000);
  });

  it('转给另一位主角时入账其 gpt 卡并同步余额投影', () => {
    const after = reduceState(base(), phoneCmd('t3', 'sakiko', 100_000));
    const p = after.protagonists!;
    expect(p.accounts.people.sakiko.cards.gpt).toBe(2_400_000 + 100_000);
    expect(personState(after, 'sakiko').player.balance).toBe(appiePayBalance(p.accounts, 'sakiko') / 100);
    expect(() => parseState(JSON.parse(JSON.stringify(after)))).not.toThrow();
  });

  it('同一 requestId 重放不会重复转账', () => {
    const action = phoneCmd('t4', 'test-npc', 12_300);
    const once = reduceState(base(), action);
    const twice = reduceState(once, structuredClone(action));
    expect(twice.protagonists!.npcWallets?.['test-npc']).toBe(12_300);
    expect(appiePayBalance(twice.protagonists!.accounts, 'soyo')).toBe(appiePayBalance(once.protagonists!.accounts, 'soyo'));
  });

  it('只能用当前主角自己的手机转账', () => {
    expect(() => reduceState(base(), phoneCmd('t5', 'soyo', 1))).toThrow(/不能转给自己/);
    expect(() => reduceState(base(), { type: 'phone_app', requestId: 't6', owner: 'sakiko', command: { type: 'send_transfer', to: 'test-npc', from: 'gpt', cents: 1 } })).toThrow(/自己的手机/);
  });

  it('旧存档没有联系人钱包字段时照常解析', () => {
    const state = base();
    expect(state.protagonists!.npcWallets).toBeUndefined();
    const after = reduceState(state, phoneCmd('t7', 'test-npc', 5_000));
    const reparsed = parseState(JSON.parse(JSON.stringify(after)));
    expect(reparsed.protagonists!.npcWallets).toEqual({ 'test-npc': 5_000 });
  });
});

describe('剧情 transfer 行动', () => {
  it('NPC 收钱后再还钱给当前主角，账目双边对称', () => {
    const seeded = reduceState(base(), phoneCmd('s1', 'test-npc', 60_000));
    const soyoSeeded = appiePayBalance(seeded.protagonists!.accounts, 'soyo');
    const after = applyStoryActions(seeded, [{ type: 'transfer', from: 'test-npc', to: 'soyo', cents: 30_000, reason: '归还零钱' }], 'turn-repay');
    const p = after.protagonists!;
    expect(p.npcWallets?.['test-npc']).toBe(30_000);
    expect(appiePayBalance(p.accounts, 'soyo')).toBe(soyoSeeded + 30_000);
    expect(after.player.balance).toBe(appiePayBalance(p.accounts, 'soyo') / 100);
    expect(totalMoney(after)).toBe(totalMoney(seeded));
    expect(after.journal.some(row => row.text.includes('测试朋友向长崎素世转账'))).toBe(true);
  });

  it('两个联系人之间转账不经过当前主角余额', () => {
    const seeded = reduceState(base(), phoneCmd('s2', 'test-npc', 60_000));
    const soyoBefore = appiePayBalance(seeded.protagonists!.accounts, 'soyo');
    const after = applyStoryActions(seeded, [{ type: 'transfer', from: 'test-npc', to: 'test-npc-2', cents: 20_000, reason: '分摊餐费' }], 'turn-split');
    const p = after.protagonists!;
    expect(p.npcWallets?.['test-npc']).toBe(40_000);
    expect(p.npcWallets?.['test-npc-2']).toBe(20_000);
    expect(appiePayBalance(p.accounts, 'soyo')).toBe(soyoBefore);
    expect(totalMoney(after)).toBe(totalMoney(seeded));
  });

  it('付款方余额不足时整轮行动不结算', () => {
    const before = base();
    expect(() => applyStoryActions(before, [{ type: 'transfer', from: 'test-npc', to: 'soyo', cents: 1, reason: '没钱还装有钱' }], 'turn-broke')).toThrow(/余额不足/);
    expect(before.protagonists!.npcWallets).toBeUndefined();
  });

  it('转账对象必须是主角或已保存的联系人', () => {
    expect(() => applyStoryActions(base(), [{ type: 'transfer', from: 'soyo', to: 'stranger-npc', cents: 100, reason: '给陌生人' }], 'turn-stranger')).toThrow(/收款方/);
  });

  it('同一轮剧情重放不会重复入账', () => {
    const seeded = reduceState(base(), phoneCmd('s3', 'test-npc', 60_000));
    const actions = [{ type: 'transfer', from: 'test-npc', to: 'soyo', cents: 30_000, reason: '归还零钱' }] as const;
    const committed = applyStoryActions(seeded, actions, 'turn-replay');
    const replayed = applyStoryActions(committed, actions, 'turn-replay');
    expect(replayed.protagonists!.npcWallets?.['test-npc']).toBe(30_000);
    expect(appiePayBalance(replayed.protagonists!.accounts, 'soyo')).toBe(appiePayBalance(committed.protagonists!.accounts, 'soyo'));
    expect(replayed.protagonists!.accounts.ledger.filter(row => row.id.startsWith('wa:turn-replay')).length)
      .toBe(committed.protagonists!.accounts.ledger.filter(row => row.id.startsWith('wa:turn-replay')).length);
  });
});
