import type { WorldState } from './types';
import type { SocialInvitation } from '../runtime/natural-interactions';
import { activeProtagonist, personState, protagonistNames } from '../runtime/protagonist-world';
import { protagonistSceneId, worldScenePosition, worldScenePresence, type WorldScenePerson } from '../runtime/world-presence';
import { agendaTargetProtagonist, agendaTargetResident, agreedMinute, socialMinute } from '../runtime/social-agenda';
import { residentById } from '../runtime/npc-cast';
import { SCENE_ENCOUNTER_DISTANCE } from '../runtime/scene-context';
import type { ProtagonistId } from '../runtime/dual-protagonists';
import type { NovelNpcPortraitId } from './novel-npc-portraits';

/** Pure presentation state. Neither creating a pair nor advancing dialogue alters an NPC's itinerary. */
export interface InvitationPortraitActor {
  id: string;
  speaker: string;
  aliases: readonly string[];
  portraitId: NovelNpcPortraitId | null;
  live2d: boolean;
}
export interface NovelInvitationPortraitPair {
  invitationId: string;
  left: InvitationPortraitActor;
  right: InvitationPortraitActor;
}
export interface InvitationDialogueRow {
  speaker: string;
  emotion: string;
  entryId?: string;
  viewpoint?: string;
}
export interface NovelInvitationPortraitFocus {
  invitationId: string;
  entryId: string;
  viewpoint: string;
  speaking: 'left' | 'right' | null;
  leftEmotion: string;
  rightEmotion: string;
  /** A third person's line should retain the original single-speaker presentation. */
  unrelatedSpeaker: boolean;
}

const protagonistAliases: Record<ProtagonistId, readonly string[]> = {
  soyo: ['长崎素世', '長崎素世', '素世', 'soyo'],
  sakiko: ['丰川祥子', '豊川祥子', '祥子', 'sakiko'],
  emma: ['樱羽艾玛', '櫻羽艾瑪', '艾玛', '艾瑪', 'emma', 'majo-emma'],
  renako: ['甘织玲奈子', '甘織玲奈子', '玲奈子', '玲奈酱', '玲奈蹦', 'renako', 'watanare-renako'],
};
const narratorLabels = new Set(['', '旁白', '叙述', 'narrator', '你的行动']);
const unique = (strings: readonly (string | undefined | null)[]): string[] =>
  [...new Set(strings.map(text => text?.trim()).filter((text): text is string => !!text))];

function protagonistActor(owner: ProtagonistId): InvitationPortraitActor {
  const name = protagonistNames[owner];
  return {
    id: protagonistSceneId(owner), speaker: name,
    aliases: unique([name, owner, protagonistSceneId(owner), ...protagonistAliases[owner]]),
    portraitId: null, live2d: owner === 'soyo',
  };
}
function guestActor(person: WorldScenePerson, state: WorldState): InvitationPortraitActor {
  if (person.protagonistId) return protagonistActor(person.protagonistId);
  const resident = residentById(person.id);
  const contacts = state.contacts.filter(c => c.id === person.id || c.sourcePersonId === person.id || c.id === person.contactId);
  return {
    id: person.id,
    // The worldbook name selects the existing authored expressions, not an arbitrary nickname.
    speaker: resident?.name ?? person.candidateName ?? person.name,
    aliases: unique([person.id, resident?.name, ...(resident?.aliases ?? []), person.name,
      person.candidateName, ...contacts.map(c => c.name)]),
    portraitId: person.portraitId ?? null, live2d: false,
  };
}
function nearPlayer(state: WorldState, person: WorldScenePerson): boolean {
  if (state.interior) return true; // worldScenePeople is already filtered to this room.
  const at = worldScenePosition(state);
  return !!at && Math.hypot(person.x - at.x, person.z - at.z) <= SCENE_ENCOUNTER_DISTANCE;
}
/** Outdoor coordinates can match across districts. Both protagonists need the
 *  same actual room/area, not merely similar x/z values on separate maps. */
