import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../src/frontend/types';
import { getUseItemQuote } from '../src/runtime/convenience-store';
import { energyDifference } from '../src/runtime/energy';
import { commitStoryTurn, createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { withoutAcademics, withAcademicSelection } from './legacy-state';

afterEach(() => vi.restoreAllMocks());
const travel = (state: WorldState, locationId: string) => reduceState(state, { type: 'novel_travel', locationId });
const neutral = () => {
  const state = createInitialState();
  state.player.health = state.player.satiety = state.player.stress = 50;
  return state;
};

describe('novel travel energy uses departure conditions and hundredths', () => {
  it.each([
    { health: 50, satiety: 50, stress: 50, multiplier: 1, cost: 0.5 },
    { health: 100, satiety: 100, stress: 0, multiplier: 0.5, cost: 0.25 },
    { health: 0, satiety: 0, stress: 100, multiplier: 1.5, cost: 0.75 },
    { health: 90, satiety: 70, stress: 25, multiplier: 215 / 300, cost: 0.36 },
  ])('charges $cost for health=$health satiety=$satiety stress=$stress', ({ health, satiety, stress, multiplier, cost }) => {
    const state = createInitialState(); Object.assign(state.player, { health, satiety, stress });
    const snapshot = JSON.stringify(state);
    const quote = getNovelTravelQuote(state, 'library');
    expect(quote).toMatchObject({ baseEnergyCost: 5, baseEnergyMultiplier: 0.1, conditionMultiplier: multiplier, calculatedEnergyCost: cost, energyCost: cost, blockedReason: null });
    const after = travel(state, 'library');
    expect(energyDifference(state.player.energy, after.player.energy)).toBe(cost);
    expect(parseState(JSON.parse(JSON.stringify(after)))).toEqual(after);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('centers each condition on 50, ignores morale, and rounds half cents upward once', () => {
    const state = neutral();
    for (const key of ['health', 'satiety', 'stress'] as const) {
      state.player[key] = 49;
      const low = getNovelTravelQuote(state, 'library');
      state.player[key] = 51;
      const high = getNovelTravelQuote(state, 'library');
      expect(key === 'stress' ? low.conditionMultiplier < 1 : low.conditionMultiplier > 1).toBe(true);
      expect(key === 'stress' ? high.conditionMultiplier > 1 : high.conditionMultiplier < 1).toBe(true);
      expect(low.energyCost).toBe(0.5); expect(high.energyCost).toBe(0.5);
      state.player[key] = 50;
    }
    state.player.health = 47; // 5 * 0.1 * 303/300 = 0.505.
    expect(getNovelTravelQuote(state, 'library').energyCost).toBe(0.51);
    state.player.morale = 0;
    const before = getNovelTravelQuote(state, 'library'); state.player.morale = 100;
    expect(getNovelTravelQuote(state, 'library')).toEqual(before);
  });

  it.each([0, 0.01, 0.49, 0.5])('allows travel with %s energy, deducts only the available amount and keeps transactions atomic', energy => {
    const state = neutral(); state.player.energy = energy;
    const quote = getNovelTravelQuote(state, 'classroom');
    expect(quote).toMatchObject({ calculatedEnergyCost: 0.5, energyCost: energy, blockedReason: null });
    const after = travel(state, 'classroom');
    expect(after.locationId).toBe('classroom'); expect(after.player.energy).toBe(0);
    const near = withAcademicSelection(reduceState(after, { type: 'novel_approach', interactionId: 'classroom-notes' }));
    const saved = JSON.stringify(near);
    expect(() => reduceState(near, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' })).toThrow(/精力不足/);
    expect(JSON.stringify(near)).toBe(saved);
    const atWindow = reduceState(near, { type: 'novel_approach', interactionId: 'classroom-window' });
    expect(reduceState(atWindow, { type: 'interior_interact', interactionId: 'classroom-window' }).player).toEqual(atWindow.player);
    expect(reduceState(near, { type: 'wait', minutes: 15 }).player.energy).toBe(2);
    const dorm = reduceState(travel(near, 'dorm-room'), { type: 'novel_approach', interactionId: 'dorm-desk' });
    expect(() => reduceState(dorm, { type: 'interior_interact', interactionId: 'dorm-desk' })).toThrow(/精力不足/);
    const bed = reduceState(dorm, { type: 'novel_approach', interactionId: 'dorm-rest' });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(reduceState(bed, { type: 'interior_rest', optionId: 'dorm-rest-short' }).player.energy).toBe(6);
  });

  it('keeps no-walk routes free and uses the original factor before a bus leg changes satiety', () => {
    const first = neutral(); first.player.energy = 0;
    expect(getNovelTravelQuote(first, 'gate')).toMatchObject({ baseEnergyCost: 0, calculatedEnergyCost: 0, energyCost: 0, alreadyThere: true });
    const home = travel(first, 'home');
    expect(home.player.energy).toBe(0); expect(home.transit.lastRide?.fare).toBe(6);
    home.player.energy = 2.37; home.player.health = home.player.satiety = home.player.stress = 50;
    const quote = getNovelTravelQuote(home, 'classroom');
    expect(quote).toMatchObject({ baseEnergyCost: 5, conditionMultiplier: 1, calculatedEnergyCost: 0.5, energyCost: 0.5, fare: 6 });
    const room = travel(home, 'classroom');
    expect(room.player.energy).toBe(1.87); expect(room.player.satiety).toBeLessThan(50);
    const transfer = getNovelTravelQuote(home, 'commercial');
    expect(transfer).toMatchObject({ baseEnergyCost: 0, calculatedEnergyCost: 0, energyCost: 0, fare: 9, minutes: 70 });
    expect(transfer.rides).toHaveLength(2);
    expect(travel(home, 'commercial').player.energy).toBe(2.37);
    expect(getNovelTravelQuote(room, 'teaching').energyCost).toBe(0);
    home.player.balance = 5;
    expect(getNovelTravelQuote(home, 'classroom').blockedReason).toMatch(/余额/);
    expect(() => travel(home, 'classroom')).toThrow(/余额/);
  });

  it('leaves 3D travel costs unchanged, including fractional-energy rejection and deductions', () => {
    const state = neutral(); state.player.energy = 4.99;
    expect(() => reduceState(state, { type: 'travel', locationId: 'library' })).toThrow(/精力不足/);
    state.player.energy = 5.01;
    expect(reduceState(state, { type: 'travel', locationId: 'library' }).player.energy).toBe(0.01);
    state.player.energy = 5;
    expect(reduceState(state, { type: 'travel', locationId: 'library' }).player.energy).toBe(0);
  });
});

describe('version 1.8 decimal energy and morale saves', () => {
  it('migrates the complete 1.7 inventory and needs without resettling actions or weakening legacy validation', () => {
    const latest = reduceState({ ...createInitialState(), locationId: 'convenience' }, { type: 'buy_item', itemId: 'cigarette-standard', quantity: 2 });
    Object.assign(latest.player, { health: 61, stress: 42, satiety: 33, foodEnergy: 546, energy: 24 });
    const { morale: _morale, ...oldPlayer } = latest.player;
    const old = { ...withoutAcademics(latest), schema_version: '1.7.0', player: oldPlayer };
    const saved = JSON.stringify(old); const migrated = parseState(JSON.parse(saved));
    expect(migrated).toEqual(latest); expect(migrated.inventory).toEqual([{ itemId: 'cigarette-standard', quantity: 40 }]);
    expect(migrated.player.morale).toBe(70);
    expect(JSON.stringify(old)).toBe(saved);
    expect(() => parseState({ ...old, player: { ...oldPlayer, energy: 24.25 } })).toThrow(/player.energy/);
    expect(() => parseState({ ...old, player: latest.player })).toThrow(/字段/);
    for (const energy of [0.001, 0.30000000000000004, 100.01, -0.01, NaN, Infinity, '1']) expect(() => parseState({ ...latest, player: { ...latest.player, energy } })).toThrow(/player.energy/);
    for (const morale of [-1, 101, 1.5, undefined, NaN, '70']) expect(() => parseState({ ...latest, player: { ...latest.player, morale } })).toThrow(/player.morale/);
    for (const energy of [0, 0.01, 0.29, 79.64, 99.99, 100]) expect(parseState({ ...latest, player: { ...latest.player, energy } }).player.energy).toBe(energy);
  });

  it('round-trips decimal use, waiting, studies and capped rest recovery without float residue', () => {
    let state = reduceState({ ...createInitialState(), locationId: 'convenience' }, { type: 'buy_item', itemId: 'meal-basic', quantity: 2 });
    state.player.energy = 90.29;
    const quote = getUseItemQuote(state, 'meal-basic');
    expect(quote.changes.energy).toBe(9.71);
    state = reduceState(state, { type: 'use_item', itemId: 'meal-basic' });
    expect(state.player.energy).toBe(100);
    state.player.energy = 3.29;
    state = reduceState(state, { type: 'wait', minutes: 15 });
    expect(state.player.energy).toBe(5.29);
    const bedroom = travel(state, 'dorm-room');
    const bed = reduceState(bedroom, { type: 'novel_approach', interactionId: 'dorm-rest' });
    bed.player.energy = 99.29;
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const rested = reduceState(bed, { type: 'interior_rest', optionId: 'dorm-rest-short' });
    expect(rested.player.energy).toBe(100);
    expect(rested.interior?.lastRest?.energyRecovered).toBe(0.71);
    expect(rested.journal.at(-1)?.text).toContain('精力+0.71');
    expect(parseState(JSON.parse(JSON.stringify(rested)))).toEqual(rested);
    const { morale: _morale, ...oldPlayer } = rested.player;
    expect(() => parseState({ ...withoutAcademics(rested), schema_version: '1.7.0', player: oldPlayer })).toThrow(/lastRest.energyRecovered/);
    const oldValid = { ...withoutAcademics(rested), schema_version: '1.7.0', player: oldPlayer, interior: { ...rested.interior, lastRest: { ...rested.interior!.lastRest!, energyRecovered: 1 } } };
    const migrated = parseState(oldValid);
    expect(migrated.interior!.lastRest!.energyRecovered).toBe(1);
    const classroom = withAcademicSelection(reduceState(travel(rested, 'classroom'), { type: 'novel_approach', interactionId: 'classroom-notes' }));
    classroom.player.energy = 5.29;
    const studied = reduceState(classroom, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' });
    expect(studied.interior!.lastStudy!.energyConsumed).toBe(3);
    expect(studied.player.energy).toBe(2.29);
    expect(parseState(JSON.parse(JSON.stringify(studied)))).toEqual(studied);
    const continued = commitStoryTurn(studied, '看看周围', { text: '房间依旧安静。', phoneMessages: [] }, { userId: 'decimal-user', assistantId: 'decimal-assistant' });
    expect(continued.player).toEqual(studied.player); expect(continued.clock).toEqual(studied.clock);
  });
});
