import {describe, expect, it} from 'vitest';
import {appiePayBalance, applyCardTransaction, makeDualLedger, recordPhoneAccess, switchProtagonist} from '../src/runtime/dual-protagonists';

describe('isolated dual protagonist ledger', () => {
  it('starts separate identities, devices, themes and balances', () => {
    const start = makeDualLedger(32800, 120000);
    expect(start.people.soyo.deviceId).not.toBe(start.people.sakiko.deviceId);
    expect(start.people.soyo.theme).not.toBe(start.people.sakiko.theme);
    expect(appiePayBalance(start, 'soyo')).toBe(32800);
    expect(appiePayBalance(start, 'sakiko')).toBe(120000);
    expect(switchProtagonist(start, 'sakiko').people.soyo.cards.gpt).toBe(32800);
    expect(start.active).toBe('soyo');
  });
  it('commits only once and never spends from the other character', () => {
    const initial = makeDualLedger(500, 1000);
    const debit = {id: 'purchase-1', actor: 'soyo' as const, card: 'gpt' as const, deltaCents: -120, note: '咖啡'};
    const saved = applyCardTransaction(initial, debit);
    expect(applyCardTransaction(saved, debit)).toBe(saved);
    expect(saved.people.soyo.cards.gpt).toBe(380);
    expect(saved.people.sakiko.cards.gpt).toBe(1000);
    expect(initial.people.soyo.cards.gpt).toBe(500);
    expect(() => applyCardTransaction(saved, {...debit, deltaCents: -200})).toThrow();
    expect(() => applyCardTransaction(saved, {...debit, id: 'purchase-2', deltaCents: -500})).toThrow();
  });
  it('records unauthorized access and retains it after changing viewpoint', () => {
    const state = makeDualLedger(0, 0);
    const event = {id: 'peek-1', actor: 'soyo' as const, owner: 'sakiko' as const, operation: 'inspect' as const,
      authorized: false, detail: '打开日历', at: '第 1 天 18:00'};
    const saved = recordPhoneAccess(state, event);
    expect(recordPhoneAccess(saved, event)).toBe(saved);
    expect(switchProtagonist(saved, 'sakiko').phoneAccess[0]).toEqual(event);
    expect(() => recordPhoneAccess(saved, {...event, detail: '改日历'})).toThrow();
  });
});
