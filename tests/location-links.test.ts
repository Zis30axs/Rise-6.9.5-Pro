import { describe, expect, it } from 'vitest';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { createInitialState, getNovelTravelQuote, novelDestinations, reduceState } from '../src/runtime/model';

describe('always-available adjacent locations', () => {
  it.each([
    ['dorm', 'dorm-room'], ['teaching', 'classroom'], ['library', 'study-room'],
  ])('enters and leaves %s through its own %s door without a map or time charge', (outside, inside) => {
    const before = reduceState(createInitialState(), { type: 'novel_travel', locationId: outside });
    expect(getAdjacentLocations(before)[0]).toMatchObject({ id: inside, kind: 'enter' });
    expect(getNovelTravelQuote(before, inside)).toMatchObject({ minutes: 0, energyCost: 0, fare: 0, blockedReason: null });
    const entered = reduceState(before, { type: 'novel_travel', locationId: inside });
    expect(entered.interior?.roomId).toBe(inside);
    expect(getAdjacentLocations(entered)).toEqual([{ id: outside, label: novelDestinations.find(item => item.id === outside)!.name, kind: 'exit' }]);
    expect(getNovelTravelQuote(entered, outside)).toMatchObject({ minutes: 0, energyCost: 0, fare: 0, blockedReason: null });
    const exited = reduceState(entered, { type: 'novel_travel', locationId: outside });
    expect(exited.interior).toBeNull();
    expect(exited.clock).toEqual(before.clock);
    expect(exited.player).toEqual(before.player);
  });

  it('makes nearby outdoor connections reciprocal and never sends the player to an unknown or same destination', () => {
    for (const destination of novelDestinations) {
      const state = { ...createInitialState(), locationId: destination.id };
      const links = getAdjacentLocations(state);
      expect(new Set(links.map(item => item.id)).size).toBe(links.length);
      for (const link of links) {
        expect(link.id).not.toBe(destination.id);
        expect(novelDestinations.some(item => item.id === link.id)).toBe(true);
        if (link.kind === 'nearby') {
          expect(getAdjacentLocations({ ...state, locationId: link.id }).map(item => item.id)).toContain(destination.id);
        }
      }
    }
  });

  it('connects the campus, shops, café and park through existing reachable routes', () => {
    const reached = new Set<string>(['gate']);
    const pending = ['gate'];
    while (pending.length) {
      const origin = pending.shift()!;
      for (const place of getAdjacentLocations({ ...createInitialState(), locationId: origin })) {
        if (!reached.has(place.id)) { reached.add(place.id); pending.push(place.id); }
      }
    }
    expect([...reached].sort()).toEqual(novelDestinations.map(item => item.id).sort());
  });

  it('labels distant district returns as paid transit, not an immediate neighboring door', () => {
    const state = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'commercial' });
    expect(getAdjacentLocations(state)).toEqual([
      { id: 'majo-highrise-home', label: '雪莉与汉娜的住处', kind: 'enter' },
      { id: 'bus-stop', label: '南门公交站', kind: 'transit' },
    ]);
    const quote = getNovelTravelQuote(state, 'bus-stop');
    expect(quote.fare).toBeGreaterThan(0);
    expect(quote.minutes).toBeGreaterThan(0);
    expect(quote.blockedReason).toBeNull();
  });

  it('provides real exits for unnamed walking areas without inventing promenade or campus arrival points', () => {
    for (const origin of ['promenade', 'campus', 'neighborhood', 'city-roads']) {
      const state = { ...createInitialState(), locationId: origin };
      const links = getAdjacentLocations(state);
      expect(links.length).toBeGreaterThan(0);
      expect(links.every(link => novelDestinations.some(destination => destination.id === link.id))).toBe(true);
    }
    expect(getAdjacentLocations({ ...createInitialState(), locationId: 'unknown' })).toEqual([]);
  });
});
