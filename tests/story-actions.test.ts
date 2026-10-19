import { describe, expect, it, vi } from 'vitest';
import type { GeneratedStory, StoryAction } from '../src/frontend/types';
import { applyStoryActions, commitStoryTurn, createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { parseGeneratedStory, STORY_ACTION_LIMITS } from '../src/runtime/story-protocol';
import { getInventoryCatalog, getPackItemQuote, getServiceTakeawayItem, getUseItemQuote, PACKAGING_FEE } from '../src/runtime/convenience-store';
import { getTakeawayQuote } from '../src/runtime/location-services';

const ids = { userId: 'action-user', assistantId: 'action-assistant' };
const sleep: StoryAction = { type: 'rest', minutes: 600, kind: 'sleep' };
const reply = (worldActions: StoryAction[]): GeneratedStory => ({ text: '行动完成，新的日常开始了。', phoneMessages: [], worldActions });
const effects = { energy: 0, morale: 0, stress: 0, health: 0, balance: 0, satiety: 0, foodEnergy: 0 };

describe('structured narrative actions', () => {
  it('accepts old envelopes and optional strict action envelopes', () => {
    const state = createInitialState();
    expect(parseGeneratedStory('{"story":"看看周围。","phone_messages":[]}', state)).toEqual({ text: '看看周围。', phoneMessages: [] });
    const parsed = parseGeneratedStory(JSON.stringify({ story: '醒来。', phone_messages: [], world_actions: [sleep] }), state);
    expect(parsed.worldActions).toEqual([sleep]);
    for (const world_actions of [null, Array(13).fill(sleep), [{ ...sleep, patch: {} }], [{ ...sleep, minutes: 600.5 }], [{ ...sleep, minutes: 10081 }], [{ type: 'travel', locationId: '__proto__' }], [{ type: 'relationship', npcId: 'constructor', delta: 5, reason: '交谈' }], [{ type: 'activity', label: '篡改', minutes: 1, effects: { ...effects, academicPoints: 999 } }]]) {
      expect(() => parseGeneratedStory(JSON.stringify({ story: '继续', phone_messages: [], world_actions }), state)).toThrow(/未写入/);
    }
    expect(() => parseGeneratedStory('{"story":"继续","phone_messages":[],"world_actions":[{"type":"rest","minutes":1,"kind":"sleep","__proto__":{}}]}', state)).toThrow(/字段/);
    expect(STORY_ACTION_LIMITS.actions).toBe(12);
  });

  it('settles an explicit ten-hour sleep once across midnight without a bed-button limit', () => {
    const before = createInitialState();
    before.player.energy = 20;
    const original = structuredClone(before);
    const result = { ...reply([sleep]), phoneMessages: [{ npcId: 'lin', text: '早上见。' }] };
    const after = commitStoryTurn(before, '睡了10个小时', result, ids);
    expect(after.clock).toEqual({ day: 2, hour: 3, minute: 20 });
    expect(after.locationId).toBe('gate');
    expect(after.player).toEqual({ energy: 100, balance: 328, health: 95, stress: 0, morale: 100, satiety: 30, foodEnergy: 0 });
    expect(after.phone.at(-1)?.at).toBe('第 2 天 03:20');
    expect(before).toEqual(original);
    const reloaded = parseState(JSON.parse(JSON.stringify(after)));
    expect(commitStoryTurn(reloaded, '睡了10个小时', result, ids)).toEqual(reloaded);
    expect(reloaded.schema_version).toBe('1.11.0');
  });

  it('applies travel and sleep sequentially, including direct entry into the dorm', () => {
    const state = createInitialState();
    const travelMinutes = getNovelTravelQuote(state, 'dorm-room').minutes;
    const after = commitStoryTurn(state, '回宿舍睡十小时', reply([{ type: 'travel', locationId: 'dorm-room' }, sleep]), ids);
    expect(after.locationId).toBe('dorm-room');
    expect(after.interior?.roomId).toBe('dorm-room');
    const beforeTime = state.clock.day * 1440 + state.clock.hour * 60 + state.clock.minute;
    const afterTime = after.clock.day * 1440 + after.clock.hour * 60 + after.clock.minute;
    expect(afterTime - beforeTime).toBe(travelMinutes + 600);
    expect(parseState(after)).toEqual(after);
  });

  it('uses existing shop and inventory settlement for a travel, buy, use sequence', () => {
    const before = createInitialState();
    const after = commitStoryTurn(before, '去买酸奶喝掉', reply([{ type: 'travel', locationId: 'convenience' }, { type: 'buy', itemId: 'drink-standard', quantity: 2 }, { type: 'use', itemId: 'drink-standard' }]), ids);
    let reference = reduceState(before, { type: 'novel_travel', locationId: 'convenience' });
    reference = reduceState(reference, { type: 'buy_item', itemId: 'drink-standard', quantity: 2 });
    reference = reduceState(reference, { type: 'use_item', itemId: 'drink-standard' });
    expect(after.player).toEqual(reference.player);
    expect(after.clock).toEqual(reference.clock);
    expect(after.inventory).toEqual([{ itemId: 'drink-standard', quantity: 1 }]);
  });

  it('allows coffee service after moving there and honors hours and affordability', () => {
    const before = createInitialState();
    const after = commitStoryTurn(before, '去咖啡店喝咖啡', reply([{ type: 'travel', locationId: 'cafe' }, { type: 'service', serviceId: 'drink-coffee' }]), ids);
    expect(after.locationId).toBe('cafe');
    expect(after.player.balance).toBe(312);
    const night = createInitialState(); night.clock.hour = 1;
    expect(() => commitStoryTurn(night, '喝咖啡', reply([{ type: 'travel', locationId: 'cafe' }, { type: 'service', serviceId: 'drink-coffee' }]), ids)).toThrow(/休息中/);
    const poor = createInitialState(); poor.player.balance = 1;
    expect(() => commitStoryTurn(poor, '喝咖啡', reply([{ type: 'travel', locationId: 'cafe' }, { type: 'service', serviceId: 'drink-coffee' }]), ids)).toThrow(/余额不足/);
  });

  it('approaches existing room facilities before performing their existing action', () => {
    const after = commitStoryTurn(createInitialState(), '回宿舍整理书桌', reply([{ type: 'travel', locationId: 'dorm-room' }, { type: 'interact', interactionId: 'dorm-desk' }]), ids);
    expect(after.interior?.activityId).toBe('dorm-desk');
    expect(after.journal.some(entry => entry.text.includes('整理了学习用品'))).toBe(true);
  });

  it('studies the exact stated duration including the former 31–59 minute gap', () => {
    const state = reduceState(createInitialState(), { type: 'choose_academics', majorId: 'computer-science' });
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('No duration sampling'); });
    try {
      const after = commitStoryTurn(state, '去自习室学45分钟程序设计', reply([{ type: 'travel', locationId: 'study-room' }, { type: 'study', subjectId: 'cs-programming', minutes: 45 }]), ids);
      expect(after.academics?.lastGain).toMatchObject({ subjectId: 'cs-programming', minutes: 45, points: 45, energyConsumed: 8, outcome: 'normal' });
      expect(parseState(JSON.parse(JSON.stringify(after)))).toEqual(after);
      expect(commitStoryTurn(after, '去自习室学45分钟程序设计', reply([{ type: 'travel', locationId: 'study-room' }, { type: 'study', subjectId: 'cs-programming', minutes: 45 }]), ids)).toEqual(after);
    } finally { random.mockRestore(); }
  });

  it('preserves cross-major results across preview, commit and reload', () => {
    let state = reduceState(createInitialState(), { type: 'choose_academics', majorId: 'computer-science' });
    state = reduceState(state, { type: 'novel_travel', locationId: 'study-room' });
    const actions: StoryAction[] = [{ type: 'study', subjectId: 'music-theory', minutes: 45 }];
    const preview = applyStoryActions(state, actions);
    const after = commitStoryTurn(state, '读45分钟乐理', reply(actions), ids);
    expect(after.academics).toEqual(preview.academics);
    expect(after.player).toEqual(preview.player);
    expect(parseState(after)).toEqual(after);
  });

  it('supports contextual everyday activities with bounded effects and one nutrition advance', () => {
    const state = createInitialState(); state.player.foodEnergy = 2990; state.player.satiety = 98;
    const activity: StoryAction = { type: 'activity', label: '参加聚餐', minutes: 30, effects: { energy: 30, morale: 50, stress: -100, health: 30, balance: -50, satiety: 10, foodEnergy: 100 } };
    const after = commitStoryTurn(state, '参加半小时聚餐', reply([activity]), ids);
    expect(after.clock).toEqual({ day: 1, hour: 17, minute: 50 });
    expect(after.player).toEqual({ energy: 100, morale: 100, health: 100, stress: 0, balance: 278, satiety: 100, foodEnergy: 3000 });
    expect(after.inventory).toEqual([]);
    expect(after.academics).toBeNull();
    const earned = applyStoryActions(state, [{ ...activity, label: '兼职结算', effects: { ...effects, balance: 100 } }]);
    expect(earned.player.balance).toBe(428);
    expect(earned.player.foodEnergy).toBe(2930);
    expect(earned.player.satiety).toBe(96);
  });

  it('rejects unaffordable custom activities and clamps other finite needs to their floors', () => {
    const before = createInitialState();
    expect(() => commitStoryTurn(before, '花钱', reply([{ type: 'activity', label: '购物', minutes: 30, effects: { ...effects, balance: -329 } }]), ids)).toThrow(/余额不足/);
    expect(() => commitStoryTurn(before, '长跑', reply([{ type: 'activity', label: '长跑', minutes: 30, effects: { ...effects, energy: -81 } }]), ids)).toThrow(/精力不足/);
    const after = applyStoryActions(before, [{ type: 'activity', label: '疲惫的一天', minutes: 10080, effects: { ...effects, health: -100, morale: -100, stress: 100, foodEnergy: -20000, satiety: -100 } }]);
    expect(after.player).toMatchObject({ health: 0, morale: 0, stress: 100, foodEnergy: 0, satiety: 0 });
    expect(after.clock.day).toBe(8);
    expect(before).toEqual(createInitialState());
  });

  it('adds schedules, completes existing appointments and changes only the named relationship', () => {
    const actions: StoryAction[] = [{ type: 'travel', locationId: 'library' }, { type: 'complete_schedule', id: 'library-notes' }, { type: 'schedule', title: '明晚继续整理', locationId: 'library', time: '20:00' }, { type: 'relationship', npcId: 'lin', delta: 4, reason: '共同整理笔记，彼此更熟悉。' }];
    const after = commitStoryTurn(createInitialState(), '赴约并约好下次见', reply(actions), ids);
    expect(after.schedule.find(item => item.id === 'library-notes')?.done).toBe(true);
    expect(after.schedule.at(-1)).toEqual({ id: 'action-assistant:schedule:2', title: '明晚继续整理', locationId: 'library', time: '20:00', done: false });
    expect(after.contacts.map(item => item.affinity)).toEqual([16, 5]);
    expect(commitStoryTurn(after, '赴约并约好下次见', reply(actions), ids)).toEqual(after);
  });

  it('rejects a failing later action without saving any earlier actions or messages', () => {
    const before = createInitialState();
    const snapshot = structuredClone(before);
    expect(() => commitStoryTurn(before, '睡觉后买东西', { ...reply([sleep, { type: 'buy', itemId: 'meal-basic', quantity: 1 }]), phoneMessages: [{ npcId: 'lin', text: '新消息' }] }, ids)).toThrow(/便利店/);
    expect(before).toEqual(snapshot);
  });

  it('rejects reused turn ids if action details change or disappear', () => {
    const before = createInitialState();
    const after = commitStoryTurn(before, '睡觉', reply([sleep]), ids);
    expect(() => commitStoryTurn(after, '睡觉', reply([{ ...sleep, minutes: 601 }]), ids)).toThrow(/ID 冲突/);
    expect(() => commitStoryTurn(after, '睡觉', reply([]), ids)).toThrow(/ID 冲突/);
    const legacy = commitStoryTurn(before, '睡觉', reply([]), ids);
    expect(() => commitStoryTurn(legacy, '睡觉', reply([sleep]), ids)).toThrow(/ID 冲突/);
  });

  it('retains replay evidence through journal churn while the original story remains', () => {
    let after = commitStoryTurn(createInitialState(), '睡觉', reply([sleep]), ids);
    for (let i = 0; i < 120; i++) after = reduceState(after, { type: 'wait', minutes: 1 });
    expect(after.journal).toHaveLength(100);
    expect(after.journal.some(entry => entry.id.startsWith(`${ids.assistantId}:wa:`))).toBe(true);
    expect(commitStoryTurn(after, '睡觉', reply([sleep]), ids)).toEqual(after);
    expect(() => commitStoryTurn(after, '睡觉', reply([{ ...sleep, minutes: 599 }]), ids)).toThrow(/ID 冲突/);
  });

  it('checks aircraft against the final location and rolls back forbidden indoor passes', () => {
    const inside = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'dorm-room' });
    const exit = commitStoryTurn(inside, '出门看天', { ...reply([{ type: 'travel', locationId: 'dorm' }]), worldEvents: [{ type: 'airliner_pass' }] }, ids, 1792257329272);
    expect(exit.interior).toBeNull();
    expect(exit.airTraffic.lastFlight?.source).toBe('story');
    expect(() => commitStoryTurn(createInitialState(), '进门看天', { ...reply([{ type: 'travel', locationId: 'dorm-room' }]), worldEvents: [{ type: 'airliner_pass' }] }, ids, 1792257329272)).toThrow(/室内/);
  });
});

