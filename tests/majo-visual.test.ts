import * as THREE from 'three';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../assets/majo-runtime/manifest.json';
import sistersManifest from '../assets/majo-sisters/manifest.json';
import {
  majoArtStatus, majoDistrictArt, majoEmotions, majoEmmaExpressions, majoExpressionPolicy,
  majoExpressionSets, majoInteriorArt, resolveMajoExpressionPortrait, resolveMajoSpeaker,
} from '../src/frontend/majo-art';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';
import { campusInteriors, getCampusInterior, getInteriorMovementWorld } from '../src/runtime/campus-interiors';
import {
  districtForLocation, housingForInterior, housingForPerson, majoHousings, residentOutfit,
} from '../src/runtime/majo-housing';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { residentById, residentCast, residentPresence } from '../src/runtime/npc-cast';
import { getSceneArea, sceneLocationId } from '../src/runtime/scene-context';
import { isScenePositionWalkable } from '../src/frontend/scene-movement';
import { createCampusWorld, streetRoutes } from '../src/frontend/scene-world';

const ROOT = path.resolve(import.meta.dirname, '..');
const manifestRows = manifest.assets as { id: string; file: string; bytes: number; sha256: string; encoding: string; personId?: string; category?: string; emotion?: string; tier?: string; presentation?: string; alpha?: boolean; width?: number; height?: number }[];
const semiMain = ['majo-hiro', 'majo-noa', 'majo-milia', 'majo-anan', 'majo-sherry', 'majo-hanna'];

