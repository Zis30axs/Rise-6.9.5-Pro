import { residentById } from './npc-cast';

/**
 * Prototype residential mapping for the PR #16 art handoff.
 *
 * These are game-authored living arrangements, not claims about canonical
 * layouts. Only the six recovered generic interiors are registered; residents
 * whose dedicated artwork is still missing keep their existing authored home
 * marker and are pointed at the closest generic shell.
 */
export type MajoHousingType =
  | 'riverfront-highrise'
  | 'traditional-courtyard'
  | 'old-family-house'
  | 'modern-open-plan'
  | 'shared-apartment'
  | 'studio-apartment';

export type MajoDistrictType =
  | 'riverfront-highrise-district'
  | 'old-town-lowrise'
  | 'older-apartment-courtyard'
  | 'traditional-downtown'
  | 'lakeside-apartment'
  | 'student-shared';

export interface MajoHousing {
  readonly id: string;
  readonly type: MajoHousingType;
  readonly label: string;
  readonly description: string;
  readonly interiorId: string;
  readonly district: MajoDistrictType;
  readonly parentLocationId: string;
  /** Recovered runtime art exists for this district; false means authored fallback. */
  readonly districtArt: boolean;
}

export const majoHousings: readonly MajoHousing[] = Object.freeze([
  {
    id: 'emma-yuki-home', type: 'modern-open-plan', label: '艾玛与月代雪的家',
    description: '两人共同居住的现代公寓客餐厅；料理台、沙发与阅读角在同一空间。',
    interiorId: 'emma-yuki-home', district: 'riverfront-highrise-district', parentLocationId: 'home', districtArt: false,
  },
  {
    id: 'koko-old-house', type: 'old-family-house', label: '泽渡家老宅',
    description: '远离校园的老式住宅客厅，保留着旧家具与直播设备旁的生活痕迹；是否与爷爷同住由实际剧情决定。',
    interiorId: 'koko-old-house', district: 'old-town-lowrise', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'nikaido-house', type: 'traditional-courtyard', label: '二阶堂家',
    description: '市中心的传统日式宅邸：榻榻米和室、可望见庭院的缘侧、入鞘武士刀刀架与练剑空间。',
    interiorId: 'nikaido-house', district: 'traditional-downtown', parentLocationId: 'downtown', districtArt: false,
  },
  {
    id: 'anan-noa-milia-home', type: 'shared-apartment', label: '安安、诺亚与米莉亚的住处',
    description: '三人合住的普通客餐厅，留有画笔、画纸与可以各自安静待着的角落。',
    interiorId: 'anan-noa-milia-home', district: 'older-apartment-courtyard', parentLocationId: 'junction', districtArt: true,
  },
  {
    id: 'sherry-hanna-home', type: 'riverfront-highrise', label: '雪莉与汉娜的住处',
    description: '滨水高层住宅的客餐厅，落地窗外是河岸步道。',
    interiorId: 'majo-highrise-home', district: 'riverfront-highrise-district', parentLocationId: 'commercial', districtArt: true,
  },
  {
    id: 'residential-prototype', type: 'studio-apartment', label: '单身公寓',
    description: '床、厨房与一张小桌组成的单身公寓室内。',
    interiorId: 'majo-studio', district: 'lakeside-apartment', parentLocationId: 'city-park', districtArt: false,
  },
]);

const housingByPerson: Readonly<Record<string, string>> = Object.freeze({
  'majo-emma': 'emma-yuki-home',
  'majo-yuki': 'emma-yuki-home',
  'majo-koko': 'koko-old-house',
  'majo-hiro': 'nikaido-house',
  'majo-anan': 'anan-noa-milia-home',
  'majo-noa': 'anan-noa-milia-home',
  'majo-milia': 'anan-noa-milia-home',
  'majo-sherry': 'sherry-hanna-home',
  'majo-hanna': 'sherry-hanna-home',
});

/** Stable outfit descriptors used by schedules and prompts; not a claim of complete art. */
const residentOutfits: Readonly<Record<string, string>> = Object.freeze({
  'majo-hiro': '和服',
});

export function housingForPerson(personId: string): MajoHousing | null {
  const housingId = housingByPerson[personId];
  return housingId ? majoHousings.find(housing => housing.id === housingId) ?? null : null;
}

export function housingForHomeMarker(home: string): MajoHousing | null {
  return majoHousings.find(housing => housing.id === home) ?? null;
}

export function housingForInterior(interiorId: string): MajoHousing | null {
  return majoHousings.find(housing => housing.interiorId === interiorId) ?? null;
}

export function residentOutfit(personId: string): string | null {
  return residentOutfits[personId] ?? null;
}

/** Game-prototype district assignment for existing map locations. */
export const residentDistrictByLocation: Readonly<Record<string, MajoDistrictType>> = Object.freeze({
  home: 'old-town-lowrise',
  commercial: 'riverfront-highrise-district',
  downtown: 'traditional-downtown',
  neighborhood: 'older-apartment-courtyard',
  'city-park': 'lakeside-apartment',
  residences: 'student-shared',
});

export function districtForLocation(locationId: string): MajoDistrictType | null {
  return residentDistrictByLocation[locationId] ?? null;
}

/** A resident's current authored home marker, with a safe fallback for older data. */
export function residentHomeMarker(personId: string): string | null {
  return residentById(personId)?.home ?? null;
}
