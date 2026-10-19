import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldAction, WorldState } from '../src/frontend/types';
import { getPurchaseQuote, getStoreAvailability, getStoreItem, getUseItemQuote, initialPlayerNeeds, storeCatalog } from '../src/runtime/convenience-store';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { withoutPlayerNeeds, withAcademicSelection } from './legacy-state';

afterEach(() => vi.restoreAllMocks());
const shop = () => ({ ...createInitialState(), locationId: 'convenience' });
const buy = (state: WorldState, itemId = 'cigarette-standard', quantity = 1) => reduceState(state, { type: 'buy_item', itemId, quantity });
const use = (state: WorldState, itemId = 'cigarette-standard') => reduceState(state, { type: 'use_item', itemId });

describe('version 1.7 inventory and needs', () => {
  it.each(['1.0.0', '1.1.0', '1.2.0', '1.3.0', '1.4.0', '1.5.0', '1.6.0'])('migrates %s once without changing established data', version => {
    const current = createInitialState();
    current.player.energy = 47; current.player.balance = 106.5;
    current.contacts[0].summary = '已有角色记录'; current.story[0].text = '已有故事'; current.phone[0].read = true;
    const old: Record<string, unknown> = { ...withoutPlayerNeeds(current), schema_version: version };
    if (version < '1.6.0') delete old.transit;
    if (version < '1.3.0') delete old.interior;
    if (version < '1.2.0') delete old.airTraffic;
    if (version < '1.1.0') delete old.scene;
    const snapshot = JSON.stringify(old);
    const migrated = parseState(JSON.parse(snapshot));
    expect(migrated).toEqual(current);
    expect(migrated.player).toMatchObject(initialPlayerNeeds);
    expect(parseState(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
    expect(JSON.stringify(old)).toBe(snapshot);
    expect(() => parseState({ ...old, inventory: [] })).toThrow(/字段/);
  });

  it('strictly validates every new field, inventory whitelist, quantities and duplicate IDs', () => {
    const state = shop();
    for (const key of ['health', 'stress', 'satiety', 'foodEnergy'] as const) {
      for (const value of [-1, 0.5, NaN, Infinity, '50', undefined, key === 'foodEnergy' ? 3001 : 101]) expect(() => parseState({ ...state, player: { ...state.player, [key]: value } })).toThrow(/player/);
    }
    for (const inventory of [undefined, null, {}, [{ itemId: '__proto__', quantity: 1 }], [{ itemId: 'constructor', quantity: 1 }], [{ itemId: 'meal-basic', quantity: 1 }, { itemId: 'meal-basic', quantity: 2 }], [{ itemId: 'meal-basic', quantity: 0 }], [{ itemId: 'meal-basic', quantity: 1000 }], [{ itemId: 'meal-basic', quantity: 1.2 }], [{ itemId: 'meal-basic', quantity: 1, price: 0 }]]) expect(() => parseState({ ...state, inventory })).toThrow(/inventory/);
    const capped = { ...state, player: { ...state.player, health: 0, stress: 100, satiety: 0, foodEnergy: 3000 }, inventory: [{ itemId: 'meal-basic', quantity: 999 }] };
    expect(parseState(capped)).toEqual(capped);
  });
});

describe('local convenience store transactions', () => {
  it('provides 12 immutable fictional products with three tiers and explicit per-use effects', () => {
    expect(storeCatalog).toHaveLength(12);
    expect(new Set(storeCatalog.map(item => item.id)).size).toBe(12);
    expect(Object.isFrozen(storeCatalog)).toBe(true);
    for (const category of ['meal', 'snack', 'drink', 'cigarette']) expect(storeCatalog.filter(item => item.category === category).map(item => item.tier)).toEqual(['basic', 'standard', 'premium']);
    for (const item of storeCatalog) { expect(Object.isFrozen(item)).toBe(true); expect(Object.isFrozen(item.effects)).toBe(true); }
    expect(getStoreItem('cigarette-standard')).toMatchObject({ price: 50, packSize: 20, kcal: 0, useMinutes: 5, effects: { energy: 35, stress: -30, satiety: 0, health: -6 } });
    expect(getStoreItem('cigarette-premium')!.effects.health).toBeLessThanOrEqual(-6);
    for (const id of ['__proto__', 'constructor', 'https://invalid', 'unknown']) expect(getStoreItem(id)).toBeNull();
  });

  it('buys package quantities without spending time and keeps independent state snapshots', () => {
    const before = shop(); const saved = JSON.stringify(before);
    const quote = getPurchaseQuote(before, 'cigarette-standard', 3);
    expect(quote).toMatchObject({ totalPrice: 150, unitsAdded: 60, owned: 0, blockedReason: null });
    const after = buy(before, 'cigarette-standard', 3);
    expect(after.inventory).toEqual([{ itemId: 'cigarette-standard', quantity: 60 }]);
    expect(after.player).toEqual({ ...before.player, balance: 178 });
    expect(after.clock).toEqual(before.clock);
    for (const key of ['story', 'phone', 'contacts', 'schedule', 'scene', 'interior', 'transit', 'airTraffic'] as const) expect(after[key]).toEqual(before[key]);
    expect(after.journal.at(-1)?.text).toContain('60 支');
    const twice = buy(after); expect(twice.inventory[0].quantity).toBe(80);
    expect(after.inventory[0].quantity).toBe(60);
    expect(JSON.stringify(before)).toBe(saved);
    expect(parseState(JSON.parse(JSON.stringify(twice)))).toEqual(twice);
  });

  it('requires the real outdoor shop and rejects invalid quantities, forged items, insufficient money and overflow atomically', () => {
    const original = shop(); const saved = JSON.stringify(original);
    for (const quantity of [0, -1, 1.5, 21, NaN, Infinity, undefined, '1']) expect(() => reduceState(original, { type: 'buy_item', itemId: 'meal-basic', quantity } as WorldAction)).toThrow(/数量/);
    for (const itemId of ['missing', '__proto__', 'constructor']) expect(() => buy(original, itemId)).toThrow(/商品/);
    expect(() => buy(createInitialState())).toThrow(/便利店/);
    const inside = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'dorm-room' });
    expect(getStoreAvailability({ ...inside, locationId: 'convenience' }).available).toBe(false);
    expect(() => buy(inside)).toThrow(/便利店/);
    const poor = { ...original, player: { ...original.player, balance: 49.99 } };
    expect(() => buy(poor)).toThrow(/余额/); expect(poor.player.balance).toBe(49.99);
    const full = { ...original, inventory: [{ itemId: 'cigarette-standard', quantity: 980 }] };
    expect(() => buy(full)).toThrow(/999/); expect(full.inventory[0].quantity).toBe(980);
    const exact = { ...original, player: { ...original.player, balance: 50 } };
    expect(buy(exact).player.balance).toBe(0);
    expect(JSON.stringify(original)).toBe(saved);
  });

  it('uses a cigarette away from the shop once with exact health/stress/energy costs and elapsed nutrition', () => {
    const state = buy(shop()); state.locationId = 'gate';
    state.clock = { day: 1, hour: 17, minute: 28 };
    state.player = { ...state.player, energy: 10, stress: 40, health: 90, satiety: 20, foodEnergy: 1000 };
    const before = JSON.stringify(state); const quote = getUseItemQuote(state, 'cigarette-standard');
    expect(quote.changes).toEqual({ energy: 35, stress: -30, health: -6, satiety: -1, foodEnergy: -10 });
    const after = use(state);
    expect(after.player).toEqual(quote.playerAfter);
    expect(after.clock).toEqual({ day: 1, hour: 17, minute: 33 });
    expect(after.inventory).toEqual([{ itemId: 'cigarette-standard', quantity: 19 }]);
    expect(after.journal.at(-1)?.text).toContain('健康-6');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('eats a single portion, removes an empty slot, and reports actual capped effects rather than nominal gains', () => {
    const state = buy(shop(), 'meal-standard');
    state.player = { ...state.player, energy: 90, health: 99, stress: 3, satiety: 90, foodEnergy: 2900 };
    const quote = getUseItemQuote(state, 'meal-standard');
    expect(quote.changes).toEqual({ energy: 10, health: 1, stress: -3, satiety: 10, foodEnergy: 100 });
    const after = use(state, 'meal-standard');
    expect(after.player).toEqual(quote.playerAfter); expect(after.inventory).toEqual([]);
    expect(after.clock).toEqual({ day: 1, hour: 17, minute: 35 });
    expect(() => use(after, 'meal-standard')).toThrow(/背包/);
    const unfilled = buy(shop(), 'meal-standard'); unfilled.player.foodEnergy = 100;
    expect(use(unfilled, 'meal-standard').player.foodEnergy).toBe(720);
  });

  it('refuses unpaid health costs, empty inventory and end-of-calendar use without mutating any field', () => {
    for (const itemId of ['cigarette-basic', 'cigarette-standard', 'cigarette-premium', 'snack-basic', 'drink-basic']) {
      const state = buy(shop(), itemId); const cost = -getStoreItem(itemId)!.effects.health;
      state.player.health = cost - 1;
      const before = JSON.stringify(state);
      expect(getUseItemQuote(state, itemId).blockedReason).toMatch(/健康/);
      expect(() => use(state, itemId)).toThrow(/健康/);
      expect(JSON.stringify(state)).toBe(before);
      state.player.health = cost;
      expect(use(state, itemId).player.health).toBe(0);
    }
    expect(() => use(shop())).toThrow(/背包/);
    expect(() => use(shop(), '__proto__')).toThrow(/商品/);
    const last = buy(shop()); last.clock = { day: 365000, hour: 23, minute: 58 };
    const before = JSON.stringify(last);
    expect(getUseItemQuote(last, 'cigarette-standard').blockedReason).toMatch(/最大天数/);
    expect(() => use(last)).toThrow(/最大天数/);
    expect(JSON.stringify(last)).toBe(before);
  });

  it('never allows action payload fields to override the authored item effects, price or time', () => {
    const state = shop();
    const purchased = reduceState(state, { type: 'buy_item', itemId: 'cigarette-standard', quantity: 1, price: 0, unitsAdded: 999 } as WorldAction);
    expect(purchased.player.balance).toBe(278); expect(purchased.inventory[0].quantity).toBe(20);
    const used = reduceState(purchased, { type: 'use_item', itemId: 'cigarette-standard', quantity: 20, minutes: 0, health: 100 } as WorldAction);
    expect(used.inventory[0].quantity).toBe(19); expect(used.player.health).toBe(84);
    expect(used.clock.minute).toBe(25);
  });
});

describe('elapsed needs across existing world actions', () => {
  it('crosses quarter-hour and midnight boundaries consistently across split actions and floors reserves at zero', () => {
    const initial = createInitialState(); initial.clock = { day: 8, hour: 23, minute: 59 };
    const whole = reduceState(initial, { type: 'wait', minutes: 32 });
    const split = [1, 14, 1, 16].reduce((state, minutes) => reduceState(state, { type: 'wait', minutes }), initial);
    expect(whole.clock).toEqual({ day: 9, hour: 0, minute: 31 });
    expect(whole.player.foodEnergy).toBe(1136); expect(whole.player.satiety).toBe(67);
    expect(split.player.foodEnergy).toBe(whole.player.foodEnergy); expect(split.player.satiety).toBe(whole.player.satiety);
    initial.player.foodEnergy = 1; initial.player.satiety = 1;
    const exhausted = reduceState(initial, { type: 'wait', minutes: 120 });
    expect(exhausted.player.foodEnergy).toBe(0); expect(exhausted.player.satiety).toBe(0);
  });

  it('quotes and commits nutrition on multi-leg transit while preserving inventory, health and stress', () => {
    let initial = buy(shop(), 'meal-standard');
    initial = reduceState(initial, { type: 'novel_travel', locationId: 'home' });
    initial.player.health = 47; initial.player.stress = 33;
    const before = JSON.stringify(initial); const quote = getNovelTravelQuote(initial, 'commercial');
    expect(quote).toMatchObject({ minutes: 70, fare: 9, foodEnergyCost: 140 });
    const after = reduceState(initial, { type: 'novel_travel', locationId: 'commercial' });
    expect(initial.player.foodEnergy - after.player.foodEnergy).toBe(quote.foodEnergyCost);
    expect(initial.player.satiety - after.player.satiety).toBe(quote.satietyCost);
    expect(after.player).toMatchObject({ health: 47, stress: 33 }); expect(after.inventory).toEqual(initial.inventory);
    expect(JSON.stringify(initial)).toBe(before);
  });

  it('keeps existing rest/study energy rules while applying duration-based pressure and nutrition', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let bed = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'dorm-room' });
    bed = reduceState(bed, { type: 'novel_approach', interactionId: 'dorm-rest' });
    bed.player.energy = 12; bed.player.health = 50; bed.player.stress = 100;
    const rested = reduceState(bed, { type: 'interior_rest', optionId: 'dorm-rest-long' });
    const restMinutes = rested.interior!.lastRest!.minutes;
    expect(rested.player.energy).toBe(100);
    expect(rested.player.health).toBe(50 + Math.floor(restMinutes / 120));
    expect(rested.player.stress).toBe(Math.max(0, 100 - Math.floor(restMinutes / 15) * 2));
    expect(rested.player.foodEnergy).toBe(Math.max(0, bed.player.foodEnergy - restMinutes * 2));
    let desk = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'classroom' });
    desk = reduceState(desk, { type: 'novel_approach', interactionId: 'classroom-notes' });
    const studied = reduceState(withAcademicSelection(desk), { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' });
    const record = studied.interior!.lastStudy!;
    expect(studied.player.energy).toBe(desk.player.energy - record.energyConsumed);
    expect(studied.player.stress).toBe(desk.player.stress + Math.ceil(record.minutes / 30));
    expect(studied.player.foodEnergy).toBe(desk.player.foodEnergy - record.minutes * 2);
  });
});
