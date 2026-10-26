import { parseLivehouseState, validateLivehouseLinks, prepareLivehouseInteraction, syncPerformanceCalendars, livehouseReceipt } from './livehouse';
import { commitNpcDialogue, recordNpcEncounter } from './npc-phone';
import { activeProtagonist, enableProtagonists, applyStoryTransferLegs, finishPersonalChange, legacyView, otherProtagonists, parseProtagonists, personState, protagonistNames, reduceProtagonistAction } from './protagonist-world';
import { PROTAGONISTS } from './dual-protagonists';
import { protagonistSceneId, worldScenePeople, worldScenePosition, worldScenePresence } from './world-presence';
import { knownProtagonistContact } from './initial-contacts';
import { protagonistOpening, protagonistOpeningJournal } from './viewpoint-openings';
import { applyWeeklySummary, captureNewJournalEvidence, recordWeeklyStory, settleWeeklyMemory } from './weekly-memory';
import { recordProtagonistNarrative } from './protagonist-narrative';
import type { AcademicState, GeneratedStory, InteriorPresence, Location, PlayerState, ScenePresence, StoryAction, TransitState, WorldAction, WorldState, InteractionEventRateState } from '../frontend/types';
import { INTERACTION_EVENT_HISTORY_LIMIT } from './interaction-event-rate';
import { applyMargoCafeGift, parseMargoCafeState } from './margo-cafe';
import { MARGO_CAFE_LOCATION_ID, MARGO_CAFE_ROOM_ID } from './margo-cafe-venue';
import { sceneAreas, sceneLandmarks } from '../frontend/scene-layout';
import { historicalToYen, TOKYO_MONEY_FACTOR } from './tokyo-world';
import { getSceneArea, getScenePeople, getInteriorPeople, getInteriorPeopleForValidation, SCENE_ENCOUNTER_DISTANCE, sceneEnvironments, sceneLocationId } from './scene-context';
import { STORY_OUTPUT_LIMITS, validateGeneratedStory } from './story-protocol';
import { advanceAirTraffic, createAirTrafficState, parseAirTrafficState, triggerAirliner } from './air-traffic';
import { bedRestOptions, campusInteriors, canManageLivehouseAndBand, getCampusInterior, getInteriorActivity, getInteriorMovementWorld, getStudyEnergyCost, isStudyInteraction, studyDurationOptions, INTERIOR_ENTRANCE_RANGE, INTERIOR_INTERACTION_RANGE } from './campus-interiors';
import { isScenePositionWalkable } from '../frontend/scene-movement';
import { createTransitState, getNearbyTransitStop, getTransitRoutes, isFarTransitLocation, requiresTransitReturn, selectTravelVehicle, transitStops, transitVehicles, TRANSIT_SEQUENCE_LIMIT } from './transit';
import { advancePlayerNutrition, getInventoryCatalog, getPackItemQuote, getPurchaseQuote, getStoreItem, getUseItemQuote, initialPlayerNeeds, INVENTORY_ITEM_LIMIT } from './convenience-store';
import { adjustEnergy, energyDifference, energyUnits } from './energy';
import { getActivityEffects, type ActivityKind } from './activity-effects';
import { getAcademicMajor, getAcademicSubject, getAcademicSubjectById, getAcademicStudyQuote, MAX_ACADEMIC_POINTS } from './academics';
import { getLocationServiceQuote, getLocationStatus, getTakeawayQuote } from './location-services';
import { storyActionFingerprint, validateStoryActions } from './story-actions';
import { CONTACT_PROFILE_LIMITS, isCharacterPortraitId, legacyCharacterProfile, validateContactProfileInput } from './characters';
import { parseNovelDialogue } from '../frontend/novel-dialogue';

/** Bounded P0/P1 save format. All names and places below are prototype examples. */
export const STATE_LIMITS = { journal: 100, story: 40, phone: 200, ...STORY_OUTPUT_LIMITS } as const;
/** Every outdoor place on the local sandtable. Gate, library, cafe, dorm,
 * teaching and the bus stop keep the primary labels; the remaining existing
 * places use compact numbered markers. */
export const mapLocations: Location[] = [
  { id: 'gate', name: '校园南门', subtitle: '城市与校园的交界', description: `【示例场景】${sceneEnvironments['south-gate']}`, x: 46, y: 75 },
  { id: 'library', name: '图书馆', subtitle: '图书馆外的前庭', description: `【示例场景】${sceneEnvironments.library}`, x: 36, y: 28 },
  { id: 'cafe', name: '街角咖啡店', subtitle: '校园咖啡店外的露台', description: `【示例场景】${sceneEnvironments['campus-cafe']}`, x: 76, y: 64 },
  { id: 'dorm', name: '学生公寓', subtitle: '公寓外的宿舍院落', description: `【示例场景】${sceneEnvironments.residences}`, x: 70, y: 23 },
  { id: 'teaching', name: '教学楼', subtitle: '教学楼外的广场', description: `【示例场景】${sceneEnvironments.teaching}`, x: 48, y: 13 },
  { id: 'sports', name: '运动场', subtitle: '跑道、球场与看台', description: `【示例场景】${sceneEnvironments.sports}`, x: 46, y: -11 },
  { id: 'junction', name: '南门十字路口', subtitle: '斑马线、交通灯与商铺', description: `【示例场景】${sceneEnvironments.junction}`, x: 0, y: 48 },
  { id: 'bookshop', name: '街角书店', subtitle: '书店门前的橱窗', description: `【示例场景】${sceneEnvironments.bookshop}`, x: -22, y: 56.5 },
  { id: 'convenience', name: '便利店', subtitle: '便利店门前', description: `【示例场景】${sceneEnvironments.convenience}`, x: 21, y: 56.5 },
  { id: 'street-cafe', name: '街边咖啡馆', subtitle: '街边露台', description: `【示例场景】${sceneEnvironments['street-cafe']}`, x: 48, y: 56.5 },
  { id: 'pocket-park', name: '口袋公园', subtitle: '步道、长椅与小喷泉', description: `【示例场景】${sceneEnvironments['pocket-park']}`, x: 37, y: 80 },
  { id: 'bus-stop', name: '南门交通站', subtitle: '候车棚与公交线路入口', description: `【示例场景】${sceneEnvironments['bus-stop']}`, x: 47, y: 39.5 },
];
export const locations: Location[] = [
  ...mapLocations,
  ...sceneAreas.filter(area => !mapLocations.some(location => location.id === sceneLocationId(area.id))).map(area => ({
    id: area.id, name: area.label, subtitle: '户外步行区域', description: `【示例场景】${sceneEnvironments[area.id]}`,
    x: (area.minX + area.maxX) / 2, y: (area.minZ + area.maxZ) / 2,
  })),
  ...campusInteriors.map(room => ({ id: room.id, name: room.label, subtitle: '校园室内', description: room.description, x: room.entrance.x, y: room.entrance.z })),
];

/** Navigation remains limited to existing, reachable landmarks and authored rooms. */
export interface NovelDestination {
  id: string;
  name: string;
  description: string;
  kind: 'outdoor' | 'interior';
  parentLocationId?: string;
}
export const novelDestinations: readonly NovelDestination[] = [
  ...sceneLandmarks.map(landmark => {
    const location = locations.find(item => item.id === sceneLocationId(landmark.id))!;
    return { id: location.id, name: location.name, description: location.description, kind: 'outdoor' as const };
  }),
  ...campusInteriors.map(room => ({ id: room.id, name: room.label, description: room.description, kind: 'interior' as const, parentLocationId: room.parentLocationId })),
];

export interface NovelTravelQuote {
  minutes: number;
  baseEnergyCost: number;
  baseEnergyMultiplier: 0.1;
  conditionMultiplier: number;
  calculatedEnergyCost: number;
  energyCost: number;
  foodEnergyCost: number;
  satietyCost: number;
  fare: number;
  rides: { vehicleId: string; fromStopId: string; toStopId: string; minutes: number; fare: number }[];
  alreadyThere: boolean;
  blockedReason: string | null;
}

function travelVehicle(locationId: string, destinationId: string, requested?: string): string {
  const origin = getCampusInterior(locationId)?.parentLocationId ?? locationId;
  const destination = getCampusInterior(destinationId)?.parentLocationId ?? destinationId;
  return selectTravelVehicle(origin, destination, requested);
}

/** Both preview and commit execute the same deterministic plan on a private clone. */
function planNovelTravel(state: WorldState, locationId: string, vehicleId: string) {
  let next = parseStateCore(state, true);
  const departure = { ...next.player };
  // Capture conditions before any leg consumes nutrition. The rational form
  // also gives exact rounding at half-cent boundaries without float drift.
  const conditionNumerator = Math.min(450, Math.max(150, 350 - departure.health - departure.satiety + departure.stress));
  const quote: NovelTravelQuote = { minutes: 0, baseEnergyCost: 0, baseEnergyMultiplier: 0.1, conditionMultiplier: conditionNumerator / 300, calculatedEnergyCost: 0, energyCost: 0, foodEnergyCost: 0, satietyCost: 0, fare: 0, rides: [], alreadyThere: false, blockedReason: null };
  // Exiting an already visited room is free and must retain its real exterior pose;
  // never teleport the player back to a distant bus stop on a same-district exit.
  if (state.interior && getCampusInterior(state.interior.roomId)?.parentLocationId === locationId) {
    return { next: reduceLegacyState(next, { type: 'leave_interior' }), quote };
  }
  try {
    if (!novelDestinations.some(destination => destination.id === locationId)) throw new Error('不存在的地图目的地。');
    if (!transitVehicles.some(vehicle => vehicle.id === vehicleId)) throw new Error('请选择都营巴士或东京Metro接驳线路。');
    if (next.locationId === locationId) { quote.alreadyThere = true; return { next, quote }; }
    // Quote the complete trip even when the real player cannot afford it. This
    // private planning budget is replaced with the real balance before commit.
    next.player = { ...next.player, energy: 100, balance: 1_000_000 };
    const seed = next.scene?.seed ?? 'novel-world-v1';
    const position = (id: string) => {
      const stop = transitStops.find(item => item.locationId === id);
      const landmark = sceneLandmarks.find(item => sceneLocationId(item.id) === id);
      const point = stop ?? landmark;
      if (!point) throw new Error('此地点没有可用的到达位置。');
      const coordinates = sceneCoordinates(point.x, point.z, stop?.yaw ?? 0);
      if (sceneLocationId(coordinates.areaId) !== id) throw new Error('地图到达位置与地点不一致。');
      next.scene = { ...coordinates, seed, encounterId: null };
      next.locationId = id;
    };
    const walk = (id: string) => {
      if (next.locationId !== id) {
        const outlook = getRouteOutlook(next, id);
        const minutes = 15 + outlook.extraMinutes;
        advance(next, minutes); next.player.energy -= 5;
        next.locationId = id;
        const eventNote = outlook.event ? `途中遇到${outlook.event.title}，额外停留 ${outlook.extraMinutes} 分钟。${outlook.event.description}` : '';
        note(next, `前往${locations.find(item => item.id === id)!.name}，步行耗时 ${minutes} 分钟。${eventNote}`);
      }
      position(id);
    };
    const ride = (toStopId: string) => {
      next = reduceLegacyState(next, { type: 'ride_transit', vehicleId, stopId: toStopId });
      const saved = next.transit.lastRide!;
      quote.rides.push({ vehicleId: saved.vehicleId, fromStopId: saved.fromStopId, toStopId: saved.toStopId, minutes: saved.minutes, fare: saved.fare });
    };
    if (next.interior) next = reduceLegacyState(next, { type: 'leave_interior' });
    const room = getCampusInterior(locationId);
    const target = room?.parentLocationId ?? locationId;
    const targetStop = transitStops.find(stop => stop.id !== 'campus' && stop.locationId === target);
    let originStop = transitStops.find(stop => stop.id !== 'campus' && stop.locationId === next.locationId);
    // A save can be on a connecting road, outside every named district. Use its
    // nearest existing stop, then keep the normal campus transfer graph.
    if (!originStop && requiresTransitReturn(next.locationId, next.scene) && next.scene) {
      const point = next.scene;
      originStop = [...transitStops].sort((a, b) => Math.hypot(point.x - a.x, point.z - a.z) - Math.hypot(point.x - b.x, point.z - b.z))[0];
    }
    if (originStop) {
      position(originStop.locationId);
      if (originStop.id !== 'campus' && originStop.id !== targetStop?.id) ride('campus');
    }
    if (targetStop) {
      if (next.locationId !== target) { walk('bus-stop'); ride(targetStop.id); }
      position(target);
    } else {
      walk(target);
    }
    // A far-city residence is still an indoor destination after its transit leg.
    if (room) {
      next.scene = { ...sceneCoordinates(room.entrance.x, room.entrance.z, room.entrance.yaw), seed, encounterId: null };
      next = reduceLegacyState(next, { type: 'enter_interior', roomId: room.id });
    }
    const absoluteMinutes = (value: WorldState) => value.clock.day * 1440 + value.clock.hour * 60 + value.clock.minute;
    quote.minutes = absoluteMinutes(next) - absoluteMinutes(state);
    quote.baseEnergyCost = 100 - next.player.energy;
    quote.calculatedEnergyCost = Math.round(quote.baseEnergyCost * conditionNumerator / 30) / 100;
    quote.energyCost = Math.min(energyUnits(departure.energy), energyUnits(quote.calculatedEnergyCost)) / 100;
    quote.foodEnergyCost = state.player.foodEnergy - next.player.foodEnergy;
    quote.satietyCost = state.player.satiety - next.player.satiety;
    quote.fare = 1_000_000 - next.player.balance;
    if (departure.balance < quote.fare) quote.blockedReason = `余额不足，本次出行需要 ${quote.fare} 日元。`;
    next.player = { ...next.player, energy: adjustEnergy(departure.energy, -quote.energyCost), balance: departure.balance - quote.fare };
  } catch (error) {
    quote.blockedReason = error instanceof Error ? error.message : '无法规划本次出行。';
  }
  return { next, quote };
}

