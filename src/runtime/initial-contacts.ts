import type { CharacterContact } from '../frontend/types';
import { characterForPerson } from '../frontend/character-appearance';
import { bangFamilyCast, bangResidentCast, residentCast, watanareResidentCast, WATANARE_QUINTET_IDS } from './npc-cast';

/**
 * Opening affinity for people who already know each other. New meetings stay at 0.
 * One named step per kind of bond, on the saved -100..100 scale.
 */
export const STARTING_AFFINITY = {
  parent: 80,
  family: 76,
  dearest: 78,
  close: 62,
  familiar: 38,
  complicated: 50,
  strained: 29,
} as const;

export type StartingAffinityTier = keyof typeof STARTING_AFFINITY;
export type StartingOwner = 'soyo' | 'sakiko' | 'emma' | 'renako';

/** Viewpoint → already-known contact → bond. Strangers are absent and stay at 0. */
export const STARTING_RELATION: Record<StartingOwner, Record<string, StartingAffinityTier>> = {
  soyo: {
    'nagasaki-mother': 'parent',
    'protagonist-sakiko': 'complicated',
    'bang-tomori': 'close',
    'bang-mutsumi': 'close',
    'bang-anon': 'close',
    'bang-rana': 'familiar',
    'bang-taki': 'complicated',
  },
  sakiko: {
    'protagonist-soyo': 'complicated',
    'bang-mutsumi': 'dearest',
    'bang-uika': 'dearest',
    'bang-umiri': 'close',
    'bang-nyamu': 'familiar',
  },
  emma: {
    'majo-yuki': 'dearest',
    'majo-hiro': 'dearest',
    'majo-sherry': 'close',
    'majo-milia': 'close',
    'majo-meruru': 'strained',
    'majo-anan': 'strained',
    'majo-noa': 'familiar',
    'majo-leia': 'familiar',
    'majo-margo': 'familiar',
    'majo-nanoka': 'familiar',
    'majo-arisa': 'familiar',
    'majo-hanna': 'familiar',
    'majo-koko': 'familiar',
  },
  renako: {
    'watanare-miyoko': 'parent',
    'watanare-haruna': 'family',
    'watanare-mai': 'dearest',
    'watanare-ajisai': 'close',
    'watanare-satsuki': 'close',
    'watanare-kaho': 'close',
    'watanare-hiroki': 'familiar',
    'watanare-kippei': 'familiar',
    'watanare-koto-mother': 'familiar',
    'watanare-hitoe': 'familiar',
    'watanare-rene': 'familiar',
    'watanare-lucie': 'familiar',
    'watanare-seira': 'familiar',
    'watanare-youko': 'familiar',
    'watanare-michiru': 'familiar',
    'watanare-himiko': 'familiar',
    'watanare-suzuran': 'familiar',
    'watanare-chizuru': 'familiar',
    'watanare-miki': 'familiar',
  },
};

/** Exact opening numbers that do not match a named step. */
const STARTING_AFFINITY_VALUE: Partial<Record<StartingOwner, Readonly<Record<string, number>>>> = {
  renako: { 'watanare-ajisai': 80, 'watanare-mai': 75 },
};

/** Optional fact carried into prompts. The affinity number still comes from the table above. */
const STARTING_RELATION_NOTE: Partial<Record<StartingOwner, Readonly<Record<string, string>>>> = {
  soyo: {
    'protagonist-sakiko': '微尴尬的和解（昔日CRYCHIC破裂与解脱后的微妙分寸感，保留温情与试探）',
    'bang-taki': '欢喜冤家（虽常日常拌嘴，但同历旧团破碎与新团重生，互为可托付后背的默契队友）',
    'bang-anon': '嘴硬心软（日常互相嫌弃调侃，实则极依赖其打破心防的行动力）',
    'bang-mutsumi': '暗藏内疚与复杂牵挂（深知睦对自己的依恋，经历过退还黄瓜的刺痛，心怀愧意又不知如何面对）',
  },
  sakiko: {
    'protagonist-soyo': '微尴尬的和解（深知昔日伤害无法轻易抹去，在温情重拾的同时恪守体面分寸）',
    'bang-uika': '命运支柱（自幼仰望的星光，低谷时无条件接纳与守护自己的避风港）',
    'bang-nyamu': '商业妥协与舞台默契（虽有揭面旧怨与理念碰撞，但重组后已形成成熟的职业合作协作）',
  },
  renako: {
    'watanare-ajisai': '恋人（玲奈子与濑名紫阳花、王冢真唯三人知情同意的认真交往）',
    'watanare-mai': '恋人（玲奈子与王冢真唯、濑名紫阳花三人知情同意的认真交往）',
  },
};

