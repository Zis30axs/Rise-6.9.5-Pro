import type { GeneratedStory, InteriorPresence, Location, ScenePresence, TransitState, WorldAction, WorldState } from '../frontend/types';
import { sceneAreas } from '../frontend/scene-layout';
import { getSceneArea, getScenePeople, SCENE_ENCOUNTER_DISTANCE, sceneEnvironments, sceneLocationId } from './scene-context';
import { STORY_OUTPUT_LIMITS, validateGeneratedStory } from './story-protocol';
import { advanceAirTraffic, createAirTrafficState, parseAirTrafficState, triggerAirliner } from './air-traffic';
import { bedRestOptions, campusInteriors, getCampusInterior, getInteriorActivity, getInteriorMovementWorld, getStudyEnergyCost, isStudyInteraction, studyDurationOptions, INTERIOR_ENTRANCE_RANGE, INTERIOR_INTERACTION_RANGE } from './campus-interiors';
import { isScenePositionWalkable } from '../frontend/scene-movement';
import { createTransitState, getNearbyTransitStop, getTransitRoutes, isFarTransitLocation, requiresTransitReturn, transitVehicles, TRANSIT_SEQUENCE_LIMIT } from './transit';

/** Bounded P0/P1 save format. All names and places below are prototype examples. */
export const STATE_LIMITS = { journal: 100, story: 40, phone: 200, ...STORY_OUTPUT_LIMITS } as const;
export const mapLocations: Location[] = [
  { id: 'gate', name: '校园南门', subtitle: '城市与校园的交界', description: `【示例场景】${sceneEnvironments['south-gate']}`, x: 46, y: 75 },
  { id: 'library', name: '图书馆', subtitle: '图书馆外的前庭', description: `【示例场景】${sceneEnvironments.library}`, x: 36, y: 28 },
  { id: 'cafe', name: '街角咖啡店', subtitle: '校园咖啡店外的露台', description: `【示例场景】${sceneEnvironments['campus-cafe']}`, x: 76, y: 64 },
  { id: 'dorm', name: '学生公寓', subtitle: '公寓外的宿舍院落', description: `【示例场景】${sceneEnvironments.residences}`, x: 70, y: 23 },
  { id: 'teaching', name: '教学楼', subtitle: '教学楼外的广场', description: `【示例场景】${sceneEnvironments.teaching}`, x: 48, y: 13 },
];
export const locations: Location[] = [
  ...mapLocations,
  ...sceneAreas.filter(area => !mapLocations.some(location => location.id === sceneLocationId(area.id))).map(area => ({
    id: area.id, name: area.label, subtitle: '户外步行区域', description: `【示例场景】${sceneEnvironments[area.id]}`,
    x: (area.minX + area.maxX) / 2, y: (area.minZ + area.maxZ) / 2,
  })),
  ...campusInteriors.map(room => ({ id: room.id, name: room.label, subtitle: '校园室内', description: room.description, x: room.entrance.x, y: room.entrance.z })),
];

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
  return {
    schema_version: '1.6.0', clock: { day: 1, hour: 17, minute: 20 }, locationId: 'gate', scene: null, interior: null,
    airTraffic: createAirTrafficState(),
    transit: createTransitState(),
    player: { energy: 80, balance: 328 },
    phone: [
      { id: 'phone-lin', npcId: 'lin', text: '【示例剧情消息】我在图书馆整理笔记。你经过的话，可以来坐一会儿。', read: false, at: '第 1 天 17:12' },
      { id: 'phone-zhou', npcId: 'zhou', text: '【示例剧情消息】社团活动的时间暂定今晚六点，在街角咖啡店。', read: false, at: '第 1 天 17:16' },
    ],
    contacts: [
      { id: 'lin', name: '林同学', tag: '演示 NPC · 同学', summary: '用于验证人物档案、消息与关系展示的示例。正式身份和经历尚待作者确认。', affinity: 12, status: '正在图书馆整理笔记' },
      { id: 'zhou', name: '周同学', tag: '演示 NPC · 社团成员', summary: '用于验证社交入口与日程的示例人物。原型不会让一次行动自动改变所有关系。', affinity: 5, status: '准备晚间的社团活动' },
    ],
    schedule: [
      { id: 'library-notes', title: '【演示】去图书馆整理笔记', locationId: 'library', time: '17:30', done: false },
      { id: 'club-meet', title: '【演示】社团见面', locationId: 'cafe', time: '18:00', done: false },
    ],
    journal: [{ id: 'entry-1', text: '开始原型体验。人物、地点及安排均为演示内容，可在源码中替换。', at: '第 1 天 17:20' }],
    story: [{ id: 'opening', role: 'assistant', text: '【原型示例】傍晚的风穿过校园南门。手机轻震了两下。你可以先读消息、去一个地方，或留在这里说出自己的行动。' }],
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
function parseScenePresence(value: unknown): ScenePresence {
  const item = object(value, ['x', 'z', 'yaw', 'areaId', 'seed', 'encounterId'], 'scene');
  const coordinates = sceneCoordinates(item.x, item.z, item.yaw);
  if (item.areaId !== coordinates.areaId) return invalid('scene.areaId 与坐标不一致');
  const scene: ScenePresence = { ...coordinates, seed: sceneSeed(item.seed), encounterId: item.encounterId === null ? null : id(item.encounterId, 'scene.encounterId') };
  if (scene.encounterId) {
    const person = getScenePeople(scene).find(person => person.id === scene.encounterId);
    if (!person || Math.hypot(person.x - scene.x, person.z - scene.z) > SCENE_ENCOUNTER_DISTANCE) return invalid('scene.encounterId 当前不在附近');
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

function parseInteriorPresence(value: unknown, version: '1.3.0' | '1.4.0' | '1.5.0' | '1.6.0'): InteriorPresence {
  const hasStudy = version === '1.5.0' || version === '1.6.0';
  const item = object(value, ['roomId', 'x', 'z', 'yaw', 'activityId', ...(version === '1.3.0' ? [] : ['lastRest']), ...(hasStudy ? ['lastStudy'] : [])], 'interior');
  const roomId = id(item.roomId, 'interior.roomId');
  const room = getCampusInterior(roomId);
  if (!room) return invalid('interior.roomId');
  const coordinates = interiorCoordinates(roomId, item.x, item.z, item.yaw);
  const activityId = item.activityId === null ? null : id(item.activityId, 'interior.activityId');
  if (activityId && !getInteriorActivity(room, activityId)) return invalid('interior.activityId');
  let lastRest: InteriorPresence['lastRest'] = null;
  if (version !== '1.3.0' && item.lastRest !== null) {
    const saved = object(item.lastRest, ['optionId', 'minutes', 'energyRecovered'], 'interior.lastRest');
    const optionId = id(saved.optionId, 'interior.lastRest.optionId');
    const option = bedRestOptions.find(option => option.id === optionId);
    if (roomId !== 'dorm-room' || !option || activityId !== optionId) return invalid('interior.lastRest 与房间或活动不一致');
    const minutes = number(saved.minutes, 'interior.lastRest.minutes', option.minMinutes, option.maxMinutes);
    const maximumRecovery = option.id === 'dorm-rest-long' ? 100 : Math.floor(minutes * 0.4);
    lastRest = { optionId, minutes, energyRecovered: number(saved.energyRecovered, 'interior.lastRest.energyRecovered', 0, maximumRecovery) };
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
    if (energyConsumed !== getStudyEnergyCost(minutes)) return invalid('interior.lastStudy.energyConsumed 与实际时长不一致');
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
  const route = getTransitRoutes(fromStopId).find(route => route.stop.id === toStopId);
  if (!vehicle || rideId !== `transit-ride-${sequence}` || !route || ride.minutes !== route.minutes || ride.fare !== route.fare) return invalid('transit.lastRide 车辆、路线或结算不一致');
  const at = text(ride.at, 'transit.lastRide.at', 40);
  const stamp = /^第 ([1-9]\d{0,5}) 天 ([01]\d|2[0-3]):([0-5]\d)$/.exec(at);
  const day = stamp ? Number(stamp[1]) : 0;
  const total = stamp ? day * 1440 + Number(stamp[2]) * 60 + Number(stamp[3]) : 0;
  if (!stamp || day > 365000 || total > clock.day * 1440 + clock.hour * 60 + clock.minute) return invalid('transit.lastRide.at');
  return { sequence, lastRide: { id: rideId, vehicleId: vehicle.id, fromStopId, toStopId, minutes: route.minutes, fare: route.fare, at } };
}

/** Reconstruct known fields; never merge untrusted save objects into live state. */
export function parseState(value: unknown): WorldState {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid('state');
  const version = (value as Record<string, unknown>).schema_version;
  if (version !== '1.0.0' && version !== '1.1.0' && version !== '1.2.0' && version !== '1.3.0' && version !== '1.4.0' && version !== '1.5.0' && version !== '1.6.0') return invalid('schema_version（支持 1.0.0 至 1.6.0）');
  const hasTransit = version === '1.6.0';
  const hasInterior = version === '1.3.0' || version === '1.4.0' || version === '1.5.0' || hasTransit;
  const hasAirTraffic = hasInterior || version === '1.2.0';
  const state = object(value, ['schema_version', 'clock', 'locationId', 'player', 'phone', 'contacts', 'schedule', 'journal', 'story', ...(version !== '1.0.0' ? ['scene'] : []), ...(hasAirTraffic ? ['airTraffic'] : []), ...(hasInterior ? ['interior'] : []), ...(hasTransit ? ['transit'] : [])], 'state');
  const clock = object(state.clock, ['day', 'hour', 'minute'], 'clock');
  const player = object(state.player, ['energy', 'balance'], 'player');
  const parsedClock = { day: number(clock.day, 'clock.day', 1, 365000), hour: number(clock.hour, 'clock.hour', 0, 23), minute: number(clock.minute, 'clock.minute', 0, 59) };
  const result: WorldState = {
    schema_version: '1.6.0',
    clock: parsedClock,
    locationId: place(state.locationId, 'locationId'),
    scene: version === '1.0.0' || state.scene === null ? null : parseScenePresence(state.scene),
    interior: hasInterior && state.interior !== null ? parseInteriorPresence(state.interior, version) : null,
    airTraffic: hasAirTraffic ? parseAirTrafficState(state.airTraffic) : createAirTrafficState(),
    transit: hasTransit ? parseTransitState(state.transit, parsedClock) : createTransitState(),
    player: { energy: number(player.energy, 'player.energy', 0, 100), balance: number(player.balance, 'player.balance', 0, 1_000_000, false) },
    phone: list(state.phone, 'phone', STATE_LIMITS.phone, (value, path) => {
      const item = object(value, ['id', 'npcId', 'text', 'read', 'at'], path);
      return { id: id(item.id, `${path}.id`), npcId: id(item.npcId, `${path}.npcId`), text: text(item.text, `${path}.text`, 4000), read: boolean(item.read, `${path}.read`), at: text(item.at, `${path}.at`, 40) };
    }),
    contacts: list(state.contacts, 'contacts', 50, (value, path) => {
      const item = object(value, ['id', 'name', 'tag', 'summary', 'affinity', 'status'], path);
      return { id: id(item.id, `${path}.id`), name: text(item.name, `${path}.name`, 80), tag: text(item.tag, `${path}.tag`, 80), summary: text(item.summary, `${path}.summary`, 2000), affinity: number(item.affinity, `${path}.affinity`, -100, 100), status: text(item.status, `${path}.status`, 200) };
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
      const item = object(value, ['id', 'role', 'text'], path);
      if (item.role !== 'user' && item.role !== 'assistant') return invalid(`${path}.role`);
      return { id: id(item.id, `${path}.id`), role: item.role, text: text(item.text, `${path}.text`, STATE_LIMITS.storyText) };
    }),
  };
  if (result.phone.some(message => !result.contacts.some(contact => contact.id === message.npcId))) return invalid('phone.npcId 引用');
  if (version === '1.0.0' && !['gate', 'library', 'cafe', 'dorm'].includes(result.locationId)) return invalid('1.0.0 locationId');
  if (!hasInterior && getCampusInterior(result.locationId)) return invalid('旧版 locationId');
  if (!hasTransit && (isFarTransitLocation(result.locationId) || (result.scene && (result.scene.x < -70 || result.scene.x > 70 || result.scene.z < -60 || result.scene.z > 90)))) return invalid('旧版 scene 或 locationId 超出原范围');
  if (result.interior) {
    const room = getCampusInterior(result.interior.roomId)!;
    if (result.locationId !== room.id || !result.scene || sceneLocationId(result.scene.areaId) !== room.parentLocationId
      || Math.hypot(result.scene.x - room.entrance.x, result.scene.z - room.entrance.z) > INTERIOR_ENTRANCE_RANGE) return invalid('interior 与室外返回位置或 locationId 不一致');
  } else {
    if (getCampusInterior(result.locationId)) return invalid('locationId 缺少 interior');
    if (isFarTransitLocation(result.locationId) && !result.scene) return invalid('远地 locationId 缺少 scene');
    if (result.scene && sceneLocationId(result.scene.areaId) !== result.locationId) return invalid('scene 与 locationId 不一致');
  }
  return result;
}

/**
 * Build one atomic world snapshot. The caller saves this snapshot once, then
 * delivers its persisted phone records and displays the accepted world event.
 * Retrying delivery keeps the same IDs. Legacy saves retain their existing data.
 */
export function commitStoryTurn(
  state: WorldState,
  input: string,
  result: GeneratedStory,
  ids: { userId: string; assistantId: string },
  now = Date.now(),
): WorldState {
  const next = parseState(state);
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
  const existingUser = next.story.find(entry => entry.id === ids.userId);
  const existingAssistant = next.story.find(entry => entry.id === ids.assistantId);
  if (existingUser || existingAssistant) {
    if (existingUser?.role === 'user' && existingUser.text === inputText && existingAssistant?.role === 'assistant' && existingAssistant.text === reply.text) {
      const unchanged = reply.phoneMessages.every((message, index) => {
        const existing = next.phone.find(item => item.id === `${ids.assistantId}:phone:${index}`);
        return existing && existing.npcId === message.npcId && existing.text === message.text;
      });
      const prefix = `${ids.assistantId}:phone:`;
      if (unchanged && next.phone.filter(item => item.id.startsWith(prefix)).length === reply.phoneMessages.length && hasFlight === recordedFlight) return next;
    }
    throw new Error('剧情记录 ID 冲突；本轮未写入。');
  }
  if (recordedFlight) throw new Error('空中事件 ID 冲突；本轮未写入。');
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
  next.story.push(
    { id: ids.userId, role: 'user', text: inputText },
    { id: ids.assistantId, role: 'assistant', text: reply.text },
  );
  next.story = next.story.slice(-STATE_LIMITS.story);
  return parseState(next);
}

/** Read receipts can only mark known message IDs; unknown/stale IDs do nothing. */
export function acknowledgePhoneRead(state: WorldState, ids: readonly string[]): WorldState {
  const next = parseState(state);
  if (!Array.isArray(ids) || ids.length > STATE_LIMITS.phone || ids.some(value => typeof value !== 'string')) throw new Error('手机已读回执无效，世界存档未更新。');
  const received = new Set(ids);
  for (const message of next.phone) if (received.has(message.id)) message.read = true;
  return next;
}

function advance(state: WorldState, minutes: number) {
  const next = state.clock.hour * 60 + state.clock.minute + minutes;
  state.clock = { day: state.clock.day + Math.floor(next / 1440), hour: Math.floor(next / 60) % 24, minute: next % 60 };
  if (state.clock.day > 365000) throw new Error('原型已到达最大天数，无法继续推进。');
}
function note(state: WorldState, message: string, stableId?: string) {
  const prefix = `entry-${state.clock.day}-${state.clock.hour}-${state.clock.minute}-`;
  const occupied = new Set(state.journal.map(entry => entry.id));
  let sequence = 1;
  while (occupied.has(`${prefix}${sequence}`)) sequence++;
  const at = `第 ${state.clock.day} 天 ${String(state.clock.hour).padStart(2, '0')}:${String(state.clock.minute).padStart(2, '0')}`;
  state.journal = [...state.journal, { id: stableId ?? `${prefix}${sequence}`, text: message, at }].slice(-STATE_LIMITS.journal);
}

/**
 * Prototype rules: travel costs 15 min plus the deterministic route outlook / 5 energy; waiting 1..120 min restores
 * 2 energy per complete 15 min. Reading costs no time. A schedule item is a
 * one-off task: complete at its location at/after its HH:mm on the current day.
 * There is no recurrence, deadline, relationship reward or LLM state mutation.
 */
export function reduceState(state: WorldState, action: WorldAction): WorldState {
  const next = parseState(state);
  if (!action || typeof action !== 'object') throw new Error('无效行动。');
  switch (action.type) {
    case 'air_traffic_tick':
      if (next.interior) return next;
      next.airTraffic = advanceAirTraffic(next.airTraffic, action.now, next.scene?.seed);
      break;
    case 'walk': {
      if (next.interior) throw new Error('当前在室内，请使用室内行走或先离开房间。');
      const seed = sceneSeed(action.seed);
      const coordinates = sceneCoordinates(action.x, action.z, action.yaw);
      const scene: ScenePresence = { ...coordinates, seed: next.scene?.seed ?? seed, encounterId: next.scene?.encounterId ?? null };
      const person = scene.encounterId ? getScenePeople(scene).find(person => person.id === scene.encounterId) : null;
      if (person && Math.hypot(person.x - scene.x, person.z - scene.z) > SCENE_ENCOUNTER_DISTANCE) scene.encounterId = null;
      next.scene = scene;
      next.locationId = sceneLocationId(scene.areaId);
      break;
    }
    case 'encounter': {
      if (next.interior) throw new Error('当前室内没有可搭话的已设定人物。');
      if (!next.scene) throw new Error('请先进入自由行走，再走到行人附近搭话。');
      const person = getScenePeople(next.scene).find(person => person.id === action.personId);
      if (!person) throw new Error('这位行人不属于当前场景。');
      if (Math.hypot(person.x - next.scene.x, person.z - next.scene.z) > SCENE_ENCOUNTER_DISTANCE) throw new Error('请走到这位行人附近再搭话。');
      next.scene.encounterId = person.id;
      break;
    }
    case 'travel': {
      if (next.interior) throw new Error('请先离开房间，再选择前往其他地点。');
      if (requiresTransitReturn(next.locationId, next.scene)) throw new Error('当前在远郊，请到公交站乘车返回校园后再步行前往。');
      if (action.locationId !== 'bus-stop' && !mapLocations.some(location => location.id === action.locationId)) throw new Error('不存在的地点。');
      if (next.locationId === action.locationId) { next.scene = null; return next; }
      if (next.player.energy < 5) throw new Error('精力不足，请先等待休息。');
      const outlook = getRouteOutlook(next, action.locationId);
      const minutes = 15 + outlook.extraMinutes;
      advance(next, minutes); next.player.energy -= 5; next.locationId = action.locationId; next.scene = null;
      const eventNote = outlook.event ? `途中遇到${outlook.event.title}，额外停留 ${outlook.extraMinutes} 分钟。${outlook.event.description}` : '';
      note(next, `前往${locations.find(location => location.id === action.locationId)!.name}，步行耗时 ${minutes} 分钟。${eventNote}`);
      break;
    }
    case 'ride_transit': {
      const currentStop = getNearbyTransitStop(next.scene, next.interior);
      if (!currentStop) throw new Error('请先走到室外公交站候车区，再选择乘车。');
      const vehicle = transitVehicles.find(vehicle => vehicle.id === action.vehicleId);
      if (!vehicle) throw new Error('请选择 BTR-82A 或 ZBD-04A 乘车。');
      const route = getTransitRoutes(currentStop.id).find(route => route.stop.id === action.stopId);
      if (!route) throw new Error('当前站点没有这条路线；远地之间请返回校园站换乘。');
      if (next.player.balance < route.fare) throw new Error(`余额不足，本程需要 ${route.fare} 元。`);
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
      note(next, `搭乘 ${vehicle.label} 从${currentStop.label}前往${route.stop.label}，耗时 ${route.minutes} 分钟，车费 ${route.fare} 元；已下车到达。`, rideId);
      break;
    }
    case 'enter_interior': {
      if (next.interior) throw new Error('请先离开当前房间。');
      const room = getCampusInterior(action.roomId);
      if (!room) throw new Error('不存在的室内地点。');
      if (!next.scene || next.locationId !== room.parentLocationId || Math.hypot(next.scene.x - room.entrance.x, next.scene.z - room.entrance.z) > INTERIOR_ENTRANCE_RANGE) throw new Error('请先走到建筑入口附近，再进入室内。');
      next.interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
      next.locationId = room.id;
      note(next, `进入${room.label}。`);
      break;
    }
    case 'leave_interior': {
      if (!next.interior) return next;
      const room = getCampusInterior(next.interior.roomId)!;
      next.interior = null;
      next.locationId = sceneLocationId(next.scene!.areaId);
      note(next, `离开${room.label}，回到原来的室外入口位置。`);
      break;
    }
    case 'interior_walk': {
      if (!next.interior) throw new Error('请先进入室内。');
      next.interior = { ...next.interior, ...interiorCoordinates(next.interior.roomId, action.x, action.z, action.yaw) };
      break;
    }
    case 'interior_interact': {
      if (!next.interior) throw new Error('请先进入室内。');
      const room = getCampusInterior(next.interior.roomId)!;
      const interaction = room.interactions.find(item => item.id === action.interactionId);
      if (!interaction) throw new Error('这项交互不属于当前房间。');
      if (Math.hypot(next.interior.x - interaction.x, next.interior.z - interaction.z) > INTERIOR_INTERACTION_RANGE) throw new Error('请先走到对应设施附近再交互。');
      if (interaction.id === 'dorm-rest') throw new Error('请选择休息时长。');
      if (isStudyInteraction(interaction.id)) throw new Error('请选择学习时长。');
      if (interaction.energyDelta < 0 && next.player.energy < -interaction.energyDelta) throw new Error('精力不足，请先休息。');
      if (interaction.minutes === 0 && interaction.energyDelta === 0 && next.interior.activityId === interaction.id) return next;
      advance(next, interaction.minutes);
      next.player.energy = Math.min(100, Math.max(0, next.player.energy + interaction.energyDelta));
      next.interior.activityId = interaction.id;
      next.interior.lastRest = null;
      next.interior.lastStudy = null;
      note(next, `${interaction.result}${interaction.minutes ? `耗时 ${interaction.minutes} 分钟，${interaction.energyDelta > 0 ? `恢复至多 ${interaction.energyDelta}` : `消耗 ${-interaction.energyDelta}`} 点精力。` : '未消耗时间或精力。'}`);
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
      const recovery = option.id === 'dorm-rest-long' ? 100 : Math.floor(minutes * 0.4);
      advance(next, minutes);
      next.player.energy = Math.min(100, energyBefore + recovery);
      next.interior.activityId = option.id;
      next.interior.lastRest = { optionId: option.id, minutes, energyRecovered: next.player.energy - energyBefore };
      next.interior.lastStudy = null;
      note(next, getInteriorActivity(getCampusInterior(next.interior.roomId)!, option.id, next.interior.lastRest)!.result);
      break;
    }
    case 'interior_study': {
      if (!next.interior) throw new Error('请先进入教室或自习室，在学习设施旁选择学习时长。');
      const room = getCampusInterior(next.interior.roomId)!;
      const interaction = room.interactions.find(item => item.id === action.interactionId);
      if (!interaction || !isStudyInteraction(interaction.id)) throw new Error('这项学习交互不属于当前房间。');
      const option = studyDurationOptions.find(item => item.id === action.optionId);
      if (!option) throw new Error('请选择有效的学习时长。');
      if (Math.hypot(next.interior.x - interaction.x, next.interior.z - interaction.z) > INTERIOR_INTERACTION_RANGE) throw new Error('请先走到学习设施附近再学习。');
      if (next.player.energy < getStudyEnergyCost(option.maxMinutes)) throw new Error(`精力不足，此档学习至少需要 ${getStudyEnergyCost(option.maxMinutes)} 点精力，请先休息。`);
      const sample = Math.random();
      if (!Number.isFinite(sample) || sample < 0 || sample > 1) throw new Error('学习时长生成失败，本次学习未结算，请重试。');
      const minutes = option.minMinutes + Math.min(option.maxMinutes - option.minMinutes, Math.floor(sample * (option.maxMinutes - option.minMinutes + 1)));
      const energyConsumed = getStudyEnergyCost(minutes);
      advance(next, minutes);
      next.player.energy -= energyConsumed;
      next.interior.activityId = interaction.id;
      next.interior.lastRest = null;
      next.interior.lastStudy = { interactionId: interaction.id, optionId: option.id, minutes, energyConsumed };
      note(next, getInteriorActivity(room, interaction.id, null, next.interior.lastStudy)!.result);
      break;
    }
    case 'wait':
      if (!Number.isInteger(action.minutes) || action.minutes < 1 || action.minutes > 120) throw new Error('等待时间必须是 1–120 的整数分钟。');
      advance(next, action.minutes); next.player.energy = Math.min(100, next.player.energy + Math.floor(action.minutes / 15) * 2);
      note(next, `休息等待 ${action.minutes} 分钟。`);
      break;
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
