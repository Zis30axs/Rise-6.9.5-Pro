import type { CharacterContact, CharacterPortraitId, InteriorPresence, ScenePresence } from '../frontend/types';
import { contactRelationNote, affinityRelation } from './affinity-tiers';
import { allResidentCast, residentPresence } from './npc-cast';
import { housingForPerson, residentOutfit } from './majo-housing';
import { PROTAGONIST_PERSON_IDS } from './dual-protagonists';
import { characterForPerson } from '../frontend/character-appearance';
export type { ScenePresence } from '../frontend/types';
import { sceneAreas, sceneBounds, sceneLandmarks } from '../frontend/scene-layout';
import { getCampusInterior, getInteriorActivity } from './campus-interiors';

import { cafeVisitorSchedule, MARGO_CAFE_OWNER_ID, MARGO_CAFE_ROOM_ID } from './margo-cafe-venue';

/** Local scene coordinates are illustrative outdoor metres, not geographical coordinates. */
export function getSceneArea(x: number, z: number) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < sceneBounds.minX || x > sceneBounds.maxX || z < sceneBounds.minZ || z > sceneBounds.maxZ) return null;
  return sceneAreas.find(area => x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ) ?? null;
}

export function sceneLocationId(areaId: string): string {
  switch (areaId) {
    case 'residences': return 'dorm';
    case 'campus-cafe': return 'cafe';
    case 'south-gate': return 'gate';
    default: return areaId;
  }
}

export const sceneEnvironments: Readonly<Record<string, string>> = {
  library: '图书馆前庭的室外台阶和步道；可见图书馆入口、廊柱及两侧树木，尚未进入阅览室。',
  teaching: '教学楼前的室外广场；可见教学楼门廊、公告与连接校园环路的步道。',
  residences: '学生公寓外的宿舍院落；可见楼门、停放单车的位置与院落步道，尚未进入宿舍。',
  sports: '室外运动场；可见跑道、球场、球门与看台。',
  'campus-cafe': '校园咖啡店外的露台；可见遮阳篷、桌椅和玻璃店门，尚未进入店内。',
  promenade: '校园内的室外林荫步道；可见树木、长椅和通往南门及图书馆的道路。',
  'south-gate': '校园南门的室外通道；可见门柱、围栏与通往十字路口的人行道。',
  'construction-site': '高田校园南门街区的建设工地，书店西侧的围挡与施工架旁堆着木板、建材和安全帽。这里有临时体力工作，进入前应遵守现场安全安排。',
  bookshop: '街角书店门前的室外人行道；可见书店橱窗与遮雨篷，尚未进入店内。',
  convenience: '便利店门前的室外人行道；可见店招、商品橱窗与街边道路，尚未进入店内。',
  'street-cafe': '街边咖啡馆门前的室外露台；可见桌椅、店门与街道，尚未进入店内。',
  'bus-stop': '高田接驳站的室外候车区域；可见站牌、候车棚与十字路口。',
  'pocket-park': '室外口袋公园；可见步道、树木、长椅与小喷泉。',
  courthouse: '审判法庭前广场；可见古典石柱、黄金天平徽章与正义穹顶。东侧公开入口通往旁听席及法庭。',
  junction: '南门十字路口的室外道路；可见斑马线、交通灯与两侧商铺。',
  campus: '校园内的室外步行区；可见图书馆、教学楼及连接宿舍和运动场的步道。',
  neighborhood: '高田校园南门街区的室外公共空间；可见商铺、道路与通向公交站和公园的人行道。',
  home: '杂司谷的室外住宅区；可见住宅楼、街边树木和杂司谷接驳站，尚未进入家中。',
  commercial: '池袋／东池袋的室外步行广场；可见商场店面、街道和池袋接驳站，尚未进入商场。',
  downtown: '目白／目白台的豪华住宅大道与高密度高层公寓街区；可见目白台接驳站、喷泉广场、林立的豪华高层住宅塔楼、长崎家高层公寓，以及丰川家、王冢家与二阶堂家的外部宅邸。',
  'city-park': '神田川沿岸的室外绿地与步道；可见树木、休憩区域和神田川绿道站。',
  'grand-commercial': '新宿大型商业娱乐区的室外步行广场；可见大型商厦、霓虹招牌、写字楼商务中心、Live House 入口与 KTV 娱乐城，尚未进入店内。',
  highland: '坡脚巴士站对着一排树篱，石阶从低层民宅之间穿过，通往若叶家的院门。',
  'asukayama-park': '王子站一侧的飞鸟山公园入口。沿树荫下的步道向前，石阶下方是喷泉广场，路灯沿着石板路排列。',
  'takao-mountain': '高尾山风景区的室外山麓山道与接驳广场；可见参天杉木、登山步道起点、观光缆车站、极乐汤温泉入口与远处重叠的苍翠山峰。',
  circle: 'CiRCLE 现场屋门前的步行广场；可见一楼咖啡厅的落地窗、侧翼练团室入口，以及通往新宿大型商业区的人行道。店员月岛麻里奈在咖啡厅里接待，尚未进入店内。',
  'city-roads': '连接校园与远处住宅区、商业区、公园的室外道路；可见路面、人行道与过往车辆。',
};

