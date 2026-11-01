import { campusInteriors } from '../runtime/campus-interiors';
import { mapLocations, novelDestinations } from '../runtime/model';
import { sceneAreas, sceneBounds } from './scene-layout';

export const MAP_DISTRICT_IDS = ['campus', 'home', 'commercial', 'downtown', 'city-park', 'grand-commercial', 'takao-mountain'] as const;
export type MapDistrictId = typeof MAP_DISTRICT_IDS[number];
export type LocalMapScope = 'city' | MapDistrictId;
export const campusDetailBounds = { minX: -74, maxX: 74, minZ: -64, maxZ: 94 };

export const mapDistricts = [
  { id: 'campus', name: '高田／西早稻田校园', shortName: '校园与南门', description: '校园、南门街区与周边现有地点。', x: 0, z: 15 },
  { id: 'home', name: '杂司谷住宅区', shortName: '杂司谷住宅区', description: '住宅街、家园与杂司谷接驳站。', x: -180, z: 150 },
  { id: 'commercial', name: '池袋／东池袋', shortName: '池袋商业区', description: '商业街、居民住处与池袋接驳站。', x: 180, z: 150 },
  { id: 'downtown', name: '目白／目白台', shortName: '目白台豪华住宅区', description: '高密度豪华住宅塔楼群、长崎家高层公寓、丰川家、王冢家、二阶堂家与目白台接驳站。', x: -20, z: 185 },
  { id: 'city-park', name: '神田川沿岸绿道', shortName: '神田川沿岸', description: '河岸绿道、公园、住处与接驳站。', x: 180, z: -150 },
  { id: 'grand-commercial', name: '新宿／大型商业区', shortName: '大型商业区', description: '汇集大型商场、Live House、KTV 娱乐中心与商务写字楼的繁华都会沙盘。', x: -180, z: -150 },
  { id: 'takao-mountain', name: '高尾山自然风景区', shortName: '高尾山风景区', description: '青翠秀美的近郊名山沙盘，包含登山步道、观景展望台、山麓温泉与观光索道。', x: 0, z: -175 },
] as const;

export function isMapDistrict(value: string): value is MapDistrictId {
  return MAP_DISTRICT_IDS.some(id => id === value);
}

/** Indoor poses are room-local. District ownership always follows the parent. */
export function locationDistrict(locationId: string): MapDistrictId {
  const outdoor = campusInteriors.find(room => room.id === locationId)?.parentLocationId ?? locationId;
  return isMapDistrict(outdoor) ? outdoor : 'campus';
}

export function districtBounds(scope: LocalMapScope) {
  if (scope === 'city') return sceneBounds;
  if (scope === 'campus') return campusDetailBounds;
  const area = sceneAreas.find(item => item.id === scope)!;
  const entrances = campusInteriors.filter(room => locationDistrict(room.id) === scope).map(room => room.entrance);
  return {
    minX: Math.min(area.minX, ...entrances.map(p => p.x)) - 8,
    maxX: Math.max(area.maxX, ...entrances.map(p => p.x)) + 8,
    minZ: Math.min(area.minZ, ...entrances.map(p => p.z)) - 8,
    maxZ: Math.max(area.maxZ, ...entrances.map(p => p.z)) + 8,
  };
}

export function districtDestinations(scope: MapDistrictId, novelMode = false) {
  return (novelMode ? novelDestinations : mapLocations).filter(place => locationDistrict(place.id) === scope);
}

/** Map pins include entrances even when this play mode requires walking there. */
export function districtMapPlaces(scope: MapDistrictId) {
  return novelDestinations.filter(place => locationDistrict(place.id) === scope);
}