describe('packaged food and narrative gifting', () => {
  it('packs a cafe dessert for its price plus packaging without consuming time or nutrients', () => {
    const state = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'cafe' });
    const quote = getTakeawayQuote(state, 'eat-dessert', 2);
    expect(PACKAGING_FEE).toBe(2);
    expect(quote).toMatchObject({ totalPrice: 40, packagingFee: 4, unitsAdded: 2, blockedReason: null, item: { id: 'takeaway-eat-dessert' } });
    const after = reduceState(state, { type: 'pack_service', serviceId: 'eat-dessert', quantity: 2 });
    expect(after.inventory).toEqual([{ itemId: 'takeaway-eat-dessert', quantity: 2 }]);
    expect(after.player).toEqual({ ...state.player, balance: state.player.balance - 40 });
    expect(after.clock).toEqual(state.clock);
    expect(parseState(JSON.parse(JSON.stringify(after)))).toEqual(after);
  });

  it('later consuming a packed portion applies its own effects once and removes only one portion', () => {
    let state = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'cafe' });
    state = reduceState(state, { type: 'pack_service', serviceId: 'eat-dessert', quantity: 2 });
    state = reduceState(state, { type: 'novel_travel', locationId: 'dorm-room' });
    const quote = getUseItemQuote(state, 'takeaway-eat-dessert');
    const after = reduceState(state, { type: 'use_item', itemId: 'takeaway-eat-dessert' });
    expect(after.player).toEqual(quote.playerAfter);
    expect(after.player.morale).toBe(Math.min(100, state.player.morale + 6));
    expect(after.player.foodEnergy).toBe(Math.min(3000, state.player.foodEnergy - 30 + 260));
    expect(after.player.balance).toBe(state.player.balance);
    expect(after.inventory).toEqual([{ itemId: 'takeaway-eat-dessert', quantity: 1 }]);
    expect(after.locationId).toBe('dorm-room');
  });

  it('packs existing convenience-store food with an explicit additional charge', () => {
    const state = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'convenience' });
    expect(getPackItemQuote(state, 'meal-basic', 1)).toMatchObject({ totalPrice: 10, packagingFee: 2, blockedReason: null });
    const after = reduceState(state, { type: 'pack_item', itemId: 'meal-basic', quantity: 1 });
    expect(after.player).toEqual({ ...state.player, balance: state.player.balance - 10 });
    expect(after.clock).toEqual(state.clock);
    expect(after.inventory).toEqual([{ itemId: 'meal-basic', quantity: 1 }]);
    expect(getPackItemQuote(state, 'cigarette-standard', 1).blockedReason).toMatch(/只有食物和饮品/);
    expect(getServiceTakeawayItem('jog')).toBeNull();
  });

  it('checks packaging affordability, quantity, stock capacity, location and opening hours', () => {
    let cafe = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'cafe' });
    cafe.player.balance = 16;
    expect(getTakeawayQuote(cafe, 'drink-coffee').blockedReason).toMatch(/余额不足/);
    cafe.player.balance = 328;
    cafe.inventory = [{ itemId: 'takeaway-drink-coffee', quantity: 999 }];
    expect(getTakeawayQuote(cafe, 'drink-coffee').blockedReason).toMatch(/最多保存/);
    expect(getTakeawayQuote(cafe, 'drink-coffee', 0).blockedReason).toMatch(/数量/);
    cafe.inventory = []; cafe.clock.hour = 23;
    expect(getTakeawayQuote(cafe, 'drink-coffee').blockedReason).toMatch(/打烊/);
    expect(getTakeawayQuote(createInitialState(), 'drink-coffee').blockedReason).toMatch(/对应地点/);
    const shop = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'convenience' });
    expect(() => reduceState(shop, { type: 'buy_item', itemId: 'takeaway-drink-coffee', quantity: 1 })).toThrow(/不存在/);
  });

  it('gifts owned food with a bounded relation benefit and no player nutrition or time change', () => {
    const before = createInitialState(); before.inventory = [{ itemId: 'takeaway-eat-dessert', quantity: 2 }];
    const action: StoryAction = { type: 'gift', itemId: 'takeaway-eat-dessert', quantity: 1, npcId: 'lin', affinityDelta: 3, reason: '送给林同学分享下午茶。' };
    const result = reply([action]);
    const after = commitStoryTurn(before, '送一份甜点给林同学', result, ids);
    expect(after.inventory).toEqual([{ itemId: 'takeaway-eat-dessert', quantity: 1 }]);
    expect(after.contacts.map(contact => contact.affinity)).toEqual([15, 5]);
    expect(after.player).toEqual(before.player);
    expect(after.clock).toEqual(before.clock);
    expect(commitStoryTurn(parseState(JSON.parse(JSON.stringify(after))), '送一份甜点给林同学', result, ids)).toEqual(after);
    expect(() => commitStoryTurn(after, '送一份甜点给林同学', reply([{ ...action, affinityDelta: 4 }]), ids)).toThrow(/ID 冲突/);
  });

  it('can travel, buy food with packaging and gift it in one atomic model response', () => {
    const actions: StoryAction[] = [{ type: 'travel', locationId: 'cafe' }, { type: 'takeaway', serviceId: 'drink-coffee', quantity: 1 }, { type: 'gift', itemId: 'takeaway-drink-coffee', quantity: 1, npcId: 'zhou', affinityDelta: 4, reason: '约好见面时把咖啡带给周同学。' }];
    const before = createInitialState();
    const result = parseGeneratedStory(JSON.stringify({ story: '把带来的咖啡递给周同学。', phone_messages: [], world_actions: actions }), before);
    const after = commitStoryTurn(before, '买杯咖啡送给周同学', result, ids);
    expect(after.inventory).toEqual([]);
    expect(after.player.balance).toBe(310);
    expect(after.contacts.map(contact => contact.affinity)).toEqual([12, 9]);
    const travelOnly = reduceState(before, { type: 'novel_travel', locationId: 'cafe' });
    expect(after.player.foodEnergy).toBe(travelOnly.player.foodEnergy);
    expect(after.clock).toEqual(travelOnly.clock);
  });

  it('fails the whole sequence when a requested gift is not actually owned', () => {
    const before = createInitialState();
    const snapshot = structuredClone(before);
    const actions: StoryAction[] = [sleep, { type: 'gift', itemId: 'meal-basic', quantity: 1, npcId: 'lin', affinityDelta: 3, reason: '送饭。' }];
    expect(() => commitStoryTurn(before, '睡醒后送饭', reply(actions), ids)).toThrow(/礼物数量不足/);
    expect(before).toEqual(snapshot);
    before.inventory = [{ itemId: 'meal-basic', quantity: 1 }];
    expect(() => commitStoryTurn(before, '送饭', reply([{ type: 'gift', itemId: 'meal-basic', quantity: 2, npcId: 'lin', affinityDelta: 3, reason: '送饭。' }]), ids)).toThrow(/礼物数量不足/);
  });

  it('rejects forged targets, arbitrary gift fields, cigarettes packaging and excess relationship gain', () => {
    const state = createInitialState();
    const base = { type: 'gift', itemId: 'meal-basic', quantity: 1, npcId: 'lin', affinityDelta: 3, reason: '送饭。' };
    for (const action of [{ ...base, npcId: '__proto__' }, { ...base, itemId: 'invented' }, { ...base, affinityDelta: 21 }, { ...base, affinityDelta: -1 }, { ...base, quantity: 0 }, { ...base, player: { energy: 100 } }, { type: 'pack', itemId: 'cigarette-basic', quantity: 1 }, { type: 'takeaway', serviceId: 'jog', quantity: 1 }]) {
      expect(() => parseGeneratedStory(JSON.stringify({ story: '送给同学', phone_messages: [], world_actions: [action] }), state)).toThrow(/未写入/);
    }
  });

  it('round-trips all 18 known inventory kinds while preserving the strict state shape', () => {
    const before = createInitialState();
    before.inventory = getInventoryCatalog().map(item => ({ itemId: item.id, quantity: 1 }));
    expect(before.inventory).toHaveLength(18);
    expect(parseState(JSON.parse(JSON.stringify(before)))).toEqual(before);
    const outside = { ...before, inventory: [...before.inventory, { itemId: 'invented-food', quantity: 1 }] };
    expect(() => parseState(outside)).toThrow(/inventory/);
  });
});
