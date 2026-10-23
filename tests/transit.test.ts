import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorldAction, WorldState } from '../src/frontend/types';
import { createTavernBridge } from '../src/runtime/bridge';
import { commitStoryTurn, createInitialState, mapLocations, parseState, reduceState } from '../src/runtime/model';
import { createTransitState, getNearbyTransitStop, getTransitContext, getTransitRoutes, isOutsideCampus, transitStops, transitVehicles, TRANSIT_SEQUENCE_LIMIT } from '../src/runtime/transit';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { getSceneContext } from '../src/runtime/scene-context';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import { withoutPlayerNeeds, withAcademicSelection } from './legacy-state';
import { initialPlayerNeeds } from '../src/runtime/convenience-store';

afterEach(() => vi.restoreAllMocks());
const atStop = (id = 'campus') => {
  const stop = transitStops.find(stop => stop.id === id)!;
  return reduceState(createInitialState(), { type: 'walk', x: stop.x, z: stop.z, yaw: stop.yaw, seed: 'transit-world-seed' });
};
const absoluteMinutes = (state: WorldState) => state.clock.day * 1440 + state.clock.hour * 60 + state.clock.minute;

describe('program-owned public transit', () => {
  it('keeps every local sandtable pin while exposing a walk-to-bus-stop action and stable route quotes', () => {
    const initial = createInitialState();
    expect(mapLocations.map(location => location.id)).toEqual(['gate', 'library', 'cafe', 'dorm', 'teaching', 'sports', 'junction', 'bookshop', 'convenience', 'street-cafe', 'pocket-park', 'bus-stop']);
    const arrived = reduceState(initial, { type: 'travel', locationId: 'bus-stop' });
    expect(arrived.locationId).toBe('bus-stop');
    expect(arrived.scene).toBeNull();
    expect(arrived.player.energy).toBe(75);
    expect(absoluteMinutes(arrived) - absoluteMinutes(initial)).toBeGreaterThanOrEqual(15);
    expect(getTransitRoutes('campus').map(route => [route.stop.id, route.minutes, route.fare])).toEqual([['home', 12, 180], ['commercial', 18, 210], ['city-park', 16, 180]]);
    expect(getTransitRoutes('unknown')).toEqual([]);
    expect(getTransitRoutes('__proto__')).toEqual([]);
    const snapshot = JSON.stringify(arrived);
    for (let i = 0; i < 5; i++) getTransitContext(arrived.transit, arrived.scene, arrived.interior);
    expect(JSON.stringify(arrived)).toBe(snapshot);
  });

  it('only offers a stop outdoors within its real six-metre boarding area', () => {
    const initial = atStop();
    expect(getNearbyTransitStop(initial.scene)?.id).toBe('campus');
    expect(getNearbyTransitStop({ ...initial.scene!, x: 52, z: 38 })?.id).toBe('campus');
    expect(getNearbyTransitStop({ ...initial.scene!, x: 52.001, z: 38 })).toBeNull();
    expect(getNearbyTransitStop({ ...initial.scene!, x: NaN })).toBeNull();
    expect(getNearbyTransitStop(null)).toBeNull();
    const room = getCampusInterior('dorm-room')!;
    const interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
    expect(getNearbyTransitStop(initial.scene, interior)).toBeNull();
  });

  it.each(transitVehicles.flatMap(vehicle => getTransitRoutes('campus').map(route => ({ vehicle, route }))))('settles $vehicle.label to $route.stop.id once and keeps every unrelated state field', ({ vehicle, route }) => {
    const initial = atStop();
    initial.player.energy = 0;
    const snapshot = JSON.stringify(initial);
    const action = { type: 'ride_transit' as const, vehicleId: vehicle.id, stopId: route.stop.id, minutes: 999, fare: 999 };
    const arrived = reduceState(initial, action);
    expect(absoluteMinutes(arrived) - absoluteMinutes(initial)).toBe(route.minutes);
    expect(arrived.player).toEqual({ ...initial.player, balance: initial.player.balance - route.fare, foodEnergy: initial.player.foodEnergy - route.minutes * 2, satiety: initial.player.satiety - (Math.floor(absoluteMinutes(arrived) / 15) - Math.floor(absoluteMinutes(initial) / 15)) });
    expect(arrived.locationId).toBe(route.stop.locationId);
    expect(arrived.scene).toMatchObject({ x: route.stop.x, z: route.stop.z, yaw: route.stop.yaw, areaId: route.stop.locationId, seed: initial.scene!.seed, encounterId: null });
    expect(arrived.transit).toEqual({ sequence: 1, lastRide: { id: 'transit-ride-1', vehicleId: vehicle.id, fromStopId: 'campus', toStopId: route.stop.id, minutes: route.minutes, fare: route.fare, at: arrived.journal.at(-1)!.at } });
    expect(arrived.journal).toHaveLength(initial.journal.length + 1);
    expect(arrived.journal.at(-1)).toMatchObject({ id: 'transit-ride-1', text: expect.stringContaining(vehicle.label) });
    for (const key of ['airTraffic', 'interior', 'phone', 'contacts', 'schedule', 'story'] as const) expect(arrived[key]).toEqual(initial[key]);
    expect(JSON.stringify(initial)).toBe(snapshot);
    const restored = parseState(JSON.parse(JSON.stringify(arrived)));
    for (let i = 0; i < 3; i++) expect(parseState(JSON.parse(JSON.stringify(restored)))).toEqual(arrived);
    expect(getTransitContext(restored.transit, restored.scene).lastRide).toMatchObject({ alreadyCommitted: true, minutes: route.minutes, fare: route.fare });
    expect(getSceneContext(restored.scene)?.areaId).toBe(route.stop.locationId);
    expect(() => reduceState(restored, action)).toThrow(/路线/);
  });

  it.each(['home', 'commercial', 'city-park'])('returns from %s, charges a separate ride and refuses a direct outer transfer or campus teleport', stopId => {
    const outward = getTransitRoutes('campus').find(route => route.stop.id === stopId)!;
    const arrived = reduceState(atStop(), { type: 'ride_transit', vehicleId: 'btr82a', stopId });
    const snapshot = JSON.stringify(arrived);
    for (const target of [...mapLocations.map(location => location.id), 'bus-stop']) expect(() => reduceState(arrived, { type: 'travel', locationId: target })).toThrow(/公交/);
    expect(() => reduceState(arrived, { type: 'ride_transit', vehicleId: 'zbd04a', stopId: stopId === 'home' ? 'commercial' : 'home' })).toThrow(/换乘/);
    expect(JSON.stringify(arrived)).toBe(snapshot);
    expect(getTransitRoutes(stopId)).toEqual([{ stop: transitStops[0], minutes: outward.minutes, fare: outward.fare }]);
    const returned = reduceState(arrived, { type: 'ride_transit', vehicleId: 'zbd04a', stopId: 'campus' });
    expect(returned.locationId).toBe('bus-stop');
    expect(returned.scene).toMatchObject({ x: 46, z: 38, yaw: 3.141, areaId: 'bus-stop' });
    expect(returned.player.balance).toBe(6560 - 2 * outward.fare);
    expect(absoluteMinutes(returned) - absoluteMinutes(arrived)).toBe(outward.minutes);
    expect(returned.transit.sequence).toBe(2);
    expect(returned.transit.lastRide).toMatchObject({ id: 'transit-ride-2', fromStopId: stopId, toStopId: 'campus', vehicleId: 'zbd04a' });
    expect(returned.journal.filter(entry => entry.id.startsWith('transit-ride-'))).toHaveLength(2);
    expect(parseState(JSON.parse(JSON.stringify(returned)))).toEqual(returned);
  });

  it('rejects remote, indoor, same-stop, unknown-vehicle and insufficient-balance actions atomically', () => {
    const current = atStop();
    const snapshot = JSON.stringify(current);
    for (const action of [
      { type: 'ride_transit', vehicleId: 't84', stopId: 'home' },
      { type: 'ride_transit', vehicleId: '__proto__', stopId: 'home' },
      { type: 'ride_transit', vehicleId: 'btr82a', stopId: 'campus' },
      { type: 'ride_transit', vehicleId: 'btr82a', stopId: 'unknown' },
    ] as WorldAction[]) expect(() => reduceState(current, action)).toThrow();
    const ride = { type: 'ride_transit' as const, vehicleId: 'btr82a', stopId: 'home' };
    for (const state of [createInitialState(), reduceState(current, { type: 'walk', x: 53, z: 38, yaw: 0, seed: 'ignored' })]) expect(() => reduceState(state, ride)).toThrow(/交通站/);
    const room = getCampusInterior('dorm-room')!;
    const inside = reduceState(reduceState(createInitialState(), { type: 'walk', ...room.entrance, seed: 'indoor-transit' }), { type: 'enter_interior', roomId: room.id });
    expect(() => reduceState(inside, ride)).toThrow(/室外/);
    const poor = { ...current, player: { ...current.player, energy: 80, balance: 5.99 } };
    const poorSnapshot = JSON.stringify(poor);
    expect(() => reduceState(poor, ride)).toThrow(/余额不足/);
    expect(JSON.stringify(poor)).toBe(poorSnapshot);
    for (const stop of transitStops.slice(1)) expect(() => reduceState(current, { type: 'travel', locationId: stop.locationId })).toThrow(/不存在/);
    expect(JSON.stringify(current)).toBe(snapshot);
  });

  it('requires a bus return while outside the original campus district, including connecting roads', () => {
    const road = reduceState(atStop('home'), { type: 'walk', x: 120, z: 100, yaw: 0, seed: 'ignored' });
    expect(road.locationId).toBe('city-roads');
    expect(isOutsideCampus(road.scene)).toBe(true);
    for (const target of ['gate', 'bus-stop', 'library']) expect(() => reduceState(road, { type: 'travel', locationId: target })).toThrow(/交通站乘车返回/);
    const backInside = reduceState(road, { type: 'walk', x: 60, z: 39, yaw: 0, seed: 'ignored' });
    expect(isOutsideCampus(backInside.scene)).toBe(false);
    expect(reduceState(backInside, { type: 'travel', locationId: 'gate' }).locationId).toBe('gate');
  });

  it('handles midnight, exact fares, exhausted sequence and the maximum day without partial changes', () => {
    const current = atStop();
    current.clock = { day: 8, hour: 23, minute: 50 };
    current.player.balance = 180;
    const arrived = reduceState(current, { type: 'ride_transit', vehicleId: 'zbd04a', stopId: 'home' });
    expect(arrived.clock).toEqual({ day: 9, hour: 0, minute: 2 });
    expect(arrived.player.balance).toBe(0);
    expect(arrived.transit.lastRide?.at).toBe('第 9 天 00:02');
    const limit = { ...current, clock: { day: 365000, hour: 23, minute: 50 } };
    const limitSnapshot = JSON.stringify(limit);
    expect(() => reduceState(limit, { type: 'ride_transit', vehicleId: 'btr82a', stopId: 'home' })).toThrow(/最大天数/);
    expect(JSON.stringify(limit)).toBe(limitSnapshot);
    const exhausted = { ...current, transit: { sequence: TRANSIT_SEQUENCE_LIMIT, lastRide: { ...arrived.transit.lastRide!, id: `transit-ride-${TRANSIT_SEQUENCE_LIMIT}`, at: '第 8 天 17:20' } } };
    expect(() => reduceState(exhausted, { type: 'ride_transit', vehicleId: 'btr82a', stopId: 'home' })).toThrow(/上限/);
    const collision = { ...current, journal: [...current.journal, { id: 'transit-ride-1', at: '第 8 天 17:20', text: '已有记录' }] };
    expect(() => reduceState(collision, { type: 'ride_transit', vehicleId: 'btr82a', stopId: 'home' })).toThrow(/ID 冲突/);
  });

  it('strictly validates ride receipts without reconstructing or charging a trip', () => {
    const arrived = reduceState(atStop(), { type: 'ride_transit', vehicleId: 'btr82a', stopId: 'home' });
    for (const transit of [undefined, null, {}, { sequence: 1, lastRide: null }, { sequence: 0.5, lastRide: null }, { sequence: 0, lastRide: arrived.transit.lastRide }, { ...arrived.transit, extra: true }]) expect(() => parseState({ ...arrived, transit })).toThrow(/存档格式无效/);
    for (const patch of [
      { id: 'transit-ride-2' }, { vehicleId: 't84' }, { fromStopId: 'home' }, { toStopId: 'campus' }, { minutes: 44 }, { minutes: '45' }, { fare: 0 }, { fare: Infinity }, { at: '第 2 天 00:00' }, { at: '第 0 天 18:05' }, { extra: {} },
    ]) expect(() => parseState({ ...arrived, transit: { ...arrived.transit, lastRide: { ...arrived.transit.lastRide, ...patch } } })).toThrow(/存档格式无效/);
    expect(() => parseState({ ...arrived, scene: null })).toThrow(/scene/);
  });

  it('migrates all old exterior formats and full 1.5 learning/rest/sky records without resampling', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    for (const roomId of ['dorm-room', 'classroom', 'study-room']) {
      const room = getCampusInterior(roomId)!;
      let current = reduceState(reduceState(createInitialState(), { type: 'walk', ...room.entrance, seed: 'old-learning' }), { type: 'enter_interior', roomId });
      const interaction = room.interactions.find(item => item.id === (roomId === 'dorm-room' ? 'dorm-rest' : roomId === 'classroom' ? 'classroom-notes' : 'study-focus'))!;
      current = reduceState(current, { type: 'interior_walk', x: interaction.x, z: interaction.z, yaw: 0 });
      if (roomId !== 'dorm-room') current = withAcademicSelection(current);
      current = reduceState(current, roomId === 'dorm-room' ? { type: 'interior_rest', optionId: 'dorm-rest-short' } : { type: 'interior_study', subjectId: 'cs-programming', interactionId: interaction.id, optionId: 'study-short' });
      const { transit: _transit, ...oldFields } = withoutPlayerNeeds(current);
      const old15 = { ...oldFields, schema_version: '1.5.0' };
      const saved = JSON.stringify(old15);
      const count = random.mock.calls.length;
      expect(parseState(JSON.parse(saved))).toEqual({ ...current, academics: null, player: { ...current.player, ...initialPlayerNeeds } });
      expect(parseState(JSON.parse(saved)).transit).toEqual(createTransitState());
      expect(random.mock.calls.length).toBe(count);
      expect(JSON.stringify(old15)).toBe(saved);
      expect(() => parseState({ ...old15, transit: createTransitState() })).toThrow(/字段/);
    }
    const current = atStop();
    const { transit: _transit, ...legacy } = withoutPlayerNeeds(current);
    for (const version of ['1.3.0', '1.4.0', '1.5.0']) expect(parseState({ ...legacy, schema_version: version })).toEqual(current);
    const { interior: _interior, ...old12 } = legacy;
    expect(parseState({ ...old12, schema_version: '1.2.0' })).toEqual(current);
    const { airTraffic: _air, ...old11 } = old12;
    expect(parseState({ ...old11, schema_version: '1.1.0' })).toEqual(current);
    const { scene: _scene, ...old10 } = old11;
    expect(parseState({ ...old10, locationId: 'gate', schema_version: '1.0.0' })).toEqual(createInitialState());
    const far = atStop('home');
    const { transit: _farTransit, ...oldFar } = withoutPlayerNeeds(far);
    expect(() => parseState({ ...oldFar, schema_version: '1.5.0' })).toThrow(/旧版/);
    const road = reduceState(current, { type: 'walk', x: 71, z: 38, yaw: 0, seed: 'ignored' });
    const { transit: _roadTransit, ...oldRoad } = withoutPlayerNeeds(road);
    expect(() => parseState({ ...oldRoad, schema_version: '1.5.0' })).toThrow(/旧版/);
  });

  it('carries the saved ride into narrative context and commits prose without settling it again', async () => {
    let request: { user_input: string; injects: { content: string }[] } | undefined;
    const host = { parent: { SillyTavern: { getContext: () => ({ characterId: 0, characters: { 0: { avatar: 'transit.png' } }, chatId: 'transit-test', mainApi: 'openai' }) } }, getVariables: () => ({}), replaceVariables: vi.fn(), eventOn: vi.fn(), eventRemoveListener: vi.fn(), tavern_events: { CHAT_CHANGED: 'chat_changed' }, generate: vi.fn(async (config: NonNullable<typeof request>) => { request = config; return JSON.stringify({ story: '商业街的店面亮着灯。', phone_messages: [] }); }), stopGenerationById: vi.fn() } as unknown as Window;
    const bridge = createTavernBridge(host)!;
    const state = reduceState(atStop(), { type: 'ride_transit', vehicleId: 'zbd04a', stopId: 'commercial' });
    const reply = await bridge.generate('看看周围', state);
    const summary = JSON.parse(request!.user_input.split('\n')[1]);
    expect(summary.location).toBe('commercial');
    expect(summary.scene).toMatchObject({ areaId: 'commercial', outdoors: true });
    expect(summary.transit.lastRide).toMatchObject({ vehicleId: 'zbd04a', fromStopId: 'campus', toStopId: 'commercial', minutes: 18, fare: 210, alreadyCommitted: true });
    expect(request!.injects[0].content).toContain('乘车可由travel执行');
    const committed = commitStoryTurn(state, '看看周围', reply, { userId: 'transit-prose-user', assistantId: 'transit-prose-assistant' });
    for (const key of ['clock', 'player', 'scene', 'transit', 'journal'] as const) expect(committed[key]).toEqual(state[key]);
    expect(commitStoryTurn(committed, '看看周围', reply, { userId: 'transit-prose-user', assistantId: 'transit-prose-assistant' })).toEqual(committed);
    expect(() => parseGeneratedStory(JSON.stringify({ story: '已经回家。', phone_messages: [], world_events: [{ type: 'ride_transit', stopId: 'home' }] }), state)).toThrow();
    bridge.dispose();
  });
});
