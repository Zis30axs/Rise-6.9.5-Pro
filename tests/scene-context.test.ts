import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createInitialState, locations, mapLocations, parseState, reduceState } from '../src/runtime/model';
import { getSceneArea, getSceneContext, getScenePeople, sampleSceneIdentity, sceneIdentities, scenePersonAnchors } from '../src/runtime/scene-context';
import { isScenePositionWalkable } from '../src/frontend/scene-movement';
import { createCampusWorld } from '../src/frontend/scene-world';
import type { ScenePresence, WorldAction } from '../src/frontend/types';

const walk = (x: number, z: number, yaw = 0, seed = 'scene-test-seed') => ({ type: 'walk' as const, x, z, yaw, seed });

describe('persistent outdoor scene and weighted encounters', () => {
  it('migrates exactly the old nine-field save while preserving every narrative and phone record', () => {
    const current = createInitialState();
    const { scene: _scene, airTraffic: _airTraffic, interior: _interior, transit: _transit, ...fields } = current;
    const legacy = { ...fields, schema_version: '1.0.0' };
    const before = JSON.stringify(legacy);
    const migrated = parseState(JSON.parse(before));
    expect(migrated).toEqual({ ...current, scene: null });
    expect(migrated.schema_version).toBe('1.6.0');
    expect(JSON.stringify(legacy)).toBe(before);
    expect(() => parseState({ ...legacy, scene: null })).toThrow(/字段/);
    expect(() => parseState({ ...legacy, unexpected: 1 })).toThrow(/字段/);
    expect(() => parseState({ ...legacy, locationId: 'bookshop' })).toThrow(/locationId/);
    expect(() => parseState({ ...current, scene: undefined })).toThrow(/scene/);
    expect(() => parseState(fields)).toThrow(/字段/);
  });

  it('updates the authoritative place by walking without charging travel or filling the journal', () => {
    const before = createInitialState();
    let after = reduceState(before, walk(0, -6));
    expect(after.locationId).toBe('library');
    expect(after.scene).toMatchObject({ x: 0, z: -6, areaId: 'library', seed: 'scene-test-seed', encounterId: null });
    for (const z of [-6.3, -6.7, -7]) after = reduceState(after, walk(0, z, 0, 'ignored-new-seed'));
    expect(after.scene?.seed).toBe('scene-test-seed');
    after = reduceState(after, walk(-22, 56.5));
    expect(after.locationId).toBe('bookshop');
    expect(after.clock).toEqual(before.clock);
    expect(after.player).toEqual(before.player);
    expect(after.journal).toEqual(before.journal);
    expect(after.phone).toEqual(before.phone);
    expect(after.story).toEqual(before.story);
    expect(before.scene).toBeNull();
    expect(mapLocations.map(location => location.id)).toEqual(['gate', 'library', 'cafe', 'dorm', 'teaching']);
    expect(locations.find(location => location.id === 'bookshop')?.description).toContain('尚未进入店内');
    expect(new Set(locations.map(location => location.id)).size).toBe(locations.length);
    expect(locations.map(location => location.id)).toEqual(expect.arrayContaining(['home', 'commercial', 'city-park']));
  });

  it('quantises pose, serialises the scene and restores stable people and encounters', () => {
    const walked = reduceState(createInitialState(), walk(0.0234, 18.0324, -Math.PI));
    expect(walked.scene).toMatchObject({ x: 0.023, z: 18.032, yaw: -3.141, areaId: 'promenade' });
    const person = getScenePeople(walked.scene!)[0]!;
    const talking = reduceState(walked, { type: 'encounter', personId: person.id });
    const restored = parseState(JSON.parse(JSON.stringify(talking)));
    expect(restored).toEqual(talking);
    expect(getScenePeople(restored.scene!)).toEqual(getScenePeople(talking.scene!));
    expect(getSceneContext(restored.scene)?.encounter).toMatchObject({ name: person.name, identity: person.identity, tags: person.tags });
    expect(restored.phone).toEqual(walked.phone);
    expect(restored.contacts).toEqual(walked.contacts);
    expect(restored.clock).toEqual(walked.clock);
  });

  it('rejects corrupt, nonfinite, out-of-bounds or inconsistent scene saves atomically', () => {
    const state = reduceState(createInitialState(), walk(0, 18));
    const saved = JSON.stringify(state);
    for (const patch of [
      { x: NaN }, { z: Infinity }, { yaw: Infinity }, { x: -261 }, { z: 261 }, { areaId: 'library' },
      { seed: '' }, { seed: 'x'.repeat(129) }, { seed: '<script>' }, { encounterId: 'missing' }, { unexpected: true },
    ]) expect(() => parseState({ ...state, scene: { ...state.scene, ...patch } })).toThrow(/存档格式无效/);
    expect(() => parseState({ ...state, locationId: 'library' })).toThrow(/不一致/);
    for (const action of [walk(NaN, 18), walk(0, Infinity), walk(0, 18, Infinity), walk(0, 261), walk(0, 18, 0, '')]) {
      expect(() => reduceState(state, action)).toThrow(/存档格式无效/);
    }
    expect(getSceneArea(0, 1000)).toBeNull();
    expect(JSON.stringify(state)).toBe(saved);
  });

  it('uses 60% student weighting near school and uniform roles in shops with seed-stable assignments', () => {
    const school = new Map<string, number>(), commercial = new Map<string, number>();
    const samples = 20000;
    for (let index = 0; index < samples; index++) {
      for (const [weighted, tally] of [[true, school], [false, commercial]] as const) {
        const role = sampleSceneIdentity(`population-${index}`, weighted);
        tally.set(role.identity, (tally.get(role.identity) ?? 0) + 1);
        expect(role.tags.includes('同学')).toBe(role.identity === '同学');
      }
    }
    expect((school.get('同学') ?? 0) / samples).toBeGreaterThan(0.58);
    expect((school.get('同学') ?? 0) / samples).toBeLessThan(0.62);
    for (const role of sceneIdentities) expect((commercial.get(role) ?? 0) / samples).toBeGreaterThan(0.115);
    for (const role of sceneIdentities) expect((commercial.get(role) ?? 0) / samples).toBeLessThan(0.135);
    const pose: ScenePresence = { x: 0, z: 18, yaw: 0, areaId: 'promenade', seed: 'stable-people', encounterId: null };
    const first = getScenePeople(pose);
    expect(first).toHaveLength(23);
    expect(getScenePeople({ ...pose, x: -22, z: 56.5, areaId: 'bookshop' })).toEqual(first);
    expect(getScenePeople({ ...pose, seed: 'new-session' })).not.toEqual(first);
    expect(new Set(first.map(person => person.id)).size).toBe(first.length);
    for (let seed = 0; seed < 80; seed++) {
      const people = getScenePeople({ ...pose, seed: `name-check-${seed}` });
      expect(new Set(people.map(person => person.name)).size).toBe(people.length);
    }
  });

  it('places every pedestrian and its visual wandering radius on free ground', () => {
    const world = createCampusWorld(new THREE.Scene());
    try {
      for (const anchor of scenePersonAnchors) {
        for (let sample = 0; sample < 16; sample++) {
          const angle = sample * Math.PI / 8;
          expect(isScenePositionWalkable(anchor.x + Math.cos(angle), anchor.z + Math.sin(angle), world.movementWorld), anchor.id).toBe(true);
        }
      }
    } finally { world.dispose(); }
  });

  it('permits only nearby current people and clears the encounter after walking away or travelling', () => {
    const state = reduceState(createInitialState(), walk(0, 18));
    const people = getScenePeople(state.scene!);
    const nearby = people[0]!, distant = people.find(person => person.x === 48)!;
    expect(() => reduceState(createInitialState(), { type: 'encounter', personId: nearby.id })).toThrow(/先进入/);
    expect(() => reduceState(state, { type: 'encounter', personId: 'missing' })).toThrow(/不属于/);
    expect(() => reduceState(state, { type: 'encounter', personId: distant.id })).toThrow(/附近/);
    const talking = reduceState(state, { type: 'encounter', personId: nearby.id });
    expect(talking.scene?.encounterId).toBe(nearby.id);
    const moved = reduceState(talking, walk(0, -6));
    expect(moved.scene?.encounterId).toBeNull();
    const travelled = reduceState(moved, { type: 'travel', locationId: 'cafe' });
    expect(travelled.scene).toBeNull();
    expect(travelled.player.energy).toBe(moved.player.energy - 5);
    const samePlace = reduceState(moved, { type: 'travel', locationId: 'library' });
    expect(samePlace.scene).toBeNull();
    expect(samePlace.clock).toEqual(moved.clock);
    expect(() => reduceState(state, { type: 'travel', locationId: 'bookshop' } as WorldAction)).toThrow(/不存在/);
  });
});
