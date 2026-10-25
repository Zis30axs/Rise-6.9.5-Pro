import type { CharacterContact, ScenePresence, WorldState } from '../frontend/types';
import { characterForPerson } from '../frontend/character-appearance';
import { sceneLandmarks } from '../frontend/scene-layout';
import { PROTAGONIST_PERSON_ID_LIST, protagonistPersonId, type ProtagonistId } from './dual-protagonists';
import { activeProtagonist, otherProtagonists, personState, protagonistNames, type PersonalState } from './protagonist-world';
import { getInteriorPeople, getSceneArea, getSceneContext, getScenePeople, SCENE_ENCOUNTER_DISTANCE, sceneLocationId, type ScenePerson } from './scene-context';

export interface WorldScenePerson extends ScenePerson {
  protagonistId?: ProtagonistId;
}

/** Existing resident IDs stay stable when their character becomes playable. */
export function protagonistSceneId(owner: ProtagonistId): string {
  return protagonistPersonId(owner) ?? `protagonist-${owner}`;
}

/** Old travel saves only retain a location; use that location's authored arrival point. */
export function worldScenePresence(state: Pick<PersonalState, 'scene' | 'locationId'>): ScenePresence | null {
  if (state.scene) return state.scene;
  const point = sceneLandmarks.find(landmark => sceneLocationId(landmark.id) === state.locationId);
  const area = point && getSceneArea(point.x, point.z);
  if (!point || !area || sceneLocationId(area.id) !== state.locationId) return null;
  return { x: point.x, z: point.z, yaw: 0, areaId: area.id, seed: 'novel-world-v1', encounterId: null };
}

export function worldScenePosition(state: Pick<PersonalState, 'scene' | 'locationId' | 'interior'>) {
  return state.interior ?? worldScenePresence(state);
}

function protagonistContact(contacts: readonly CharacterContact[], owner: ProtagonistId): CharacterContact | undefined {
  const personId = protagonistSceneId(owner);
  return contacts.find(contact => contact.sourcePersonId === personId || contact.id === personId)
    ?? contacts.find(contact => contact.id === `protagonist-${owner}`);
}

/** All live outdoor people, or the live occupants of the current room. No affinity filter. */
export function worldScenePeople(state: WorldState): WorldScenePerson[] {
  const scene = worldScenePresence(state);
  // Once a resident has a personal save, only that save may position her.
  const hidden = state.protagonists ? PROTAGONIST_PERSON_ID_LIST : [];
  const people: WorldScenePerson[] = state.interior
    ? getInteriorPeople(state.interior.roomId, state.contacts, state.clock, hidden)
    : scene ? getScenePeople(scene, state.contacts, state.clock, hidden) : [];
  if (!state.protagonists) return people;
  for (const owner of otherProtagonists(activeProtagonist(state))) {
    const personal = personState(state, owner);
    if (state.interior ? personal.interior?.roomId !== state.interior.roomId : !!personal.interior) continue;
    const position = worldScenePosition(personal);
    if (!position) continue;
    const id = protagonistSceneId(owner), contact = protagonistContact(state.contacts, owner);
    people.push({
      id, protagonistId: owner, name: contact?.name ?? protagonistNames[owner], candidateName: protagonistNames[owner],
      identity: '主角', tags: ['主角'], description: contact?.summary ?? '她正在这里。',
      x: position.x, z: position.z, color: 0x859c6d,
      portraitId: contact?.portraitId ?? characterForPerson(id), contactId: contact?.id ?? null, isMain: true,
    });
  }
  return people;
}

/** Rendering, talk targeting and model context share the same saved population. */
export function worldSceneContext(state: WorldState) {
  return getSceneContext(worldScenePresence(state), state.interior, state.contacts, state.clock, [], worldScenePeople(state));
}

/** Hearing a nearby conversation does not confer physical access to another phone. */
export function protagonistsInTalkingRange(state: WorldState): (WorldScenePerson & { protagonistId: ProtagonistId })[] {
  const position = worldScenePosition(state);
  if (!position) return [];
  return worldScenePeople(state).filter((person): person is WorldScenePerson & { protagonistId: ProtagonistId } =>
    !!person.protagonistId && Math.hypot(person.x - position.x, person.z - position.z) <= SCENE_ENCOUNTER_DISTANCE);
}