describe('PR #16 runtime art registry', () => {
  it('registers Emma nine expressions plus six user-confirmed three-panel semi-main sets', () => {
    expect(Object.keys(majoEmmaExpressions)).toEqual([...majoEmotions]);
    expect(new Set(Object.values(majoEmmaExpressions)).size).toBe(9);
    for (const src of Object.values(majoEmmaExpressions)) expect(src.startsWith('data:image/webp;base64,')).toBe(true);
    expect(majoExpressionSets['majo-emma']).toMatchObject({ tier: 'main', complete: true, completedExpressions: 9, width: 1024, height: 1536 });
    expect(Object.keys(majoExpressionSets).sort()).toEqual(['majo-anan', 'majo-emma', 'majo-hanna', 'majo-hiro', 'majo-margo', 'majo-milia', 'majo-noa', 'majo-sherry', 'majo-yuki', 'majo-nanoka', 'majo-honoka'].sort());
    for (const person of semiMain) {
      const set = majoExpressionSets[person]!;
      expect(set).toMatchObject({ tier: 'semi-main', targetExpressions: 3, complete: true, completedExpressions: 3, width: 1024, height: 2048 });
      expect(Object.keys(set.expressions).sort()).toEqual(['happy', 'neutral', 'shy']);
      expect(new Set(Object.values(set.expressions)).size).toBe(3);
    }
    expect(majoExpressionSets['majo-yuki']).toMatchObject({ tier: 'semi-main', targetExpressions: 3, completedExpressions: 3, width: 512, height: 1024 });
  });

  it('resolves portraits by person identity first and emotion second', () => {
    expect(resolveMajoSpeaker('樱羽艾玛')).toBe('majo-emma');
    expect(resolveMajoSpeaker(' 艾玛 ')).toBe('majo-emma');
    expect(resolveMajoSpeaker('二阶堂希罗')).toBe('majo-hiro');
    expect(resolveMajoSpeaker('希罗')).toBe('majo-hiro');
    expect(resolveMajoSpeaker('城崎诺亚')).toBe('majo-noa');
    expect(resolveMajoSpeaker('佐伯米莉亚')).toBe('majo-milia');
    expect(resolveMajoSpeaker('夏目安安')).toBe('majo-anan');
    expect(resolveMajoSpeaker('橘雪莉')).toBe('majo-sherry');
    expect(resolveMajoSpeaker('橘雪梨')).toBe('majo-sherry');
    expect(resolveMajoSpeaker('远野汉娜')).toBe('majo-hanna');
    expect(resolveMajoSpeaker('宝生玛格')).toBe('majo-margo');
    expect(resolveMajoSpeaker('宝生マーゴ')).toBe('majo-margo');
    expect(resolveMajoSpeaker('玛格')).toBe('majo-margo');
    expect(resolveMajoSpeaker('月代雪')).toBe('majo-yuki');
    expect(resolveMajoSpeaker('月代ユキ')).toBe('majo-yuki');
    expect(resolveMajoSpeaker('黑部奈叶香')).toBe('majo-nanoka');
    expect(resolveMajoSpeaker('黒部ホノカ')).toBe('majo-honoka');
    expect(resolveMajoSpeaker('奈穗香')).toBe('majo-honoka');
    expect(resolveMajoExpressionPortrait('奈叶香', 'happy')).toMatchObject({ personId: 'majo-nanoka', width: 483, height: 1086, exact: true });
    expect(resolveMajoExpressionPortrait('穗乃香', 'sad')).toMatchObject({ personId: 'majo-honoka', width: 483, height: 1086, exact: true });
    expect(resolveMajoExpressionPortrait('穗乃香', 'angry')).toMatchObject({ personId: 'majo-honoka', exact: false });
    expect(resolveMajoExpressionPortrait('素世', 'happy')).toBeNull();
    expect(resolveMajoSpeaker('素世')).toBeNull();
    expect(resolveMajoSpeaker('艾玛同学')).toBeNull();
    for (const emotion of majoEmotions) {
      expect(resolveMajoExpressionPortrait('艾玛', emotion)).toEqual({
        personId: 'majo-emma', src: majoEmmaExpressions[emotion], width: 1024, height: 1536, exact: true,
      });
    }
    expect(resolveMajoExpressionPortrait('希罗', 'happy')).toMatchObject({ personId: 'majo-hiro', width: 1024, height: 2048, exact: true });
    // Missing semi-main emotions reuse the same person's neutral panel, never another identity.
    const fallback = resolveMajoExpressionPortrait('希罗', 'sad')!;
    expect(fallback).toMatchObject({ personId: 'majo-hiro', width: 1024, height: 2048, exact: false });
    expect(fallback.src).toBe(majoExpressionSets['majo-hiro']!.expressions.neutral);
    const yuki = majoExpressionSets['majo-yuki']!;
    expect(Object.keys(yuki.expressions).sort()).toEqual(['happy', 'neutral', 'thinking']);
    for (const src of Object.values(yuki.expressions)) expect(src?.startsWith('data:image/png;base64,')).toBe(true);
    expect(resolveMajoExpressionPortrait('月代雪', 'thinking')).toMatchObject({ personId: 'majo-yuki', width: 512, height: 1024, exact: true });
    expect(resolveMajoExpressionPortrait('月代雪', 'shy')).toMatchObject({ personId: 'majo-yuki', src: yuki.expressions.neutral, exact: false });
    expect(resolveMajoExpressionPortrait('陌生的立绘名', 'happy')).toBeNull();
  });

  it('never falls back to a generic face for a registered semi-main character', () => {
    const missing = majoEmotions.filter(emotion => !['neutral', 'happy', 'shy'].includes(emotion));
    expect(missing).toEqual(['sad', 'angry', 'surprised', 'thinking', 'serious', 'relieved']);
    for (const person of semiMain) {
      const set = majoExpressionSets[person]!;
      for (const emotion of missing) {
        const portrait = resolveMajoExpressionPortrait(residentById(person)!.name, emotion)!;
        expect(portrait).toMatchObject({ personId: person, exact: false, width: 1024, height: 2048 });
        expect(portrait.src).toBe(set.expressions.neutral);
      }
    }
  });

  it('selects Margo by stable identity and retains two additional transparent sprites', () => {
    const set = majoExpressionSets['majo-margo']!;
    expect(set).toMatchObject({ personId: 'majo-margo', tier: 'semi-main',
      targetExpressions: 3, completedExpressions: 3, complete: true, width: 768, height: 1024 });
    expect(Object.keys(set.expressions).sort()).toEqual(['happy', 'neutral', 'shy']);
    for (const [emotion, hash] of [
      ['neutral', '06784579bed462cd52e4d34f1b04da954f08de1847d21691ecab98e7899579cb'],
      ['happy', '7b99e566d31f20602a0b983232c6a1bca8afd7deb048fb2877e53a16e7351c18'],
      ['shy', '5fd04d84b6a1a55f25b72288bd5b9bfa40037ac06fcdd85779b5df0c646994ab'],
      ['extras/angry', 'ac0bbb4c6f9203f8cd1d2fa06069034ab6d5ef54d8f507b8bbfcfaaa318cb3cf'],
      ['extras/surprised', 'd05ca8a21f5d3fa2b7a9f1d80a89d8baf655a21a2f1da7721c4a179f757d8523'],
    ] as const) {
      const bytes = readFileSync(path.join(ROOT, 'assets/majo-runtime/characters/majo-margo', emotion + '.avif'));
      expect(createHash('sha256').update(bytes).digest('hex'), emotion).toBe(hash);
      expect(bytes.subarray(4, 12).toString('ascii'), emotion).toBe('ftypavif');
    }
    expect(new Set(Object.values(set.expressions)).size).toBe(3);
    for (const src of Object.values(set.expressions)) expect(src?.startsWith('data:image/avif;base64,')).toBe(true);
    expect(resolveMajoExpressionPortrait('宝生マーゴ', 'happy')).toMatchObject({
      personId: 'majo-margo', src: set.expressions.happy, width: 768, height: 1024, exact: true,
    });
    expect(resolveMajoExpressionPortrait('玛格', 'sad')).toMatchObject({
      personId: 'majo-margo', src: set.expressions.neutral, exact: false,
    });
    expect(resolveMajoExpressionPortrait('奈叶香', 'happy')?.personId).not.toBe('majo-margo');
  });

  it('reports completed and missing art honestly', () => {
    expect(majoArtStatus).toHaveLength(15);
    expect(majoExpressionPolicy).toEqual({ main: 9, semiMain: 3 });
    expect(new Set(majoArtStatus.map(row => row.personId))).toEqual(new Set(residentCast.map(row => row.id)));
    const emma = majoArtStatus.find(row => row.personId === 'majo-emma')!;
    expect(emma).toMatchObject({ tier: 'main', targetExpressions: 9, expressions: 9, complete: true });
    for (const person of semiMain) {
      expect(majoArtStatus.find(row => row.personId === person)).toMatchObject({ tier: 'semi-main', targetExpressions: 3, expressions: 3, complete: true });
    }
    expect(majoArtStatus.find(row => row.personId === 'majo-hiro')).toMatchObject({ outfit: '和服' });
    for (const row of majoArtStatus.filter(row => row.tier === 'semi-main')) expect(row.targetExpressions).toBe(3);
    expect(majoArtStatus.filter(row => row.complete).map(row => row.personId).sort()).toEqual(['majo-emma', 'majo-margo', 'majo-yuki', 'majo-nanoka', 'majo-honoka', ...semiMain].sort());
    expect(majoArtStatus.filter(row => !row.complete).map(row => row.personId).sort()).toEqual(['majo-arisa', 'majo-koko', 'majo-leia', 'majo-meruru']);
  });

  it('ships six independent transparent sister sprites matching the static manifest', () => {
    const rows = sistersManifest.assets;
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      const bytes = readFileSync(path.join(ROOT, 'assets/majo-sisters', row.file));
      expect(bytes.length).toBe(row.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
      expect(row.width).toBeGreaterThanOrEqual(482);
      expect(row.height).toBe(1086);
      expect(resolveMajoExpressionPortrait(
        row.personId === 'majo-honoka' ? '穗乃香' : '奈叶香',
        row.emotion === 'worried' ? 'sad' : row.emotion as 'neutral' | 'happy' | 'shy',
      )).toMatchObject({ personId: row.personId, exact: true });
    }
  });

  it('keeps every registered runtime file byte-identical to its verified manifest entry', () => {
    expect(manifestRows).toHaveLength(39);
    expect(manifestRows.filter(row => row.personId === 'majo-emma')).toHaveLength(9);
    expect(manifestRows.filter(row => row.category === 'character-sheet')).toHaveLength(21);
    expect(manifestRows.filter(row => row.category === 'interior')).toHaveLength(6);
    expect(manifestRows.filter(row => row.category === 'district')).toHaveLength(3);
    for (const row of manifestRows.filter(row => row.category === 'character-sheet')) {
      expect(row).toMatchObject({ tier: 'semi-main', presentation: 'sprite', alpha: true });
      if (row.personId === 'majo-yuki') {
        expect(row).toMatchObject({ width: 512, height: 1024, mime: 'image/png' });
        expect(row.encoding).toContain('flood-matte');
        expect(['neutral', 'happy', 'thinking']).toContain(row.emotion);
      } else {
        expect(row).toMatchObject({ width: 1024, height: 2048, mime: 'image/webp' });
        expect(row.encoding).toContain('anime-seg-alpha-upscale-2x');
        expect(semiMain).toContain(row.personId);
        expect(['neutral', 'happy', 'shy']).toContain(row.emotion);
      }
    }
    const cutouts = JSON.parse(readFileSync(path.join(ROOT, 'assets/majo-runtime/character-cutouts.json'), 'utf8')) as {
      schema: string; upscale: number; model: { name: string; sha256: string; license: string }; assets: unknown[];
    };
    expect(cutouts.schema).toBe('unread-city-majo-character-cutouts-v1');
    expect(cutouts.upscale).toBe(2);
    expect(cutouts.model).toMatchObject({ name: 'skytnt/anime-seg', license: 'Apache-2.0', sha256: 'f15622d853e8260172812b657053460e20806f04b9e05147d49af7bed31a6e99' });
    expect(cutouts.assets).toHaveLength(21);
    for (const row of manifestRows) {
      const bytes = readFileSync(path.join(ROOT, 'assets/majo-runtime', row.file));
      expect(bytes.length, row.file).toBe(row.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), row.file).toBe(row.sha256);
    }
  });
});