export interface ScenePerson {
  id: string;
  name: string;
  /** Original seed-derived label remains an alias after a confirmed rename. */
  candidateName: string;
  identity: string;
  tags: string[];
  description: string;
  x: number;
  z: number;
  locationId?: string;
  pinned?: boolean;
  color: number;
  portraitId: CharacterPortraitId;
  contactId: string | null;
  isMain: boolean;
}
export interface ScenePersonAnchor { id: string; locationId: string; x: number; z: number; schoolWeighted: boolean }

/** Fixed accessible meeting points keep the same people across rendering, saving and generation. */
export const scenePersonAnchors: readonly ScenePersonAnchor[] = [
  { id: 'avenue-west', locationId: 'promenade', x: -2, z: 15, schoolWeighted: true },
  { id: 'avenue-east', locationId: 'promenade', x: 2, z: 20, schoolWeighted: true },
  { id: 'library-west', locationId: 'library', x: -3, z: -10, schoolWeighted: true },
  { id: 'library-east', locationId: 'library', x: 3, z: -12, schoolWeighted: true },
  { id: 'teaching-west', locationId: 'teaching', x: -2, z: -34, schoolWeighted: true },
  { id: 'teaching-east', locationId: 'teaching', x: 2, z: -36, schoolWeighted: true },
  { id: 'dorm-west', locationId: 'dorm', x: -47, z: -4, schoolWeighted: true },
  { id: 'dorm-east', locationId: 'dorm', x: -43, z: -3, schoolWeighted: true },
  { id: 'sports-west', locationId: 'sports', x: 40, z: -11, schoolWeighted: true },
  { id: 'sports-east', locationId: 'sports', x: 47, z: -9, schoolWeighted: true },
  { id: 'gate-west', locationId: 'gate', x: -2, z: 29, schoolWeighted: true },
  { id: 'gate-east', locationId: 'gate', x: 2, z: 32, schoolWeighted: true },
  { id: 'junction-west', locationId: 'junction', x: -6, z: 49, schoolWeighted: true },
  { id: 'junction-east', locationId: 'junction', x: 6, z: 47, schoolWeighted: true },
  { id: 'bookshop-west', locationId: 'bookshop', x: -25, z: 56, schoolWeighted: false },
  { id: 'bookshop-east', locationId: 'bookshop', x: -19, z: 56, schoolWeighted: false },
  { id: 'convenience-west', locationId: 'convenience', x: 18, z: 56, schoolWeighted: false },
  { id: 'convenience-east', locationId: 'convenience', x: 24, z: 56, schoolWeighted: false },
  { id: 'street-cafe', locationId: 'street-cafe', x: 48, z: 55.5, schoolWeighted: false },
  { id: 'bus-west', locationId: 'bus-stop', x: 45, z: 39.5, schoolWeighted: true },
  { id: 'bus-east', locationId: 'bus-stop', x: 50, z: 39.5, schoolWeighted: true },
  { id: 'park-west', locationId: 'pocket-park', x: 35, z: 80, schoolWeighted: false },
  { id: 'park-east', locationId: 'pocket-park', x: 40, z: 80, schoolWeighted: false },
  // Remaining campus spots and outer Tokyo districts.
  { id: 'cafe-terrace', locationId: 'cafe', x: 14, z: 1, schoolWeighted: true },
  { id: 'construction-west', locationId: 'construction-site', x: -50, z: 64, schoolWeighted: false },
  { id: 'courthouse-plaza', locationId: 'courthouse', x: -18, z: 95, schoolWeighted: false },
  { id: 'home-plaza', locationId: 'home', x: -182, z: 152, schoolWeighted: false },
  { id: 'home-lane', locationId: 'home', x: -176, z: 147, schoolWeighted: false },
  { id: 'downtown-fountain', locationId: 'downtown', x: -18, z: 186, schoolWeighted: false },
  { id: 'downtown-avenue', locationId: 'downtown', x: 12, z: 190, schoolWeighted: false },
  { id: 'commercial-plaza', locationId: 'commercial', x: 178, z: 150, schoolWeighted: false },
  { id: 'commercial-arcade', locationId: 'commercial', x: 188, z: 146, schoolWeighted: false },
  { id: 'city-park-bank', locationId: 'city-park', x: 176, z: -150, schoolWeighted: false },
  { id: 'city-park-trail', locationId: 'city-park', x: 188, z: -146, schoolWeighted: false },
  { id: 'grand-plaza', locationId: 'grand-commercial', x: -182, z: -150, schoolWeighted: false },
  { id: 'grand-promenade', locationId: 'grand-commercial', x: -172, z: -154, schoolWeighted: false },
  { id: 'takao-trail', locationId: 'takao-mountain', x: 4, z: -174, schoolWeighted: false },
  { id: 'circle-plaza', locationId: 'circle', x: -306, z: -154, schoolWeighted: false },
];