/** Viewing a route never writes a save, moves the player or samples rest/study time. */
export function getNovelTravelQuote(state: WorldState, locationId: string, vehicleId?: string): NovelTravelQuote {
  return planNovelTravel(legacyView(state), locationId, travelVehicle(state.locationId, locationId, vehicleId)).quote;
}

export interface RouteOutlook {
  extraMinutes: number;
  event: null | { kind: 'traffic' | 'special'; title: string; description: string };
}

/** Reproducible demo outlook: opening the map never rerolls a route or changes the save. */
export function getRouteOutlook(state: WorldState, targetId: string): RouteOutlook {
  if (targetId === state.locationId || !locations.some(location => location.id === targetId)) return { extraMinutes: 0, event: null };
  const seed = ['unread-city-route-v1:2', state.clock.day, state.clock.hour, state.clock.minute, state.locationId, targetId, state.journal.length].join('|');
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const sample = (hash >>> 0) % 100;
  if (sample < 20) {
    return (hash & 1) === 0
      ? { extraMinutes: 10, event: { kind: 'traffic', title: '路口施工', description: '【演示路况】前方路口正在施工，需要沿旁边的人行道绕行。' } }
      : { extraMinutes: 15, event: { kind: 'traffic', title: '下课人流', description: '【演示路况】下课的人流集中经过路口，步行速度暂时放慢。' } };
  }
  if (sample < 35) {
    return ((hash >>> 8) & 1) === 0
      ? { extraMinutes: 5, event: { kind: 'special', title: '行人问路', description: '【演示路遇】一位行人停下来问路，途中多停留了片刻。' } }
      : { extraMinutes: 5, event: { kind: 'special', title: '临时校园活动', description: '【演示路遇】路边正举行临时校园活动，经过时短暂停留。' } };
  }
  return { extraMinutes: 0, event: null };
}

export function createInitialState(): WorldState {
  const clock = { day: 1, hour: 17, minute: 20 };
  return {
    schema_version: '1.11.0', currency: 'JPY', clock, locationId: 'gate', scene: null, interior: null,
    airTraffic: createAirTrafficState(),
    transit: createTransitState(),
    player: { energy: 80, balance: 6560, ...initialPlayerNeeds },
    inventory: [],
    academics: null,
    phone: [],
    contacts: [knownProtagonistContact('sakiko', protagonistNames.sakiko)],
    schedule: [],
    journal: [protagonistOpeningJournal('soyo', clock)],
    story: [{ id: 'opening', role: 'assistant', text: protagonistOpening('soyo', clock) }],
  };
}

function invalid(path: string): never { throw new Error(`存档格式无效：${path}。原存档已保留，请先备份并检查数据。`); }
function object(value: unknown, keys: string[], path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
  const ownKeys = Object.keys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => !keys.includes(key))) return invalid(`${path} 字段`);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string, max = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\u0000')) return invalid(path);
  return value;
}
function id(value: unknown, path: string): string {
  const result = text(value, path, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) return invalid(path);
  return result;
}
function number(value: unknown, path: string, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) return invalid(path);
  return value;
}
function energyNumber(value: unknown, path: string, max = 100): number {
  const parsed = number(value, path, 0, max, false);
  if (energyUnits(parsed) / 100 !== parsed) return invalid(`${path} 最多保留两位小数`);
  return parsed;
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return invalid(path);
  return value;
}
function list<T extends { id: string }>(value: unknown, path: string, max: number, parse: (item: unknown, path: string) => T): T[] {
  if (!Array.isArray(value) || value.length > max) return invalid(path);
  const result = value.map((item, index) => parse(item, `${path}[${index}]`));
  if (new Set(result.map(item => item.id)).size !== result.length) return invalid(`${path} ID 重复`);
  return result;
}
function place(value: unknown, path: string): string {
  const result = id(value, path);
  if (!locations.some(location => location.id === result)) return invalid(path);
  return result;
}
function time(value: unknown, path: string): string {
  const result = text(value, path, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(result)) return invalid(path);
  return result;
}

function sceneSeed(value: unknown): string {
  const seed = text(value, 'scene.seed', 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(seed)) return invalid('scene.seed');
  return seed;
}
function sceneCoordinates(x: unknown, z: unknown, yaw: unknown) {
  if (typeof x !== 'number' || typeof z !== 'number' || typeof yaw !== 'number' || !Number.isFinite(yaw) || !getSceneArea(x, z)) return invalid('scene 位置');
  const point = { x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000 };
  const area = getSceneArea(point.x, point.z);
  if (!area) return invalid('scene 位置');
  // Normalise orientation before quantisation so arbitrary turn counts cannot grow saves.
  const wrappedYaw = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return { ...point, yaw: Math.max(-3.141, Math.min(3.141, Math.round(wrappedYaw * 1000) / 1000)), areaId: area.id };
}
function parseScenePresence(value: unknown, interior: InteriorPresence | null, deferProtagonists = false): ScenePresence {
  const item = object(value, ['x', 'z', 'yaw', 'areaId', 'seed', 'encounterId'], 'scene');
  const coordinates = sceneCoordinates(item.x, item.z, item.yaw);
  if (item.areaId !== coordinates.areaId) return invalid('scene.areaId 与坐标不一致');
  const scene: ScenePresence = { ...coordinates, seed: sceneSeed(item.seed), encounterId: item.encounterId === null ? null : id(item.encounterId, 'scene.encounterId') };
  if (scene.encounterId && !(deferProtagonists && isProtagonistEncounter(scene.encounterId))) {
    const cafeInterior = interior?.roomId === MARGO_CAFE_ROOM_ID ? interior : null;
    const position = cafeInterior ?? scene;
    const people = cafeInterior ? getInteriorPeopleForValidation(cafeInterior.roomId) : getScenePeople(scene);
    const person = people.find(person => person.id === scene.encounterId);
    if (!person || Math.hypot(person.x - position.x, person.z - position.z) > SCENE_ENCOUNTER_DISTANCE) return invalid('scene.encounterId 当前不在附近');
  }
  return scene;
}

