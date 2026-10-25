import type { CharacterContact } from '../frontend/types';
import { characterForPerson } from '../frontend/character-appearance';
import { residentCast, watanareResidentCast, WATANARE_QUINTET_IDS } from './npc-cast';

/** Already exchanged numbers during CRYCHIC, not a first-encounter unlock. */
export function knownProtagonistContact(id: 'soyo' | 'sakiko', name: string): CharacterContact {
  const contactId = `protagonist-${id}`;
  return {
    id: contactId, name, tag: '旧识 · 手机联系人',
    summary: '曾经同在 CRYCHIC 活动的旧识，至今保留着彼此的联系方式。',
    affinity: 0, status: '已交换联系方式',
    portraitId: characterForPerson(contactId), sourcePersonId: null, isMain: true,
  };
}

/** Emma already knows the other 12 residents and Yuki at game start. */
export function emmaInitialFriendContacts(): CharacterContact[] {
  return residentCast.filter(person => person.id !== 'majo-emma').map(person => ({
    id: person.id, name: person.name,
    tag: person.id === 'majo-yuki' ? '挚友 · 同住' : '牢屋敷旧识 · 手机好友',
    summary: person.profile.split('\n')[0]?.slice(0, 500) || person.publicProfile,
    affinity: 0, status: '已互加好友',
    portraitId: characterForPerson(person.id), sourcePersonId: person.id, isMain: true,
  }));
}

/** Renako already knows the Quintet, her family, relatives, and Watanare acquaintances at game start. */
export function renakoInitialFriendContacts(): CharacterContact[] {
  const quintet = new Set<string>(WATANARE_QUINTET_IDS);
  const family = new Set<string>(['watanare-haruna', 'watanare-miyoko']);
  return watanareResidentCast.filter(person => person.id !== 'watanare-renako').map(person => ({
    id: person.id, name: person.name,
    tag: family.has(person.id) ? '家人 · 同住' : quintet.has(person.id) ? '芦谷五人组 · 挚友' : '芦谷旧识与亲友 · 手机好友',
    summary: person.profile.split('\n')[0]?.slice(0, 500) || person.publicProfile,
    affinity: 0, status: '已互加好友',
    portraitId: characterForPerson(person.id), sourcePersonId: person.id, isMain: true,
  }));
}
