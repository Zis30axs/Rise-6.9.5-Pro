import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCampusWorld } from '../src/frontend/scene-world';
import { isScenePositionWalkable } from '../src/frontend/scene-movement';
import type { WorldAction, WorldState } from '../src/frontend/types';
import { isStudyInteraction, campusInteriors } from '../src/runtime/campus-interiors';
import { createInitialState, getNovelTravelQuote, mapLocations, novelDestinations, parseState, reduceState } from '../src/runtime/model';
import { getScenePeople } from '../src/runtime/scene-context';
import { getTransitRoutes, transitStops, TRANSIT_SEQUENCE_LIMIT } from '../src/runtime/transit';
import { withAcademicSelection } from './legacy-state';

afterEach(() => vi.restoreAllMocks());
const minutes = (state: WorldState) => state.clock.day * 1440 + state.clock.hour * 60 + state.clock.minute;
const travel = (state: WorldState, locationId: string) => reduceState(state, { type: 'novel_travel', locationId });
const atStop = (id: string) => {
  const stop = transitStops.find(item => item.id === id)!;
  return reduceState(createInitialState(), { type: 'walk', ...stop, seed: 'saved-novel-test' });
};

describe('novel navigation uses the same world and transit rules', () => {
  it('offers the established 15 local landmarks, a downtown landmark and eleven rooms', () => {
    expect(novelDestinations).toHaveLength(27);
    expect(new Set(novelDestinations.map(item => item.id)).size).toBe(27);
    expect(novelDestinations.filter(item => item.kind === 'interior').map(item => item.id)).toEqual([
      'margo-cafe-room', 'dorm-room', 'classroom', 'study-room', 'toyokawa-house',
      'emma-yuki-home', 'koko-old-house', 'nikaido-house', 'anan-noa-milia-home', 'majo-highrise-home', 'majo-studio',
    ]);
    expect(novelDestinations.some(item => ['campus', 'neighborhood', 'city-roads'].includes(item.id))).toBe(false);
  });

  it('quotes all destinations without writes or randomness, and commits only legal restorable arrivals', () => {
    const world = createCampusWorld(new THREE.Scene());
    const initial = atStop('campus');
    const snapshot = JSON.stringify(initial);
    const random = vi.spyOn(Math, 'random');
    for (const destination of novelDestinations) {
      const quote = getNovelTravelQuote(initial, destination.id);
      expect(quote.blockedReason, destination.id).toBeNull();
      expect(getNovelTravelQuote(initial, destination.id)).toEqual(quote);
      const arrived = travel(initial, destination.id);
      expect(arrived.locationId).toBe(destination.id);
      expect(minutes(arrived) - minutes(initial)).toBe(quote.minutes);
      expect(Math.round(initial.player.energy * 100) - Math.round(arrived.player.energy * 100)).toBe(Math.round(quote.energyCost * 100));
      expect(initial.player.balance - arrived.player.balance).toBe(quote.fare);
      expect(initial.player.foodEnergy - arrived.player.foodEnergy).toBe(quote.foodEnergyCost);
      expect(initial.player.satiety - arrived.player.satiety).toBe(quote.satietyCost);
      expect(arrived.inventory).toEqual(initial.inventory);
      expect(arrived.player.health).toBe(initial.player.health);
      expect(arrived.player.stress).toBe(initial.player.stress);
      expect(arrived.scene?.seed).toBe('saved-novel-test');
      expect(arrived.scene?.encounterId).toBeNull();
      expect(isScenePositionWalkable(arrived.scene!.x, arrived.scene!.z, world.movementWorld), destination.id).toBe(true);
      expect(parseState(JSON.parse(JSON.stringify(arrived)))).toEqual(arrived);
      for (const key of ['airTraffic', 'phone', 'contacts', 'schedule', 'story'] as const) expect(arrived[key]).toEqual(initial[key]);
      expect(travel(arrived, destination.id)).toEqual(arrived);
    }
    expect(random).not.toHaveBeenCalled();
    expect(JSON.stringify(initial)).toBe(snapshot);
    world.dispose();
  });

  it.each([...mapLocations.map(item => item.id), 'bus-stop'])('keeps walking time and outlook while scaling novel energy for %s', id => {
    const state = createInitialState();
    const original = reduceState(state, { type: 'travel', locationId: id });
    const arrived = travel(state, id);
    expect(arrived.clock).toEqual(original.clock);
    const cost = id === state.locationId ? 0 : 0.36;
    expect(arrived.player).toEqual({ ...original.player, energy: (Math.round(state.player.energy * 100) - Math.round(cost * 100)) / 100 });
    expect(arrived.journal).toEqual(original.journal);
  });

  it.each(campusInteriors)('enters and leaves $id from its parent for free and preserves a completed activity when already there', room => {
    const outside = travel(createInitialState(), room.parentLocationId);
    const inside = travel(outside, room.id);
    expect(inside.clock).toEqual(outside.clock);
    expect(inside.player).toEqual(outside.player);
    expect(inside.interior).toMatchObject({ roomId: room.id, ...room.spawn });
    const returned = travel(inside, room.parentLocationId);
    expect(returned.interior).toBeNull();
    expect(returned.clock).toEqual(inside.clock);
    expect(returned.player).toEqual(inside.player);
    const observation = room.interactions.find(item => item.minutes === 0 && !isStudyInteraction(item.id))!;
    const approached = reduceState(inside, { type: 'novel_approach', interactionId: observation.id });
    const observed = reduceState(approached, { type: 'interior_interact', interactionId: observation.id });
    expect(travel(observed, room.id)).toEqual(observed);
  });

  it.each(['home', 'commercial', 'city-park'])('charges each transit leg for %s, including return and a two-leg transfer', source => {
    const route = getTransitRoutes('campus').find(item => item.stop.id === source)!;
    const initial = createInitialState();
    const campus = reduceState(initial, { type: 'travel', locationId: 'bus-stop' });
    const arrived = travel(initial, source);
    expect(minutes(arrived) - minutes(initial)).toBe(minutes(campus) - minutes(initial) + route.minutes);
    expect(arrived.player).toEqual({ ...initial.player, energy: 79.64, balance: initial.player.balance - route.fare, foodEnergy: initial.player.foodEnergy - (minutes(arrived) - minutes(initial)) * 2, satiety: initial.player.satiety - (Math.floor(minutes(arrived) / 15) - Math.floor(minutes(initial) / 15)) });
    for (const target of ['home', 'commercial', 'city-park'].filter(id => id !== source)) {
      const onward = getTransitRoutes('campus').find(item => item.stop.id === target)!;
      const quote = getNovelTravelQuote(arrived, target, 'zbd04a');
      expect(quote).toMatchObject({ minutes: route.minutes + onward.minutes, fare: route.fare + onward.fare, energyCost: 0, blockedReason: null });
      expect(quote.rides.map(item => [item.vehicleId, item.fromStopId, item.toStopId])).toEqual([['zbd04a', source, 'campus'], ['zbd04a', 'campus', target]]);
      const transferred = reduceState(arrived, { type: 'novel_travel', locationId: target, vehicleId: 'zbd04a' });
      expect(transferred.transit.sequence).toBe(3);
      expect(transferred.journal.filter(item => item.id.startsWith('transit-ride-'))).toHaveLength(3);
      expect(transferred.transit.lastRide?.toStopId).toBe(target);
      expect(parseState(transferred)).toEqual(transferred);
    }
    const back = travel(arrived, 'bus-stop');
    expect(minutes(back) - minutes(arrived)).toBe(route.minutes);
    expect(back.player.energy).toBe(arrived.player.energy);
    expect(back.player.balance).toBe(arrived.player.balance - route.fare);
    const room = travel(arrived, 'dorm-room');
    expect(room.interior?.roomId).toBe('dorm-room');
    expect(room.transit.sequence).toBe(2);
    const roomQuote = getNovelTravelQuote(arrived, 'dorm-room');
    expect(Math.round(arrived.player.energy * 100) - Math.round(room.player.energy * 100)).toBe(Math.round(roomQuote.energyCost * 100));
    expect(roomQuote.baseEnergyCost).toBe(5);
  });

  it('refuses the whole transfer when only one leg is affordable, and rejects forged targets or prices', () => {
    const state = atStop('home');
    state.player.balance = 6;
    const snapshot = JSON.stringify(state);
    expect(getNovelTravelQuote(state, 'commercial')).toMatchObject({ fare: 9, minutes: 70, blockedReason: expect.stringContaining('余额') });
    expect(() => travel(state, 'commercial')).toThrow(/余额/);
    expect(JSON.stringify(state)).toBe(snapshot);
    for (const id of ['__proto__', 'constructor', 'campus', 'imaginary-home']) {
      expect(getNovelTravelQuote(state, id).blockedReason).toMatch(/目的地/);
      expect(() => travel(state, id)).toThrow(/目的地/);
    }
    expect(() => reduceState(state, { type: 'novel_travel', locationId: 'library', vehicleId: 't84' })).toThrow(/乘车/);
    const poor = createInitialState(); poor.player.energy = 0.1;
    expect(travel(poor, 'dorm-room').player.energy).toBe(0);
    const forged = { type: 'novel_travel', locationId: 'home', fare: 0, minutes: 0, x: 0, z: 0 } as WorldAction;
    expect(reduceState(atStop('campus'), forged).player.balance).toBe(322);
  });

  it('preflights transit sequence exhaustion and uses the nearest existing stop for a road save', () => {
    const state = atStop('home');
    state.transit = { sequence: TRANSIT_SEQUENCE_LIMIT - 1, lastRide: { id: `transit-ride-${TRANSIT_SEQUENCE_LIMIT - 1}`, vehicleId: 'btr82a', fromStopId: 'campus', toStopId: 'home', minutes: 45, fare: 6, at: '第 1 天 17:20' } };
    const snapshot = JSON.stringify(state);
    expect(() => travel(state, 'commercial')).toThrow(/上限/);
    expect(JSON.stringify(state)).toBe(snapshot);
    const road = reduceState(createInitialState(), { type: 'walk', x: -180, z: 110, yaw: 0, seed: 'road-seed' });
    expect(road.locationId).toBe('city-roads');
    const arrived = travel(road, 'library');
    expect(arrived.transit.lastRide).toMatchObject({ fromStopId: 'home', toStopId: 'campus', fare: 6, minutes: 45 });
    expect(arrived.scene?.seed).toBe('road-seed');
  });

  it('clears an old encounter on travel without changing the saved population seed', () => {
    let state = reduceState(createInitialState(), { type: 'walk', x: -2, z: 15, yaw: 0, seed: 'same-people' });
    const person = getScenePeople(state.scene!).find(item => Math.hypot(item.x + 2, item.z - 15) < 3)!;
    state = reduceState(state, { type: 'encounter', personId: person.id });
    const arrived = travel(state, 'study-room');
    expect(arrived.scene).toMatchObject({ encounterId: null, seed: 'same-people' });
  });

  it('approaches every authored facility without settlement and reuses exact rest/study records', () => {
    for (const room of campusInteriors) {
      const inside = travel(createInitialState(), room.id);
      for (const interaction of room.interactions) {
        const approached = reduceState(inside, { type: 'novel_approach', interactionId: interaction.id });
        expect(approached.interior).toMatchObject({ x: interaction.x, z: interaction.z });
        for (const key of ['clock', 'player', 'journal', 'story', 'scene'] as const) expect(approached[key]).toEqual(inside[key]);
        expect(parseState(approached)).toEqual(approached);
      }
      expect(() => reduceState(inside, { type: 'novel_approach', interactionId: 'foreign-facility' })).toThrow(/当前房间/);
    }
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const bed = reduceState(travel(createInitialState(), 'dorm-room'), { type: 'novel_approach', interactionId: 'dorm-rest' });
    expect(random).not.toHaveBeenCalled();
    const rested = reduceState(bed, { type: 'interior_rest', optionId: 'dorm-rest-short' });
    expect(rested.interior?.lastRest?.minutes).toBe(23);
    expect(travel(rested, 'dorm-room')).toEqual(rested);
    expect(reduceState(rested, { type: 'novel_approach', interactionId: 'dorm-desk' }).interior?.lastRest).toEqual(rested.interior?.lastRest);
    const desk = withAcademicSelection(reduceState(travel(rested, 'study-room'), { type: 'novel_approach', interactionId: 'study-focus' }));
    const studied = reduceState(desk, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'study-focus', optionId: 'study-short' });
    expect(studied.interior?.lastStudy).toMatchObject({ minutes: 23, energyConsumed: 4 });
    expect(random).toHaveBeenCalledTimes(2);
    expect(() => reduceState(createInitialState(), { type: 'novel_approach', interactionId: 'dorm-rest' })).toThrow(/室内/);
  });
});
