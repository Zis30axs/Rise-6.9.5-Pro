import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { getTransitRoutes, transitVehicles } from '../src/runtime/transit';
import { TOKYO_MONEY_FACTOR, TOKYO_COUNTRY_ID, TOKYO_REGION_NAME } from '../src/runtime/tokyo-world';

describe('Tokyo world and historical save migration', () => {
  it('starts in Japanese yen and keeps stable vehicle identifiers with civilian labels', () => {
    const fresh = createInitialState();
    expect(fresh.currency).toBe('JPY');
    expect(fresh.player.balance).toBe(6560);
    expect(TOKYO_COUNTRY_ID).toBe('JPN');
    expect(TOKYO_REGION_NAME.test('東京都')).toBe(true);
    expect(getTransitRoutes('campus').map(item => [item.stop.id, item.minutes, item.fare]))
      .toEqual([['home', 12, 180], ['commercial', 18, 210], ['city-park', 16, 180]]);
    expect(transitVehicles.map(item => item.id)).toEqual(['btr82a', 'zbd04a']);
    expect(transitVehicles.map(item => item.label).join(' ')).toMatch(/都营巴士.*东京Metro/);
  });

  it('converts a pre-Tokyo single-player save one time and preserves historical text', () => {
    const previous = createInitialState();
    delete previous.currency;
    previous.player.balance = 328;
    const oldText = previous.journal[0].text;
    const migrated = parseState(previous);
    expect(migrated.currency).toBe('JPY');
    expect(migrated.player.balance).toBe(328 * TOKYO_MONEY_FACTOR);
    expect(migrated.journal[0].text).toBe(oldText);
    expect(parseState(migrated)).toEqual(migrated);
    expect(previous.currency).toBeUndefined();
    expect(previous.player.balance).toBe(328);
  });

  it('converts three separated protagonist wallets and Appie Pay cards only once', () => {
    const previous = enableProtagonists(createInitialState());
    delete previous.currency;
    const protagonists = previous.protagonists!;
    previous.player.balance /= TOKYO_MONEY_FACTOR;
    protagonists.inactive.player.balance /= TOKYO_MONEY_FACTOR;
    protagonists.third.player.balance /= TOKYO_MONEY_FACTOR;
    for (const owner of Object.values(protagonists.accounts.people))
      for (const card of ['gpt', 'claude', 'gemini'] as const)
        owner.cards[card] /= TOKYO_MONEY_FACTOR;
    const migrated = parseState(previous);
    expect(migrated.currency).toBe('JPY');
    expect(migrated.player.balance).toBe(6560);
    expect(migrated.protagonists!.inactive.player.balance).toBe(24000);
    expect(migrated.protagonists!.third.player.balance).toBe(12000);
    expect(migrated.protagonists!.accounts.people.emma.cards.gpt).toBe(1200000);
    expect(parseState(migrated)).toEqual(migrated);
  });

  it('preserves a historical route duration and converts its previously settled fare', () => {
    const stop = { x: 46, z: 38, yaw: 3.141, seed: 'tokyo-ticket' };
    const reached = reduceState(
      reduceState(createInitialState(), { type: 'walk', ...stop }),
      { type: 'ride_transit', vehicleId: 'btr82a', stopId: 'home' },
    );
    delete reached.currency;
    reached.player.balance = 322;
    reached.transit.lastRide!.minutes = 45;
    reached.transit.lastRide!.fare = 6;
    const migrated = parseState(reached);
    expect(migrated.transit.lastRide?.minutes).toBe(45);
    expect(migrated.transit.lastRide?.fare).toBe(120);
    expect(migrated.player.balance).toBe(6440);
    expect(parseState(migrated)).toEqual(migrated);
  });
});
