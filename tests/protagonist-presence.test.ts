import { describe, expect, it } from 'vitest';
import { createInitialState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState, phoneAccess } from '../src/runtime/protagonist-world';
import { narrativeContext, recordProtagonistNarrative } from '../src/runtime/protagonist-narrative';
import { settleBackgroundLife } from '../src/runtime/background-life';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { worldSceneContext, worldScenePeople } from '../src/runtime/world-presence';

function sportsMeeting() {
  let state = enableProtagonists(createInitialState());
  state = reduceState(state, { type: 'novel_travel', locationId: 'sports' });
  state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
  return reduceState(state, { type: 'novel_travel', locationId: 'sports' });
}

describe('saved protagonist presence', () => {
  it('includes the other protagonist after both independently arrive at the sports field', () => {
    const state = sportsMeeting();
    expect(personState(state, 'soyo').locationId).toBe('sports');
    expect(personState(state, 'soyo').scene).toMatchObject({ x: state.scene!.x, z: state.scene!.z });
    const context = worldSceneContext(state);
    expect(context!.nearbyPeople.map(person => person.id)).toContain('protagonist-soyo');
  });

  it('uses Emma\'s saved position rather than a second schedule-driven resident', () => {
    const state = sportsMeeting();
    const emma = personState(state, 'emma');
    emma.locationId = state.locationId;
    emma.scene = structuredClone(state.scene);
    emma.interior = null;
    const people = worldScenePeople(state);
    const projections = people.filter(person => person.id === 'majo-emma');
    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({ x: emma.scene!.x, z: emma.scene!.z });
  });

  it('keeps old location-only travel saves visible without writing their fallback positions', () => {
    const state = sportsMeeting();
    state.scene = null;
    personState(state, 'soyo').scene = null;
    const before = structuredClone(state);
    expect(worldSceneContext(state)!.nearbyPeople.map(person => person.id)).toContain('protagonist-soyo');
    expect(state).toEqual(before);
  });

  it('removes Emma\'s resident and protagonist projections when Emma becomes controlled', () => {
    const state = reduceState(sportsMeeting(), { type: 'switch_protagonist', target: 'emma' });
    const people = worldScenePeople(state);
    expect(people.some(person => person.id === 'majo-emma' || person.protagonistId === 'emma')).toBe(false);
    expect(people.filter(person => person.protagonistId).map(person => person.protagonistId)).toEqual(['soyo', 'sakiko', 'renako']);
  });

  it('excludes the controlled protagonist and projects only people in the same room', () => {
    let state = enableProtagonists(createInitialState());
    state = reduceState(state, { type: 'novel_travel', locationId: 'dorm-room' });
    const room = getCampusInterior('dorm-room')!;
    const sakiko = personState(state, 'sakiko');
    sakiko.locationId = room.id;
    sakiko.scene = structuredClone(state.scene);
    sakiko.interior = structuredClone(state.interior);
    const emma = personState(state, 'emma');
    emma.locationId = 'toyokawa-house';
    emma.interior = { roomId: 'toyokawa-house', ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
    expect(worldScenePeople(state).filter(person => person.protagonistId).map(person => person.protagonistId)).toEqual(['sakiko']);
    expect(worldSceneContext(state)!.nearbyPeople.map(person => person.id)).toContain('protagonist-sakiko');
  });

  it('includes a protagonist in the same location without granting access to her locked phone, and excludes other locations', () => {
    const state = sportsMeeting();
    state.protagonists!.devices.soyo.locked = true;
    personState(state, 'soyo').scene!.x = state.scene!.x - 20;
    expect(narrativeContext(state).counterpartsInScene.map(person => person.id)).toContain('soyo');
    expect(phoneAccess(state, 'soyo').read).toBe(false);
    const other = personState(state, 'soyo');
    other.locationId = 'library';
    other.scene = { x: -2, z: -12, yaw: 0, areaId: 'library', seed: state.scene!.seed, encounterId: null };
    state.protagonists!.devices.soyo.locked = false;
    expect(narrativeContext(state).counterpartsInScene.map(person => person.id)).not.toContain('soyo');
    expect(phoneAccess(state, 'soyo').read).toBe(false);
  });

  it('records witnessed dialogue in the same location but not at another location', () => {
    const state = sportsMeeting();
    personState(state, 'soyo').scene!.x = state.scene!.x - 20;
    const reply = { text: '|丰川祥子|平静|一起在这里坐一会儿吧。|', phoneMessages: [] };
    const after = structuredClone(state);
    after.story.push({ id: 'presence-dialogue', role: 'assistant', text: reply.text });
    const shared = recordProtagonistNarrative(state, after, reply, 'presence-dialogue');
    expect(personState(shared, 'soyo').journal.some(entry => entry.id === 'shared:presence-dialogue')).toBe(true);
    const remote = personState(after, 'soyo');
    remote.locationId = 'library';
    remote.scene = { x: -2, z: -12, yaw: 0, areaId: 'library', seed: state.scene!.seed, encounterId: null };
    const remoteResult = recordProtagonistNarrative(state, after, reply, 'presence-dialogue');
    expect(personState(remoteResult, 'soyo').journal.some(entry => entry.id === 'shared:presence-dialogue')).toBe(false);
  });

  it('pauses selected conversation partners in the same location while game time advances', () => {
    const before = sportsMeeting();
    personState(before, 'soyo').scene!.x = before.scene!.x - 12;
    before.scene!.encounterId = 'protagonist-soyo';
    const after = structuredClone(before);
    const minutes = after.clock.hour * 60 + after.clock.minute + 15;
    after.clock.hour = Math.floor(minutes / 60);
    after.clock.minute = minutes % 60;
    settleBackgroundLife(before, after);
    expect(after.protagonists!.backgroundLife!.people.soyo.pending).toBeNull();
    expect(after.protagonists!.backgroundLife!.people.soyo.events).toEqual(before.protagonists!.backgroundLife!.people.soyo.events);
  });
});
