import type { CharacterContact, CharacterPortraitId, InteriorPresence, ScenePresence } from '../frontend/types';
import { residentCast, residentPresence } from './npc-cast';
import { housingForPerson, residentOutfit } from './majo-housing';
import { characterForPerson } from '../frontend/character-appearance';
export type { ScenePresence } from '../frontend/types';
import { sceneAreas, sceneBounds, sceneLandmarks } from '../frontend/scene-layout';
import { getCampusInterior, getInteriorActivity } from './campus-interiors';

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
  bookshop: '街角书店门前的室外人行道；可见书店橱窗与遮雨篷，尚未进入店内。',
  convenience: '便利店门前的室外人行道；可见店招、商品橱窗与街边道路，尚未进入店内。',
  'street-cafe': '街边咖啡馆门前的室外露台；可见桌椅、店门与街道，尚未进入店内。',
  'bus-stop': '南门公交站的室外候车区域；可见站牌、候车棚与十字路口。',
  'pocket-park': '室外口袋公园；可见步道、树木、长椅与小喷泉。',
  junction: '南门十字路口的室外道路；可见斑马线、交通灯与两侧商铺。',
  campus: '校园内的室外步行区；可见图书馆、教学楼及连接宿舍和运动场的步道。',
  neighborhood: '南门街区的室外公共空间；可见商铺、道路与通向公交站和公园的人行道。',
  home: '家附近的室外住宅区；可见住宅楼、街边树木和家园公交站，尚未进入家中。',
  commercial: '城市商业区的室外步行广场；可见商场店面、街道和商业区公交站，尚未进入商场。',
  downtown: '市中心区的街道与步行广场；可见市中心站、商店和丰川家的外部建筑。丰川家私人区域并非公共场所，尚未进入。',
  'city-park': '城市公园的室外绿地与步道；可见树木、休憩区域和公园公交站。',
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
const surnames = ['林', '陈', '周', '王', '李', '吴', '郑', '徐', '沈', '许', '叶', '方', '顾', '陆', '赵', '宋'];
const givenNames = ['予安', '知夏', '嘉宁', '书言', '明远', '思齐', '以辰', '若岚', '景行', '亦舒', '子墨', '向晚', '清和', '星遥', '可欣', '言川'];

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
    同学: '身边带着书包，像是刚下课，正留意周围的路。', 教师: '拿着资料，步履从容。', 职员: '穿着日常通勤服装，手里拿着随身物品。',
    居民: '穿着轻便，正沿附近的步道散步。', 访客: '不时看一眼周围的路标，像是第一次来这里。', 店员: '穿着整洁，正在店外短暂停留。',
    骑手: '带着配送用的随身装备，正查看附近的方向。', 自由职业者: '背着轻便的随身包，暂时停在路边。',
  };
  return {
    id: `ped-${hashString(seed).toString(36)}-${anchor.id}`, name, candidateName: name, ...identity,
    description: descriptions[identity.identity]!, x: anchor.x, z: anchor.z, color: colors[Math.floor(random() * colors.length)]!,
    portraitId: characterForPerson(`ped-${hashString(seed).toString(36)}-${anchor.id}`), contactId: null, isMain: false,
  };
}

export function getScenePeople(scene: ScenePresence, contacts: readonly CharacterContact[] = [], clock?: {hour: number; minute: number}): ScenePerson[] {
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
  for (const resident of residentCast) {
    const presence = clock ? residentPresence(resident.id, clock) : null;
    if (clock && !presence?.anchorId) continue;
    const anchor = scenePersonAnchors.find(a => a.id === (presence?.anchorId ?? resident.anchor));
    if (!anchor) continue;
    people.push({id:resident.id,name:resident.name,candidateName:resident.name,identity:'常驻居民',tags:['常驻人物'],
      description:resident.publicProfile,x:anchor.x+.6,z:anchor.z+.6,color:0x859c6d,
      portraitId:characterForPerson(resident.id),contactId:null,isMain:false});
  }
  const occupied = new Set(contacts.map(contact => contact.name));
  return people.map(person => {
    const contact = contacts.find(contact => contact.sourcePersonId === person.id || contact.id === person.id);
    const start = hashString(`confirmed-name|${scene.seed}|${person.id}`) % (surnames.length * givenNames.length);
    for (let offset = 0; !contact && !residentCast.some(r => r.id === person.id) && occupied.has(person.name); offset++) {
      const index = (start + offset) % (surnames.length * givenNames.length);
      person.name = surnames[Math.floor(index / givenNames.length)]! + givenNames[index % givenNames.length]!;
    }
    occupied.add(contact?.name ?? person.name);
    return contact ? { ...person, name: contact.name, description: contact.summary, portraitId: contact.portraitId, contactId: contact.id, isMain: contact.isMain } : person;
  });
}

export const SCENE_ENCOUNTER_DISTANCE = 7;
export function getSceneContext(scene: ScenePresence | null, interior: InteriorPresence | null = null, contacts: readonly CharacterContact[] = [], clock?: {hour: number; minute: number}) {
  if (interior) {
    const room = getCampusInterior(interior.roomId);
    if (!room) return null;
    const last = getInteriorActivity(room, interior.activityId, interior.lastRest, interior.lastStudy);
    return {
      areaId: room.id, label: room.label, outdoors: false, skyVisible: false,
      position: { x: interior.x, z: interior.z, yaw: interior.yaw, unit: '示意米' },
      environment: room.description,
      nearbyLandmarks: [], nearbyPeople: [], encounter: null,
      exit: { parentLocationId: room.parentLocationId, description: '南侧房门返回进入前的室外位置；尚未执行离开。' },
      lastInteraction: last ? { id: last.id, label: last.label, result: last.result, alreadyCommitted: true, minutes: last.minutes, energyDelta: last.energyDelta } : null,
    };
  }
  if (!scene) return null;
  const area = getSceneArea(scene.x, scene.z);
  if (!area) return null;
  const people = getScenePeople(scene, contacts, clock);
  const nearby = people
    .map(person => ({ person, distance: Math.hypot(person.x - scene.x, person.z - scene.z) }))
    .filter(item => item.distance <= 18)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8);
  const personContext = (person: ScenePerson) => ({ id: person.id, name: person.name, identity: person.identity, tags: person.tags, description: person.description, portraitId: person.portraitId, contactId: person.contactId, isMain: person.isMain,
    outfit: residentOutfit(person.id), housing: housingForPerson(person.id)?.id ?? null });
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