function interiorCoordinates(roomId: string, x: unknown, z: unknown, yaw: unknown) {
  const room = getCampusInterior(roomId);
  if (!room || typeof x !== 'number' || typeof z !== 'number' || typeof yaw !== 'number' || !Number.isFinite(yaw)) return invalid('interior 位置');
  const world = getInteriorMovementWorld(room);
  if (!isScenePositionWalkable(x, z, world)) return invalid('interior 位置或碰撞');
  // Keep the full bounded point at rounded furniture corners if millimetre
  // quantisation would push a valid position inside the collision radius.
  const rounded = { x: Math.round(x * 1000) / 1000, z: Math.round(z * 1000) / 1000 };
  const point = isScenePositionWalkable(rounded.x, rounded.z, world) ? rounded : { x, z };
  const wrappedYaw = ((yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return { ...point, yaw: Math.max(-3.141, Math.min(3.141, Math.round(wrappedYaw * 1000) / 1000)) || 0 };
}

function parseInteriorPresence(value: unknown, version: '1.3.0' | '1.4.0' | '1.5.0' | '1.6.0' | '1.7.0' | '1.8.0' | '1.9.0' | '1.10.0' | '1.11.0'): InteriorPresence {
  const hasStudy = version === '1.5.0' || version === '1.6.0' || version === '1.7.0' || version === '1.8.0' || (version === '1.9.0' || version === '1.10.0' || version === '1.11.0');
  const item = object(value, ['roomId', 'x', 'z', 'yaw', 'activityId', ...(version === '1.3.0' ? [] : ['lastRest']), ...(hasStudy ? ['lastStudy'] : [])], 'interior');
  const roomId = id(item.roomId, 'interior.roomId');
  const room = getCampusInterior(roomId);
  if (!room) return invalid('interior.roomId');
  const coordinates = interiorCoordinates(roomId, item.x, item.z, item.yaw);
  const activityId = item.activityId === null ? null : id(item.activityId, 'interior.activityId');
  if (activityId && !getInteriorActivity(room, activityId)) return invalid('interior.activityId');
  if (activityId === 'study-reading' && version !== '1.10.0' && version !== '1.11.0') return invalid('旧版 interior.activityId');
  let lastRest: InteriorPresence['lastRest'] = null;
  if (version !== '1.3.0' && item.lastRest !== null) {
    const saved = object(item.lastRest, ['optionId', 'minutes', 'energyRecovered'], 'interior.lastRest');
    const optionId = id(saved.optionId, 'interior.lastRest.optionId');
    const option = bedRestOptions.find(option => option.id === optionId);
    if (roomId !== 'dorm-room' || !option || activityId !== optionId) return invalid('interior.lastRest 与房间或活动不一致');
    const minutes = number(saved.minutes, 'interior.lastRest.minutes', option.minMinutes, option.maxMinutes);
    const maximumRecovery = option.id === 'dorm-rest-long' ? 100 : Math.floor(minutes * 0.4);
    lastRest = { optionId, minutes, energyRecovered: version === '1.8.0' || (version === '1.9.0' || version === '1.10.0' || version === '1.11.0') ? energyNumber(saved.energyRecovered, 'interior.lastRest.energyRecovered', maximumRecovery) : number(saved.energyRecovered, 'interior.lastRest.energyRecovered', 0, maximumRecovery) };
  }
  if (bedRestOptions.some(option => option.id === activityId) && !lastRest) return invalid('interior.lastRest 缺少已结算休息记录');
  let lastStudy: InteriorPresence['lastStudy'] = null;
  if (hasStudy && item.lastStudy !== null) {
    const saved = object(item.lastStudy, ['interactionId', 'optionId', 'minutes', 'energyConsumed'], 'interior.lastStudy');
    const interactionId = id(saved.interactionId, 'interior.lastStudy.interactionId');
    const optionId = id(saved.optionId, 'interior.lastStudy.optionId');
    const option = studyDurationOptions.find(option => option.id === optionId);
    if (!isStudyInteraction(interactionId) || !room.interactions.some(interaction => interaction.id === interactionId) || activityId !== interactionId || !option || lastRest) return invalid('interior.lastStudy 与房间或活动不一致');
    const minutes = number(saved.minutes, 'interior.lastStudy.minutes', option.minMinutes, option.maxMinutes);
    const energyConsumed = number(saved.energyConsumed, 'interior.lastStudy.energyConsumed', 0, 100);
    if (energyConsumed !== getStudyEnergyCost(minutes) && !((version === '1.10.0' || version === '1.11.0') && energyConsumed === getStudyEnergyCost(minutes) + 3)) return invalid('interior.lastStudy.energyConsumed 与实际时长不一致');
    lastStudy = { interactionId, optionId, minutes, energyConsumed };
  }
  return { roomId, ...coordinates, activityId, lastRest, lastStudy };
}

function parseTransitState(value: unknown, clock: WorldState['clock']): TransitState {
  const item = object(value, ['sequence', 'lastRide'], 'transit');
  const sequence = number(item.sequence, 'transit.sequence', 0, TRANSIT_SEQUENCE_LIMIT);
  if (item.lastRide === null) {
    if (sequence !== 0) return invalid('transit.lastRide 缺少已结算车程');
    return createTransitState();
  }
  if (sequence === 0) return invalid('transit.sequence 与车程不一致');
  const ride = object(item.lastRide, ['id', 'vehicleId', 'fromStopId', 'toStopId', 'minutes', 'fare', 'at'], 'transit.lastRide');
  const rideId = id(ride.id, 'transit.lastRide.id');
  const vehicle = transitVehicles.find(vehicle => vehicle.id === ride.vehicleId);
  const fromStopId = id(ride.fromStopId, 'transit.lastRide.fromStopId');
  const toStopId = id(ride.toStopId, 'transit.lastRide.toStopId');
  const route = vehicle && getTransitRoutes(fromStopId, vehicle.id).find(route => route.stop.id === toStopId);
  const minutes = number(ride.minutes, 'transit.lastRide.minutes', 1, 10080);
  const fare = number(ride.fare, 'transit.lastRide.fare', 0, 20_000_000);
  // Historical RMB tickets retain their settled time/fare, even after conversion.
  const oldRoutes: Record<string, { minutes: number; fare: number }> = {
    home: { minutes: 45, fare: 6 }, commercial: { minutes: 25, fare: 3 },
    'city-park': { minutes: 35, fare: 4 }, downtown: { minutes: 55, fare: 12 },
    'grand-commercial': { minutes: 40, fare: 8 },
  };
  const oldDestination = fromStopId === 'campus' ? toStopId : toStopId === 'campus' ? fromStopId : '';
  const old = oldRoutes[oldDestination];
  const currentTicket = !!route && minutes === route.minutes && fare === route.fare;
  const historicalTicket = !!route && !!old && minutes === old.minutes && (fare === old.fare || fare === old.fare * TOKYO_MONEY_FACTOR);
  if (!vehicle || rideId !== `transit-ride-${sequence}` || !route || (!currentTicket && !historicalTicket)) return invalid('transit.lastRide 车辆、路线或结算不一致');
  const at = text(ride.at, 'transit.lastRide.at', 40);
  const stamp = /^第 ([1-9]\d{0,5}) 天 ([01]\d|2[0-3]):([0-5]\d)$/.exec(at);
  const day = stamp ? Number(stamp[1]) : 0;
  const total = stamp ? day * 1440 + Number(stamp[2]) * 60 + Number(stamp[3]) : 0;
  if (!stamp || day > 365000 || total > clock.day * 1440 + clock.hour * 60 + clock.minute) return invalid('transit.lastRide.at');
  return { sequence, lastRide: { id: rideId, vehicleId: vehicle.id, fromStopId, toStopId, minutes, fare, at } };
}

function academicPoints(value: unknown, path: string): number {
  const result = number(value, path, 0, MAX_ACADEMIC_POINTS, false);
  if (!Number.isInteger(result * 2)) return invalid(path);
  return result;
}
function parseAcademics(value: unknown, clock: WorldState['clock'], legacy: boolean): AcademicState | null {
  if (value === null) return null;
  const hasCorrection = !legacy && !!value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'correction');
  const item = object(value, legacy ? ['majorId', 'subjectId', 'points', 'lastGain'] : ['majorId', 'subjects', 'lastGain', ...(hasCorrection ? ['correction'] : [])], 'academics');
  const correction = hasCorrection ? (() => {
    const raw = object(item.correction, ['previousMajorId', 'keepProgress'], 'academics.correction');
    const previousMajorId = id(raw.previousMajorId, 'academics.correction.previousMajorId');
    if (!getAcademicMajor(previousMajorId)) return invalid('academics.correction.previousMajorId');
    return { previousMajorId, keepProgress: boolean(raw.keepProgress, 'academics.correction.keepProgress') };
  })() : undefined;
  const correctionField = correction ? { correction } : {};
  const majorId = id(item.majorId, 'academics.majorId');
  const major = getAcademicMajor(majorId);
  if (!major) return invalid('academics.majorId');
  const subjects: AcademicState['subjects'] = [];
  if (legacy) {
    const subjectId = id(item.subjectId, 'academics.subjectId');
    if (!getAcademicSubject(majorId, subjectId)) return invalid('academics 专业与学科不匹配');
    const points = number(item.points, 'academics.points', 0, MAX_ACADEMIC_POINTS);
    subjects.push(...major.subjects.map(subject => ({ subjectId: subject.id, points: subject.id === subjectId ? points : 0 })));
  } else {
    if (!Array.isArray(item.subjects) || item.subjects.length < 3 || item.subjects.length > 24) return invalid('academics.subjects');
    for (const [index, raw] of item.subjects.entries()) {
      const path = `academics.subjects[${index}]`;
      const entry = object(raw, ['subjectId', 'points'], path);
      const subjectId = id(entry.subjectId, `${path}.subjectId`);
      if (!getAcademicSubjectById(subjectId) || subjects.some(subject => subject.subjectId === subjectId)) return invalid(`${path}.subjectId`);
      const points = academicPoints(entry.points, `${path}.points`);
      if (!getAcademicSubject(majorId, subjectId) && points === 0) return invalid(`${path} 跨专业科目缺少学习进度`);
      subjects.push({ subjectId, points });
    }
    if (major.subjects.some(subject => !subjects.some(entry => entry.subjectId === subject.id))) return invalid('academics.subjects 缺少本专业课程');
  }
  if (item.lastGain === null) {
    if (subjects.some(subject => subject.points !== 0) && !correction?.keepProgress) return invalid('academics.lastGain 缺少已结算学习记录');
    return { majorId, subjects, lastGain: null, ...correctionField };
  }
  const extras = ['outcome', 'channel', 'interactionId', 'energyConsumed', 'moraleChange', 'stressChange'];
  const gain = object(item.lastGain, ['subjectId', 'minutes', 'points', 'totalPoints', 'at', ...(legacy ? [] : extras)], 'academics.lastGain');
  const subjectId = id(gain.subjectId, 'academics.lastGain.subjectId');
  const entry = subjects.find(subject => subject.subjectId === subjectId);
  const minutes = number(gain.minutes, 'academics.lastGain.minutes', 15, 240);
  const points = legacy ? number(gain.points, 'academics.lastGain.points', 0, MAX_ACADEMIC_POINTS) : academicPoints(gain.points, 'academics.lastGain.points');
  const totalPoints = academicPoints(gain.totalPoints, 'academics.lastGain.totalPoints');
  if (!entry || totalPoints !== entry.points || points > totalPoints || (legacy && subjectId !== item.subjectId)) return invalid('academics.lastGain 与学科或实际学习进度不一致');
  const at = text(gain.at, 'academics.lastGain.at', 40);
  const stamp = /^第 ([1-9]\d{0,5}) 天 ([01]\d|2[0-3]):([0-5]\d)$/.exec(at);
  const day = stamp ? Number(stamp[1]) : 0;
  const total = stamp ? day * 1440 + Number(stamp[2]) * 60 + Number(stamp[3]) : 0;
  if (!stamp || day > 365000 || total > clock.day * 1440 + clock.hour * 60 + clock.minute) return invalid('academics.lastGain.at');
  if (legacy || gain.outcome === null) {
    if (points !== minutes || !getAcademicSubject(majorId, subjectId) || (!legacy && extras.some(key => gain[key] !== null))) return invalid('academics.lastGain 旧学习记录不一致');
    return { majorId, subjects, lastGain: { subjectId, minutes, points, totalPoints, at, outcome: null, channel: null, interactionId: null, energyConsumed: null, moraleChange: null, stressChange: null }, ...correctionField };
  }
  const outcome = gain.outcome;
  if (outcome !== 'normal' && outcome !== 'inspiration' && outcome !== 'confusion') return invalid('academics.lastGain.outcome');
  const channel = gain.channel;
  if (channel !== 'classroom' && channel !== 'study-room' && channel !== 'bookshop') return invalid('academics.lastGain.channel');
  const interactionId = gain.interactionId === null ? null : id(gain.interactionId, 'academics.lastGain.interactionId');
  if (channel === 'bookshop' ? interactionId !== null : !getCampusInterior(channel)!.interactions.some(item => item.id === interactionId && isStudyInteraction(item.id))) return invalid('academics.lastGain.interactionId');
  const crossMajor = !getAcademicSubject(majorId, subjectId);
  if ((!crossMajor && outcome !== 'normal') || (crossMajor && channel === 'classroom')) return invalid('academics.lastGain 学习渠道或结果不一致');
  const multiplier = outcome === 'inspiration' ? 3 : outcome === 'confusion' ? 1 : 2;
  const energyConsumed = number(gain.energyConsumed, 'academics.lastGain.energyConsumed', 0, 100);
  if (points * 2 !== minutes * multiplier || energyConsumed !== getStudyEnergyCost(minutes) + (outcome === 'confusion' ? 3 : 0)) return invalid('academics.lastGain 收益或消耗不一致');
  const moraleChange = number(gain.moraleChange, 'academics.lastGain.moraleChange', -100, 100);
  const stressChange = number(gain.stressChange, 'academics.lastGain.stressChange', -100, 100);
  const base = getActivityEffects('study', minutes);
  const morale = base.morale + (outcome === 'inspiration' ? 3 : outcome === 'confusion' ? -4 : 0);
  const stress = base.stress + (outcome === 'inspiration' ? -2 : outcome === 'confusion' ? 5 : 0);
  if (moraleChange < Math.min(0, morale) || moraleChange > Math.max(0, morale) || stressChange < Math.min(0, stress) || stressChange > Math.max(0, stress)) return invalid('academics.lastGain 精神或压力净变化不一致');
  return { majorId, subjects, lastGain: { subjectId, minutes, points, totalPoints, at, outcome, channel, interactionId, energyConsumed, moraleChange, stressChange }, ...correctionField };
}

/** Convert historical money once; a persisted currency tag stops repeat conversions. */
function migrateHistoricalMoney(state: WorldState): void {
  state.player.balance = historicalToYen(state.player.balance);
  if (state.transit.lastRide) state.transit.lastRide.fare *= TOKYO_MONEY_FACTOR;
}

/** Reconstruct known fields; never merge untrusted save objects into live state. */
function parseInteractionEventRateState(value: unknown, clock: WorldState['clock']): InteractionEventRateState {
  const rate = object(value, ['version', 'checks'], 'interactionEventRate');
  if (rate.version !== 1 || !Array.isArray(rate.checks) || rate.checks.length > INTERACTION_EVENT_HISTORY_LIMIT)
    return invalid('interactionEventRate');
  const now = (clock.day - 1) * 1440 + clock.hour * 60 + clock.minute;
  const checks: InteractionEventRateState['checks'] = [];
  for (const [index, raw] of rate.checks.entries()) {
    const path = `interactionEventRate.checks[${index}]`;
    const row = object(raw, ['owner', 'at', 'locationId', 'arrival', 'offered'], path);
    if (!['soyo', 'sakiko', 'emma', 'renako'].includes(String(row.owner))) return invalid(`${path}.owner`);
    const at = number(row.at, `${path}.at`, 0, now);
    if (checks.length && at < checks[checks.length - 1]!.at) return invalid(`${path}.at 顺序`);
    checks.push({
      owner: row.owner as InteractionEventRateState['checks'][number]['owner'],
      at, locationId: place(row.locationId, `${path}.locationId`),
      arrival: boolean(row.arrival, `${path}.arrival`),
      offered: boolean(row.offered, `${path}.offered`),
    });
  }
  return { version: 1, checks };
}

const isProtagonistEncounter = (id: string): boolean => PROTAGONISTS.some(owner => protagonistSceneId(owner) === id);

function protagonistViews(state: WorldState): WorldState[] {
  if (!state.protagonists) return [state];
  return [state, ...otherProtagonists(activeProtagonist(state)).map(owner => {
    const view = { ...state, ...personState(state, owner) };
    const others = otherProtagonists(owner);
    return { ...view, protagonists: { ...state.protagonists!,
      accounts: { ...state.protagonists!.accounts, active: owner },
      inactive: personState(state, others[0]!), third: personState(state, others[1]!),
    } };
  })];
}

function hasLiveEncounter(state: WorldState): boolean {
  const position = worldScenePosition(state);
  return !!position && worldScenePeople(state).some(person => person.id === state.scene?.encounterId &&
    Math.hypot(person.x - position.x, person.z - position.z) <= SCENE_ENCOUNTER_DISTANCE);
}

/** Called after movement/clock settlement, never as a substitute for input validation. */
function clearDepartedProtagonistEncounters(state: WorldState): WorldState {
  for (const view of protagonistViews(state)) {
    if (view.scene?.encounterId && isProtagonistEncounter(view.scene.encounterId) && !hasLiveEncounter(view)) view.scene.encounterId = null;
  }
  return state;
}

export function parseState(value: unknown): WorldState {
  const state = parseStateCore(value, true);
  validateLivehouseLinks(state);
  for (const view of protagonistViews(state)) {
    if (!view.scene?.encounterId || !isProtagonistEncounter(view.scene.encounterId)) continue;
    if (view.protagonists && view.scene.encounterId === protagonistSceneId(activeProtagonist(view))) return invalid('scene.encounterId 不能指向当前主角');
    if (view.protagonists && hasLiveEncounter(view)) continue;
    // Older Emma NPC encounters used authored anchors. They remain readable,
    // but the live population never reuses those anchors for a playable Emma.
    parseScenePresence(view.scene, view.interior);
  }
  return state;
}

/** Personal compatibility projections lack the other protagonists until reassembled. */
function parseStateCore(value: unknown, deferProtagonists = false): WorldState {
  if (value && typeof value === 'object' && !Array.isArray(value) && ['1.12.0', '1.13.0'].includes(String((value as Record<string, unknown>).schema_version))) {
    const source = value as Record<string, unknown>;
    const hasYen = Object.hasOwn(source, 'currency');
    if (hasYen && source.currency !== 'JPY') return invalid('currency');
    const { protagonists, currency: _currency, ...rest } = source;
    // Parse all existing ledgers in their previous units before converting once.
    const base = parseStateCore({ ...rest, currency: 'JPY', schema_version: '1.11.0' }, deferProtagonists);
    const state: WorldState = { ...base, schema_version: '1.13.0', currency: 'JPY',
      protagonists: parseProtagonists(protagonists, base, value => parseStateCore(value, deferProtagonists), !hasYen) };
    if (!hasYen) {
      migrateHistoricalMoney(state);
      const p = state.protagonists!;
      for (const personal of [p.inactive, p.third, p.fourth]) {
        personal.player.balance = historicalToYen(personal.player.balance);
        if (personal.transit.lastRide) personal.transit.lastRide.fare *= TOKYO_MONEY_FACTOR;
      }
      for (const owner of Object.values(p.accounts.people)) for (const key of ['gpt', 'claude', 'gemini'] as const)
        owner.cards[key] *= TOKYO_MONEY_FACTOR;
      for (const transaction of p.accounts.ledger) transaction.deltaCents *= TOKYO_MONEY_FACTOR;
      for (const order of p.orders) order.totalCents *= TOKYO_MONEY_FACTOR;
      for (const person of Object.values(p.backgroundLife?.people ?? {})) {
        const pending = person.pending;
        if (!pending) continue;
        if (pending.routeContext) pending.routeContext.player.balance = historicalToYen(pending.routeContext.player.balance);
        if (pending.arrival) {
          pending.arrival.fareCents *= TOKYO_MONEY_FACTOR;
          if (pending.arrival.transit.lastRide) pending.arrival.transit.lastRide.fare *= TOKYO_MONEY_FACTOR;
        }
      }
    }
    return state;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid('state');
  const version = (value as Record<string, unknown>).schema_version;
  if (version !== '1.0.0' && version !== '1.1.0' && version !== '1.2.0' && version !== '1.3.0' && version !== '1.4.0' && version !== '1.5.0' && version !== '1.6.0' && version !== '1.7.0' && version !== '1.8.0' && version !== '1.9.0' && version !== '1.10.0' && version !== '1.11.0') return invalid('schema_version（支持 1.0.0 至 1.11.0）');
  const hasInteractionEventRate = version === '1.11.0' && Object.hasOwn(value, 'interactionEventRate');
  const hasLivehouse = version === '1.11.0' && Object.hasOwn(value, 'livehouse');
  const hasMargoCafeDaily = version === '1.11.0' && Object.hasOwn(value, 'margoCafeDaily');
  const hasMorale = version === '1.8.0' || (version === '1.9.0' || version === '1.10.0' || version === '1.11.0');
  const hasInventory = version === '1.7.0' || hasMorale;
  const hasTransit = version === '1.6.0' || hasInventory;
  const hasInterior = version === '1.3.0' || version === '1.4.0' || version === '1.5.0' || hasTransit;
  const hasAirTraffic = hasInterior || version === '1.2.0';
  const hasYen = Object.hasOwn(value, 'currency');
  const state = object(value, ['schema_version', ...(hasYen ? ['currency'] : []), 'clock', 'locationId', 'player', 'phone', 'contacts', 'schedule', 'journal', 'story', ...(version !== '1.0.0' ? ['scene'] : []), ...(hasAirTraffic ? ['airTraffic'] : []), ...(hasInterior ? ['interior'] : []), ...(hasTransit ? ['transit'] : []), ...(hasInventory ? ['inventory'] : []), ...((version === '1.9.0' || version === '1.10.0' || version === '1.11.0') ? ['academics'] : []), ...(hasInteractionEventRate ? ['interactionEventRate'] : []), ...(hasMargoCafeDaily ? ['margoCafeDaily'] : []), ...(hasLivehouse ? ['livehouse'] : [])], 'state');
  if (hasYen && state.currency !== 'JPY') return invalid('currency');
  const clock = object(state.clock, ['day', 'hour', 'minute'], 'clock');
  const player = object(state.player, ['energy', 'balance', ...(hasInventory ? ['health', 'stress', 'satiety', 'foodEnergy'] : []), ...(hasMorale ? ['morale'] : [])], 'player');
  const inventory: WorldState['inventory'] = [];
  if (hasInventory) {
    if (!Array.isArray(state.inventory) || state.inventory.length > getInventoryCatalog().length) return invalid('inventory');
    for (const [index, value] of state.inventory.entries()) {
      const path = `inventory[${index}]`;
      const item = object(value, ['itemId', 'quantity'], path);
      const itemId = id(item.itemId, `${path}.itemId`);
      if (!getStoreItem(itemId) || inventory.some(entry => entry.itemId === itemId)) return invalid(`${path}.itemId`);
      inventory.push({ itemId, quantity: number(item.quantity, `${path}.quantity`, 1, INVENTORY_ITEM_LIMIT) });
    }
  }
  const parsedClock = { day: number(clock.day, 'clock.day', 1, 365000), hour: number(clock.hour, 'clock.hour', 0, 23), minute: number(clock.minute, 'clock.minute', 0, 59) };
  const parsedInterior = hasInterior && state.interior !== null ? parseInteriorPresence(state.interior, version) : null;
  const result: WorldState = {
    schema_version: '1.11.0', currency: 'JPY',
    clock: parsedClock,
    locationId: place(state.locationId, 'locationId'),
    scene: version === '1.0.0' || state.scene === null ? null : parseScenePresence(state.scene, parsedInterior, deferProtagonists),
    interior: parsedInterior,
    airTraffic: hasAirTraffic ? parseAirTrafficState(state.airTraffic) : createAirTrafficState(),
    transit: hasTransit ? parseTransitState(state.transit, parsedClock) : createTransitState(),
    ...(hasInteractionEventRate ? { interactionEventRate: parseInteractionEventRateState(state.interactionEventRate, parsedClock) } : {}),
    ...(hasLivehouse ? { livehouse: parseLivehouseState(state.livehouse, (parsedClock.day - 1) * 1440 + parsedClock.hour * 60 + parsedClock.minute) } : {}),
    ...(hasMargoCafeDaily ? { margoCafeDaily: parseMargoCafeState(state.margoCafeDaily, parsedClock) } : {}),
    player: { energy: hasMorale ? energyNumber(player.energy, 'player.energy') : number(player.energy, 'player.energy', 0, 100), balance: number(player.balance, 'player.balance', 0, 20_000_000, false),
      ...(hasInventory ? { health: number(player.health, 'player.health', 0, 100), stress: number(player.stress, 'player.stress', 0, 100), satiety: number(player.satiety, 'player.satiety', 0, 100), foodEnergy: number(player.foodEnergy, 'player.foodEnergy', 0, 3000) } : initialPlayerNeeds),
      morale: hasMorale ? number(player.morale, 'player.morale', 0, 100) : 70 },
    inventory,
    academics: (version === '1.9.0' || version === '1.10.0' || version === '1.11.0') ? parseAcademics(state.academics, parsedClock, version === '1.9.0') : null,
    phone: list(state.phone, 'phone', STATE_LIMITS.phone, (value, path) => {
      const item = object(value, ['id', 'npcId', 'text', 'read', 'at'], path);
      return { id: id(item.id, `${path}.id`), npcId: id(item.npcId, `${path}.npcId`), text: text(item.text, `${path}.text`, 4000), read: boolean(item.read, `${path}.read`), at: text(item.at, `${path}.at`, 40) };
    }),
    contacts: list(state.contacts, 'contacts', CONTACT_PROFILE_LIMITS.contacts, (value, path) => {
      const item = object(value, ['id', 'name', 'tag', 'summary', 'affinity', 'status', ...(version === '1.11.0' ? ['portraitId', 'sourcePersonId', 'isMain'] : [])], path);
      const contactId = id(item.id, `${path}.id`);
      const profile = version === '1.11.0' ? {
        portraitId: isCharacterPortraitId(item.portraitId) ? item.portraitId : invalid(`${path}.portraitId`),
        sourcePersonId: item.sourcePersonId === null ? null : id(item.sourcePersonId, `${path}.sourcePersonId`),
        isMain: boolean(item.isMain, `${path}.isMain`),
      } : legacyCharacterProfile(contactId);
      return { id: contactId, name: text(item.name, `${path}.name`, 80), tag: text(item.tag, `${path}.tag`, 80), summary: text(item.summary, `${path}.summary`, 2000), affinity: number(item.affinity, `${path}.affinity`, -100, 100), status: text(item.status, `${path}.status`, 200), ...profile };
    }),
    schedule: list(state.schedule, 'schedule', 100, (value, path) => {
      const item = object(value, ['id', 'title', 'locationId', 'time', 'done'], path);
      return { id: id(item.id, `${path}.id`), title: text(item.title, `${path}.title`, 200), locationId: place(item.locationId, `${path}.locationId`), time: time(item.time, `${path}.time`), done: boolean(item.done, `${path}.done`) };
    }),
    journal: list(state.journal, 'journal', STATE_LIMITS.journal, (value, path) => {
      const item = object(value, ['id', 'text', 'at'], path);
      return { id: id(item.id, `${path}.id`), text: text(item.text, `${path}.text`, 1000), at: text(item.at, `${path}.at`, 40) };
    }),
    story: list(state.story, 'story', STATE_LIMITS.story, (value, path) => {
      const hasParticipants = version === '1.11.0' && !!value && typeof value === 'object' && Object.hasOwn(value, 'participantIds');
      const item = object(value, ['id', 'role', 'text', ...(hasParticipants ? ['participantIds'] : [])], path);
      if (item.role !== 'user' && item.role !== 'assistant') return invalid(`${path}.role`);
      let participantIds: string[] | undefined;
      if (hasParticipants) {
        if (!Array.isArray(item.participantIds) || item.participantIds.length > 8) return invalid(`${path}.participantIds`);
        participantIds = item.participantIds.map((value, index) => id(value, `${path}.participantIds[${index}]`));
        if (new Set(participantIds).size !== participantIds.length) return invalid(`${path}.participantIds 重复`);
      }
      return { id: id(item.id, `${path}.id`), role: item.role, text: text(item.text, `${path}.text`, STATE_LIMITS.storyText), ...(participantIds ? { participantIds } : {}) };
    }),
  };
  if (result.phone.some(message => !result.contacts.some(contact => contact.id === message.npcId))) return invalid('phone.npcId 引用');
  const sourceIds = result.contacts.flatMap(contact => contact.sourcePersonId ? [contact.sourcePersonId] : []);
  if (new Set(sourceIds).size !== sourceIds.length) return invalid('contacts.sourcePersonId 重复');
  if (version === '1.0.0' && !['gate', 'library', 'cafe', 'dorm'].includes(result.locationId)) return invalid('1.0.0 locationId');
  if (!hasInterior && getCampusInterior(result.locationId)) return invalid('旧版 locationId');
  if (!hasTransit && (isFarTransitLocation(result.locationId) || (result.scene && (result.scene.x < -70 || result.scene.x > 70 || result.scene.z < -60 || result.scene.z > 90)))) return invalid('旧版 scene 或 locationId 超出原范围');
  if (result.interior) {
    const room = getCampusInterior(result.interior.roomId)!;
    if (result.locationId !== room.id || !result.scene || sceneLocationId(result.scene.areaId) !== room.parentLocationId
      || Math.hypot(result.scene.x - room.entrance.x, result.scene.z - room.entrance.z) > INTERIOR_ENTRANCE_RANGE) return invalid('interior 与室外返回位置或 locationId 不一致');
    const study = result.interior.lastStudy;
    if (study && study.energyConsumed > getStudyEnergyCost(study.minutes)) {
      const gain = result.academics?.lastGain;
      if (!gain || gain.outcome !== 'confusion' || gain.channel !== room.id || gain.interactionId !== study.interactionId
        || gain.minutes !== study.minutes || gain.energyConsumed !== study.energyConsumed) return invalid('interior.lastStudy 额外消耗缺少已结算阅读结果');
    }
  } else {
    if (getCampusInterior(result.locationId)) return invalid('locationId 缺少 interior');
    if (isFarTransitLocation(result.locationId) && !result.scene) return invalid('远地 locationId 缺少 scene');
    if (result.scene && sceneLocationId(result.scene.areaId) !== result.locationId) return invalid('scene 与 locationId 不一致');
  }
  if (!hasYen) migrateHistoricalMoney(result);
  return result;
}

/** Apply a validated sequence on a private clone; the caller alone persists it. */
function applyLegacyStoryActions(state: WorldState, actions: readonly StoryAction[], turnId = 'preview'): WorldState {
  let next = parseStateCore(state, true);
  const validated = validateStoryActions(actions, next);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(turnId)) throw new Error('剧情行动记录 ID 无效。');
  const clearInteriorActivity = () => {
    if (next.interior) { next.interior.activityId = null; next.interior.lastRest = null; next.interior.lastStudy = null; }
  };
  for (const [index, action] of validated.entries()) {
    switch (action.type) {
      case 'travel': next = reduceLegacyState(next, { type: 'novel_travel', locationId: action.locationId }); break;
      case 'service': next = reduceLegacyState(next, { type: 'location_service', serviceId: action.serviceId }); break;
      case 'buy': next = reduceLegacyState(next, { type: 'buy_item', itemId: action.itemId, quantity: action.quantity }); break;
      case 'pack': next = reduceLegacyState(next, { type: 'pack_item', itemId: action.itemId, quantity: action.quantity }); break;
      case 'takeaway': next = reduceLegacyState(next, { type: 'pack_service', serviceId: action.serviceId, quantity: action.quantity }); break;
      case 'gift': next = reduceLegacyState(next, { ...action, type: 'gift_item' }); break;
      case 'use': next = reduceLegacyState(next, { type: 'use_item', itemId: action.itemId }); break;
      case 'interact':
        if (action.interactionId === 'dorm-rest' || isStudyInteraction(action.interactionId)) throw new Error('休息或学习请使用包含明确分钟数的剧情行动。');
        next = reduceLegacyState(next, { type: 'novel_approach', interactionId: action.interactionId });
        next = reduceLegacyState(next, { type: 'interior_interact', interactionId: action.interactionId });
        break;
      case 'rest': {
        const before = { ...next.player };
        advance(next, action.minutes);
        const recovery = action.kind === 'sleep' && action.minutes >= 420 ? 100
          : action.kind === 'wait' ? Math.floor(action.minutes / 15) * 2 : Math.floor(action.minutes * .4);
        next.player.energy = adjustEnergy(next.player.energy, recovery);
        applyActivityEffects(next, action.kind === 'wait' ? 'wait' : 'rest', action.minutes);
        clearInteriorActivity();
        note(next, `根据你的行动${{ sleep: '睡眠', rest: '休息', wait: '等待' }[action.kind]} ${action.minutes} 分钟。${activityChangeNote(before, next.player)}`);
        break;
      }
      case 'study': {
        const subject = getAcademicSubjectById(action.subjectId)!;
        if (!next.academics) throw new Error('请先选择专业，再开始学习。');
        const channel = next.locationId;
        if (channel !== 'classroom' && channel !== 'study-room' && channel !== 'bookshop') throw new Error('请先前往教室、图书馆自习室或书店再学习。');
        const crossMajor = !getAcademicSubject(next.academics.majorId, action.subjectId);
        if (channel === 'classroom' && crossMajor) throw new Error('教室仅学习本专业课程；跨专业阅读请去图书馆或书店。');
        if (channel === 'bookshop') {
          const venue = getLocationStatus(channel, next.clock)!;
          if (!venue.isOpen) throw new Error(`书店已打烊，营业时间 ${venue.hoursLabel}。`);
          if (venue.minutesUntilClose !== null && action.minutes > venue.minutesUntilClose) throw new Error('这段阅读无法在书店关门前完成。');
        }
        // A stable draw makes previews/retries agree, while preserving the
        // existing 25% inspiration / 25% confusion / 50% ordinary distribution.
        let sample = 2166136261;
        const seed = `${next.clock.day}:${next.clock.hour}:${next.clock.minute}:${action.subjectId}:${action.minutes}:${index}`;
        for (let i = 0; i < seed.length; i++) sample = Math.imul(sample ^ seed.charCodeAt(i), 16777619);
        const draw = (sample >>> 0) % 100;
        const outcome = !crossMajor || draw >= 50 ? 'normal' : draw < 25 ? 'inspiration' : 'confusion';
        const energyConsumed = getStudyEnergyCost(action.minutes) + (outcome === 'confusion' ? 3 : 0);
        if (next.player.energy < energyConsumed) throw new Error(`精力不足，此次学习需要 ${energyConsumed} 点精力，请先休息。`);
        const points = action.minutes * (outcome === 'inspiration' ? 1.5 : outcome === 'confusion' ? .5 : 1);
        let progress = next.academics.subjects.find(entry => entry.subjectId === action.subjectId);
        if ((progress?.points ?? 0) + points > MAX_ACADEMIC_POINTS) throw new Error('学习进度已到达存档上限。');
        const before = { ...next.player };
        advance(next, action.minutes);
        next.player.energy = adjustEnergy(next.player.energy, -energyConsumed);
        const effects = getActivityEffects('study', action.minutes);
        next.player.morale = Math.max(0, Math.min(100, next.player.morale + effects.morale + (outcome === 'inspiration' ? 3 : outcome === 'confusion' ? -4 : 0)));
        next.player.stress = Math.max(0, Math.min(100, next.player.stress + effects.stress + (outcome === 'inspiration' ? -2 : outcome === 'confusion' ? 5 : 0)));
        if (!progress) { progress = { subjectId: action.subjectId, points: 0 }; next.academics.subjects.push(progress); }
        progress.points += points;
        const at = `第 ${next.clock.day} 天 ${String(next.clock.hour).padStart(2, '0')}:${String(next.clock.minute).padStart(2, '0')}`;
        next.academics.lastGain = { subjectId: action.subjectId, minutes: action.minutes, points, totalPoints: progress.points, at, outcome, channel,
          interactionId: channel === 'bookshop' ? null : channel === 'classroom' ? 'classroom-notes' : 'study-focus',
          energyConsumed, moraleChange: next.player.morale - before.morale, stressChange: next.player.stress - before.stress };
        clearInteriorActivity();
        note(next, `学习${subject.name} ${action.minutes} 分钟，进度 +${points}，累计 ${progress.points} 点。${crossMajor ? `跨专业阅读结果：${{ inspiration: '灵感', confusion: '困惑', normal: '普通' }[outcome]}。` : ''}${activityChangeNote(before, next.player)}`);
        break;
      }
      case 'schedule': {
        if (next.schedule.length >= 100) throw new Error('日程已满，本轮未新增安排。');
        const id = `${turnId}:schedule:${index}`;
        if (next.schedule.some(entry => entry.id === id)) throw new Error('日程 ID 冲突。');
        next.schedule.push({ id, title: action.title, locationId: action.locationId, time: action.time, done: false });
        note(next, `新增日程：${action.time}，${locations.find(place => place.id === action.locationId)!.name}，${action.title}。`);
        break;
      }
      case 'complete_schedule': next = reduceLegacyState(next, action); break;
      // Transfer legs are booked by applyStoryTransferLegs on the authoritative
      // ledger after finishPersonalChange; mirroring them here would double-count.
      case 'transfer': break;
      case 'relationship': {
        const contact = next.contacts.find(contact => contact.id === action.npcId)!;
        const before = contact.affinity;
        contact.affinity = Math.max(-100, Math.min(100, contact.affinity + action.delta));
        note(next, `${contact.name}的关系变化 ${contact.affinity - before >= 0 ? '+' : ''}${contact.affinity - before}：${action.reason}`);
        break;
      }
      case 'activity': {
        const before = { ...next.player };
        if (action.effects.balance < 0 && next.player.balance < -action.effects.balance) throw new Error(`余额不足，${action.label}需要 ${-action.effects.balance} 日元。`);
        if (next.player.balance + action.effects.balance > 20_000_000) throw new Error('余额超过存档上限，本轮未结算。');
        if (action.effects.energy < 0 && energyUnits(next.player.energy) < -energyUnits(action.effects.energy)) throw new Error(`精力不足，无法完成${action.label}，请先休息。`);
        advance(next, action.minutes);
        next.player.energy = adjustEnergy(next.player.energy, action.effects.energy);
        for (const key of ['morale', 'stress', 'health', 'satiety'] as const) next.player[key] = Math.max(0, Math.min(100, next.player[key] + action.effects[key]));
        next.player.foodEnergy = Math.max(0, Math.min(3000, next.player.foodEnergy + action.effects.foodEnergy));
        next.player.balance += action.effects.balance;
        clearInteriorActivity();
        note(next, `${action.label}，耗时 ${action.minutes} 分钟。${action.effects.balance ? `余额${action.effects.balance > 0 ? '+' : ''}${action.effects.balance} 日元。` : ''}${activityChangeNote(before, next.player)}`);
        break;
      }
    }
  }
  return parseStateCore(next, true);
}

/**
 * Build one atomic world snapshot. The caller saves this snapshot once, then
 * delivers its persisted phone records and displays the accepted world event.
 * Retrying delivery keeps the same IDs. Legacy saves retain their existing data.
 */
function commitLegacyStoryTurn(
  state: WorldState,
  input: string,
  result: GeneratedStory,
  ids: { userId: string; assistantId: string },
  now = Date.now(),
  worldAuthority?: WorldState,
): WorldState {
  let next = parseStateCore(state, true);
  if (typeof input !== 'string' || !input.trim() || input.length > STATE_LIMITS.inputText || input.includes('\u0000')) {
    throw new Error(`请输入 1–${STATE_LIMITS.inputText} 字的行动。`);
  }
  const reply = validateGeneratedStory(result, next);
  // Leave room for the stable message suffix within the 128-char save ID limit.
  const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(value);
  if (!ids || !validId(ids.userId) || !validId(ids.assistantId) || ids.userId === ids.assistantId) throw new Error('剧情记录 ID 无效；本轮未写入。');
  const inputText = input.trim();
  const flightId = `${ids.assistantId}:airliner`;
  const hasFlight = reply.worldEvents?.length === 1;
  const recordedFlight = next.airTraffic.lastFlight?.id === flightId || next.journal.some(entry => entry.id === flightId);
  const worldActions = reply.worldActions ?? [];
  const actionPrefix = `${ids.assistantId}:wa:`;
  const actionReceiptId = `${actionPrefix}${storyActionFingerprint(worldActions)}`;
  const recordedActions = next.journal.filter(entry => entry.id.startsWith(actionPrefix));
  const unchangedActions = worldActions.length ? recordedActions.length === 1 && recordedActions[0].id === actionReceiptId : recordedActions.length === 0;
  const existingUser = next.story.find(entry => entry.id === ids.userId);
  const existingAssistant = next.story.find(entry => entry.id === ids.assistantId);
  if (existingUser || existingAssistant) {
    if (existingUser?.role === 'user' && existingUser.text === inputText && existingAssistant?.role === 'assistant' && existingAssistant.text === reply.text) {
      const unchanged = reply.phoneMessages.every((message, index) => {
        const existing = next.phone.find(item => item.id === `${ids.assistantId}:phone:${index}`);
        return existing && existing.npcId === message.npcId && existing.text === message.text;
      });
      const prefix = `${ids.assistantId}:phone:`;
      if (unchanged && next.phone.filter(item => item.id.startsWith(prefix)).length === reply.phoneMessages.length && hasFlight === recordedFlight && unchangedActions) return next;
    }
    throw new Error('剧情记录 ID 冲突；本轮未写入。');
  }
  if (recordedFlight) throw new Error('空中事件 ID 冲突；本轮未写入。');
  if (recordedActions.length) throw new Error('剧情行动 ID 冲突；本轮未写入。');
  next = applyLegacyStoryActions(next, worldActions, ids.assistantId);
  // Reject the entire turn on cooldown. Accepting prose while dropping its
  // requested pass would leave the narrated scene different from saved facts.
  if (hasFlight) {
    if (next.interior) throw new Error('玩家当前在室内，不能新增天空客机事件；本轮正文和状态均未写入。');
    next.airTraffic = triggerAirliner(next.airTraffic, now, 'story', flightId);
    note(next, '一架远处的客机在高空平稳经过。', flightId);
  }
  const at = `第 ${next.clock.day} 天 ${String(next.clock.hour).padStart(2, '0')}:${String(next.clock.minute).padStart(2, '0')}`;
  const messages = reply.phoneMessages.map((message, index) => ({
    id: `${ids.assistantId}:phone:${index}`, npcId: message.npcId, text: message.text, read: false, at,
  }));
  if (messages.some(message => next.phone.some(existing => existing.id === message.id))) throw new Error('手机消息 ID 冲突；本轮未写入。');
  // Prune only acknowledged records from this bounded delivery list. The phone
  // owns its history; this function never deletes messages in its storage.
  let excess = Math.max(0, next.phone.length + messages.length - STATE_LIMITS.phone);
  if (next.phone.filter(message => message.read).length < excess) throw new Error('未读剧情消息已满，请先阅读手机消息后重试。本轮正文和消息均未写入。');
  next.phone = next.phone.filter(message => {
    if (excess > 0 && message.read) { excess--; return false; }
    return true;
  });
  next.phone.push(...messages);
  const participants = new Set<string>();
  for (const snapshot of [state, next]) {
    const position = snapshot.interior ?? snapshot.scene;
    const people = worldScenePeople({ ...snapshot, protagonists: worldAuthority?.protagonists })
      .filter(person => !person.protagonistId || position && Math.hypot(person.x - position.x, person.z - position.z) <= SCENE_ENCOUNTER_DISTANCE);
    const contacts = snapshot.contacts.filter(contact => {
      if (!worldAuthority?.protagonists) return true;
      const owner = PROTAGONISTS.find(owner => contact.id === `protagonist-${owner}` ||
        contact.id === protagonistSceneId(owner) || contact.sourcePersonId === protagonistSceneId(owner));
      return !owner || people.some(person => person.protagonistId === owner) ||
        reply.phoneMessages.some(message => message.npcId === contact.id);
    });
    if (position && people.some(person => person.id === snapshot.scene?.encounterId &&
      Math.hypot(person.x - position.x, person.z - position.z) <= SCENE_ENCOUNTER_DISTANCE)) participants.add(snapshot.scene!.encounterId!);
    for (const segment of parseNovelDialogue(reply.text)) {
      if (!segment.speaker) continue;
      const matches = [
        ...contacts.filter(contact => contact.id === segment.speaker || contact.name === segment.speaker).map(contact => contact.id),
        ...people.filter(person => person.id === segment.speaker || person.name === segment.speaker || person.candidateName === segment.speaker).map(person => person.contactId ?? person.id),
      ];
      const unique = [...new Set(matches)];
      if (unique.length === 1) participants.add(unique[0]);
    }
  }
  const participantIds = [...participants].slice(0, 8);
  const participantEvidence = participantIds.length ? { participantIds } : {};
  next.story.push(
    { id: ids.userId, role: 'user', text: inputText, ...participantEvidence },
    { id: ids.assistantId, role: 'assistant', text: reply.text, ...participantEvidence },
  );
  next.story = next.story.slice(-STATE_LIMITS.story);
  if (worldActions.length) note(next, `已结算本轮 ${worldActions.length} 项剧情行动。`, actionReceiptId);
  return parseStateCore(next, true);
}

/** Read receipts can only mark known message IDs; unknown/stale IDs do nothing. */
export function acknowledgePhoneRead(state: WorldState, ids: readonly string[]): WorldState {
  const next = parseState(state);
  if (!Array.isArray(ids) || ids.length > STATE_LIMITS.phone || ids.some(value => typeof value !== 'string')) throw new Error('手机已读回执无效，世界存档未更新。');
  const received = new Set(ids);
  for (const message of next.phone) if (received.has(message.id)) message.read = true;
  return next;
}

function clearIndoorEncounter(state: WorldState) {
  // Dynamic protagonists are checked after the personal view is reassembled.
  if (state.interior && state.scene?.encounterId && !isProtagonistEncounter(state.scene.encounterId) && !getInteriorPeople(state.interior.roomId, state.contacts, state.clock).some(person =>
    person.id === state.scene!.encounterId && Math.hypot(person.x - state.interior!.x, person.z - state.interior!.z) <= SCENE_ENCOUNTER_DISTANCE)) state.scene.encounterId = null;
}

function advance(state: WorldState, minutes: number) {
  state.player = advancePlayerNutrition(state.player, state.clock, minutes);
  const next = state.clock.hour * 60 + state.clock.minute + minutes;
  state.clock = { day: state.clock.day + Math.floor(next / 1440), hour: Math.floor(next / 60) % 24, minute: next % 60 };
  if (state.clock.day > 365000) throw new Error('已到达最大天数，无法继续推进。');
  clearIndoorEncounter(state);
}
function note(state: WorldState, message: string, stableId?: string) {
  const prefix = `entry-${state.clock.day}-${state.clock.hour}-${state.clock.minute}-`;
  const occupied = new Set(state.journal.map(entry => entry.id));
  let sequence = 1;
  while (occupied.has(`${prefix}${sequence}`)) sequence++;
  const at = `第 ${state.clock.day} 天 ${String(state.clock.hour).padStart(2, '0')}:${String(state.clock.minute).padStart(2, '0')}`;
  const entries = [...state.journal, { id: stableId ?? `${prefix}${sequence}`, text: message, at }];
  // Keep replay evidence for every still-visible story turn, even after many
  // button actions. Once its story is pruned, its receipt may be pruned too.
  const storyIds = new Set(state.story.filter(item => item.role === 'assistant').map(item => item.id));
  const protectedReceipt = (entry: WorldState['journal'][number]) => {
    const match = /^(.*):wa:[0-9a-f]{24}$/.exec(entry.id);
    return !!match && storyIds.has(match[1]);
  };
  while (entries.length > STATE_LIMITS.journal) {
    const index = entries.findIndex(entry => !protectedReceipt(entry));
    entries.splice(index < 0 ? 0 : index, 1);
  }
  state.journal = entries;
}

function applyActivityEffects(state: WorldState, kind: ActivityKind, minutes: number) {
  const changes = getActivityEffects(kind, minutes);
  for (const key of ['morale', 'stress', 'health'] as const) state.player[key] = Math.min(100, Math.max(0, state.player[key] + changes[key]));
}

function activityChangeNote(before: PlayerState, after: PlayerState): string {
  const labels = { energy: '精力', morale: '精神', stress: '压力', health: '健康', satiety: '饱腹', foodEnergy: '食物能量' } as const;
  const changes = (Object.keys(labels) as (keyof typeof labels)[]).flatMap(key => {
    const delta = key === 'energy' ? energyDifference(after.energy, before.energy) : after[key] - before[key];
    return delta ? [`${labels[key]}${delta > 0 ? '+' : ''}${delta}${key === 'foodEnergy' ? ' kcal' : ''}`] : [];
  });
  return changes.length ? `实际变化：${changes.join('，')}。` : '身心状态未变化。';
}

/**
 * Prototype rules: travel costs 15 min plus the deterministic route outlook / 5 energy; waiting 1..120 min restores
 * 2 energy per complete 15 min. Reading costs no time. A schedule item is a
 * one-off task: complete at its location at/after its HH:mm on the current day.
 * Structured narrative actions share these transactions; exact-duration rest,
 * study, contextual effects and relationship changes are handled above.
 */
function reduceLegacyState(state: WorldState, action: WorldAction, worldAuthority?: WorldState): WorldState {
  const next = parseStateCore(state, true);
  if (!action || typeof action !== 'object') throw new Error('无效行动。');
  switch (action.type) {
    case 'save_contact': {
      const { type: _type, ...input } = action;
      const profile = validateContactProfileInput(input);
      const existing = next.contacts.find(contact => contact.id === profile.id);
      if (!existing && next.contacts.length >= CONTACT_PROFILE_LIMITS.contacts) throw new Error('主要人物已达50位，请先编辑已有联系人。');
      if (next.contacts.some(contact => contact.id !== profile.id && contact.name.trim() === profile.name)) throw new Error('已有同名联系人，请使用可区分的姓名。');
      const sourcePersonId = profile.sourcePersonId === undefined ? existing?.sourcePersonId ?? null : profile.sourcePersonId;
      if (existing?.sourcePersonId && sourcePersonId !== existing.sourcePersonId) throw new Error('已确认人物的来源身份不能更换。');
      if (sourcePersonId && sourcePersonId !== existing?.sourcePersonId) {
        const people = worldScenePeople({ ...next, protagonists: worldAuthority?.protagonists });
        const person = people.find(person => person.id === sourcePersonId);
        if (!person) throw new Error('这位陌生人不属于当前场景。');
        if (!existing && profile.id !== sourcePersonId) throw new Error('请沿用陌生人的稳定人物 ID。');
      }
      if (sourcePersonId && next.contacts.some(contact => contact.id !== profile.id && (contact.sourcePersonId === sourcePersonId || contact.id === sourcePersonId))) throw new Error('这位人物已经是联系人。');
      if (existing && existing.name === profile.name && existing.portraitId === profile.portraitId && existing.summary === profile.summary && existing.sourcePersonId === sourcePersonId && existing.isMain) return next;
      const contact = existing
        ? { ...existing, name: profile.name, portraitId: profile.portraitId, summary: profile.summary, sourcePersonId, isMain: true }
        : { id: profile.id, name: profile.name, portraitId: profile.portraitId, summary: profile.summary, sourcePersonId, isMain: true, tag: '主要人物', affinity: 0, status: '已记入联系人' };
      if (existing) next.contacts[next.contacts.indexOf(existing)] = contact;
      else next.contacts.push(contact);
      // Profile text remains narrative data, including when an introduction
      // happens to contain the dialogue table delimiter used by the reader.
      const eventText = `人物档案已记录：${contact.name}。${contact.summary}`.replaceAll('|', '｜').replace(/[\r\n]+/g, ' ');
      note(next, eventText);
      const prefix = `profile-${next.clock.day}-${next.clock.hour}-${next.clock.minute}-`;
      let sequence = 1;
      while (next.story.some(entry => entry.id === `${prefix}${sequence}`)) sequence++;
      next.story.push({ id: `${prefix}${sequence}`, role: 'assistant', text: eventText, participantIds: [contact.id] });
      next.story = next.story.slice(-STATE_LIMITS.story);
      break;
    }
    case 'choose_academics': {
      const major = getAcademicMajor(action.majorId);
      if (!major) throw new Error('请选择有效的专业。');
      if (next.academics) {
        if (next.academics.majorId === action.majorId) return next;
        throw new Error('专业已经确认，本阶段不能重新选择。');
      }
      next.academics = { majorId: major.id, subjects: major.subjects.map(subject => ({ subjectId: subject.id, points: 0 })), lastGain: null };
      note(next, `确认专业：${major.name}。本专业三门课程分别积累进度，周课表已生成；旧学习记录不补算。`);
      break;
    }
    case 'correct_academics': {
      const major = getAcademicMajor(action.majorId);
      if (!major || !next.academics || typeof action.keepProgress !== 'boolean') throw new Error('请选择有效的专业修复选项。');
      const previous = next.academics;
      if (previous.majorId === major.id && action.keepProgress) return next;
      // Retain only earned points. Zero-point courses from the old major must not
      // survive as invalid cross-major rows, and lastGain may reference a
      // classroom action that would be illegal for the newly chosen major.
      const retained = action.keepProgress ? previous.subjects.filter(item => item.points > 0) : [];
      const subjects = major.subjects.map(subject => ({
        subjectId: subject.id, points: retained.find(item => item.subjectId === subject.id)?.points ?? 0,
      }));
      for (const entry of retained) {
        if (!subjects.some(subject => subject.subjectId === entry.subjectId)) subjects.push({ ...entry });
      }
      next.academics = { majorId: major.id, subjects, lastGain: null, correction: { previousMajorId: previous.majorId, keepProgress: action.keepProgress } };
      // A previous confusion receipt refers to lastGain, intentionally removed above.
      if (next.interior?.lastStudy) {
        next.interior.lastStudy = null;
        if (next.interior.activityId && isStudyInteraction(next.interior.activityId)) next.interior.activityId = null;
      }
      note(next, `更正本角色专业：${getAcademicMajor(previous.majorId)?.name ?? '原专业'} → ${major.name}。${action.keepProgress ? '保留已积累学习点' : '按确认清零原有学业进度'}；最近一次学习结果已清除。`);
      break;
    }
    case 'buy_item': {
      if (!Number.isInteger(action.quantity) || action.quantity < 1) throw new Error('购买数量必须是 1–20 的整数。');
      const quote = getPurchaseQuote(next, action.itemId, action.quantity);
      if (quote.blockedReason || !quote.item) throw new Error(quote.blockedReason ?? '不存在的商品。');
      next.player.balance -= quote.totalPrice;
      const owned = next.inventory.find(entry => entry.itemId === action.itemId);
      if (owned) owned.quantity += quote.unitsAdded;
      else next.inventory.push({ itemId: quote.item.id, quantity: quote.unitsAdded });
      note(next, `购买${quote.item.name} ${quote.quantity} ${quote.item.purchaseUnit}，支付 ${quote.totalPrice} 日元；背包增加 ${quote.unitsAdded} ${quote.item.useUnit}。`);
      break;
    }
    case 'pack_item':
    case 'pack_service': {
      const quote = action.type === 'pack_item' ? getPackItemQuote(next, action.itemId, action.quantity) : getTakeawayQuote(next, action.serviceId, action.quantity);
      if (quote.blockedReason || !quote.item) throw new Error(quote.blockedReason ?? '无法打包这份食品。');
      next.player.balance -= quote.totalPrice;
      const owned = next.inventory.find(entry => entry.itemId === quote.item!.id);
      if (owned) owned.quantity += quote.unitsAdded;
      else next.inventory.push({ itemId: quote.item.id, quantity: quote.unitsAdded });
      note(next, `打包${quote.item.name} ${quote.quantity} ${quote.item.purchaseUnit}，支付 ${quote.totalPrice} 日元（含打包费 ${quote.packagingFee} 日元），已放入背包；尚未食用。`);
      break;
    }
    case 'gift_item': {
      const item = getStoreItem(action.itemId);
      const contact = next.contacts.find(contact => contact.id === action.npcId);
      if (!item || !contact) throw new Error('不存在的礼物或收礼人。');
      if (!Number.isInteger(action.quantity) || action.quantity < 1 || action.quantity > 20) throw new Error('赠送数量必须是 1–20 的整数。');
      if (!Number.isInteger(action.affinityDelta) || action.affinityDelta < 0 || action.affinityDelta > 20) throw new Error('送礼关系增益必须是 0–20 的整数。');
      if (typeof action.reason !== 'string' || !action.reason.trim() || action.reason.length > 240 || action.reason.includes('\u0000')) throw new Error('请提供送礼的情境依据。');
      const owned = next.inventory.find(entry => entry.itemId === action.itemId);
      if (!owned || owned.quantity < action.quantity) throw new Error('背包中的礼物数量不足，无法赠送。');
      next.inventory = next.inventory.flatMap(entry => entry.itemId !== action.itemId ? [entry] : entry.quantity > action.quantity ? [{ ...entry, quantity: entry.quantity - action.quantity }] : []);
      const before = contact.affinity;
      contact.affinity = Math.min(100, contact.affinity + action.affinityDelta);
      note(next, `将${item.name} ${action.quantity} ${item.useUnit}送给${contact.name}，关系 +${contact.affinity - before}。${action.reason.trim()}`);
      break;
    }
    case 'use_item': {
      const quote = getUseItemQuote(next, action.itemId);
      if (quote.blockedReason || !quote.item) throw new Error(quote.blockedReason ?? '不存在的商品。');
      advance(next, quote.minutes);
      next.player = quote.playerAfter;
      next.inventory = next.inventory.flatMap(entry => entry.itemId !== action.itemId ? [entry] : entry.quantity > 1 ? [{ ...entry, quantity: entry.quantity - 1 }] : []);
      const labels = { energy: '精力', health: '健康', morale: '精神', stress: '压力', satiety: '饱腹', foodEnergy: '食物能量' } as const;
      const changes = (Object.keys(labels) as (keyof typeof labels)[]).filter(key => (quote.changes[key] ?? 0) !== 0).map(key => `${labels[key]}${(quote.changes[key] ?? 0) > 0 ? '+' : ''}${quote.changes[key]}${key === 'foodEnergy' ? ' kcal' : ''}`).join('，');
      note(next, `使用${quote.item.name} 1 ${quote.item.useUnit}，耗时 ${quote.minutes} 分钟。${changes ? `实际变化：${changes}。` : '状态已达边界，未产生额外变化。'}`);
      break;
    }
    case 'location_service': {
      const quote = getLocationServiceQuote(next, action.serviceId);
      if (quote.blockedReason || !quote.service) throw new Error(quote.blockedReason ?? '不存在的地点活动。');
      const before = { ...next.player };
      const status = getLocationStatus(next.locationId, next.clock)!;
      advance(next, quote.minutes);
      // The quote already includes elapsed nutrition; replace, never apply twice.
      next.player = quote.playerAfter;
      note(next, `在${status.label}${quote.service.label}，${quote.price ? `支付 ${quote.price} 日元` : '免费'}，耗时 ${quote.minutes} 分钟。${quote.service.description}${activityChangeNote(before, next.player)}`);
      break;
    }
    case 'novel_travel': {
      const planned = planNovelTravel(next, action.locationId, travelVehicle(next.locationId, action.locationId, action.vehicleId));
      if (planned.quote.blockedReason) throw new Error(planned.quote.blockedReason);
      return parseStateCore(planned.next, true);
    }
    case 'novel_approach': {
      if (!next.interior) throw new Error('请先进入室内。');
      const room = getCampusInterior(next.interior.roomId)!;
      const interaction = room.interactions.find(item => item.id === action.interactionId);
      if (!interaction) throw new Error('这项设施不属于当前房间。');
      next.interior = { ...next.interior, ...interiorCoordinates(room.id, interaction.x, interaction.z, next.interior.yaw) };
      clearIndoorEncounter(next);
      break;
    }
    case 'air_traffic_tick':
      if (next.interior) return next;
      next.airTraffic = advanceAirTraffic(next.airTraffic, action.now, next.scene?.seed);
      break;
    case 'walk': {
      if (next.interior) throw new Error('当前在室内，请使用室内行走或先离开房间。');
      const seed = sceneSeed(action.seed);
      const coordinates = sceneCoordinates(action.x, action.z, action.yaw);
      const scene: ScenePresence = { ...coordinates, seed: next.scene?.seed ?? seed, encounterId: next.scene?.encounterId ?? null };
      const person = scene.encounterId ? worldScenePeople({ ...next, scene, protagonists: worldAuthority?.protagonists }).find(person => person.id === scene.encounterId) : null;
      if (scene.encounterId && (!person || Math.hypot(person.x - scene.x, person.z - scene.z) > SCENE_ENCOUNTER_DISTANCE)) scene.encounterId = null;
      next.scene = scene;
      next.locationId = sceneLocationId(scene.areaId);
      break;
    }
    case 'encounter': {
      if (worldAuthority?.protagonists && !next.scene) next.scene = worldScenePresence(next);
      if (!next.scene) throw new Error('请先进入自由行走，再走到行人附近搭话。');
      const people = worldScenePeople({ ...next, protagonists: worldAuthority?.protagonists });
      const position = next.interior ?? next.scene;
      const person = people.find(person => person.id === action.personId);
      if (!person) throw new Error('这位行人不属于当前场景。');
      if (Math.hypot(person.x - position.x, person.z - position.z) > SCENE_ENCOUNTER_DISTANCE) throw new Error('请走到这位行人附近再搭话。');
      next.scene.encounterId = person.id;
      break;
    }
    case 'travel': {
      if (next.interior) throw new Error('请先离开房间，再选择前往其他地点。');
      if (requiresTransitReturn(next.locationId, next.scene)) throw new Error('当前在远郊，请到交通站乘车返回校园后再步行前往。');
      if (action.locationId !== 'bus-stop' && !mapLocations.some(location => location.id === action.locationId)) throw new Error('不存在的地点。');
      if (next.locationId === action.locationId) { next.scene = null; return next; }
      if (next.player.energy < 5) throw new Error('精力不足，请先等待休息。');
      const outlook = getRouteOutlook(next, action.locationId);
      const minutes = 15 + outlook.extraMinutes;
      advance(next, minutes); next.player.energy = adjustEnergy(next.player.energy, -5); next.locationId = action.locationId; next.scene = null;
      const eventNote = outlook.event ? `途中遇到${outlook.event.title}，额外停留 ${outlook.extraMinutes} 分钟。${outlook.event.description}` : '';
      note(next, `前往${locations.find(location => location.id === action.locationId)!.name}，步行耗时 ${minutes} 分钟。${eventNote}`);
      break;
    }
    case 'ride_transit': {
      const currentStop = getNearbyTransitStop(next.scene, next.interior);
      if (!currentStop) throw new Error('请先走到室外交通站候车区，再选择乘车。');
      const vehicle = transitVehicles.find(vehicle => vehicle.id === action.vehicleId);
      if (!vehicle) throw new Error('请选择都营巴士或东京Metro接驳线路。');
      const route = getTransitRoutes(currentStop.id, vehicle.id).find(route => route.stop.id === action.stopId);
      if (!route) throw new Error('当前站点没有这条路线；远地之间请返回校园站换乘。');
      if (next.player.balance < route.fare) throw new Error(`余额不足，本程需要 ${route.fare} 日元。`);
      if (next.transit.sequence >= TRANSIT_SEQUENCE_LIMIT) throw new Error('乘车记录已达到上限，本次未扣费。');
      const sequence = next.transit.sequence + 1;
      const rideId = `transit-ride-${sequence}`;
      if (next.journal.some(entry => entry.id === rideId)) throw new Error('乘车记录 ID 冲突，本次未扣费。');
      const coordinates = sceneCoordinates(route.stop.x, route.stop.z, route.stop.yaw);
      advance(next, route.minutes);
      next.player.balance -= route.fare;
      next.scene = { ...coordinates, seed: next.scene!.seed, encounterId: null };
      next.locationId = route.stop.locationId;
      const at = `第 ${next.clock.day} 天 ${String(next.clock.hour).padStart(2, '0')}:${String(next.clock.minute).padStart(2, '0')}`;
      next.transit = { sequence, lastRide: { id: rideId, vehicleId: vehicle.id, fromStopId: currentStop.id, toStopId: route.stop.id, minutes: route.minutes, fare: route.fare, at } };
      note(next, `搭乘 ${vehicle.label} 从${currentStop.label}前往${route.stop.label}，耗时 ${route.minutes} 分钟，车费 ${route.fare} 日元；已下车到达。`, rideId);
      break;
    }
    case 'enter_interior': {
      if (next.interior) throw new Error('请先离开当前房间。');
      const room = getCampusInterior(action.roomId);
      if (!room) throw new Error('不存在的室内地点。');
      if (room.id === MARGO_CAFE_ROOM_ID && !getLocationStatus(MARGO_CAFE_LOCATION_ID, next.clock)?.isOpen) throw new Error('玛格的咖啡馆已打烊，营业时间 10:00–次日 02:00。');
      if (!next.scene || next.locationId !== room.parentLocationId || Math.hypot(next.scene.x - room.entrance.x, next.scene.z - room.entrance.z) > INTERIOR_ENTRANCE_RANGE) throw new Error('请先走到建筑入口附近，再进入室内。');
      next.interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
      next.locationId = room.id;
      next.scene.encounterId = null;
      note(next, `进入${room.label}。`);
      break;
    }
    case 'leave_interior': {
      if (!next.interior) return next;
      const room = getCampusInterior(next.interior.roomId)!;
      next.interior = null;
      next.scene!.encounterId = null;
      next.locationId = sceneLocationId(next.scene!.areaId);
      note(next, `离开${room.label}，回到原来的室外入口位置。`);
      break;
    }
    case 'interior_walk': {
      if (!next.interior) throw new Error('请先进入室内。');
      next.interior = { ...next.interior, ...interiorCoordinates(next.interior.roomId, action.x, action.z, action.yaw) };
      clearIndoorEncounter(next);
      break;
    }
    case 'interior_interact': {
      if (!next.interior) throw new Error('请先进入室内。');
      const room = getCampusInterior(next.interior.roomId)!;
      const interaction = room.interactions.find(item => item.id === action.interactionId);
      if (!interaction) throw new Error('这项交互不属于当前房间。');
      if (room.id === MARGO_CAFE_ROOM_ID) {
        const venue = getLocationStatus(MARGO_CAFE_LOCATION_ID, next.clock)!;
        if (!venue.isOpen || (venue.minutesUntilClose !== null && interaction.minutes > venue.minutesUntilClose)) throw new Error('这项活动无法在咖啡馆打烊前完成。');
      }
      if (Math.hypot(next.interior.x - interaction.x, next.interior.z - interaction.z) > INTERIOR_INTERACTION_RANGE) throw new Error('请先走到对应设施附近再交互。');
      if (interaction.id === 'dorm-rest') throw new Error('请选择休息时长。');
      if (isStudyInteraction(interaction.id)) throw new Error('请选择学习时长。');
      if (interaction.id === 'livehouse-booking' || interaction.id === 'livehouse-create-band') {
        const who = (worldAuthority?.protagonists ? activeProtagonist(worldAuthority) : (next.protagonists ? activeProtagonist(next) : 'soyo'));
        const check = canManageLivehouseAndBand(next, who);
        if (!check.allowed) throw new Error(check.reason);
      }
      const formalLivehouse = interaction.id === 'livehouse-booking' || interaction.id === 'livehouse-create-band';
      if (formalLivehouse && !prepareLivehouseInteraction(next, action, worldAuthority ?? next)) return next;
      if (interaction.energyDelta < 0 && next.player.energy < -interaction.energyDelta) throw new Error('精力不足，请先休息。');
      if (interaction.minutes === 0 && interaction.energyDelta === 0 && next.interior.activityId === interaction.id) return next;
      const playerBefore = { ...next.player };
      advance(next, interaction.minutes);
      next.player.energy = adjustEnergy(next.player.energy, interaction.energyDelta);
      if (interaction.id === 'dorm-desk') applyActivityEffects(next, 'desk', interaction.minutes);
      if (interaction.id === 'study-shelf') applyActivityEffects(next, 'bookshelf', interaction.minutes);
      if (interaction.id === 'nikaido-kendo-practice') applyActivityEffects(next, 'practice', interaction.minutes);
      next.interior.activityId = interaction.id;
      next.interior.lastRest = null;
      next.interior.lastStudy = null;
      note(next, `${formalLivehouse ? livehouseReceipt(worldAuthority ? { ...next, protagonists: worldAuthority.protagonists } : next, action) : interaction.result}${interaction.minutes ? `耗时 ${interaction.minutes} 分钟，${interaction.energyDelta > 0 ? `恢复至多 ${interaction.energyDelta}` : `消耗 ${-interaction.energyDelta}`} 点精力。${activityChangeNote(playerBefore, next.player)}` : '未消耗时间或精力。'}`);
      break;
    }
    case 'interior_rest': {
      if (!next.interior || next.interior.roomId !== 'dorm-room') throw new Error('请先进入学生宿舍，在床边选择休息时长。');
      const option = bedRestOptions.find(item => item.id === action.optionId);
      if (!option) throw new Error('请选择有效的休息时长。');
      if (Math.hypot(next.interior.x - option.x, next.interior.z - option.z) > INTERIOR_INTERACTION_RANGE) throw new Error('请先走到床边附近再休息。');
      const sample = Math.random();
      if (!Number.isFinite(sample) || sample < 0 || sample > 1) throw new Error('休息时长生成失败，本次休息未结算，请重试。');
      const minutes = option.minMinutes + Math.min(option.maxMinutes - option.minMinutes, Math.floor(sample * (option.maxMinutes - option.minMinutes + 1)));
      const energyBefore = next.player.energy;
      const playerBefore = { ...next.player };
      const recovery = option.id === 'dorm-rest-long' ? 100 : Math.floor(minutes * 0.4);
      advance(next, minutes);
      next.player.energy = adjustEnergy(energyBefore, recovery);
      applyActivityEffects(next, 'rest', minutes);
      next.interior.activityId = option.id;
      next.interior.lastRest = { optionId: option.id, minutes, energyRecovered: energyDifference(next.player.energy, energyBefore) };
      next.interior.lastStudy = null;
      note(next, getInteriorActivity(getCampusInterior(next.interior.roomId)!, option.id, next.interior.lastRest)!.result + activityChangeNote(playerBefore, next.player));
      break;
    }
    case 'interior_study':
    case 'read_subject': {
      const quote = getAcademicStudyQuote(next, { subjectId: action.subjectId, optionId: action.optionId,
        ...(action.type === 'interior_study' ? { interactionId: action.interactionId } : {}) });
      if (quote.blockedReason || !quote.option || !quote.subject || !next.academics) throw new Error(quote.blockedReason ?? '无法开始学习。');
      const option = quote.option;
      const sample = Math.random();
      if (!Number.isFinite(sample) || sample < 0 || sample > 1) throw new Error('学习时长生成失败，本次学习未结算，请重试。');
      const minutes = option.minMinutes + Math.min(option.maxMinutes - option.minMinutes, Math.floor(sample * (option.maxMinutes - option.minMinutes + 1)));
      let outcome = quote.outcomes[0];
      if (quote.isCrossMajor) {
        const result = Math.random();
        if (!Number.isFinite(result) || result < 0 || result > 1) throw new Error('阅读结果生成失败，本次学习未结算，请重试。');
        outcome = quote.outcomes[result < .25 ? 0 : result < .5 ? 1 : 2];
      }
      const energyConsumed = getStudyEnergyCost(minutes) + outcome.extraEnergy;
      const points = minutes * (outcome.pointsMultiplier * 2) / 2;
      const playerBefore = { ...next.player };
      advance(next, minutes);
      next.player.energy = adjustEnergy(next.player.energy, -energyConsumed);
      const mental = getActivityEffects('study', minutes);
      next.player.morale = Math.min(100, Math.max(0, next.player.morale + mental.morale + outcome.morale));
      next.player.stress = Math.min(100, Math.max(0, next.player.stress + mental.stress + outcome.stress));
      const channel = action.type === 'read_subject' ? 'bookshop' : next.interior!.roomId as 'classroom' | 'study-room';
      if (action.type === 'interior_study') {
        next.interior!.activityId = action.interactionId;
        next.interior!.lastRest = null;
        next.interior!.lastStudy = { interactionId: action.interactionId, optionId: option.id, minutes, energyConsumed };
      }
      let subject = next.academics.subjects.find(item => item.subjectId === action.subjectId);
      if (!subject) { subject = { subjectId: action.subjectId, points: 0 }; next.academics.subjects.push(subject); }
      subject.points = (subject.points * 2 + points * 2) / 2;
      const at = `第 ${next.clock.day} 天 ${String(next.clock.hour).padStart(2, '0')}:${String(next.clock.minute).padStart(2, '0')}`;
      next.academics.lastGain = { subjectId: subject.subjectId, minutes, points, totalPoints: subject.points, at,
        outcome: outcome.id, channel, interactionId: action.type === 'interior_study' ? action.interactionId : null, energyConsumed, moraleChange: next.player.morale - playerBefore.morale, stressChange: next.player.stress - playerBefore.stress };
      const place = channel === 'bookshop' ? '书店' : getCampusInterior(channel)!.label;
      note(next, `在${place}学习${quote.subject.name} ${minutes} 分钟，消耗 ${energyConsumed} 点精力。${quote.isCrossMajor ? `跨专业阅读：${outcome.label}。` : ''}${activityChangeNote(playerBefore, next.player)}${quote.subject.name}学习进度 +${points}，累计 ${subject.points} 点。`);
      break;
    }
    case 'wait': {
      if (!Number.isInteger(action.minutes) || action.minutes < 1 || action.minutes > 120) throw new Error('等待时间必须是 1–120 的整数分钟。');
      const playerBefore = { ...next.player };
      advance(next, action.minutes); next.player.energy = adjustEnergy(next.player.energy, Math.floor(action.minutes / 15) * 2);
      applyActivityEffects(next, 'wait', action.minutes);
      note(next, `休息等待 ${action.minutes} 分钟。${activityChangeNote(playerBefore, next.player)}`);
      break;
    }
    case 'read_phone': {
      const message = next.phone.find(message => message.id === action.id);
      if (!message) throw new Error('找不到这条消息。');
      if (message.read) return next;
      message.read = true;
      note(next, `读了${next.contacts.find(contact => contact.id === message.npcId)!.name}的消息。`);
      break;
    }
    case 'complete_schedule': {
      const item = next.schedule.find(item => item.id === action.id);
      if (!item) throw new Error('找不到这项日程。');
      if (item.done) return next;
      if (next.locationId !== item.locationId) throw new Error('请先到达日程地点。');
      const [hour, minute] = item.time.split(':').map(Number);
      if (next.clock.hour * 60 + next.clock.minute < hour * 60 + minute) throw new Error('尚未到日程时间。');
      item.done = true; note(next, `完成日程：${item.title}。`);
      break;
    }
    default: throw new Error('不支持的行动。');
  }
  return next;
}

/** Public reducers keep the active legacy view as a compatibility projection only. */
export function reduceState(state: WorldState, action: WorldAction): WorldState {
  const parsed = parseState(state);
  const before = action?.type === 'interior_interact' && ['livehouse-create-band', 'livehouse-booking'].includes(action.interactionId) ? enableProtagonists(parsed) : parsed;
  if (action?.type === 'receive_cafe_gift') return parseState(finishPersonalChange(before, applyMargoCafeGift(before, action.offerId), '咖啡馆赠礼'));
  if (action?.type === 'switch_protagonist' || action?.type === 'phone_app') {
    const next = reduceProtagonistAction(before, action);
    captureNewJournalEvidence(before, next);
    settleWeeklyMemory(next);
    return parseState(clearDepartedProtagonistEncounters(next));
  }
  const next = reduceLegacyState(legacyView(before), action, before);
  const candidate = clearDepartedProtagonistEncounters(finishPersonalChange(before, next, `世界行动：${action.type}`));
  if (action.type === 'interior_interact' && action.booking) syncPerformanceCalendars(candidate, action.booking.id);
  return parseState(action.type === 'encounter' && !(candidate.protagonists && isProtagonistEncounter(action.personId))
    ? recordNpcEncounter(candidate, action.personId) : candidate);
}
export function applyStoryActions(state: WorldState, actions: readonly StoryAction[], turnId = 'preview'): WorldState {
  const before = parseState(state);
  const after = finishPersonalChange(before, applyLegacyStoryActions(legacyView(before), actions, turnId), '剧情行动');
  return parseState(applyStoryTransferLegs(clearDepartedProtagonistEncounters(after), actions, turnId));
}
export function commitStoryTurn(state: WorldState, input: string, result: GeneratedStory, ids: {userId: string; assistantId: string}, now = Date.now()): WorldState {
  const before = parseState(state);
  // The legacy single-protagonist reducer cannot validate a world-level weekly
  // summary; commit its ordinary story/actions first, then atomically apply the
  // validated omniscient report to the dual-protagonist candidate snapshot.
  const { weeklySummary, contactRequests, phoneDecision, ...legacyResult } = result;
  const finished = clearDepartedProtagonistEncounters(finishPersonalChange(before, commitLegacyStoryTurn(legacyView(before), input, legacyResult, ids, now, before), '剧情结算'));
  const settled = applyStoryTransferLegs(finished, legacyResult.worldActions ?? [], ids.assistantId);
  const next = commitNpcDialogue(before, recordProtagonistNarrative(before, settled, result, ids.assistantId), input, result, ids.assistantId);
  recordWeeklyStory(next, activeProtagonist(next), ids.assistantId, result.text);
  captureNewJournalEvidence(finished, next);
  applyWeeklySummary(next, result.weeklySummary);
  return parseState(next);
}



