import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInitialState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { worldSceneContext } from '../src/runtime/world-presence';
import { getSceneArea, sceneLocationId, scenePersonAnchors } from '../src/runtime/scene-context';
import { residentPresence } from '../src/runtime/npc-cast';
import { AFFINITY_TIERS, affinityRelation, affinityTier } from '../src/runtime/affinity-tiers';
import { startingAffinity, startingRelationNote } from '../src/runtime/initial-contacts';

describe('affinity tiers', () => {
  it('covers -100..100 without gaps or overlaps', () => {
    let cursor = -100;
    for (const tier of AFFINITY_TIERS) {
      expect(tier.min).toBe(cursor);
      expect(tier.max).toBeGreaterThanOrEqual(tier.min);
      expect(tier.label.trim().length).toBeGreaterThan(0);
      expect(tier.note.trim().length).toBeGreaterThan(8);
      expect(tier.hint.length).toBeGreaterThan(20);
      expect(tier.hint).not.toMatch(/恋爱对象|变成恋人/);
      cursor = tier.max + 1;
    }
    expect(cursor).toBe(101);
    const edges = [-100, -50, -49, -10, -9, 9, 10, 29, 30, 49, 50, 69, 70, 89, 90, 100];
    const seen = edges.map(value => affinityTier(value).id);
    expect(new Set(seen).size).toBe(AFFINITY_TIERS.length);
    expect(affinityTier(-50).id).toBe('hostile');
    expect(affinityTier(-49).id).toBe('dislike');
    expect(affinityTier(9).id).toBe('distant');
    expect(affinityTier(10).id).toBe('acquainted');
    expect(affinityTier(29).id).toBe('acquainted');
    expect(affinityTier(30).id).toBe('familiar');
    expect(affinityTier(50).label).toBe('朋友');
    expect(affinityTier(70).label).toBe('挚友');
    expect(affinityTier(90).label).toBe('羁绊');
    expect(affinityRelation(80)).toMatchObject({ affinity: 80, tier: 'close', label: '挚友' });
    expect(affinityRelation(80).hint).not.toContain('认真交往');
    const noted = affinityRelation(80, '恋人（三人知情同意的认真交往）');
    expect(noted.relationNote).toBe('恋人（三人知情同意的认真交往）');
    expect(noted.hint).toContain('认真交往');
    expect(noted.hint).toContain('占有欲或撒娇');
    expect(noted.hint).toContain('三人知情同意');
  });

  it('puts the tier hint on people who are here, and not on contacts who are elsewhere', () => {
    const state = createInitialState();
    const presence = residentPresence('bang-tomori', state.clock);
    const anchor = scenePersonAnchors.find(item => item.id === presence?.anchorId);
    const area = anchor ? getSceneArea(anchor.x, anchor.z) : null;
    if (!anchor || !area) throw new Error('灯的锚点缺失');
    state.scene = { x: anchor.x, z: anchor.z, yaw: 0, areaId: area.id, seed: 'affinity-tier', encounterId: null };
    state.locationId = sceneLocationId(area.id);
    const scene = worldSceneContext(state);
    const tomori = scene?.nearbyPeople.find(person => person.id === 'bang-tomori');
    const bond = affinityRelation(startingAffinity('soyo', 'bang-tomori'));
    expect(tomori?.relationship).toEqual(bond);
    expect(JSON.stringify(scene?.nearbyPeople)).toContain(bond.hint);
    for (const person of scene?.nearbyPeople ?? []) {
      if (!person.contactId) expect(person).not.toHaveProperty('relationship');
    }
    const absent = affinityRelation(startingAffinity('soyo', 'nagasaki-mother'));
    expect(scene?.nearbyPeople.some(person => person.id === 'nagasaki-mother')).toBe(false);
    expect(JSON.stringify(scene?.nearbyPeople)).not.toContain(absent.hint);
    const bridge = readFileSync('src/runtime/bridge.ts', 'utf8');
    expect(bridge).toContain('relationship 只发给已经是联系人的在场者');
    const sms = readFileSync('src/runtime/autonomous-sms.ts', 'utf8');
    expect(sms).toContain('bond: affinityRelation(contact.affinity, contact.relationNote)');
    expect(sms).toContain('高档位不等于恋爱');
  });

  it('sends Ajisai’s lover note only when she is present', () => {
    let state = reduceState(enableProtagonists(createInitialState()), { type: 'switch_protagonist', target: 'renako' });
    const presence = residentPresence('watanare-ajisai', state.clock);
    const anchor = scenePersonAnchors.find(item => item.id === presence?.anchorId);
    const area = anchor ? getSceneArea(anchor.x, anchor.z) : null;
    if (!anchor || !area) throw new Error('紫阳花的锚点缺失');
    state.scene = { x: anchor.x, z: anchor.z, yaw: 0, areaId: area.id, seed: 'ajisai-note', encounterId: null };
    state.locationId = sceneLocationId(area.id);
    const scene = worldSceneContext(state);
    const ajisai = scene?.nearbyPeople.find(person => person.id === 'watanare-ajisai');
    const note = startingRelationNote('renako', 'watanare-ajisai')!;
    expect(ajisai?.relationship).toMatchObject({ affinity: 80, label: '挚友', relationNote: note });
    expect(ajisai?.relationship?.hint).toContain('认真交往');
    const maiNote = startingRelationNote('renako', 'watanare-mai')!;
    const maiHere = scene?.nearbyPeople.some(person => person.id === 'watanare-mai');
    if (!maiHere) expect(JSON.stringify(scene?.nearbyPeople)).not.toContain(maiNote);
  });
});