const SCENE_WIDE_HUB_IDS = new Set([
  'teaching', 'library', 'sports', 'commercial', 'downtown', 'grand-commercial', 'home', 'city-park', 'takao-mountain',
]);

export function sceneLocationCapacity(locationId: string): { maxResidents: number; maxPassersby: number } {
  return SCENE_WIDE_HUB_IDS.has(locationId) ? { maxResidents: 3, maxPassersby: 1 } : { maxResidents: 2, maxPassersby: 1 };
}

export function scenePersonLocationId(person: Pick<ScenePerson, 'x' | 'z' | 'locationId'>): string | null {
  if (person.locationId) return person.locationId;
  const area = getSceneArea(person.x, person.z);
  return area ? sceneLocationId(area.id) : null;
}

export function isSameScenePlace(person: Pick<ScenePerson, 'x' | 'z' | 'locationId'>, targetLocationId: string, indoors = false): boolean {
  if (indoors) return !person.locationId || person.locationId === targetLocationId;
  return scenePersonLocationId(person) === targetLocationId;
}

function offsetInsideAnchor(anchor: ScenePersonAnchor, personId: string): { x: number; z: number } {
  const hash = hashString(`resident-pos|${personId}`);
  const angle = ((hash & 0xffff) / 0x10000) * Math.PI * 2;
  const radius = 0.8 + (((hash >>> 16) & 0xff) / 255) * 1.1;
  const area = sceneAreas.find(item => sceneLocationId(item.id) === anchor.locationId);
  const rawX = anchor.x + Math.cos(angle) * radius;
  const rawZ = anchor.z + Math.sin(angle) * radius;
  if (!area) return { x: Math.round(rawX * 100) / 100, z: Math.round(rawZ * 100) / 100 };
  const x = Math.min(area.maxX - 0.5, Math.max(area.minX + 0.5, rawX));
  const z = Math.min(area.maxZ - 0.5, Math.max(area.minZ + 0.5, rawZ));
  return { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function randomFrom(seed: string) {
  let value = hashString(seed);
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(value ^ value >>> 15, value | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

export const sceneIdentities = ['同学', '教师', '职员', '居民', '访客', '店员', '骑手', '自由职业者'] as const;
const surnames = ['佐藤', '铃木', '高桥', '田中', '伊藤', '渡边', '山本', '中村', '小林', '加藤', '吉田', '山田', '松本', '井上', '清水', '斋藤'];
const givenNames = ['阳菜', '美咲', '结衣', '葵', '凛', '樱', '真由', '千夏', '优花', '遥', '莉子', '悠斗', '翔太', '莲', '拓海', '晴人'];

/** Campus/nearby stops: 60% students, remaining 40% split equally. Shops: all eight equally likely. */
export function sampleSceneIdentity(seed: string, schoolWeighted: boolean): { identity: string; tags: string[] } {
  const random = randomFrom(`identity|${seed}`);
  const sample = random();
  const identity = schoolWeighted
    ? sample < 0.6 ? sceneIdentities[0] : sceneIdentities[1 + Math.floor((sample - 0.6) / 0.4 * (sceneIdentities.length - 1))]!
    : sceneIdentities[Math.floor(sample * sceneIdentities.length)]!;
  return { identity, tags: [identity] };
}

export function sampleScenePerson(seed: string, anchor: ScenePersonAnchor): ScenePerson {
  const identity = sampleSceneIdentity(`${seed}|${anchor.id}`, anchor.schoolWeighted);
  const random = randomFrom(`appearance|${seed}|${anchor.id}`);
  const name = surnames[Math.floor(random() * surnames.length)]! + givenNames[Math.floor(random() * givenNames.length)]!;
  const colors = [0x699ca5, 0xb58c72, 0x7d8cb6, 0xb999c0, 0x859c6d, 0xc6a66f, 0xa47779, 0x7b9d95];
  const descriptions: Record<string, string> = {
    同学: '身边带着随身背包，像是刚下课，正留意周围的路。', 教师: '拿着资料，步履从容。', 职员: '穿着日常通勤服装，手里拿着随身物品。',
    居民: '穿着轻便，正沿附近的步道散步。', 访客: '不时看一眼周围的路标，像是第一次来这里。', 店员: '穿着整洁，正在店外短暂停留。',
    骑手: '带着配送用的随身装备，正查看附近的方向。', 自由职业者: '背着轻便的随身包，暂时停在路边。',
  };
  return {
    id: `ped-${hashString(seed).toString(36)}-${anchor.id}`, name, candidateName: name, ...identity,
    description: descriptions[identity.identity]!, x: anchor.x, z: anchor.z, locationId: anchor.locationId,
    color: colors[Math.floor(random() * colors.length)]!,
    portraitId: characterForPerson(`ped-${hashString(seed).toString(36)}-${anchor.id}`), contactId: null, isMain: false,
  };
}

/** The controlled protagonist's resident identity is never projected as a background NPC. */
export const hiddenProtagonistPersons = (state: { protagonists?: { accounts?: { active?: string } } }): readonly string[] => {
  const active = state.protagonists?.accounts?.active;
  const person = active ? (PROTAGONIST_PERSON_IDS as Record<string, string | undefined>)[active] : undefined;
  return person ? [person] : [];
};
/** Static identity/position authority for stored encounters; never a live population. */
const RESIDENTIAL_INTERIOR_HOMES = new Set(['residential-mutsumi', 'amaori-family-home', 'ouzuka-residence', 'sena-family-home', 'koto-apartment', 'koyanagi-home', 'nanoka-honoka-home', 'soyo-house']);
export function getInteriorPeopleForValidation(roomId: string): ScenePerson[] {
  if (roomId === 'court-hearing') return [
    {id:'court-judge',name:'审判长',candidateName:'审判长',identity:'法官',tags:['法庭'],
      description:'端坐于审判席，主持庭审与秩序。',x:0,z:-3.1,locationId:roomId,color:0x7f6a5b,
      portraitId:characterForPerson('court-judge'),contactId:null,isMain:false},
    {id:'court-clerk',name:'书记员',candidateName:'书记员',identity:'法院工作人员',tags:['法庭'],
      description:'在一侧核对卷宗并记录发言。',x:4.8,z:-1.4,locationId:roomId,color:0x7f6a5b,
      portraitId:characterForPerson('court-clerk'),contactId:null,isMain:false},
  ];
  if (roomId === 'legal-office') {
    const sherry = allResidentCast.find(row => row.id === 'majo-sherry');
    return sherry ? [{
      id: sherry.id, name: sherry.name, candidateName: sherry.name,
      identity: '律师事务所见习人员', tags: ['常驻人物', '法律专业', '律师职业'],
      description: '橘雪莉正整理案卷，准备陪同艾玛核对证据。',
      x: -2, z: 1.2, locationId: roomId, color: 0x859c6d, portraitId: characterForPerson(sherry.id),
      contactId: null, isMain: false,
    }] : [];
  }
  // Keep the former workplace as a valid historical encounter when reading old saves.
  // Current visibility is filtered by residentPresence below.
  if (roomId === 'ring-desk' || roomId === 'livehouse') {
    return ['bang-taki', 'bang-marina'].flatMap(id => {
      const person = allResidentCast.find(row => row.id === id);
      if (!person) return [];
      return [{
        id: person.id, name: person.name, candidateName: person.name,
        identity: id === 'bang-marina' ? 'CiRCLE 店员' : 'Live House 工作人员',
        tags: ['常驻人物', id === 'bang-marina' ? '店员' : '乐队'],
        description: person.publicProfile, x: id === 'bang-marina' ? -2.2 : 2.2, z: 1.6, locationId: roomId, color: 0x859c6d,
        portraitId: characterForPerson(person.id), contactId: null, isMain: false,
      }];
    });
  }
  if (roomId === 'circle-cafe' || roomId === 'circle-studio') {
    const marina = allResidentCast.find(row => row.id === 'bang-marina');
    return marina ? [{
      id: marina.id, name: marina.name, candidateName: marina.name,
      identity: 'CiRCLE 店员', tags: ['常驻人物', '店员'],
      description: marina.publicProfile, x: 0, z: -2.2, locationId: roomId, color: 0x859c6d,
      portraitId: characterForPerson(marina.id), contactId: null, isMain: false,
    }] : [];
  }
  if (RESIDENTIAL_INTERIOR_HOMES.has(roomId)) {
    return allResidentCast.filter(r => r.home === roomId).map((resident, idx) => ({
      id: resident.id, name: resident.name, candidateName: resident.name,
      identity: '住户', tags: ['常驻人物', '住户'],
      description: resident.publicProfile, x: -1.5 + idx * 1.2, z: 0.8, locationId: roomId,
      color: 0x859c6d, portraitId: characterForPerson(resident.id), contactId: null, isMain: false,
    }));
  }
  if (roomId !== MARGO_CAFE_ROOM_ID) return [];
  return allResidentCast.flatMap(resident => {
    const visit = cafeVisitorSchedule.find(visit => visit.id === resident.id);
    const owner = resident.id === MARGO_CAFE_OWNER_ID;
    if (!owner && !visit) return [];
    const person: ScenePerson = {
      id: resident.id, name: resident.name, candidateName: resident.name,
      identity: owner ? '咖啡馆店主' : '咖啡馆来客', tags: owner ? ['常驻人物', '店主'] : ['常驻人物', '来客'],
      description: resident.publicProfile, x: visit?.x ?? 0, z: visit?.z ?? -2.2, locationId: roomId,
      color: 0x859c6d, portraitId: characterForPerson(resident.id), contactId: null, isMain: false,
    };
    return [person];
  });
}

/** Authored indoor people are separate from outdoor anchors and random pedestrians. */
export function getInteriorPeople(roomId: string, contacts: readonly CharacterContact[] = [], clock?: { hour: number; minute: number; day?: number }, hiddenPersonIds: readonly string[] = []): ScenePerson[] {
  if (!clock) return [];
  if (roomId === 'court-hearing') return getInteriorPeopleForValidation(roomId);
  return getInteriorPeopleForValidation(roomId).flatMap(person => {
    if (hiddenPersonIds.includes(person.id)) return [];
    const presence = residentPresence(person.id, clock);
    if (!presence?.available || presence.locationId !== roomId) return [];
    const contact = contacts.find(contact => contact.sourcePersonId === person.id || contact.id === person.id);
    return [{ ...person, locationId: roomId, description: `${person.description}${presence.activity}。`, ...(contact ? { name: contact.name, description: contact.summary, portraitId: contact.portraitId, contactId: contact.id, isMain: contact.isMain } : {}) }];
  });
}

export function getScenePeople(scene: ScenePresence, contacts: readonly CharacterContact[] = [], clock?: {hour: number; minute: number; day?: number}, hiddenPersonIds: readonly string[] = []): ScenePerson[] {
  const hidden = new Set(hiddenPersonIds);
  const names = new Set<string>();
  const people = scenePersonAnchors.map(anchor => {
    const person = sampleScenePerson(scene.seed, anchor);
    const start = hashString(`unique-name|${scene.seed}|${anchor.id}`) % (surnames.length * givenNames.length);
    for (let offset = 0; names.has(person.name); offset++) {
      const index = (start + offset) % (surnames.length * givenNames.length);
      person.name = surnames[Math.floor(index / givenNames.length)]! + givenNames[index % givenNames.length]!;
    }
    names.add(person.name);
    person.candidateName = person.name;
    return person;
  });
  // Resident identity is independent of the pedestrian seed. Without a clock,
  // expose authored meeting anchors for save validation, not live presence.
  for (const resident of allResidentCast) {
    if (hidden.has(resident.id)) continue;
    const presence = clock ? residentPresence(resident.id, clock) : null;
    if (clock && !presence?.anchorId) continue;
    const anchorId = !clock && resident.id === MARGO_CAFE_OWNER_ID ? 'junction-west' : presence?.anchorId ?? resident.anchor;
    const anchor = scenePersonAnchors.find(a => a.id === anchorId);
    if (!anchor) continue;
    const coords = offsetInsideAnchor(anchor, resident.id);
    people.push({id:resident.id,name:resident.name,candidateName:resident.name,identity:'常驻居民',tags:['常驻人物'],
      description:resident.publicProfile,x:coords.x,z:coords.z,locationId:anchor.locationId,color:0x859c6d,
      portraitId:characterForPerson(resident.id),contactId:null,isMain:false});
  }
  const occupied = new Set(contacts.map(contact => contact.name));
  return people.map(person => {
    const contact = contacts.find(contact => contact.sourcePersonId === person.id || contact.id === person.id);
    const start = hashString(`confirmed-name|${scene.seed}|${person.id}`) % (surnames.length * givenNames.length);
    for (let offset = 0; !contact && !allResidentCast.some(r => r.id === person.id) && occupied.has(person.name); offset++) {
      const index = (start + offset) % (surnames.length * givenNames.length);
      person.name = surnames[Math.floor(index / givenNames.length)]! + givenNames[index % givenNames.length]!;
    }
    occupied.add(contact?.name ?? person.name);
    return contact ? { ...person, name: contact.name, description: contact.summary, portraitId: contact.portraitId, contactId: contact.id, isMain: contact.isMain } : person;
  });
}

export type ScenePersonKind = 'person' | 'passerby';

export function scenePersonKind(person: ScenePerson): ScenePersonKind {
  return person.id.startsWith('ped-') && !person.contactId && !person.isMain ? 'passerby' : 'person';
}

export function scenePersonLabel(person: ScenePerson): string {
  return scenePersonKind(person) === 'person' ? person.name : `陌生${person.identity}`;
}

export interface SceneRosterOptions {
  locationId?: string | null;
  seed?: string;
  clock?: { hour: number; minute: number; day?: number };
}

/** A single location-scoped roster for the map, location list and narrative request.
 * Enforces strict same-location / same-room membership and clean sparse street caps,
 * while retaining the active encounter, protagonists, saved contacts and pinned guests.
 */
export function selectSceneRoster<T extends ScenePerson>(
  population: readonly T[],
  position: { x: number; z: number },
  indoors = false,
  encounterId?: string | null,
  options?: SceneRosterOptions,
) {
  const fallbackArea = !indoors ? getSceneArea(position.x, position.z) : null;
  const targetLocationId = options?.locationId !== undefined
    ? options.locationId
    : (fallbackArea ? sceneLocationId(fallbackArea.id) : null);
  if (!indoors && !targetLocationId) return [];

  const seen = new Set<string>();
  const matched = population.flatMap(person => {
    if (seen.has(person.id)) return [];
    seen.add(person.id);
    const distance = Math.hypot(person.x - position.x, person.z - position.z);
    if (!Number.isFinite(distance)) return [];
    if (targetLocationId && !isSameScenePlace(person, targetLocationId, indoors)) return [];
    const kind = scenePersonKind(person);
    return [{ person, distance, kind, canTalk: true as const }];
  });

  const bucket = options?.clock
    ? `${options.clock.day ?? 1}:${Math.floor((options.clock.hour * 60 + options.clock.minute) / 120)}`
    : 'static';
  const slotKey = `${options?.seed ?? 'scene'}|${targetLocationId ?? 'room'}|${bucket}`;
  const isProtagonist = (person: ScenePerson) => Boolean((person as { protagonistId?: unknown }).protagonistId);
  const isProtectedFixed = (person: ScenePerson) =>
    person.id === encounterId || isProtagonist(person) || !!person.pinned || !!person.contactId;

  const fixed = matched.filter(row => row.kind !== 'passerby');
  const protectedFixed = fixed.filter(row => isProtectedFixed(row.person)).sort((a, b) =>
    Number(b.person.id === encounterId) - Number(a.person.id === encounterId) ||
    Number(isProtagonist(b.person)) - Number(isProtagonist(a.person)) ||
    Number(!!b.person.pinned) - Number(!!a.person.pinned) ||
    a.distance - b.distance || a.person.id.localeCompare(b.person.id),
  );
  const unpinnedResidents = fixed.filter(row => !isProtectedFixed(row.person)).sort((a, b) =>
    hashString(`${slotKey}|res|${a.person.id}`) - hashString(`${slotKey}|res|${b.person.id}`) ||
    a.person.id.localeCompare(b.person.id),
  );

  const cap = sceneLocationCapacity(targetLocationId ?? 'gate');
  const nonProtagonistProtected = protectedFixed.filter(row => !isProtagonist(row.person)).length;
  const residentSlots = indoors ? unpinnedResidents.length : Math.max(0, cap.maxResidents - nonProtagonistProtected);
  const keptFixed = [...protectedFixed, ...unpinnedResidents.slice(0, residentSlots)];
  const fixedNpcCount = keptFixed.filter(row => !isProtagonist(row.person)).length;

  const passers = matched.filter(row => row.kind === 'passerby');
  const selectedPasser = encounterId ? passers.filter(row => row.person.id === encounterId) : [];
  const candidatePassers = passers
    .filter(row => row.person.id !== encounterId)
    .sort((a, b) =>
      hashString(`${slotKey}|ped|${a.person.id}`) - hashString(`${slotKey}|ped|${b.person.id}`) ||
      a.distance - b.distance || a.person.id.localeCompare(b.person.id),
    );
  const passerSlots = indoors
    ? candidatePassers.length
    : Math.max(0, (fixedNpcCount < cap.maxResidents ? cap.maxPassersby : 0) - selectedPasser.length);
  const keptPassers = [...selectedPasser, ...candidatePassers.slice(0, passerSlots)];

  return [...keptFixed, ...keptPassers].sort((a, b) =>
    Number(a.kind === 'passerby') - Number(b.kind === 'passerby') ||
    Number(b.person.id === encounterId) - Number(a.person.id === encounterId) ||
    a.distance - b.distance || a.person.id.localeCompare(b.person.id),
  );
}

export const SCENE_POPULATION_INSTRUCTIONS = '【现场人物】scene.nearbyPeople 与当前地点的沙盘及地点人物列表共用实际在场名册，按已登记人物在前、随机行人在后的次序提供。此处列出的角色与路人均处于同一地点或同一房间（canTalk=true），可直接当面交谈与互动；优先承接这些人物和 scene.encounter，随机路人只作补充，不得替换、重命名或重复生成已有身份。knownToPlayer=false 表示主角尚不认识对方，不得凭空写出其姓名、私人经历或秘密，也不能未经当面交换就默认已加好友。跨区地图上显示的其他地点熟人或另一主角、其他房间、已离开或仍在路上的人，不得凭地图查看、联系人列表或历史正文判定此刻在场；地图浏览、筛选或标签收起不改变实际位置与知情。';

function relationshipOf(person: { id: string; contactId: string | null }, contacts: readonly CharacterContact[]) {
  const contact = contacts.find(row => row.id === person.contactId || row.id === person.id || row.sourcePersonId === person.id);
  return contact ? { relationship: affinityRelation(contact.affinity, contactRelationNote(contact)) } : {};
}
export function getSceneContext(scene: ScenePresence | null, interior: InteriorPresence | null = null, contacts: readonly CharacterContact[] = [], clock?: {hour: number; minute: number; day?: number}, hiddenPersonIds: readonly string[] = [], population?: readonly ScenePerson[]) {
  if (interior) {
    const room = getCampusInterior(interior.roomId);
    if (!room) return null;
    const last = getInteriorActivity(room, interior.activityId, interior.lastRest, interior.lastStudy);
    const nearbyPeople = selectSceneRoster(
      population ?? getInteriorPeople(room.id, contacts, clock, hiddenPersonIds),
      interior, true, scene?.encounterId,
      { locationId: room.id, seed: scene?.seed ?? 'interior', clock },
    ).map(({ person, kind, canTalk }) => ({
      ...person, ...relationshipOf(person, contacts),
      kind, canTalk, knownToPlayer: !!person.contactId,
    }));
    const encounter = nearbyPeople.find(person => person.id === scene?.encounterId && person.canTalk) ?? null;
    return {
      areaId: room.id, label: room.label, outdoors: room.outdoors === true, skyVisible: room.outdoors === true,
      position: { x: interior.x, z: interior.z, yaw: interior.yaw, unit: '示意米' },
      environment: room.description,
      nearbyLandmarks: [], nearbyPeople, encounter,
      exit: { parentLocationId: room.parentLocationId, description: room.outdoors !== undefined ? '沿来路返回接驳地点。' : '南侧房门返回进入前的室外位置；尚未执行离开。' },
      lastInteraction: last ? { id: last.id, label: last.label, result: last.result, alreadyCommitted: true, minutes: last.minutes, energyDelta: last.energyDelta } : null,
    };
  }
  if (!scene) return null;
  const area = getSceneArea(scene.x, scene.z);
  if (!area) return null;
  const areaLocationId = sceneLocationId(area.id);
  const people = population ?? getScenePeople(scene, contacts, clock, hiddenPersonIds);
  const nearby = selectSceneRoster(people, scene, false, scene.encounterId, {
    locationId: areaLocationId, seed: scene.seed, clock,
  });
  const personContext = (person: ScenePerson) => ({ id: person.id, name: person.name, identity: person.identity, tags: person.tags, description: person.description, portraitId: person.portraitId, contactId: person.contactId, isMain: person.isMain,
    outfit: residentOutfit(person.id), housing: housingForPerson(person.id)?.id ?? null, ...relationshipOf(person, contacts) });
  const encounter = nearby.find(entry => entry.person.id === scene.encounterId)?.person ?? null;
  return {
    areaId: area.id, label: area.label, outdoors: true, skyVisible: true,
    position: { x: scene.x, z: scene.z, yaw: scene.yaw, unit: '示意米' },
    environment: sceneEnvironments[area.id],
    nearbyLandmarks: sceneLandmarks
      .filter(landmark => sceneLocationId(landmark.id) === areaLocationId)
      .map(landmark => ({ id: landmark.id, label: landmark.label })),
    nearbyPeople: nearby.map(({ person, kind, canTalk }) => ({ ...personContext(person),
      kind, canTalk, knownToPlayer: !!person.contactId })),
    encounter: encounter ? personContext(encounter) : null,
  };
}