describe('residential prototypes and Nikaido house', () => {
  it('connects all six housing prototypes to distinct reachable interiors and existing parents', () => {
    expect(majoHousings).toHaveLength(6);
    expect(new Set(campusInteriors.map(room => room.id)).size).toBe(10);
    for (const housing of majoHousings) {
      const room = getCampusInterior(housing.interiorId);
      expect(room, housing.id).toBeDefined();
      expect(room!.parentLocationId).toBe(housing.parentLocationId);
      expect(housingForInterior(housing.interiorId)?.id).toBe(housing.id);
    }
    expect(housingForPerson('majo-emma')?.id).toBe('emma-yuki-home');
    expect(housingForPerson('majo-yuki')?.id).toBe('emma-yuki-home');
    expect(housingForPerson('majo-hiro')?.id).toBe('nikaido-house');
    expect(housingForPerson('majo-anan')?.id).toBe('anan-noa-milia-home');
    expect(housingForInterior('nikaido-house')?.type).toBe('traditional-courtyard');
    expect(residentOutfit('majo-hiro')).toBe('和服');
    expect(residentOutfit('majo-emma')).toBeNull();
  });

  it('keeps every new exterior entrance within a real route endpoint and every facility reachable', () => {
    const world = createCampusWorld(new THREE.Scene());
    const nodes = Object.values(streetRoutes).flat();
    try {
      for (const housing of majoHousings) {
        const room = getCampusInterior(housing.interiorId)!;
        const area = getSceneArea(room.entrance.x, room.entrance.z);
        expect(area, room.id).not.toBeNull();
        expect(sceneLocationId(area!.id), room.id).toBe(room.parentLocationId);
        expect(nodes.some(node => Math.hypot(node.position[0] - room.entrance.x, node.position[2] - room.entrance.z) <= 6), room.id).toBe(true);
        expect(isScenePositionWalkable(room.entrance.x, room.entrance.z, world.movementWorld), room.id).toBe(true);
        const movement = getInteriorMovementWorld(room);
        expect(isScenePositionWalkable(room.spawn.x, room.spawn.z, movement), room.id).toBe(true);
        for (const interaction of room.interactions) {
          expect(isScenePositionWalkable(interaction.x, interaction.z, movement), interaction.id).toBe(true);
        }
      }
    } finally { world.dispose(); }
  });

  it('authors the Nikaido estate with tatami, garden, a sheathed katana and a practice space', () => {
    const room = getCampusInterior('nikaido-house')!;
    const ids = room.interactions.map(item => item.id);
    expect(ids).toEqual(expect.arrayContaining(['nikaido-tatami-rest', 'nikaido-garden-view', 'nikaido-katana-observe', 'nikaido-kendo-practice']));
    const katana = room.interactions.find(item => item.id === 'nikaido-katana-observe')!;
    expect(katana.minutes).toBe(0);
    expect(katana.result).toContain('入鞘');
    expect(katana.prompt).toContain('没有拔出');
  });

  it('settles the practice session once with time, energy and wellbeing changes', () => {
    let state = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'nikaido-house' });
    state = reduceState(state, { type: 'novel_approach', interactionId: 'nikaido-kendo-practice' });
    const before = { clock: state.clock, energy: state.player.energy, morale: state.player.morale, stress: state.player.stress };
    const after = reduceState(state, { type: 'interior_interact', interactionId: 'nikaido-kendo-practice' });
    const minutes = (value: typeof after) => value.clock.day * 1440 + value.clock.hour * 60 + value.clock.minute;
    expect(minutes(after) - (before.clock.day * 1440 + before.clock.hour * 60 + before.clock.minute)).toBe(45);
    expect(after.player.energy).toBe(before.energy - 8);
    expect(after.player.morale).toBeGreaterThan(before.morale);
    expect(after.player.stress).toBeLessThan(before.stress);
    expect(after.interior?.activityId).toBe('nikaido-kendo-practice');
    expect(parseState(after)).toEqual(after);
    expect(() => reduceState(after, { type: 'interior_interact', interactionId: 'nikaido-katana-observe' })).toThrow(/走到/);
  });

  it('uses the authored housing interior instead of the old home marker while residents sleep', () => {
    const hiro = residentPresence('majo-hiro', { hour: 10, minute: 0 })!;
    expect(hiro).toMatchObject({ locationId: 'nikaido-house', housing: 'nikaido-house', available: false, outfit: '和服' });
    const emma = residentPresence('majo-emma', { hour: 23, minute: 30 })!;
    expect(emma).toMatchObject({ locationId: 'emma-yuki-home', housing: 'emma-yuki-home', available: false });
    expect(residentById('majo-emma')!.home).toBe('emma-yuki-home');
  });

  it('maps six existing districts to prototype types and only claims three recovered district images', () => {
    expect(districtForLocation('home')).toBe('old-town-lowrise');
    expect(districtForLocation('commercial')).toBe('riverfront-highrise-district');
    expect(districtForLocation('neighborhood')).toBe('older-apartment-courtyard');
    expect(districtForLocation('downtown')).toBe('traditional-downtown');
    expect(districtForLocation('city-park')).toBe('lakeside-apartment');
    expect(districtForLocation('residences')).toBe('student-shared');
    expect(Object.keys(majoDistrictArt)).toHaveLength(3);
    expect(majoHousings.filter(housing => housing.districtArt)).toHaveLength(3);
    expect(getNovelBackground('nikaido-house', 12).source).toBe('majo-art');
    expect(getNovelBackground('majo-studio', 12).source).toBe('majo-art');
    expect(Object.keys(majoInteriorArt)).toHaveLength(6);
  });

  it('does not change the save schema or add rooms to legacy saves', () => {
    const initial = createInitialState();
    expect(initial.schema_version).toBe('1.11.0');
    expect(parseState(initial)).toEqual(initial);
    const interiorIds = campusInteriors.map(room => room.id);
    expect(interiorIds).toHaveLength(new Set(interiorIds).size);
    expect(initial.interior).toBeNull();
  });
});