function presentProtagonist(state: WorldState, other: ProtagonistId): boolean {
  const person = personState(state, other);
  const playerRoom = state.interior?.roomId ?? null, otherRoom = person.interior?.roomId ?? null;
  if (playerRoom || otherRoom) return !!playerRoom && playerRoom === otherRoom;
  const here = worldScenePresence(state), there = worldScenePresence(person);
  return person.locationId === state.locationId &&
    !!here && !!there && here.areaId === there.areaId;
}
function actualPartner(state: WorldState, people: readonly WorldScenePerson[],
  invite: SocialInvitation,
  current: ProtagonistId): WorldScenePerson | undefined {
  const targetProtagonist = agendaTargetProtagonist(state, invite);
  if (invite.owner !== current && targetProtagonist !== current) return undefined;
  if (invite.owner !== current) {
    return presentProtagonist(state, invite.owner) ? people.find(person => person.protagonistId === invite.owner && nearPlayer(state, person)) : undefined;
  }
  if (targetProtagonist === current) return undefined; // Never render the player twice.
  if (targetProtagonist) return presentProtagonist(state, targetProtagonist) ? people.find(person => person.protagonistId === targetProtagonist && nearPlayer(state, person)) : undefined;
  const personId = agendaTargetResident(state, invite);
  return people.find(person => (personId ? person.id === personId : person.id === invite.targetId ||
    person.contactId === invite.targetId) && nearPlayer(state, person));
}

/**
 * The room/position comes from the authoritative world population, not a text
 * assertion, an invited NPC's planned arrival or an expired invitation.
 */
export function resolveNovelInvitationPortraitPair(state: WorldState,
  scenePeople: readonly WorldScenePerson[]): NovelInvitationPortraitPair | null {
  if (!state.protagonists) return null;
  const current = activeProtagonist(state), now = socialMinute(state);
  const invitations = state.protagonists.socialInvitations ?? [];
  for (let index = invitations.length - 1; index >= 0; index--) {
    const invite = invitations[index]!;
    const person = actualPartner(state, scenePeople, invite, current);
    if (!person) continue;
    // The face-to-face exchange can show both participants at the moment it happens,
    // even if the agreed meeting is tomorrow. It must not become a permanent pair.
    const discussingInPerson = invite.source === 'meeting' &&
      now >= invite.createdAt && now - invite.createdAt <= 30;
    const due = agreedMinute(invite);
    const agenda = invite.agenda;
    const leave = agenda?.steps.find(step => step.kind === 'leave');
    const formallyMeeting = invite.status === 'accepted' &&
      (!agenda || (agenda.status === 'scheduled' && !leave?.done && now < (leave?.at ?? due + 240))) &&
      (agenda ? !!agenda.steps.find(step => step.kind === 'arrive')?.done
        : now >= due - 180 && now <= due + 240) &&
      (state.interior?.roomId ?? state.locationId) === invite.locationId &&
      // For scheduled resident NPCs, only a recorded arrival constitutes presence.
      (!agenda || !agendaTargetResident(state, invite) ||
        !!agenda.steps.find(step => step.kind === 'arrive')?.done);
    if (!discussingInPerson && !formallyMeeting) continue;
    return { invitationId: invite.id, left: protagonistActor(current), right: guestActor(person, state) };
  }
  return null;
}

function matches(actor: InvitationPortraitActor, speaker: string): boolean {
  const normalized = speaker.trim().toLowerCase();
  return !!normalized && actor.aliases.some(alias => alias.toLowerCase() === normalized);
}
function speakingSide(speaker: string, pair: NovelInvitationPortraitPair): 'left' | 'right' | null {
  const left = matches(pair.left, speaker), right = matches(pair.right, speaker);
  return left === right ? null : left ? 'left' : 'right';
}

/**
 * Each side retains only its own *past* expression within the current scene
 * entry. Clicking back never leaks the emotion of a future line.
 */
export function novelInvitationPortraitFocus(rows: readonly InvitationDialogueRow[],
  cursor: number, pair: NovelInvitationPortraitPair): NovelInvitationPortraitFocus {
  const current = rows[cursor];
  const raw = current?.speaker.trim() ?? '';
  const speaking = speakingSide(raw, pair);
  const unrelatedSpeaker = !narratorLabels.has(raw) && !speaking;
  let leftEmotion = '平静', rightEmotion = '平静';
  let foundLeft = false, foundRight = false;
  for (let index = cursor; index >= 0 && (!foundLeft || !foundRight); index--) {
    const row = rows[index]!;
    if (current?.entryId !== row.entryId || current?.viewpoint !== row.viewpoint) break;
    const side = speakingSide(row.speaker, pair);
    if (side === 'left' && !foundLeft) { leftEmotion = row.emotion; foundLeft = true; }
    if (side === 'right' && !foundRight) { rightEmotion = row.emotion; foundRight = true; }
  }
  return { invitationId: pair.invitationId, entryId: current?.entryId ?? '', viewpoint: current?.viewpoint ?? '',
    speaking, leftEmotion, rightEmotion, unrelatedSpeaker };
}
