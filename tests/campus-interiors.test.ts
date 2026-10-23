import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { bedRestOptions, campusInteriors, getCampusInterior, getInteriorActivity, getInteriorMovementWorld, getStudyEnergyCost, isStudyInteraction, studyDurationOptions, INTERIOR_ENTRANCE_RANGE } from '../src/runtime/campus-interiors';
import { commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { getSceneContext } from '../src/runtime/scene-context';
import { createCampusWorld } from '../src/frontend/scene-world';
import { isScenePositionWalkable } from '../src/frontend/scene-movement';
import { createTavernBridge } from '../src/runtime/bridge';
import type { WorldAction } from '../src/frontend/types';
import { withoutPlayerNeeds, withAcademicSelection } from './legacy-state';
import { initialPlayerNeeds } from '../src/runtime/convenience-store';

const exterior = (roomId = 'dorm-room') => {
  const room = getCampusInterior(roomId)!;
  return reduceState(createInitialState(), { type: 'walk', ...room.entrance, seed: 'campus-room-test' });
};
const entered = (roomId = 'dorm-room') => {
  const state = reduceState(exterior(roomId), { type: 'enter_interior', roomId });
  return roomId === 'dorm-room' ? state : withAcademicSelection(state);
};
afterEach(() => vi.restoreAllMocks());

describe('campus interiors and deterministic facilities', () => {
  it('uses reachable exterior entrances, free spawns and reachable facility approaches', () => {
    const world = createCampusWorld(new THREE.Scene());
    try {
      expect(new Set(campusInteriors.map(room => room.id)).size).toBe(11);
      for (const room of campusInteriors) {
        expect(isScenePositionWalkable(room.entrance.x, room.entrance.z, world.movementWorld), room.id).toBe(true);
        const movement = getInteriorMovementWorld(room);
        expect(isScenePositionWalkable(room.spawn.x, room.spawn.z, movement), room.id).toBe(true);
        for (const interaction of room.interactions) expect(isScenePositionWalkable(interaction.x, interaction.z, movement), interaction.id).toBe(true);
      }
    } finally { world.dispose(); }
  });

  it('strictly migrates all supported exterior saves without changing their existing facts', () => {
    const current = exterior('study-room');
    current.airTraffic = reduceState(current, { type: 'air_traffic_tick', now: 1792257329272 }).airTraffic;
    const { interior: _interior, transit: _transit, ...old12Fields } = withoutPlayerNeeds(current);
    const old12 = { ...old12Fields, schema_version: '1.2.0' };
    const before = JSON.stringify(old12);
    expect(parseState(JSON.parse(before))).toEqual(current);
    expect(JSON.stringify(old12)).toBe(before);
    expect(() => parseState({ ...old12, interior: null })).toThrow(/字段/);
    expect(parseState({ ...old12Fields, interior: null, schema_version: '1.3.0' })).toEqual(current);
    const { airTraffic: _airTraffic, ...old11Fields } = old12Fields;
    expect(parseState({ ...old11Fields, schema_version: '1.1.0' })).toEqual({ ...current, airTraffic: createInitialState().airTraffic });
    const { scene: _scene, ...old10Fields } = old11Fields;
    expect(parseState({ ...old10Fields, schema_version: '1.0.0' })).toEqual({ ...current, scene: null, airTraffic: createInitialState().airTraffic });
    expect(() => parseState({ ...old12, locationId: 'dorm-room' })).toThrow(/locationId/);
    expect(() => parseState({ ...old10Fields, schema_version: '1.0.0', locationId: 'teaching' })).toThrow(/locationId/);
  });

  it('requires a real nearby entrance and restores the unchanged exterior pose on exit', () => {
    for (const room of campusInteriors) {
      const before = exterior(room.id);
      const inside = reduceState(before, { type: 'enter_interior', roomId: room.id });
      expect(inside.locationId).toBe(room.id);
      expect(inside.interior).toEqual({ roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null });
      expect(inside.scene).toEqual(before.scene);
      expect(inside.clock).toEqual(before.clock);
      expect(inside.player).toEqual(before.player);
      expect(inside.phone).toEqual(before.phone);
      const reloaded = parseState(JSON.parse(JSON.stringify(inside)));
      const outside = reduceState(reloaded, { type: 'leave_interior' });
      expect(outside.scene).toEqual(before.scene);
      expect(outside.locationId).toBe(room.parentLocationId);
      expect(outside.interior).toBeNull();
      expect(reduceState(outside, { type: 'leave_interior' })).toEqual(outside);
      expect(() => reduceState(inside, { type: 'enter_interior', roomId: room.id })).toThrow(/先离开/);
    }
    expect(() => reduceState(createInitialState(), { type: 'enter_interior', roomId: 'dorm-room' })).toThrow(/入口附近/);
    expect(() => reduceState(exterior(), { type: 'enter_interior', roomId: 'classroom' })).toThrow(/入口附近/);
    expect(() => reduceState(exterior(), { type: 'enter_interior', roomId: 'missing' })).toThrow(/不存在/);
    const far = reduceState(createInitialState(), { type: 'walk', x: -49 + INTERIOR_ENTRANCE_RANGE + 0.1, z: -6.5, yaw: 0, seed: 'far-entry' });
    expect(() => reduceState(far, { type: 'enter_interior', roomId: 'dorm-room' })).toThrow(/入口附近/);
  });

  it('bounds indoor movement and rejects furniture, corrupt save fields and cross-room commands atomically', () => {
    const inside = entered();
    const snapshot = JSON.stringify(inside);
    for (const patch of [{ x: NaN }, { z: Infinity }, { yaw: Infinity }, { x: 6 }, { x: -4, z: -1 }, { roomId: 'missing' }, { activityId: 'classroom-notes' }, { extra: true }]) {
      expect(() => parseState({ ...inside, interior: { ...inside.interior, ...patch } })).toThrow(/存档格式无效/);
    }
    expect(() => parseState({ ...inside, locationId: 'dorm' })).toThrow(/不一致/);
    expect(() => parseState({ ...inside, scene: null })).toThrow(/不一致/);
    expect(() => parseState({ ...inside, interior: null })).toThrow(/缺少/);
    for (const action of [
      { type: 'walk', x: 0, z: 18, yaw: 0, seed: 'walk' }, { type: 'travel', locationId: 'library' },
      { type: 'encounter', personId: 'ped-test' }, { type: 'interior_interact', interactionId: 'classroom-notes' },
      { type: 'interior_walk', x: -4, z: -1, yaw: 0 },
    ] as WorldAction[]) expect(() => reduceState(inside, action)).toThrow();
    const moved = reduceState(inside, { type: 'interior_walk', x: 1.2344, z: 2, yaw: Math.PI * 10 });
    expect(moved.interior).toMatchObject({ x: 1.234, z: 2, yaw: 0 });
    expect(moved.scene).toEqual(inside.scene);
    expect(moved.journal).toEqual(inside.journal);
    expect(JSON.stringify(inside)).toBe(snapshot);
  });

  it.each([
    { id: 'dorm-rest-short', sample: 0, minutes: 15, energy: 6, clock: { day: 1, hour: 17, minute: 35 } },
    { id: 'dorm-rest-short', sample: 0.5, minutes: 23, energy: 9, clock: { day: 1, hour: 17, minute: 43 } },
    { id: 'dorm-rest-short', sample: 0.999999, minutes: 30, energy: 12, clock: { day: 1, hour: 17, minute: 50 } },
    { id: 'dorm-rest-medium', sample: 0, minutes: 60, energy: 24, clock: { day: 1, hour: 18, minute: 20 } },
    { id: 'dorm-rest-medium', sample: 0.5, minutes: 90, energy: 36, clock: { day: 1, hour: 18, minute: 50 } },
    { id: 'dorm-rest-medium', sample: 0.999999, minutes: 120, energy: 48, clock: { day: 1, hour: 19, minute: 20 } },
    { id: 'dorm-rest-long', sample: 0, minutes: 420, energy: 80, clock: { day: 2, hour: 0, minute: 20 } },
    { id: 'dorm-rest-long', sample: 0.5, minutes: 480, energy: 80, clock: { day: 2, hour: 1, minute: 20 } },
    { id: 'dorm-rest-long', sample: 0.999999, minutes: 540, energy: 80, clock: { day: 2, hour: 2, minute: 20 } },
  ])('samples $id at $sample once and restores its actual $minutes minutes without rerolling', ({ id, sample, minutes, energy, clock }) => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(sample);
    const near = reduceState(entered(), { type: 'interior_walk', x: -2.3, z: -1, yaw: 0 });
    near.player.energy = 20;
    const before = JSON.stringify(near);
    const rested = reduceState(near, { type: 'interior_rest', optionId: id });
    expect(rested.clock).toEqual(clock);
    expect(rested.player.energy).toBe(20 + energy);
    expect(rested.interior).toEqual({ ...near.interior, activityId: id, lastRest: { optionId: id, minutes, energyRecovered: energy } });
    expect(rested.journal).toHaveLength(near.journal.length + 1);
    expect(rested.journal.at(-1)?.text).toContain(`${minutes} 分钟`);
    expect(rested.journal.at(-1)?.text).toContain(`恢复 ${energy} 点精力`);
    for (const key of ['phone', 'contacts', 'schedule', 'story', 'scene', 'airTraffic'] as const) expect(rested[key]).toEqual(near[key]);
    expect(JSON.stringify(near)).toBe(before);
    const reloaded = parseState(JSON.parse(JSON.stringify(rested)));
    expect(reloaded).toEqual(rested);
    expect(getSceneContext(reloaded.scene, reloaded.interior)?.lastInteraction).toMatchObject({ id, alreadyCommitted: true, minutes, energyDelta: energy });
    const continued = commitStoryTurn(reloaded, '看看醒来后的宿舍', { text: '宿舍里的床铺与书桌还在原处，休息已经结束。', phoneMessages: [] }, { userId: 'rest-user', assistantId: 'rest-assistant' });
    for (const key of ['clock', 'player', 'interior', 'journal', 'phone'] as const) expect(continued[key]).toEqual(rested[key]);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('uses only the three trusted rest choices and rejects stale, distant or cross-room actions atomically', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const initial = entered();
    expect(bedRestOptions.map(option => option.id)).toEqual(['dorm-rest-short', 'dorm-rest-medium', 'dorm-rest-long']);
    expect(bedRestOptions.every(option => option.prompt === '')).toBe(true);
    expect(() => reduceState(initial, { type: 'interior_rest', optionId: 'dorm-rest-short' })).toThrow(/附近/);
    const near = reduceState(initial, { type: 'interior_walk', x: -2.3, z: -1, yaw: 0 });
    const before = JSON.stringify(near);
    expect(() => reduceState(near, { type: 'interior_interact', interactionId: 'dorm-rest' })).toThrow(/请选择休息时长/);
    for (const optionId of ['dorm-rest', 'missing', '__proto__', 'classroom-notes']) {
      expect(() => reduceState(near, { type: 'interior_rest', optionId })).toThrow(/有效的休息时长/);
    }
    for (const state of [createInitialState(), entered('classroom'), entered('study-room')]) {
      expect(() => reduceState(state, { type: 'interior_rest', optionId: 'dorm-rest-short' })).toThrow(/学生宿舍/);
    }
    expect(random).not.toHaveBeenCalled();
    const forged = { type: 'interior_rest', optionId: 'dorm-rest-short', minutes: -480, energyDelta: 100 } as WorldAction;
    const rested = reduceState(near, forged);
    expect(rested.clock).toEqual({ day: 1, hour: 17, minute: 35 });
    expect(rested.player.energy).toBe(86);
    expect(rested.interior?.lastRest).toEqual({ optionId: 'dorm-rest-short', minutes: 15, energyRecovered: 6 });
    expect(random).toHaveBeenCalledTimes(1);
    expect(() => parseState({ ...entered('classroom'), interior: { ...entered('classroom').interior, activityId: 'dorm-rest-short' } })).toThrow(/activityId/);
    expect(JSON.stringify(near)).toBe(before);
  });

  it('rolls long rest across midnight and leaves capped energy at 100', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const near = reduceState(entered(), { type: 'interior_walk', x: -2.3, z: -1, yaw: 0 });
    near.clock = { day: 7, hour: 23, minute: 45 };
    near.player.energy = 100;
    const rested = reduceState(near, { type: 'interior_rest', optionId: 'dorm-rest-long' });
    expect(rested.clock).toEqual({ day: 8, hour: 7, minute: 45 });
    expect(rested.player.energy).toBe(100);
    expect(rested.interior?.lastRest).toEqual({ optionId: 'dorm-rest-long', minutes: 480, energyRecovered: 0 });
    expect(rested.journal.at(-1)?.at).toBe('第 8 天 07:45');
    const limit = { ...near, clock: { day: 365000, hour: 23, minute: 45 } };
    expect(() => reduceState(limit, { type: 'interior_rest', optionId: 'dorm-rest-long' })).toThrow(/最大天数/);
    expect(limit.clock).toEqual({ day: 365000, hour: 23, minute: 45 });
  });

  it('preserves legacy half-hour rest saves and their original completed activity context', () => {
    const near = reduceState(entered(), { type: 'interior_walk', x: -2.3, z: -1, yaw: 0 });
    const { lastRest: _lastRest, lastStudy: _lastStudy, ...legacyInterior } = near.interior!;
    const { transit: _transit, ...legacyNear } = withoutPlayerNeeds(near);
    const saved = { ...legacyNear, schema_version: '1.3.0', clock: { day: 1, hour: 17, minute: 50 }, player: { ...legacyNear.player, energy: 92 }, interior: { ...legacyInterior, activityId: 'dorm-rest' }, journal: [...near.journal, { id: 'legacy-rest', at: '第 1 天 17:50', text: '在宿舍床边休息了半小时。耗时 30 分钟，恢复至多 12 点精力。' }] };
    const before = JSON.stringify(saved);
    const reloaded = parseState(JSON.parse(JSON.stringify(saved)));
    expect(reloaded).toEqual({ ...saved, schema_version: '1.11.0', contacts: createInitialState().contacts, academics: null, inventory: [], player: { ...saved.player, ...initialPlayerNeeds }, transit: createInitialState().transit, interior: { ...saved.interior, lastRest: null, lastStudy: null } });
    expect(parseState(JSON.parse(JSON.stringify(reloaded)))).toEqual(reloaded);
    expect(JSON.stringify(saved)).toBe(before);
    expect(getSceneContext(reloaded.scene, reloaded.interior)?.lastInteraction).toEqual({ id: 'dorm-rest', label: '床边休息', result: '在宿舍床边休息了半小时。', alreadyCommitted: true, minutes: 30, energyDelta: 12 });
    expect(getInteriorActivity(getCampusInterior('classroom')!, 'dorm-rest-long')).toBeUndefined();
    expect(() => reduceState(reloaded, { type: 'interior_interact', interactionId: 'dorm-rest' })).toThrow(/请选择休息时长/);
    expect(() => parseState({ ...saved, interior: { ...saved.interior, lastRest: null } })).toThrow(/字段/);
    expect(() => parseState({ ...saved, interior: { ...saved.interior, activityId: 'dorm-rest-short' } })).toThrow(/lastRest/);
  });

  it('strictly validates persisted rest results and retains them through walking until another activity', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const near = reduceState(entered(), { type: 'interior_walk', x: -2.3, z: -1, yaw: 0 });
    const rested = reduceState(near, { type: 'interior_rest', optionId: 'dorm-rest-medium' });
    expect(rested.interior?.lastRest).toEqual({ optionId: 'dorm-rest-medium', minutes: 90, energyRecovered: 20 });
    const before = JSON.stringify(rested);
    for (const patch of [
      { optionId: 'dorm-rest-long' }, { optionId: '__proto__' }, { minutes: 59 }, { minutes: 121 }, { minutes: 90.5 }, { minutes: NaN },
      { energyRecovered: -1 }, { energyRecovered: 37 }, { energyRecovered: Infinity }, { energyRecovered: 0.005 }, { extra: true },
    ]) expect(() => parseState({ ...rested, interior: { ...rested.interior, lastRest: { ...rested.interior!.lastRest, ...patch } } })).toThrow(/存档格式无效/);
    for (const lastRest of [null, undefined]) expect(() => parseState({ ...rested, interior: { ...rested.interior, lastRest } })).toThrow(/lastRest/);
    expect(() => parseState({ ...rested, interior: { ...rested.interior, activityId: 'dorm-desk' } })).toThrow(/lastRest/);
    const walked = reduceState(rested, { type: 'interior_walk', x: 3, z: 1.8, yaw: 0 });
    expect(walked.interior?.lastRest).toEqual(rested.interior?.lastRest);
    const observed = reduceState(walked, { type: 'interior_interact', interactionId: 'dorm-wardrobe' });
    expect(observed.interior?.lastRest).toBeNull();
    expect(observed.interior?.activityId).toBe('dorm-wardrobe');
    expect(observed.clock).toEqual(rested.clock);
    expect(observed.player).toEqual(rested.player);
    expect(random).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(rested)).toBe(before);
  });

  it('handles a random endpoint of one and rejects invalid samples without partial changes', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(1);
    const near = reduceState(entered(), { type: 'interior_walk', x: -2.3, z: -1, yaw: 0 });
    const before = JSON.stringify(near);
    expect(reduceState(near, { type: 'interior_rest', optionId: 'dorm-rest-short' }).interior?.lastRest?.minutes).toBe(30);
    for (const sample of [NaN, Infinity, -0.1, 1.1]) {
      random.mockReturnValue(sample);
      expect(() => reduceState(near, { type: 'interior_rest', optionId: 'dorm-rest-short' })).toThrow(/生成失败/);
    }
    expect(JSON.stringify(near)).toBe(before);
  });

  it('requires nearby facilities and charges study effects without phone, schedule or story changes', () => {
    const initial = entered();
    expect(() => reduceState(initial, { type: 'interior_interact', interactionId: 'dorm-rest' })).toThrow(/附近/);
    const classroom = reduceState(entered('classroom'), { type: 'interior_walk', x: 1.3, z: -1.5, yaw: 0 });
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const studied = reduceState(classroom, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' });
    expect(studied.clock).toEqual({ day: 1, hour: 17, minute: 50 });
    expect(studied.player.energy).toBe(75);
    for (const key of ['phone', 'contacts', 'schedule', 'story', 'scene', 'airTraffic'] as const) expect(studied[key]).toEqual(classroom[key]);
    const exhausted = { ...classroom, player: { ...classroom.player, energy: 4 } };
    expect(() => reduceState(exhausted, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' })).toThrow(/精力不足/);
    expect(exhausted.player.energy).toBe(4);
    const observed = reduceState(reduceState(initial, { type: 'interior_walk', x: 3, z: 1.8, yaw: 0 }), { type: 'interior_interact', interactionId: 'dorm-wardrobe' });
    expect(observed.clock).toEqual(initial.clock);
    expect(observed.player).toEqual(initial.player);
    expect(reduceState(observed, { type: 'interior_interact', interactionId: 'dorm-wardrobe' })).toEqual(observed);
  });

  it('provides completed indoor facts without outdoor people or sky events', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const inside = reduceState(reduceState(entered('study-room'), { type: 'interior_walk', x: 0, z: -2, yaw: 0 }), { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'study-focus', optionId: 'study-short' });
    const context = getSceneContext(inside.scene, inside.interior);
    expect(context).toMatchObject({ areaId: 'study-room', outdoors: false, skyVisible: false, nearbyPeople: [], nearbyLandmarks: [], encounter: null, lastInteraction: { id: 'study-focus', alreadyCommitted: true, minutes: 30 } });
    expect(reduceState(inside, { type: 'air_traffic_tick', now: 1792257329272 })).toEqual(inside);
    const before = JSON.stringify(inside);
    expect(() => commitStoryTurn(inside, '看看房间', { text: '天空出现飞机。', phoneMessages: [], worldEvents: [{ type: 'airliner_pass' }] }, { userId: 'inside-user', assistantId: 'inside-assistant' }, 1792257329272)).toThrow(/室内/);
    expect(JSON.stringify(inside)).toBe(before);
  });

  it.each([
    { optionId: 'study-short', sample: 0, minutes: 15 },
    { optionId: 'study-short', sample: 0.5, minutes: 23 },
    { optionId: 'study-short', sample: 0.999999, minutes: 30 },
    { optionId: 'study-medium', sample: 0, minutes: 60 },
    { optionId: 'study-medium', sample: 0.5, minutes: 90 },
    { optionId: 'study-medium', sample: 0.999999, minutes: 120 },
    { optionId: 'study-long', sample: 0, minutes: 120 },
    { optionId: 'study-long', sample: 0.5, minutes: 180 },
    { optionId: 'study-long', sample: 0.999999, minutes: 240 },
  ])('samples $optionId at $sample once and saves the actual $minutes-minute study in both learning rooms', ({ optionId, sample, minutes }) => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(sample);
    for (const [roomId, interactionId] of [['classroom', 'classroom-notes'], ['study-room', 'study-focus']]) {
      const room = getCampusInterior(roomId)!;
      const anchor = room.interactions.find(item => item.id === interactionId)!;
      const near = reduceState(entered(roomId), { type: 'interior_walk', x: anchor.x, z: anchor.z, yaw: 0 });
      const before = JSON.stringify(near);
      const studied = reduceState(near, { type: 'interior_study', subjectId: 'cs-programming', interactionId: interactionId!, optionId });
      const energyConsumed = Math.ceil(minutes / 6);
      const totalMinutes = 17 * 60 + 20 + minutes;
      expect(studied.clock).toEqual({ day: 1, hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60 });
      expect(studied.player.energy).toBe(80 - energyConsumed);
      expect(studied.interior).toEqual({ ...near.interior, activityId: interactionId, lastRest: null, lastStudy: { interactionId, optionId, minutes, energyConsumed } });
      expect(studied.journal).toHaveLength(near.journal.length + 1);
      expect(studied.journal.at(-1)?.text).toContain(`${minutes} 分钟`);
      expect(studied.journal.at(-1)?.text).toContain(`消耗 ${energyConsumed} 点精力`);
      for (const key of ['phone', 'contacts', 'schedule', 'story', 'scene', 'airTraffic'] as const) expect(studied[key]).toEqual(near[key]);
      const reloaded = parseState(JSON.parse(JSON.stringify(studied)));
      expect(reloaded).toEqual(studied);
      expect(getSceneContext(reloaded.scene, reloaded.interior)?.lastInteraction).toMatchObject({ id: interactionId, alreadyCommitted: true, minutes, energyDelta: -energyConsumed });
      const continued = commitStoryTurn(reloaded, '看看学习结束后的房间', { text: '桌上的笔记还摊着，刚才的学习已经结束。', phoneMessages: [] }, { userId: 'study-user', assistantId: 'study-assistant' });
      for (const key of ['clock', 'player', 'interior', 'journal', 'phone', 'schedule'] as const) expect(continued[key]).toEqual(studied[key]);
      expect(JSON.stringify(near)).toBe(before);
    }
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('checks trusted study options, room, proximity and the full range energy before drawing time', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const near = reduceState(entered('classroom'), { type: 'interior_walk', x: 1.3, z: -1.5, yaw: 0 });
    const before = JSON.stringify(near);
    expect(studyDurationOptions.map(option => [option.id, option.minMinutes, option.maxMinutes])).toEqual([
      ['study-short', 15, 30], ['study-medium', 60, 120], ['study-long', 120, 240],
    ]);
    expect(isStudyInteraction('classroom-notes')).toBe(true);
    expect(isStudyInteraction('study-focus')).toBe(true);
    expect(isStudyInteraction('dorm-desk')).toBe(false);
    expect(() => reduceState(near, { type: 'interior_interact', interactionId: 'classroom-notes' })).toThrow(/请选择学习时长/);
    for (const optionId of ['dorm-rest-short', 'missing', '__proto__', 'classroom-notes']) expect(() => reduceState(near, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId })).toThrow(/有效的学习时长/);
    for (const interactionId of ['study-focus', 'classroom-board', '__proto__', 'missing']) expect(() => reduceState(near, { type: 'interior_study', subjectId: 'cs-programming', interactionId, optionId: 'study-short' })).toThrow(/不属于/);
    expect(() => reduceState(createInitialState(), { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' })).toThrow(/先进入/);
    expect(() => reduceState(entered('dorm-room'), { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' })).toThrow(/不属于/);
    expect(() => reduceState(entered('classroom'), { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short' })).toThrow(/附近/);
    for (const option of studyDurationOptions) {
      const minimumEnergy = getStudyEnergyCost(option.maxMinutes);
      const exhausted = { ...near, player: { ...near.player, energy: minimumEnergy - 1 } };
      const original = JSON.stringify(exhausted);
      expect(() => reduceState(exhausted, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: option.id })).toThrow(/精力不足/);
      expect(JSON.stringify(exhausted)).toBe(original);
    }
    expect(random).not.toHaveBeenCalled();
    const enough = { ...near, player: { ...near.player, energy: 5 } };
    const studied = reduceState(enough, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-short', minutes: 999, energyConsumed: -100 } as WorldAction);
    expect(studied.interior?.lastStudy).toEqual({ interactionId: 'classroom-notes', optionId: 'study-short', minutes: 15, energyConsumed: 3 });
    expect(studied.player.energy).toBe(2);
    expect(random).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(near)).toBe(before);
  });

  it('handles study sample endpoint one, midnight and maximum-day failures atomically', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(1);
    const near = reduceState(entered('study-room'), { type: 'interior_walk', x: 0, z: -2, yaw: 0 });
    near.clock = { day: 7, hour: 23, minute: 45 };
    near.player.energy = 40;
    const before = JSON.stringify(near);
    const studied = reduceState(near, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'study-focus', optionId: 'study-long' });
    expect(studied.clock).toEqual({ day: 8, hour: 3, minute: 45 });
    expect(studied.player.energy).toBe(0);
    expect(studied.interior?.lastStudy).toEqual({ interactionId: 'study-focus', optionId: 'study-long', minutes: 240, energyConsumed: 40 });
    expect(studied.journal.at(-1)?.at).toBe('第 8 天 03:45');
    for (const sample of [NaN, Infinity, -Infinity, -0.1, 1.1]) {
      random.mockReturnValue(sample);
      expect(() => reduceState(near, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'study-focus', optionId: 'study-long' })).toThrow(/生成失败/);
    }
    random.mockReturnValue(1);
    const limit = { ...near, clock: { day: 365000, hour: 23, minute: 45 } };
    expect(() => reduceState(limit, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'study-focus', optionId: 'study-long' })).toThrow(/最大天数/);
    expect(limit.clock).toEqual({ day: 365000, hour: 23, minute: 45 });
    expect(JSON.stringify(near)).toBe(before);
  });

  it('strictly validates study records and retains the saved result while walking', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const near = reduceState(entered('classroom'), { type: 'interior_walk', x: 1.3, z: -1.5, yaw: 0 });
    const studied = reduceState(near, { type: 'interior_study', subjectId: 'cs-programming', interactionId: 'classroom-notes', optionId: 'study-medium' });
    const before = JSON.stringify(studied);
    for (const patch of [
      { interactionId: 'study-focus' }, { interactionId: 'classroom-board' }, { optionId: 'study-short' }, { optionId: '__proto__' },
      { minutes: 59 }, { minutes: 121 }, { minutes: 90.5 }, { minutes: NaN },
      { energyConsumed: 14 }, { energyConsumed: 16 }, { energyConsumed: Infinity }, { energyConsumed: 15.5 }, { extra: true },
    ]) expect(() => parseState({ ...studied, interior: { ...studied.interior, lastStudy: { ...studied.interior!.lastStudy, ...patch } } })).toThrow(/lastStudy/);
    expect(() => parseState({ ...studied, interior: { ...studied.interior, lastStudy: undefined } })).toThrow(/lastStudy/);
    const { lastStudy: _lastStudy, ...missingStudyField } = studied.interior!;
    expect(() => parseState({ ...studied, interior: missingStudyField })).toThrow(/字段/);
    expect(() => parseState({ ...studied, interior: { ...studied.interior, activityId: 'classroom-board' } })).toThrow(/lastStudy/);
    expect(() => parseState({ ...studied, interior: { ...studied.interior, lastRest: { optionId: 'dorm-rest-short', minutes: 15, energyRecovered: 6 } } })).toThrow(/lastRest/);
    expect(() => parseState({ ...entered('dorm-room'), interior: { ...entered('dorm-room').interior, lastStudy: studied.interior!.lastStudy } })).toThrow(/lastStudy/);
    const walked = reduceState(studied, { type: 'interior_walk', x: -5, z: 2.8, yaw: 0 });
    expect(walked.interior?.lastStudy).toEqual(studied.interior?.lastStudy);
    const observed = reduceState(walked, { type: 'interior_interact', interactionId: 'classroom-window' });
    expect(observed.interior?.lastStudy).toBeNull();
    expect(observed.clock).toEqual(studied.clock);
    expect(observed.player).toEqual(studied.player);
    expect(random).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(studied)).toBe(before);
  });

  it('migrates legacy learning and completed rest from 1.4 without charging or sampling', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    for (const [roomId, activityId] of [['classroom', 'classroom-notes'], ['study-room', 'study-focus']]) {
      const current = entered(roomId);
      const { lastStudy: _lastStudy, ...interior14 } = current.interior!;
      const { transit: _transit, ...legacyCurrent } = withoutPlayerNeeds(current);
      const old14 = { ...legacyCurrent, schema_version: '1.4.0', interior: { ...interior14, activityId }, clock: { day: 1, hour: 17, minute: 50 }, player: { ...legacyCurrent.player, energy: 75 } };
      const before = JSON.stringify(old14);
      const migrated = parseState(JSON.parse(before));
      expect(migrated).toEqual({ ...old14, schema_version: '1.11.0', contacts: createInitialState().contacts, academics: null, inventory: [], player: { ...old14.player, ...initialPlayerNeeds }, transit: createInitialState().transit, interior: { ...old14.interior, lastStudy: null } });
      expect(getSceneContext(migrated.scene, migrated.interior)?.lastInteraction).toMatchObject({ id: activityId, minutes: 30, energyDelta: -5, alreadyCommitted: true });
      expect(parseState(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
      expect(JSON.stringify(old14)).toBe(before);
      const { lastRest: _lastRest, ...interior13 } = old14.interior;
      expect(parseState({ ...old14, schema_version: '1.3.0', interior: interior13 })).toEqual(migrated);
      expect(() => parseState({ ...old14, interior: { ...old14.interior, lastStudy: null } })).toThrow(/字段/);
    }
    expect(random).not.toHaveBeenCalled();
    const nearBed = reduceState(entered(), { type: 'interior_walk', x: -2.3, z: -1, yaw: 0 });
    const rested = reduceState(nearBed, { type: 'interior_rest', optionId: 'dorm-rest-short' });
    const { lastStudy: _lastStudy, ...rest14 } = rested.interior!;
    const { transit: _transit, ...legacyRested } = withoutPlayerNeeds(rested);
    const oldRest = { ...legacyRested, schema_version: '1.4.0', interior: rest14 };
    expect(parseState(JSON.parse(JSON.stringify(oldRest)))).toEqual({ ...rested, player: { ...rested.player, ...initialPlayerNeeds } });
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('injects indoor context into actual bridge requests and refuses unsolicited model sky events', async () => {
    let request: { user_input: string; injects: { content: string }[] } | undefined;
    const generate = vi.fn(async (config: NonNullable<typeof request>) => { request = config; return JSON.stringify({ story: '自习室里依旧安静。', phone_messages: [] }); });
    const host = { parent: { SillyTavern: { getContext: () => ({ characterId: 0, characters: { 0: { avatar: 'campus.png' } }, chatId: 'campus-test', mainApi: 'openai' }) } }, getVariables: () => ({}), replaceVariables: vi.fn(), eventOn: vi.fn(), eventRemoveListener: vi.fn(), tavern_events: { CHAT_CHANGED: 'chat_changed' }, generate, stopGenerationById: vi.fn() } as unknown as Window;
    const bridge = createTavernBridge(host)!;
    const state = entered('study-room');
    await bridge.generate('继续看看房间', state);
    const summary = JSON.parse(request!.user_input.split('\n')[1]);
    expect(summary.location).toBe('study-room');
    expect(summary.locationDetails.name).toBe('图书馆自习室');
    expect(summary.scene).toMatchObject({ outdoors: false, nearbyPeople: [], skyVisible: false });
    expect(summary.airTraffic).toMatchObject({ active: null, canTriggerPass: false, skyVisible: false });
    expect(request!.injects[0].content).toContain('行动前玩家在室内');
    generate.mockResolvedValueOnce(JSON.stringify({ story: '出现飞机。', phone_messages: [], world_events: [{ type: 'airliner_pass' }] }));
    await expect(bridge.generate('看看房间', state)).rejects.toThrow(/未写入/);
    bridge.dispose();
  });
});
