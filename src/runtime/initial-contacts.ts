import type { CharacterContact } from '../frontend/types';
import { characterForPerson } from '../frontend/character-appearance';
import { bangResidentCast, residentCast, watanareResidentCast, WATANARE_QUINTET_IDS } from './npc-cast';

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

/** Emma already knows the original prisoners and Yuki; the former guard Honoka is not an automatic phone friend. */
export function emmaInitialFriendContacts(): CharacterContact[] {
  return residentCast.filter(person => person.id !== 'majo-emma' && person.id !== 'majo-honoka').map(person => ({
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

const bandContact = (id: string, tag: string): CharacterContact => {
  const person = bangResidentCast.find(row => row.id === id);
  if (!person) throw new Error('乐队常驻人物缺失：' + id);
  return {
    id: person.id, name: person.name, tag, summary: person.publicProfile,
    affinity: 0, status: '已互加好友',
    portraitId: characterForPerson(person.id), sourcePersonId: person.id, isMain: true,
  };
};

/** Soyo already plays in MyGO!!!!! and kept Mutsumi from CRYCHIC. */
export function soyoInitialBandContacts(): CharacterContact[] {
  return [
    bandContact('bang-tomori', 'MyGO!!!!! · 乐队'),
    bandContact('bang-anon', 'MyGO!!!!! · 乐队'),
    bandContact('bang-taki', 'MyGO!!!!! · 乐队'),
    bandContact('bang-rana', 'MyGO!!!!! · 乐队'),
    bandContact('bang-mutsumi', '月之森同窗 · CRYCHIC 旧友'),
  ];
}

/** Sakiko already plays in Ave Mujica. Other bands are not preloaded onto her phone. */
export function sakikoInitialBandContacts(): CharacterContact[] {
  return [
    bandContact('bang-mutsumi', 'Ave Mujica · 乐队'),
    bandContact('bang-uika', 'Ave Mujica · 乐队'),
    bandContact('bang-umiri', 'Ave Mujica · 乐队'),
    bandContact('bang-nyamu', 'Ave Mujica · 乐队'),
  ];
}
