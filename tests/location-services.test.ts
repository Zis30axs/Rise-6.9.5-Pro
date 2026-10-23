import { describe, expect, it } from 'vitest';
import type { WorldAction, WorldState } from '../src/frontend/types';
import { getLocationServiceQuote, getLocationServices, getLocationStatus, locationServiceCatalog } from '../src/runtime/location-services';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';

function at(locationId = 'cafe', hour = 14, minute = 0): WorldState {
  const state = ['commercial', 'city-park'].includes(locationId)
    ? reduceState(createInitialState(), { type: 'novel_travel', locationId })
    : { ...createInitialState(), locationId };
  state.clock = { day: 2, hour, minute };
  return state;
}
const use = (state: WorldState, serviceId = 'drink-coffee') => reduceState(state, { type: 'location_service', serviceId });

describe('authored location hours and services', () => {
  it('makes the screenshot cafe at 00:20 explicitly closed with a known next opening', () => {
    const state = at('cafe', 0, 20);
    expect(getLocationStatus(state.locationId, state.clock)).toMatchObject({
      label: '街角咖啡店', hoursLabel: '08:00–22:00', isOpen: false,
      statusLabel: '休息中', minutesUntilOpen: 460, minutesUntilClose: 0,
    });
    expect(getLocationServices(state).map(service => service.id)).toContain('drink-coffee');
    expect(getLocationServiceQuote(state, 'drink-coffee').blockedReason).toMatch(/休息中.*08:00–22:00/);
    expect(() => use(state)).toThrow(/休息中/);
  });

  it.each([
    [7, 59, false, 1, 0], [8, 0, true, 0, 840], [21, 59, true, 0, 1], [22, 0, false, 600, 0],
  ])('uses precise opening boundaries for the campus cafe at %s:%s', (hour, minute, isOpen, minutesUntilOpen, minutesUntilClose) => {
    expect(getLocationStatus('cafe', { day: 1, hour, minute })).toMatchObject({ isOpen, minutesUntilOpen, minutesUntilClose });
  });

  it('treats the street cafe overnight interval as one uninterrupted session', () => {
    expect(getLocationStatus('street-cafe', at('street-cafe', 0, 20).clock)).toMatchObject({ hoursLabel: '10:00–次日 02:00', isOpen: true, minutesUntilClose: 100 });
    expect(getLocationStatus('street-cafe', at('street-cafe', 2).clock)).toMatchObject({ isOpen: false, minutesUntilOpen: 480 });
    const before = at('street-cafe', 23, 55);
    expect(use(before).clock).toEqual({ day: 3, hour: 0, minute: 5 });
  });

  it('has known bookshop/store hours without duplicating their purchase or reading actions', () => {
    expect(getLocationStatus('bookshop', at('bookshop', 8).clock)).toMatchObject({ hoursLabel: '09:00–22:00', isOpen: false });
    expect(getLocationStatus('convenience', at('convenience', 23, 59).clock)).toMatchObject({ hoursLabel: '24 小时营业', isOpen: true, minutesUntilClose: null });
    expect(getLocationServices(at('bookshop'))).toEqual([]);
    expect(getLocationServices(at('convenience'))).toEqual([]);
    expect(getLocationStatus('gate', at('gate').clock)).toBeNull();
    expect(getLocationStatus('__proto__', at().clock)).toBeNull();
    expect(getLocationServices(at('gate'))).toEqual([]);
  });

  it('offers authored food, exercise and park activities only at their own venues', () => {
    expect(getLocationServices(at('commercial')).map(service => service.id)).toEqual(['eat-meal', 'eat-noodles']);
    expect(getLocationServices(at('sports')).map(service => service.id)).toEqual(['jog', 'stretch']);
    expect(getLocationServices(at('pocket-park')).map(service => service.id)).toEqual(['park-rest', 'take-stroll']);
    expect(getLocationServices(at('city-park')).map(service => service.id)).toEqual(['park-rest', 'take-stroll']);
    expect(getLocationServices(at('promenade')).map(service => service.id)).toEqual(['take-stroll']);
    expect(new Set(locationServiceCatalog.map(service => service.id)).size).toBe(locationServiceCatalog.length);
  });
});

