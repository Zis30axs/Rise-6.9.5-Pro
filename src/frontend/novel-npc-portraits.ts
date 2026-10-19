import { characterForPerson } from './character-appearance';

export type NovelNpcPortraitId = ReturnType<typeof characterForPerson>;
export interface NovelPortraitPerson {
  readonly id: string;
  readonly name: string;
  readonly portraitId?: NovelNpcPortraitId;
  readonly sourcePersonId?: string | null;
  readonly contactId?: string | null;
  readonly candidateName?: string;
}
export interface NovelNpcPortraitContext {
  readonly contacts: readonly NovelPortraitPerson[];
  /** The saved population, not a distance-filtered list, also supports reading earlier dialogue. */
  readonly scenePeople: readonly NovelPortraitPerson[];
  readonly encounterId?: string | null;
}

const nonNpcSpeakers = new Set(['', '旁白', '叙述', 'narrator', '我', '你', '玩家', '主角', '你的行动', '素世', '长崎素世', '長崎素世', '長崎そよ', 'soyo']);

/** Resolve existing identities only. A model name or an unknown speaker never creates a new NPC. */
export function resolveNovelNpcPortrait(speaker: string, context: NovelNpcPortraitContext): NovelNpcPortraitId | null {
  const name = speaker.trim();
  if (nonNpcSpeakers.has(name.toLowerCase())) return null;
  const identities: { ids: Set<string>; names: Set<string>; portraitId: NovelNpcPortraitId; encounter: boolean }[] = [];
  const sceneIds = new Set<string>();
  const duplicateSceneIds = new Set<string>();
  for (const person of context.scenePeople) {
    if (sceneIds.has(person.id)) duplicateSceneIds.add(person.id);
    sceneIds.add(person.id);
  }
  for (const person of context.scenePeople) {
    if (!person.id.trim() || !person.name.trim() || duplicateSceneIds.has(person.id)) continue;
    const matches = context.contacts.filter(contact => contact.sourcePersonId === person.id || contact.id === person.id || contact.id === person.contactId);
    if (matches.length > 1) continue;
    const contact = matches[0];
    identities.push({ ids: new Set([person.id, ...(contact ? [contact.id] : [])]),
      names: new Set([person.name.trim(), person.candidateName?.trim() ?? '', ...(contact ? [contact.name.trim()] : [])].filter(Boolean)),
      portraitId: contact?.portraitId ?? person.portraitId ?? characterForPerson(person.id), encounter: person.id === context.encounterId });
  }
  for (const person of context.contacts) {
    if (!person.id.trim() || !person.name.trim() || identities.some(identity => identity.ids.has(person.id))) continue;
    identities.push({ ids: new Set([person.id, ...(person.sourcePersonId ? [person.sourcePersonId] : [])]), names: new Set([person.name.trim()]),
      portraitId: person.portraitId ?? characterForPerson(person.sourcePersonId ?? person.id), encounter: false });
  }
  const ids = identities.filter(identity => identity.ids.has(name));
  if (ids.length) return ids.length === 1 ? ids[0].portraitId : null;

  const names = identities.filter(identity => identity.names.has(name));
  if (names.length === 1) return names[0].portraitId;
  if (names.length < 2) return null;

  // Only the explicit current conversation target can disambiguate a name;
  // record order, contact status text and partial names are not identity proof.
  const encounters = names.filter(identity => identity.encounter);
  return encounters.length === 1 ? encounters[0].portraitId : null;
}
