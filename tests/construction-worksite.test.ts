import { describe, expect, it } from 'vitest';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { getLocationServiceQuote, getLocationServices, getLocationStatus } from '../src/runtime/location-services';
import { appiePayBalance, PROTAGONISTS } from '../src/runtime/dual-protagonists';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { mapLocationPoint } from '../src/frontend/campus-map-layout';
import { districtMapPlaces } from '../src/frontend/map-districts';
import { getSceneArea } from '../src/runtime/scene-context';

function atSite(owner: (typeof PROTAGONISTS)[number] = 'soyo') {
  let state = enableProtagonists(createInitialState());
  if (owner !== 'soyo') state = reduceState(state, { type: 'switch_protagonist', target: owner });
  state.clock = { day: 2, hour: 8, minute: 0 };
  state.locationId = 'construction-site';
  state.scene = null;
  state.player.energy = 95;
  return parseState(state);
}

describe('south gate construction site', () => {
  it('shares a reachable point among the map, scene and novel travel', () => {
    const point = mapLocationPoint('construction-site');
    expect(point).toEqual(expect.objectContaining({ x: -52, z: 62 }));
    expect(getSceneArea(point!.x, point!.z)?.id).toBe('construction-site');
    expect(districtMapPlaces('campus').some(place => place.id === 'construction-site')).toBe(true);
    expect(getAdjacentLocations({ locationId: 'bookshop', interior: null }).some(place => place.id === 'construction-site')).toBe(true);
    expect(getNovelTravelQuote(createInitialState(), 'construction-site').blockedReason).toBeNull();
  });

  it('requires on-site work with enough energy before closing', () => {
    const early = atSite();
    expect(getLocationStatus('construction-site', early.clock)?.hoursLabel).toBe('07:00–18:00');
    expect(getLocationServices(early).map(service => service.id)).toEqual(['construction-clear', 'construction-carry']);
    expect(getLocationServiceQuote(early, 'construction-clear').blockedReason).toBeNull();
    expect(getLocationServiceQuote(early, 'construction-carry').blockedReason).toBeNull();
    const exhausted = structuredClone(early); exhausted.player.energy = 39;
    expect(getLocationServiceQuote(exhausted, 'construction-clear').blockedReason).toMatch(/精力不足/);
    const late = structuredClone(early); late.clock.hour = 17; late.clock.minute = 0;
    expect(getLocationServiceQuote(late, 'construction-clear').blockedReason).toMatch(/打烊/);
    const closed = structuredClone(early); closed.clock.hour = 19;
    expect(getLocationServiceQuote(closed, 'construction-clear').blockedReason).toBeTruthy();
    const elsewhere = structuredClone(early); elsewhere.locationId = 'bookshop';
    expect(getLocationServiceQuote(elsewhere, 'construction-clear').blockedReason).toMatch(/当前地点/);
  });

  it('credits only the active protagonist and advances time', () => {
    for (const owner of PROTAGONISTS) {
      const before = atSite(owner);
      const original = structuredClone(before);
      const beforeAccount = appiePayBalance(before.protagonists!.accounts, owner);
      const next = reduceState(before, { type: 'location_service', serviceId: 'construction-clear' });
      expect(next.clock).toEqual({ day: 2, hour: 10, minute: 0 });
      expect(next.player.energy).toBe(55);
      expect(next.player.balance - before.player.balance).toBe(3200);
      expect(appiePayBalance(next.protagonists!.accounts, owner) - beforeAccount).toBe(320000);
      expect(next.journal.at(-1)?.text).toContain('领取工资 3200 日元');
      for (const other of PROTAGONISTS) {
        if (other !== owner) expect(appiePayBalance(next.protagonists!.accounts, other)).toBe(appiePayBalance(before.protagonists!.accounts, other));
      }
      expect(before).toEqual(original);
      expect(parseState(next)).toEqual(next);
    }
  });

  it('allows the heavy four-hour shift and denies actions without time or energy', () => {
    const before = atSite();
    const next = reduceState(before, { type: 'location_service', serviceId: 'construction-carry' });
    expect(next.clock).toEqual({ day: 2, hour: 12, minute: 0 });
    expect(next.player.energy).toBe(20);
    expect(next.player.balance - before.player.balance).toBe(6800);
    const afterClosing = structuredClone(before); afterClosing.clock.hour = 17;
    expect(() => reduceState(afterClosing, { type: 'location_service', serviceId: 'construction-carry' })).toThrow();
    expect(() => reduceState({ ...before, locationId: 'library' }, { type: 'location_service', serviceId: 'construction-carry' })).toThrow();
  });

  it('reads legacy saves whose neighborhood coordinates now belong to the site', () => {
    const original = createInitialState();
    original.clock = { day: 2, hour: 8, minute: 0 };
    original.locationId = 'neighborhood';
    original.scene = { x: -52, z: 62, yaw: 0, areaId: 'neighborhood', seed: 'old-save', encounterId: null };
    const restored = parseState(original);
    expect(restored.scene?.areaId).toBe('construction-site');
    expect(restored.locationId).toBe('construction-site');
    expect(parseState(restored)).toEqual(restored);
  });
});