describe('atomic service settlement', () => {
  it('pays for and consumes a daytime coffee exactly once with a pure preview and saved receipt', () => {
    const state = at('cafe', 14, 10);
    state.player.energy = 50.05;
    state.inventory = [{ itemId: 'drink-basic', quantity: 2 }];
    const original = JSON.stringify(state);
    const quote = getLocationServiceQuote(state, 'drink-coffee');
    expect(quote).toMatchObject({ minutes: 10, price: 320, blockedReason: null, changes: { energy: 18, balance: -320, morale: 3, satiety: -1, foodEnergy: -10 } });
    expect(quote.playerAfter).toMatchObject({ energy: 68.05, balance: 6240, foodEnergy: 1190 });
    expect(JSON.stringify(state)).toBe(original);
    const after = use(state);
    expect(after.player).toEqual(quote.playerAfter);
    expect(after.clock).toEqual({ day: 2, hour: 14, minute: 20 });
    expect(after.locationId).toBe('cafe');
    expect(after.interior).toBeNull();
    expect(after.inventory).toEqual(state.inventory);
    expect(after.story).toEqual(state.story);
    expect(after.journal).toHaveLength(state.journal.length + 1);
    expect(after.journal.at(-1)?.text).toMatch(/街角咖啡店.*咖啡.*支付 320 日元.*10 分钟.*精力\+18/);
    expect(parseState(JSON.parse(JSON.stringify(after)))).toEqual(after);
    expect(JSON.stringify(state)).toBe(original);
  });

  it('clamps all restorative benefits after one nutrition settlement and reports actual changes', () => {
    const state = at('cafe', 14, 10);
    state.player = { ...state.player, energy: 99.95, morale: 99, health: 100, stress: 2, satiety: 99, foodEnergy: 2999 };
    const quote = getLocationServiceQuote(state, 'drink-latte');
    const after = use(state, 'drink-latte');
    expect(after.player).toEqual(quote.playerAfter);
    expect(after.player).toMatchObject({ energy: 100, morale: 100, health: 100, stress: 0, satiety: 100, foodEnergy: 3000 });
    expect(quote.changes).toMatchObject({ energy: 0.05, morale: 1, health: 0, stress: -2, satiety: 1, foodEnergy: 1 });
  });

  it('finishes exactly at closing but refuses even a minute beyond it without changing input', () => {
    const allowed = at('cafe', 21, 50);
    expect(use(allowed).clock).toEqual({ day: 2, hour: 22, minute: 0 });
    const refused = at('cafe', 21, 51);
    const original = JSON.stringify(refused);
    expect(getLocationServiceQuote(refused, 'drink-coffee').blockedReason).toMatch(/打烊.*9.*10/);
    expect(() => use(refused)).toThrow(/打烊/);
    expect(JSON.stringify(refused)).toBe(original);
    expect(use(at('street-cafe', 1, 50)).clock).toEqual({ day: 2, hour: 2, minute: 0 });
    expect(() => use(at('street-cafe', 1, 51))).toThrow(/打烊/);
  });

  it('keeps 24 hour park activities available across midnight and permits zero-energy rest', () => {
    const state = at('pocket-park', 23, 50);
    state.player.energy = 0;
    const after = use(state, 'park-rest');
    expect(after.clock).toEqual({ day: 3, hour: 0, minute: 10 });
    expect(after.player.energy).toBe(6);
    expect(after.player.balance).toBe(state.player.balance);
    expect(after.journal.at(-1)?.text).toMatch(/免费/);
  });

  it('requires enough energy for exercise using exact decimal energy and never creates negative values', () => {
    const low = at('sports'); low.player.energy = 9.99;
    const original = JSON.stringify(low);
    expect(getLocationServiceQuote(low, 'jog').blockedReason).toMatch(/精力不足/);
    expect(() => use(low, 'jog')).toThrow(/精力不足/);
    expect(JSON.stringify(low)).toBe(original);
    low.player.energy = 10;
    expect(use(low, 'jog').player.energy).toBe(0);
    low.player.energy = 10.01;
    expect(use(low, 'jog').player.energy).toBe(0.01);
  });

  it('rejects a wrong location, unknown/prototype ID, insufficient balance, and max day atomically', () => {
    const poor = at(); poor.player.balance = 15.99;
    const last = at('pocket-park', 23, 50); last.clock.day = 365000;
    const cases: [WorldState, string, RegExp][] = [
      [at('gate'), 'drink-coffee', /地点/], [at(), '__proto__', /不存在/], [at(), 'constructor', /不存在/],
      [poor, 'drink-coffee', /余额不足/], [last, 'park-rest', /最大天数/],
    ];
    for (const [state, serviceId, reason] of cases) {
      const original = JSON.stringify(state);
      const quote = getLocationServiceQuote(state, serviceId);
      expect(quote.blockedReason).toMatch(reason);
      expect(quote.playerAfter).toEqual(state.player);
      expect(Object.values(quote.changes).every(delta => delta === 0)).toBe(true);
      expect(() => use(state, serviceId)).toThrow(reason);
      expect(JSON.stringify(state)).toBe(original);
    }
  });

  it('does not allow forged price, effects or duration in an action to override the catalog', () => {
    const state = at();
    const after = reduceState(state, { type: 'location_service', serviceId: 'drink-coffee', price: 0, minutes: 0, effects: { balance: 1000000 } } as WorldAction);
    expect(after.player.balance).toBe(state.player.balance - 320);
    expect(after.clock.minute).toBe(10);
    expect(after.inventory).toEqual([]);
  });

  it('keeps room interactions separate and validates all authored services through save parsing', () => {
    const room = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'study-room' });
    expect(getLocationServices(room)).toEqual([]);
    expect(() => use(room)).toThrow(/地点/);
    for (const service of locationServiceCatalog) {
      const state = at(service.locationIds[0]);
      expect(parseState(use(state, service.id))).toEqual(use(state, service.id));
    }
  });
});
