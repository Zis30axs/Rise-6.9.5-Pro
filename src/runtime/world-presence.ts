import type { CharacterContact, ScenePresence, WorldState } from '../frontend/types';
import { characterForPerson } from '../frontend/character-appearance';
import { sceneLandmarks } from '../frontend/scene-layout';
import { PROTAGONIST_PERSON_ID_LIST, protagonistPersonId, type ProtagonistId } from './dual-protagonists';
import { activeProtagonist, otherProtagonists, personState, protagonistNames, type PersonalState } from './protagonist-world';
import { getInteriorPeople, getInteriorPeopleForValidation, getSceneArea, getSceneContext, getScenePeople, scenePersonAnchors, SCENE_ENCOUNTER_DISTANCE, sceneLocationId, type ScenePerson } from './scene-context';
import { allResidentCast, residentPresence } from './npc-cast';
import { getCampusInterior } from './campus-interiors';
import { activeOtherSideNpcLocation } from './other-side';
import { isNpcUnderCourtRestriction } from './court-legal-effects';

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
  // Emma's standing legal partner also attends the actual court when retained
  // for this case, without changing other residents' authored daily schedules.
  const trial = state.courtroom?.active;
  if (state.interior?.roomId === 'court-hearing' && trial &&
    (trial.owner === 'emma' || trial.fee?.sherry) &&
    !isNpcUnderCourtRestriction(state,'majo-sherry',state.clock.day,state.clock.hour)) {
    const sherry = allResidentCast.find(person => person.id === 'majo-sherry');
    if (sherry) {
      const contact = state.contacts.find(row => row.id === sherry.id || row.sourcePersonId === sherry.id);
      people.push({
        id:sherry.id,name:contact?.name ?? sherry.name,candidateName:sherry.name,
        identity:'律师事务所法律协助人员',tags:['常驻人物','法律协助'],
        description:'随同当事人来到法庭，依据当前案卷整理证据。',
        x:-2.5,z:0.7,color:0x859c6d,portraitId:contact?.portraitId ?? characterForPerson(sherry.id),
        contactId:contact?.id ?? null,isMain:contact?.isMain ?? false,
      });
    }
  }
  // Expiring story-committed NPC locations supersede authored fallback schedules.
  // Never project an NPC twice or let a saved NPC event steal a playable identity.
  if (state.protagonists?.otherSideNpc) {
    const authoredIds = new Set(allResidentCast.map(row => row.id));
    for (let index = people.length - 1; index >= 0; index--) {
      const person = people[index]!;
      if (authoredIds.has(person.id) && activeOtherSideNpcLocation(state, person.id)) people.splice(index, 1);
    }
    for (const resident of allResidentCast) {
      if (hidden.includes(resident.id) || !authoredIds.has(resident.id)) continue;
      const override = activeOtherSideNpcLocation(state, resident.id);
      if (!override) continue;
      const inRoom = !!getCampusInterior(override.locationId);
      if (state.interior ? (!inRoom || state.interior.roomId !== override.locationId)
        : (inRoom || !scene || sceneLocationId(scene.areaId) !== override.locationId)) continue;
      const room = inRoom ? getCampusInterior(override.locationId) : null;
      const roomAnchor = room
        ? getInteriorPeopleForValidation(room.id).find(person => person.id === resident.id)
          ?? { x: room.spawn.x, z: room.spawn.z }
        : null;
      // Keep the resident at their real scheduled anchor if the override did not move them.
      // This also works in areas without a sceneLandmark (e.g. promenade).
      const scheduled = residentPresence(resident.id, state.clock);
      const original = scenePersonAnchors.find(anchor => anchor.id === scheduled?.anchorId);
      const originalArea = original && getSceneArea(original.x, original.z);
      const retained = original && originalArea && sceneLocationId(originalArea.id) === override.locationId
        ? { x: original.x + .6, z: original.z + .6 } : null;
      const outdoorAnchor = !inRoom ? retained ?? sceneLandmarks.find(row => sceneLocationId(row.id) === override.locationId) : null;
      if (!roomAnchor && !outdoorAnchor) continue;
      const contact = state.contacts.find(row => row.sourcePersonId === resident.id || row.id === resident.id);
      people.push({
        id: resident.id, name: contact?.name ?? resident.name, candidateName: resident.name,
        identity: '常驻居民', tags: ['常驻人物'],
        description: `${contact?.summary ? contact.summary.slice(0, 160) + '；' : ''}${override.status}`,
        x: roomAnchor?.x ?? outdoorAnchor?.x ?? 0, z: roomAnchor?.z ?? outdoorAnchor?.z ?? 0,
        color: 0x859c6d, portraitId: contact?.portraitId ?? characterForPerson(resident.id),
        contactId: contact?.id ?? null, isMain: contact?.isMain ?? false,
      });
    }
  }
  if (!state.protagonists) return people.filter(person => !isNpcUnderCourtRestriction(state,person.id,state.clock.day,state.clock.hour));
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
  return people.filter(person => !isNpcUnderCourtRestriction(state,person.id,state.clock.day,state.clock.hour));
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