export function startingAffinity(owner: StartingOwner, contactId: string): number {
  const override = STARTING_AFFINITY_VALUE[owner]?.[contactId];
  if (override !== undefined) return override;
  const tier = STARTING_RELATION[owner][contactId];
  if (!tier) throw new Error(`缺少开局好感：${owner} → ${contactId}`);
  return STARTING_AFFINITY[tier];
}

export function startingRelationNote(owner: StartingOwner, contactId: string): string | undefined {
  return STARTING_RELATION_NOTE[owner]?.[contactId];
}

function seed<T extends CharacterContact>(owner: StartingOwner, contact: T): T {
  const relationNote = startingRelationNote(owner, contact.id);
  return { ...contact, affinity: startingAffinity(owner, contact.id), ...(relationNote ? { relationNote } : {}) };
}

/** Already exchanged numbers during CRYCHIC, not a first-encounter unlock. */
export function knownProtagonistContact(id: 'soyo' | 'sakiko', name: string, owner: StartingOwner = id === 'sakiko' ? 'soyo' : 'sakiko'): CharacterContact {
  const contactId = `protagonist-${id}`;
  return seed(owner, {
    id: contactId, name, tag: '旧识 · 手机联系人',
    summary: '曾经同在 CRYCHIC 活动的旧识，至今保留着彼此的联系方式。',
    affinity: 0, status: '已交换联系方式',
    portraitId: characterForPerson(contactId), sourcePersonId: null, isMain: true,
  });
}

/** Emma already knows the original prisoners and Yuki; the former guard Honoka is not an automatic phone friend. */
export function emmaInitialFriendContacts(): CharacterContact[] {
  return residentCast.filter(person => person.id !== 'majo-emma' && person.id !== 'majo-honoka').map(person => seed('emma', {
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
  return watanareResidentCast.filter(person => person.id !== 'watanare-renako').map(person => seed('renako', {
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

/** Soyo's mother already lives with her. She is not a stranger met in the new city. */
export function soyoMotherContact(): CharacterContact {
  const person = bangFamilyCast.find(row => row.id === 'nagasaki-mother');
  if (!person) throw new Error('长崎夫人未登记为常驻家人');
  return seed('soyo', {
    id: person.id, name: person.name, tag: '家人 · 同住',
    summary: person.profile.split('\n')[0]?.slice(0, 500) || person.publicProfile,
    affinity: 0, status: '母女同住',
    portraitId: characterForPerson(person.id), sourcePersonId: person.id, isMain: true,
  });
}

/** Soyo already plays in MyGO!!!!! and kept Mutsumi from CRYCHIC. */
export function soyoInitialBandContacts(): CharacterContact[] {
  return [
    bandContact('bang-tomori', 'MyGO!!!!! · 乐队'),
    bandContact('bang-anon', 'MyGO!!!!! · 乐队'),
    bandContact('bang-taki', 'MyGO!!!!! · 乐队'),
    bandContact('bang-rana', 'MyGO!!!!! · 乐队'),
    bandContact('bang-mutsumi', '月之森同窗 · CRYCHIC 旧友'),
  ].map(contact => seed('soyo', contact));
}

/** Sakiko already plays in Ave Mujica. Other bands are not preloaded onto her phone. */
export function sakikoInitialBandContacts(): CharacterContact[] {
  return [
    bandContact('bang-mutsumi', 'Ave Mujica · 乐队'),
    bandContact('bang-uika', 'Ave Mujica · 乐队'),
    bandContact('bang-umiri', 'Ave Mujica · 乐队'),
    bandContact('bang-nyamu', 'Ave Mujica · 乐队'),
  ].map(contact => seed('sakiko', contact));
}

/** Everyone already on Soyo's phone when a new game begins. */
export function soyoInitialContacts(sakikoName: string): CharacterContact[] {
  return [
    knownProtagonistContact('sakiko', sakikoName, 'soyo'),
    ...soyoInitialBandContacts(),
    soyoMotherContact(),
  ];
}
