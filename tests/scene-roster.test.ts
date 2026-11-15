import { describe, expect, it } from 'vitest';
import { createInitialState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState, phoneAccess } from '../src/runtime/protagonist-world';
import { worldMapRadarPeople, worldSceneContext, worldScenePeople, worldSceneRoster } from '../src/runtime/world-presence';
import { getSceneContext, sampleScenePerson, selectSceneRoster } from '../src/runtime/scene-context';
import { getCampusInterior } from '../src/runtime/campus-interiors';

function sportsState() {
  const state = enableProtagonists(createInitialState());
  state.locationId = 'sports';
  state.scene = { x: 39, z: -11, yaw: 0, areaId: 'sports', seed: 'roster', encounterId: null };
  state.interior = null;
  const sakiko = personState(state, 'sakiko');
  sakiko.locationId = 'sports'; sakiko.interior = null;
  sakiko.scene = { ...state.scene, x: 64 };
  return state;
}

describe('shared location-gated scene population', () => {
  it('keeps opening gate scenes sparse with same-location talking access and no meter metrics', () => {
    const state = enableProtagonists(createInitialState());
    const context = worldSceneContext(state)!;
    expect(context.nearbyPeople.length).toBeGreaterThanOrEqual(1);
    expect(context.nearbyPeople.length).toBeLessThanOrEqual(3);
    expect(context.nearbyPeople.every(person => person.canTalk)).toBe(true);
    expect(context.nearbyPeople.every(person => !('distanceMetres' in person))).toBe(true);
  });

  it('allows conversation with a co-located protagonist anywhere in sports without 7m/35m cutoffs', () => {
    const state = sportsState();
    expect(worldScenePeople(state).some(person => person.id === 'protagonist-sakiko')).toBe(true);
    const context = worldSceneContext(state)!;
    const sakiko = context.nearbyPeople.find(person => person.id === 'protagonist-sakiko');
    expect(sakiko).toBeDefined();
    expect(sakiko?.canTalk).toBe(true);
    expect(context.encounter).toBeNull();
  });

  it('caps passers-by cleanly behind fixed residents while preserving protected/selected entries', () => {
    const state = sportsState(), scene = state.scene!;
    const pedestrians = Array.from({ length: 10 }, (_, i) => sampleScenePerson('crowd', {
      id: 'test-' + i, locationId: 'sports', x: scene.x + 1 + i / 10, z: scene.z, schoolWeighted: true,
    }));
    const resident = { ...pedestrians[0]!, id: 'bang-tomori', name: '高松灯', locationId: 'sports', x: scene.x + 16 };
    const context = getSceneContext(scene, null, [], state.clock, [], [...pedestrians, resident])!;
    expect(context.nearbyPeople[0]?.id).toBe('bang-tomori');
    expect(context.nearbyPeople.filter(person => person.kind === 'passerby').length).toBeLessThanOrEqual(1);
    const selected = pedestrians[9]!;
    const rows = selectSceneRoster([...pedestrians, resident], scene, false, selected.id, { locationId: 'sports', seed: scene.seed, clock: state.clock });
    expect(rows.some(row => row.person.id === selected.id && row.canTalk)).toBe(true);
  });

  it('uses the exact same ordered IDs for the display roster and narrative without mutating a save', () => {
    const state = sportsState();
    state.protagonists!.devices.sakiko.locked = true;
    const before = structuredClone(state);
    expect(worldSceneContext(state)!.nearbyPeople.map(person => person.id))
      .toEqual(worldSceneRoster(state).map(row => row.person.id));
    expect(state).toEqual(before);
    expect(phoneAccess(state, 'sakiko').read).toBe(false);
  });

  it('excludes another location or indoor room from the active scene roster while keeping map radar scoped to acquaintances', () => {
    const state = sportsState(), sakiko = personState(state, 'sakiko');
    sakiko.locationId = 'library';
    sakiko.scene = { x: -2, z: -12, yaw: 0, areaId: 'library', seed: 'roster', encounterId: null };
    expect(worldSceneContext(state)!.nearbyPeople.some(person => person.id === 'protagonist-sakiko')).toBe(false);
    const radar = worldMapRadarPeople(state);
    const sakikoRadar = radar.find(row => row.person.id === 'protagonist-sakiko');
    expect(sakikoRadar).toMatchObject({ locationId: 'library', placeId: 'library', atCurrentPlace: false, canTalk: false });
    expect(radar.some(row => !row.atCurrentPlace && !row.person.protagonistId && !row.person.contactId)).toBe(false);

    const moved = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    const room = getCampusInterior('dorm-room')!;
    personState(moved, 'soyo').interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
    personState(moved, 'soyo').locationId = room.id;
    expect(worldSceneRoster(moved).some(row => row.person.id === 'protagonist-soyo')).toBe(false);
  });
});
