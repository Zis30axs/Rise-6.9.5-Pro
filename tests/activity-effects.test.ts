import { afterEach, describe, expect, it, vi } from 'vitest';
import { getActivityEffects } from '../src/runtime/activity-effects';
import { commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { withAcademicSelection } from './legacy-state';

afterEach(() => vi.restoreAllMocks());
const near = (roomId: string, interactionId: string) => reduceState(reduceState(createInitialState(), { type: 'novel_travel', locationId: roomId }), { type: 'novel_approach', interactionId });

describe('activity wellbeing effects', () => {
  it('quotes authored activity effects with their actual-duration rounding', () => {
    expect(getActivityEffects('study', 15)).toEqual({ morale: -1, stress: 1, health: 0 });
    expect(getActivityEffects('study', 16)).toEqual({ morale: -2, stress: 1, health: 0 });
    expect(getActivityEffects('study', 31)).toEqual({ morale: -3, stress: 2, health: 0 });
    expect(getActivityEffects('desk', 20)).toEqual({ morale: 3, stress: -4, health: 0 });
    expect(getActivityEffects('bookshelf', 10)).toEqual({ morale: 2, stress: -2, health: 0 });
    expect(getActivityEffects('wait', 14)).toEqual({ morale: 0, stress: 0, health: 0 });
    expect(getActivityEffects('wait', 30)).toEqual({ morale: 2, stress: -2, health: 0 });
    expect(getActivityEffects('rest', 120)).toEqual({ morale: 16, stress: -16, health: 1 });
    for (const kind of ['study', 'desk', 'bookshelf', 'wait', 'rest', 'unknown', '__proto__']) for (const minutes of [0, -1, 0.5, Infinity, NaN]) expect(getActivityEffects(kind, minutes)).toEqual({ morale: 0, stress: 0, health: 0 });
    expect(getActivityEffects('unknown', 20)).toEqual({ morale: 0, stress: 0, health: 0 });
  });

  it.each([
    { roomId: 'dorm-room', interactionId: 'dorm-desk', energy: 3, stress: -4, morale: 3 },
    { roomId: 'study-room', interactionId: 'study-shelf', energy: 1, stress: -2, morale: 2 },
  ])('settles $interactionId and records only actual capped mental changes', ({ roomId, interactionId, energy, stress, morale }) => {
    const state = near(roomId, interactionId);
    state.player.energy = 9.29; state.player.stress = 10; state.player.morale = 40;
    const after = reduceState(state, { type: 'interior_interact', interactionId });
    expect(after.player.energy).toBe((929 - energy * 100) / 100);
    expect(after.player.stress).toBe(10 + stress); expect(after.player.morale).toBe(40 + morale);
    expect(after.journal.at(-1)?.text).toContain(`精神+${morale}`);
    expect(after.journal.at(-1)?.text).toContain(`压力${stress}`);
    state.player.morale = 99; state.player.stress = 1;
    const capped = reduceState(state, { type: 'interior_interact', interactionId });
    expect(capped.player.morale).toBe(100); expect(capped.player.stress).toBe(0);
    expect(capped.journal.at(-1)?.text).toContain('精神+1，压力-1');
    expect(parseState(JSON.parse(JSON.stringify(capped)))).toEqual(capped);
  });

  it('keeps full study energy costs while flooring morale, capping stress and preserving historical record shape', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = withAcademicSelection(near('classroom', 'classroom-notes'));
    state.player.energy = 10.29; state.player.morale = 1; state.player.stress = 100;
    const after = reduceState(state, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' });
    expect(after.interior!.lastStudy).toEqual({ interactionId: 'classroom-notes', optionId: 'study-short', minutes: 23, energyConsumed: 4 });
    expect(after.player.energy).toBe(6.29); expect(after.player.morale).toBe(0); expect(after.player.stress).toBe(100);
    expect(after.journal.at(-1)?.text).toContain('精神-1'); expect(after.journal.at(-1)?.text).not.toContain('压力+');
    expect(parseState(after)).toEqual(after);
  });

  it('allows recovery from zero energy and mental reserves with capped actual journal values', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = near('dorm-room', 'dorm-rest');
    state.player.energy = 0; state.player.morale = 0; state.player.stress = 10;
    const after = reduceState(state, { type: 'interior_rest', optionId: 'dorm-rest-short' });
    expect(after.player).toMatchObject({ energy: 6, morale: 2, stress: 8 });
    expect(after.interior!.lastRest).toEqual({ optionId: 'dorm-rest-short', minutes: 15, energyRecovered: 6 });
    expect(after.journal.at(-1)?.text).toContain('精神+2，压力-2');
    after.player.energy = 99.99; after.player.morale = 100; after.player.stress = 0;
    const waited = reduceState(after, { type: 'wait', minutes: 15 });
    expect(waited.player).toMatchObject({ energy: 100, morale: 100, stress: 0 });
    expect(waited.journal.at(-1)?.text).toContain('精力+0.01');
    expect(waited.journal.at(-1)?.text).not.toContain('精神+');
  });

  it('keeps observation, conversation, approach and purchase free of mental and energy effects', () => {
    const state = near('study-room', 'study-window');
    state.player.energy = 0; state.player.morale = 0;
    const observed = reduceState(state, { type: 'interior_interact', interactionId: 'study-window' });
    expect(observed.player).toEqual(state.player); expect(observed.clock).toEqual(state.clock);
    const approached = reduceState(observed, { type: 'novel_approach', interactionId: 'study-shelf' });
    expect(approached.player).toEqual(state.player);
    const spoken = commitStoryTurn(observed, '安静看看', { text: '你望向窗边。', phoneMessages: [] }, { userId: 'free-user', assistantId: 'free-assistant' });
    expect(spoken.player).toEqual(state.player); expect(spoken.clock).toEqual(state.clock);
    const shop = { ...createInitialState(), locationId: 'convenience' };
    const bought = reduceState(shop, { type: 'buy_item', itemId: 'meal-basic', quantity: 1 });
    expect(bought.player).toEqual({ ...shop.player, balance: shop.player.balance - 8 });
  });
});
