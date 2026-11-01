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
import { residentSocialAgendaPresence } from './social-agenda';
import { resolveWeather, weatherNarrative } from './weather';

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
  const courtSummoned = new Set<string>();
  if (state.interior?.roomId === 'court-hearing' && trial &&
    (trial.owner === 'emma' || trial.fee?.sherry) &&
    trial.respondent !== '橘雪莉' &&
    !isNpcUnderCourtRestriction(state,'majo-sherry',state.clock.day,state.clock.hour)) {
    const sherry = allResidentCast.find(person => person.id === 'majo-sherry');
    if (sherry) {
      const contact = state.contacts.find(row => row.id === sherry.id || row.sourcePersonId === sherry.id);
      courtSummoned.add(sherry.id);
      people.push({
        id:sherry.id,name:contact?.name ?? sherry.name,candidateName:sherry.name,
        identity:'律师事务所法律协助人员',tags:['常驻人物','法律协助'],
        description:'随同当事人来到法庭，依据当前案卷整理证据。',
        x:-2.5,z:0.7,color:0x859c6d,portraitId:contact?.portraitId ?? characterForPerson(sherry.id),
        contactId:contact?.id ?? null,isMain:contact?.isMain ?? false,
      });
    }
  }
  // The client and opposing party are represented in their actual trial,
  // including temporarily introduced clients with no permanent city schedule.
  if (state.interior?.roomId === 'court-hearing' && trial) {
    const named = [
      ...(trial.source==='commission' ? [{name:trial.client,role:'委托人' as const,x:-2.4}] : []),
      ...(trial.respondent ? [{name:trial.respondent,role:'诉讼相对方' as const,x:2.4}] : []),
    ];
    const shown=new Set(people.map(person=>person.name));
    for (const entry of named) {
      if(shown.has(entry.name) || (Object.values(protagonistNames) as string[]).includes(entry.name)) continue;
      const resident=allResidentCast.find(row=>
        row.name===entry.name || row.id===entry.name || row.aliases.includes(entry.name));
      if(resident && PROTAGONIST_PERSON_ID_LIST.includes(resident.id)) continue;
      const id=resident?.id ?? 'court-person-'+(entry.role==='委托人'?'client':'respondent');
      if(isNpcUnderCourtRestriction(state,id,state.clock.day,state.clock.hour)) continue;
      const contact=state.contacts.find(row=>row.sourcePersonId===id || row.name===entry.name);
      courtSummoned.add(id);
      people.push({
        id,name:contact?.name ?? entry.name,candidateName:entry.name,
        identity:entry.role,tags:['法庭',entry.role],
        description:entry.role==='委托人'?'正在参与自己的案件，保留自身知情与表达。':'依据案卷身份应诉，保留自身意志与答辩空间。',
        x:entry.x,z:0.8,color:0x89766a,
        portraitId:contact?.portraitId ?? characterForPerson(id),
        contactId:contact?.id ?? null,isMain:contact?.isMain ?? false,
      });
      shown.add(entry.name);
    }
  }
  // Expiring story-committed NPC locations supersede authored fallback schedules.
  // Never project an NPC twice or let a saved NPC event steal a playable identity.
  if (state.protagonists?.otherSideNpc) {
    const authoredIds = new Set(allResidentCast.map(row => row.id));
    for (let index = people.length - 1; index >= 0; index--) {
      const person = people[index]!;
      if (!courtSummoned.has(person.id) && authoredIds.has(person.id) && activeOtherSideNpcLocation(state, person.id)) people.splice(index, 1);
    }
    for (const resident of allResidentCast) {
      if (hidden.includes(resident.id) || !authoredIds.has(resident.id) || courtSummoned.has(resident.id)) continue;
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

  // Private, committed meeting itineraries take precedence over authored
  // resident routines and temporary off-screen hints. Neither the planned
  // departure nor a missed meeting teleports a resident into the room.
  if (state.protagonists) for (const resident of allResidentCast) {
    if (hidden.includes(resident.id) || courtSummoned.has(resident.id)) continue;
    const agenda = residentSocialAgendaPresence(state,resident.id);
    if (!agenda) continue;
    for (let i=people.length-1;i>=0;i--) if(people[i]?.id===resident.id) people.splice(i,1);
    if (agenda.phase!=='present') continue;
    const room=getCampusInterior(agenda.locationId);
    if (state.interior ? !room || state.interior.roomId!==room.id :
      !!room || !scene || sceneLocationId(scene.areaId)!==agenda.locationId) continue;
    const roomAnchor=room ? getInteriorPeopleForValidation(room.id).find(person=>person.id===resident.id)
      ??{x:room.spawn.x,z:room.spawn.z}:null;
    const outdoorAnchor=!room?scenePersonAnchors.find(anchor=>{
      const area=getSceneArea(anchor.x,anchor.z);
      return area && sceneLocationId(area.id)===agenda.locationId && anchor.id===resident.id;
    })??sceneLandmarks.find(row=>sceneLocationId(row.id)===agenda.locationId):null;
    const anchor=roomAnchor??outdoorAnchor;
    if(!anchor)continue;
    const contact=state.contacts.find(row=>row.id===resident.id||row.sourcePersonId===resident.id);
    people.push({id:resident.id,name:contact?.name??resident.name,candidateName:resident.name,
      identity:'常驻居民',tags:['常驻人物'],description:agenda.detail,
      x:anchor.x,z:anchor.z,color:0x859c6d,portraitId:contact?.portraitId??characterForPerson(resident.id),
      contactId:contact?.id??null,isMain:contact?.isMain??false});
  }
  if (!state.protagonists) return people.filter(person => !isNpcUnderCourtRestriction(state,person.id,state.clock.day,state.clock.hour));
  // A formal summons supersedes other playable characters' ordinary scene
  // projection only while this hearing is live. Their saved personal position
  // and point-of-view are never overwritten by the court scene projection.
  const courtAttendees = new Set<ProtagonistId>();
  if (state.interior?.roomId === 'court-hearing' && trial?.fee) {
    for (const owner of otherProtagonists(activeProtagonist(state))) {
      const summoned = trial.fee.defendant === protagonistNames[owner];
      const counsel = trial.fee.lawyer === owner;
      if (!summoned && !counsel) continue;
      courtAttendees.add(owner);
      const id = protagonistSceneId(owner), contact = protagonistContact(state.contacts, owner);
      people.push({
        id,protagonistId:owner,name:contact?.name ?? protagonistNames[owner],
        candidateName:protagonistNames[owner],identity:summoned?'被告当事人':'法律协助人员',
        tags:['法庭','主角',summoned?'被告':'协助'],
        description:summoned?'应诉并保留独立知情范围与人格立场。':'协助整理案卷与出庭论证。',
        x:summoned?2.4:-2.4,z:0.8,color:0x859c6d,
        portraitId:contact?.portraitId ?? characterForPerson(id),
        contactId:contact?.id ?? null,isMain:true,
      });
    }
  }
  for (const owner of otherProtagonists(activeProtagonist(state))) {
    if (courtAttendees.has(owner)) continue;
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
  const scene = getSceneContext(worldScenePresence(state), state.interior, state.contacts, state.clock, [], worldScenePeople(state));
  if (!scene) return null;
  return { ...scene, weather: weatherNarrative(resolveWeather(state)) };
}

/** Hearing a nearby conversation does not confer physical access to another phone. */
export function protagonistsInTalkingRange(state: WorldState): (WorldScenePerson & { protagonistId: ProtagonistId })[] {
  const position = worldScenePosition(state);
  if (!position) return [];
  return worldScenePeople(state).filter((person): person is WorldScenePerson & { protagonistId: ProtagonistId } =>
    !!person.protagonistId && Math.hypot(person.x - position.x, person.z - position.z) <= SCENE_ENCOUNTER_DISTANCE);
}
