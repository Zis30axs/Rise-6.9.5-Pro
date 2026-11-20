import { describe, expect, it } from 'vitest';
import { districtMapPlaces } from '../src/frontend/map-districts';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';
import { affinityLocationNotes } from '../src/runtime/affinity-locations';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { validateStoryActions } from '../src/runtime/story-actions';
import { worldSceneContext } from '../src/runtime/world-presence';

describe('王子·飞鸟山公园', () => {
  const gate = 'asukayama-park', fountain = 'asukayama';
  it('travels from the stop to the park, visits the fountain, rests and leaves', () => {
    const start = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'bus-stop' });
    expect(districtMapPlaces(gate).map(place => place.id)).toEqual([gate, fountain]);
    expect(getAdjacentLocations(start).map(place => place.id)).toContain(gate);
    const quote = getNovelTravelQuote(start, gate);
    expect(quote).toMatchObject({ blockedReason: null, fare: 220, minutes: 28 });
    const entered = reduceState(start, { type: 'novel_travel', locationId: gate });
    expect(entered.player.balance).toBe(start.player.balance - quote.fare);
    expect(getAdjacentLocations(entered).map(place => place.id)).toContain(fountain);
    const action = { type: 'travel', locationId: fountain };
    expect(validateStoryActions([action], entered)).toEqual([action]);
    const arrived = parseState(reduceState(entered, { type: 'novel_travel', locationId: fountain }));
    expect(worldSceneContext(arrived)).toMatchObject({ outdoors: true, skyVisible: true, areaId: fountain });
    const rested = reduceState(arrived, { type: 'location_service', serviceId: 'park-rest' });
    expect(rested.locationId).toBe(fountain);
    const leave = reduceState(rested, { type: 'novel_travel', locationId: gate });
    expect(leave.locationId).toBe(gate);
    const returned = reduceState(leave, { type: 'novel_travel', locationId: 'bus-stop' });
    expect(returned.transit.lastRide).toMatchObject({ fromStopId: gate, toStopId: 'campus' });
  });

  it('rehomes old fountain saves without touching other visits to Ikebukuro', () => {
    const start = createInitialState();
    const oldAccess = reduceState(start, { type: 'novel_travel', locationId: 'commercial' });
    const plaza = reduceState(start, { type: 'novel_travel', locationId: fountain });
    const restored = parseState({ ...plaza, scene: oldAccess.scene });
    expect(restored.locationId).toBe(fountain);
    expect(restored.interior).toEqual(plaza.interior);
    expect(restored.player).toEqual(plaza.player);
    expect(reduceState(restored, { type: 'leave_interior' }).locationId).toBe(gate);
    expect(parseState(oldAccess).scene).toEqual(oldAccess.scene);
  });

  it('keeps the original three pictures and the fountain-specific character reactions', () => {
    const pictures = new Set<string>();
    for (const [hour, phase] of [[5, 'night'], [6, 'day'], [17, 'dusk'], [19, 'night']] as const) {
      const bg = getNovelBackground(fountain, hour);
      expect(bg).toMatchObject({ id: `asukayama-${phase}`, phase, imagePhase: phase, source: 'user-art' });
      expect(bg.src).toMatch(/^data:image\/webp;base64,/);
      expect(getNovelBackground(gate, hour).src).toBe(bg.src);
      expect(getNovelBackground('city-park', hour).src).not.toBe(bg.src);
      pictures.add(bg.src);
    }
    expect(pictures.size).toBe(3);
    expect(affinityLocationNotes('protagonist-soyo', 'friend', gate, 18, 'sunny')).not.toEqual([]);
    expect(affinityLocationNotes('protagonist-sakiko', 'confidant', gate, 18, 'sunny')).toEqual([]);
    expect(affinityLocationNotes('protagonist-sakiko', 'confidant', fountain, 18, 'sunny').join('')).toContain('喷泉旁');
  });
});
