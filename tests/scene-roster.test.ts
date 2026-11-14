import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { worldSceneContext, worldScenePeople, worldSceneRoster } from '../src/runtime/world-presence';
import { getSceneContext, sampleScenePerson, selectSceneRoster } from '../src/runtime/scene-context';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { phoneAccess } from '../src/runtime/protagonist-world';

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

describe('shared visible scene population', () => {
  it('includes the protagonist visible on the map at 25 metres without granting conversation access', () => {
    const state = sportsState();
    expect(worldScenePeople(state).some(person => person.id === 'protagonist-sakiko')).toBe(true);
    const context = worldSceneContext(state)!;
    expect(context.nearbyPeople.find(person => person.id === 'protagonist-sakiko'))
      .toMatchObject({ distanceMetres: 25, canTalk: false });
    expect(context.encounter).toBeNull();
  });

  it('puts stable residents ahead of random passers-by and never drops them at the old eight-person limit', () => {
    const state = sportsState(), scene = state.scene!;
    const pedestrians = Array.from({ length: 10 }, (_, i) => sampleScenePerson('crowd', {
      id: 'test-' + i, x: scene.x + 1 + i / 10, z: scene.z, schoolWeighted: true,
    }));
    const resident = { ...pedestrians[0]!, id: 'bang-tomori', name: '高松灯', x: scene.x + 16 };
    const context = getSceneContext(scene, null, [], state.clock, [], [...pedestrians, resident])!;
    expect(context.nearbyPeople[0]?.id).toBe('bang-tomori');
    expect(context.nearbyPeople.some(person => person.id.startsWith('ped-'))).toBe(true);
  });

  it('uses the exact same ordered IDs for the display roster and narrative without mutating a save', () => {
    const state = sportsState(), before = structuredClone(state);
    expect(worldSceneContext(state)!.nearbyPeople.map(person => person.id))
      .toEqual(worldSceneRoster(state).map(row => row.person.id));
    expect(state).toEqual(before);
    expect(phoneAccess(state, 'sakiko').read).toBe(false);
  });

  it('excludes a distant or indoor counterpart instead of announcing a remote meeting', () => {
    const state = sportsState(), sakiko = personState(state, 'sakiko');
    sakiko.scene!.x = state.scene!.x + 35.01;
    expect(worldSceneContext(state)!.nearbyPeople.some(person => person.id === 'protagonist-sakiko')).toBe(false);
    sakiko.scene!.x = state.scene!.x;
    const room = getCampusInterior('dorm-room')!;
    sakiko.interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
    expect(worldSceneRoster(state).some(row => row.person.id === 'protagonist-sakiko')).toBe(false);
  });

  it('does not round 7.01 metres down into talking range and keeps the selected random passer-by', () => {
    const origin = { x: 0, z: 0 };
    const people = Array.from({ length: 12 }, (_, i) => sampleScenePerson('crowd', {
      id: 'test-' + i, x: i / 2, z: 0, schoolWeighted: true,
    }));
    const selected = people[11]!;
    const rows = selectSceneRoster(people, origin, false, selected.id);
    expect(rows[0]?.person.id).toBe(selected.id);
    expect(rows).toHaveLength(8);
    expect(selectSceneRoster([{ ...selected, x: 7.01 }], origin)[0]?.canTalk).toBe(false);
  });
});
