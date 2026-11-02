import type { CharacterContact, CharacterPortraitId, InteriorPresence, ScenePresence } from '../frontend/types';
import { affinityRelation } from './affinity-tiers';
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
  'takao-mountain': '高尾山风景区的室外山麓山道与接驳广场；可见参天杉木、登山步道起点、观光缆车站、极乐汤温泉入口与远处重叠的苍翠山峰。',
  circle: 'CiRCLE 现场屋门前的步行广场；可见一楼咖啡厅的落地窗、侧翼练团室入口，以及通往新宿大型商业区的人行道。店员月之森真里在咖啡厅里接待，尚未进入店内。',
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
  color: number;
  portraitId: CharacterPortraitId;
  contactId: string | null;
  isMain: boolean;
}
export interface ScenePersonAnchor { id: string; x: number; z: number; schoolWeighted: boolean }

/** Fixed accessible meeting points keep the same people across rendering, saving and generation. */
export const scenePersonAnchors: readonly ScenePersonAnchor[] = [
  { id: 'avenue-west', x: -2, z: 15, schoolWeighted: true },
  { id: 'avenue-east', x: 2, z: 20, schoolWeighted: true },
  { id: 'library-west', x: -2, z: -5, schoolWeighted: true },
  { id: 'library-east', x: 2, z: 0, schoolWeighted: true },
  { id: 'teaching-west', x: -2, z: -34, schoolWeighted: true },
  { id: 'teaching-east', x: 2, z: -36, schoolWeighted: true },
  { id: 'dorm-west', x: -47, z: -4, schoolWeighted: true },
  { id: 'dorm-east', x: -43, z: -3, schoolWeighted: true },
  { id: 'sports-west', x: 40, z: -11, schoolWeighted: true },
  { id: 'sports-east', x: 47, z: -9, schoolWeighted: true },
  { id: 'gate-west', x: -2, z: 29, schoolWeighted: true },
  { id: 'gate-east', x: 2, z: 32, schoolWeighted: true },
  { id: 'junction-west', x: -6, z: 49, schoolWeighted: true },
  { id: 'junction-east', x: 6, z: 47, schoolWeighted: true },
  { id: 'bookshop-west', x: -25, z: 56, schoolWeighted: false },
  { id: 'bookshop-east', x: -19, z: 56, schoolWeighted: false },
  { id: 'convenience-west', x: 18, z: 56, schoolWeighted: false },
  { id: 'convenience-east', x: 24, z: 56, schoolWeighted: false },
  { id: 'street-cafe', x: 48, z: 55.5, schoolWeighted: false },
  { id: 'bus-west', x: 45, z: 39.5, schoolWeighted: true },
  { id: 'bus-east', x: 50, z: 39.5, schoolWeighted: true },
  { id: 'park-west', x: 35, z: 80, schoolWeighted: false },
  { id: 'park-east', x: 40, z: 80, schoolWeighted: false },
];

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
    description: descriptions[identity.identity]!, x: anchor.x, z: anchor.z, color: colors[Math.floor(random() * colors.length)]!,
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
const RESIDENTIAL_INTERIOR_HOMES = new Set(['amaori-family-home', 'ouzuka-residence', 'sena-family-home', 'koto-apartment', 'koyanagi-home', 'nanoka-honoka-home', 'soyo-house']);
export function getInteriorPeopleForValidation(roomId: string): ScenePerson[] {
  if (roomId === 'court-hearing') return [
    {id:'court-judge',name:'审判长',candidateName:'审判长',identity:'法官',tags:['法庭'],
      description:'端坐于审判席，主持庭审与秩序。',x:0,z:-3.1,color:0x7f6a5b,
      portraitId:characterForPerson('court-judge'),contactId:null,isMain:false},
    {id:'court-clerk',name:'书记员',candidateName:'书记员',identity:'法院工作人员',tags:['法庭'],
      description:'在一侧核对卷宗并记录发言。',x:4.8,z:-1.4,color:0x7f6a5b,
      portraitId:characterForPerson('court-clerk'),contactId:null,isMain:false},
  ];
  if (roomId === 'legal-office') {
    const sherry = allResidentCast.find(row => row.id === 'majo-sherry');
    return sherry ? [{
      id: sherry.id, name: sherry.name, candidateName: sherry.name,
      identity: '律师事务所见习人员', tags: ['常驻人物', '法律专业', '律师职业'],
      description: '橘雪莉正整理案卷，准备陪同艾玛核对证据。',
      x: -2, z: 1.2, color: 0x859c6d, portraitId: characterForPerson(sherry.id),
      contactId: null, isMain: false,
    }] : [];
  }
  if (roomId === 'livehouse') {
    const taki = allResidentCast.find(row => row.id === 'bang-taki');
    return taki ? [{
      id: taki.id, name: taki.name, candidateName: taki.name,
      identity: 'Live House 工作人员', tags: ['常驻人物', '乐队'],
      description: taki.publicProfile, x: 2.2, z: 1.6, color: 0x859c6d,
      portraitId: characterForPerson(taki.id), contactId: null, isMain: false,
    }] : [];
  }
  if (RESIDENTIAL_INTERIOR_HOMES.has(roomId)) {
    return allResidentCast.filter(r => r.home === roomId).map((resident, idx) => ({
      id: resident.id, name: resident.name, candidateName: resident.name,
      identity: '住户', tags: ['常驻人物', '住户'],
      description: resident.publicProfile, x: -1.5 + idx * 1.2, z: 0.8,
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
      description: resident.publicProfile, x: visit?.x ?? 0, z: visit?.z ?? -2.2,
      color: 0x859c6d, portraitId: characterForPerson(resident.id), contactId: null, isMain: false,
    };
    return [person];
  });
}

/** Authored indoor people are separate from outdoor anchors and random pedestrians. */
export function getInteriorPeople(roomId: string, contacts: readonly CharacterContact[] = [], clock?: { hour: number; minute: number }, hiddenPersonIds: readonly string[] = []): ScenePerson[] {
  if (!clock) return [];
  if (roomId === 'court-hearing') return getInteriorPeopleForValidation(roomId);
  return getInteriorPeopleForValidation(roomId).flatMap(person => {
    if (hiddenPersonIds.includes(person.id)) return [];
    const presence = residentPresence(person.id, clock);
    if (!presence?.available || presence.locationId !== roomId) return [];
    const contact = contacts.find(contact => contact.sourcePersonId === person.id || contact.id === person.id);
    return [{ ...person, description: `${person.description}${presence.activity}。`, ...(contact ? { name: contact.name, description: contact.summary, portraitId: contact.portraitId, contactId: contact.id, isMain: contact.isMain } : {}) }];
  });
}

export function getScenePeople(scene: ScenePresence, contacts: readonly CharacterContact[] = [], clock?: {hour: number; minute: number}, hiddenPersonIds: readonly string[] = []): ScenePerson[] {
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
    people.push({id:resident.id,name:resident.name,candidateName:resident.name,identity:'常驻居民',tags:['常驻人物'],
      description:resident.publicProfile,x:anchor.x+.6,z:anchor.z+.6,color:0x859c6d,
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

export const SCENE_ENCOUNTER_DISTANCE = 7;
function relationshipOf(person: { id: string; contactId: string | null }, contacts: readonly CharacterContact[]) {
  const contact = contacts.find(row => row.id === person.contactId || row.id === person.id || row.sourcePersonId === person.id);
  return contact ? { relationship: affinityRelation(contact.affinity, contact.relationNote) } : {};
}
export function getSceneContext(scene: ScenePresence | null, interior: InteriorPresence | null = null, contacts: readonly CharacterContact[] = [], clock?: {hour: number; minute: number}, hiddenPersonIds: readonly string[] = [], population?: readonly ScenePerson[]) {
  if (interior) {
    const room = getCampusInterior(interior.roomId);
    if (!room) return null;
    const last = getInteriorActivity(room, interior.activityId, interior.lastRest, interior.lastStudy);
    const nearbyPeople = (population ?? getInteriorPeople(room.id, contacts, clock, hiddenPersonIds))
      .map(person => ({ ...person, ...relationshipOf(person, contacts), distanceMetres: Math.round(Math.hypot(person.x - interior.x, person.z - interior.z) * 10) / 10 }))
      .filter(person => person.distanceMetres <= 18);
    const encounter = nearbyPeople.find(person => person.id === scene?.encounterId && person.distanceMetres <= SCENE_ENCOUNTER_DISTANCE) ?? null;
    return {
      areaId: room.id, label: room.label, outdoors: false, skyVisible: false,
      position: { x: interior.x, z: interior.z, yaw: interior.yaw, unit: '示意米' },
      environment: room.description,
      nearbyLandmarks: [], nearbyPeople, encounter,
      exit: { parentLocationId: room.parentLocationId, description: '南侧房门返回进入前的室外位置；尚未执行离开。' },
      lastInteraction: last ? { id: last.id, label: last.label, result: last.result, alreadyCommitted: true, minutes: last.minutes, energyDelta: last.energyDelta } : null,
    };
  }
  if (!scene) return null;
  const area = getSceneArea(scene.x, scene.z);
  if (!area) return null;
  const people = population ?? getScenePeople(scene, contacts, clock, hiddenPersonIds);
  const nearby = people
    .map(person => ({ person, distance: Math.hypot(person.x - scene.x, person.z - scene.z) }))
    .filter(item => item.distance <= 18)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8);
  const personContext = (person: ScenePerson) => ({ id: person.id, name: person.name, identity: person.identity, tags: person.tags, description: person.description, portraitId: person.portraitId, contactId: person.contactId, isMain: person.isMain,
    outfit: residentOutfit(person.id), housing: housingForPerson(person.id)?.id ?? null, ...relationshipOf(person, contacts) });
  const encounter = people.find(person => person.id === scene.encounterId && Math.hypot(person.x - scene.x, person.z - scene.z) <= SCENE_ENCOUNTER_DISTANCE);
  return {
    areaId: area.id, label: area.label, outdoors: true, skyVisible: true,
    position: { x: scene.x, z: scene.z, yaw: scene.yaw, unit: '示意米' },
    environment: sceneEnvironments[area.id],
    nearbyLandmarks: sceneLandmarks
      .map(landmark => ({ id: landmark.id, label: landmark.label, distanceMetres: Math.round(Math.hypot(landmark.x - scene.x, landmark.z - scene.z)) }))
      .filter(landmark => landmark.distanceMetres <= 40).sort((a, b) => a.distanceMetres - b.distanceMetres).slice(0, 5),
    nearbyPeople: nearby.map(({ person, distance }) => ({ ...personContext(person), distanceMetres: Math.round(distance * 10) / 10 })),
    encounter: encounter ? personContext(encounter) : null,
  };
}
