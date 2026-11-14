import { describe, expect, it } from 'vitest';
import { identityStrategyDossier } from '../src/frontend/identity-strategy';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { PROTAGONISTS } from '../src/runtime/dual-protagonists';
import { getLocationServiceQuote } from '../src/runtime/location-services';
import { applyStoryActions, createInitialState, parseState, reduceState } from '../src/runtime/model';
import {
  PRESET_NPC_IDS,
  PRESET_NPC_TRAIT_CATALOG,
  activeBandAdvisorTraits,
  advisorExternalModifiersByOwner,
  resolveNpcTraits,
} from '../src/runtime/npc-traits';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { applySocialSkillTurn } from '../src/runtime/social-skills';
import { settleStrategyWorld } from '../src/runtime/strategy-world';
import type { StoryAction, WorldState } from '../src/frontend/types';

const KANA_RE = /[\u3040-\u30ff]/;

function sakikoWorld(hour = 17, minute = 0): WorldState {
  const seeded = createInitialState();
  seeded.clock = { day: 4, hour, minute };
  let state = enableProtagonists(seeded);
  state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
  state = reduceState(state, {
    type: 'strategy',
    requestId: 'npc-trait-sakiko-manual',
    command: { type: 'set_control', owner: 'sakiko', controller: 'manual', includeInPrompt: true },
  });
  return parseState(state);
}

function insideLivehouse(state: WorldState): WorldState {
  const room = getCampusInterior('livehouse')!;
  const copy = structuredClone(state);
  copy.locationId = room.id;
  copy.scene = {
    x: room.entrance.x,
    z: room.entrance.z,
    yaw: 0,
    areaId: room.parentLocationId,
    seed: 'npc-traits-livehouse',
    encounterId: null,
  };
  copy.interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
  return parseState(copy);
}

describe('NPC traits catalog and dynamic derivation', () => {
  it('assigns 1–3 canon-faithful traits without Japanese kana to all 47 preset NPCs and aliases', () => {
    expect(PRESET_NPC_IDS.length).toBe(47);

    for (const id of PRESET_NPC_IDS) {
      const traits = PRESET_NPC_TRAIT_CATALOG[id]!;
      expect(traits.length).toBeGreaterThanOrEqual(1);
      expect(traits.length).toBeLessThanOrEqual(3);
      expect(new Set(traits.map(t => t.id)).size).toBe(traits.length);
      for (const item of traits) {
        expect(item.title.trim().length).toBeGreaterThan(0);
        expect(item.icon.trim().length).toBeGreaterThan(0);
        expect(item.summary.trim().length).toBeGreaterThan(0);
        expect(`${item.title}${item.summary}${item.icon}`).not.toMatch(KANA_RE);
        expect(resolveNpcTraits({ id, personId: id, name: '' }).map(t => t.id)).toEqual(traits.map(t => t.id));
      }
    }

    expect(resolveNpcTraits({ id: 'circle-marina', personId: 'circle-marina', name: '月岛麻里奈' }).map(t => t.id))
      .toEqual(PRESET_NPC_TRAIT_CATALOG['bang-marina']!.map(t => t.id));
    expect(resolveNpcTraits({ id: 'bang-makoto', personId: 'bang-makoto', name: '长崎真琴' }).map(t => t.id))
      .toEqual(PRESET_NPC_TRAIT_CATALOG['nagasaki-mother']!.map(t => t.id));
    expect(resolveNpcTraits({ id: 'wata-mai', personId: 'wata-mai', name: '王冢真唯' }).map(t => t.id))
      .toEqual(PRESET_NPC_TRAIT_CATALOG['watanare-mai']!.map(t => t.id));
    expect(resolveNpcTraits({ id: 'wata-ajisai', personId: 'wata-ajisai', name: '濑名紫阳花' }).map(t => t.id))
      .toEqual(PRESET_NPC_TRAIT_CATALOG['watanare-ajisai']!.map(t => t.id));
  });

  it('keeps playable protagonists free of NPC traits while giving custom contacts deterministic 1–3 traits', () => {
    for (const owner of PROTAGONISTS) {
      expect(resolveNpcTraits({ id: owner, personId: owner })).toEqual([]);
      expect(resolveNpcTraits({ id: `protagonist-${owner}`, personId: `protagonist-${owner}` })).toEqual([]);
    }
    expect(resolveNpcTraits({ id: 'majo-emma', personId: 'majo-emma' })).toEqual([]);
    expect(resolveNpcTraits({ id: 'watanare-renako', personId: 'watanare-renako' })).toEqual([]);

    const musician = resolveNpcTraits({
      id: 'friend-drummer',
      name: '林谷奏',
      tag: '轻音社鼓手',
      summary: '在 CiRCLE 帮忙代班打鼓的大学生。',
    });
    const repeat = resolveNpcTraits({
      id: 'friend-drummer',
      name: '林谷奏',
      tag: '轻音社鼓手',
      summary: '在 CiRCLE 帮忙代班打鼓的大学生。',
    });
    const barista = resolveNpcTraits({
      id: 'friend-cafe',
      name: '青木礼',
      tag: '烘焙店兼职店员',
      summary: '总是记得熟客常点的拿铁和咖啡甜点口味。',
    });
    const neighbor = resolveNpcTraits({
      id: 'friend-neighbor',
      name: '佐佐木澄',
      tag: '偶然认识的路人',
      summary: '在站前长椅边一起避过雨。',
    });

    for (const list of [musician, barista, neighbor]) {
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.length).toBeLessThanOrEqual(3);
      expect(new Set(list.map(t => t.id)).size).toBe(list.length);
      for (const item of list) {
        expect(`${item.title}${item.summary}`).not.toMatch(KANA_RE);
      }
    }
    expect(musician.map(t => t.id)).toEqual(repeat.map(t => t.id));
    expect(musician.some(t => t.id.startsWith('dyn_'))).toBe(true);
    expect(barista.some(t => t.category === 'social' || t.category === 'strategy')).toBe(true);
  });
});

describe('NPC traits wired into advisors, strategy focuses, decisions, practice, and identity dossier', () => {
  it('boosts focus progress, decision efficiency, practice gain, and social XP when appointed as band advisor', () => {
    const base = sakikoWorld(17, 0);
    const sakikoBand = base.livehouse!.bands.find(b => b.founder === 'sakiko')!;

    // Baseline without advisors
    expect(activeBandAdvisorTraits(base, 'sakiko')).toEqual([]);
    expect(advisorExternalModifiersByOwner(base).sakiko).toBeUndefined();

    const baseFocus = reduceState(base, {
      type: 'strategy',
      requestId: 'npc-base-focus',
      command: { type: 'start_focus', owner: 'sakiko', focusId: 'sakiko_redefine_band' },
    });
    const baseAdvanced = structuredClone(baseFocus);
    baseAdvanced.clock = { day: 4, hour: 18, minute: 0 };
    settleStrategyWorld(baseFocus, baseAdvanced);
    expect(baseAdvanced.protagonists!.strategy!.people.sakiko.active?.progress).toBe(60);

    const baseDecision = reduceState(base, {
      type: 'strategy',
      requestId: 'npc-base-decision',
      command: { type: 'choose_decision', owner: 'sakiko', decisionId: 'sakiko_practice_keyboard' },
    });
    expect(base.player.energy - baseDecision.player.energy).toBe(25);
    expect(baseDecision.livehouseVisit?.skill.sakiko ?? 0).toBe(4);

    // Appoint Yahata Umiri (+0.20 focus_progress_rate, -4 energy cost) & Misumi Uika (+0.22 practice_skill_rate, +0.20 social_xp_rate, -3 energy cost)
    let advised = reduceState(baseFocus, {
      type: 'society',
      requestId: 'appoint-uika',
      command: { type: 'appoint_advisor', bandId: sakikoBand.id, seat: 'music', personId: 'bang-uika' },
    });
    advised = reduceState(advised, {
      type: 'society',
      requestId: 'appoint-umiri',
      command: { type: 'appoint_advisor', bandId: sakikoBand.id, seat: 'operations', personId: 'bang-umiri' },
    });

    // Focus progresses faster: 1 + 0.12 (Uika) + 0.20 (Umiri) = 1.32 -> 60 * 1.32 = 79.2
    const advAdvanced = structuredClone(advised);
    advAdvanced.clock = { day: 4, hour: 18, minute: 0 };
    settleStrategyWorld(advised, advAdvanced);
    expect(advAdvanced.protagonists!.strategy!.people.sakiko.active?.progress).toBe(79.2);

    // Does not leak to protagonists not in Ave Mujica (e.g. Emma)
    expect(activeBandAdvisorTraits(advised, 'emma')).toEqual([]);

    // Decision energy cost reduced (25 - 7 = 18) and instrument delta boosted (round(4 * 1.47) = 6)
    const energyBefore = advised.player.energy;
    const advDecision = reduceState(advised, {
      type: 'strategy',
      requestId: 'npc-adv-decision',
      command: { type: 'choose_decision', owner: 'sakiko', decisionId: 'sakiko_practice_keyboard' },
    });
    expect(energyBefore - advDecision.player.energy).toBe(18);
    expect(advDecision.livehouseVisit?.skill.sakiko).toBe(6);
    expect(personState(advDecision, 'sakiko').journal.at(-1)?.text).toContain('三角初华');

    // Appoint Mutsumi (+3 decision_stress_relief, -2 energy cost) and check stress relief boost on evening walk
    const walkBase = reduceState(base, {
      type: 'strategy',
      requestId: 'npc-walk-base',
      command: { type: 'choose_decision', owner: 'sakiko', decisionId: 'sakiko_evening_walk' },
    });
    const walkAdvisedState = reduceState(advised, {
      type: 'society',
      requestId: 'appoint-mutsumi-social',
      command: { type: 'appoint_advisor', bandId: sakikoBand.id, seat: 'social', personId: 'bang-mutsumi' },
    });
    const seededStressBefore = structuredClone(walkAdvisedState);
    seededStressBefore.player.stress = 40;
    const baseStressBefore = structuredClone(base);
    baseStressBefore.player.stress = 40;
    const walkBaseDelta = baseStressBefore.player.stress - reduceState(baseStressBefore, {
      type: 'strategy',
      requestId: 'npc-walk-base-2',
      command: { type: 'choose_decision', owner: 'sakiko', decisionId: 'sakiko_evening_walk' },
    }).player.stress;
    const walkAdvDelta = seededStressBefore.player.stress - reduceState(seededStressBefore, {
      type: 'strategy',
      requestId: 'npc-walk-adv',
      command: { type: 'choose_decision', owner: 'sakiko', decisionId: 'sakiko_evening_walk' },
    }).player.stress;
    expect(walkBaseDelta).toBe(7);
    expect(walkAdvDelta).toBe(10);
    expect(walkBase.player.energy).toBeLessThanOrEqual(base.player.energy);

    // Livehouse practice quote also gains practice_skill_rate bonus when advised
    const liveBaseQuote = getLocationServiceQuote(insideLivehouse(base), 'livehouse-practice-1h');
    const liveAdvQuote = getLocationServiceQuote(insideLivehouse(advised), 'livehouse-practice-1h');
    expect(liveAdvQuote.livehouse!.skillGain).toBeGreaterThan(liveBaseQuote.livehouse!.skillGain);

    // Social skill turn receives +20% (Uika) + 8% (Umiri) = +28% social_xp_rate modifier
    const socialAction: StoryAction = {
      type: 'social_skill',
      skillId: 'expression',
      deviation: 3,
      reason: '排练后坦诚沟通日程分工',
    };
    const socialBase = applySocialSkillTurn(applyStoryActions(base, [socialAction], 'soc-base'), [socialAction], 'soc-base');
    const socialAdv = applySocialSkillTurn(applyStoryActions(advised, [socialAction], 'soc-adv'), [socialAction], 'soc-adv');
    const baseXpTotal = (socialBase.protagonists!.socialSkills!.people.sakiko.xp.expression * 4)
      + (socialBase.protagonists!.socialSkills!.people.sakiko.xpRemainders?.expression ?? 0);
    const advXpTotal = (socialAdv.protagonists!.socialSkills!.people.sakiko.xp.expression * 4)
      + (socialAdv.protagonists!.socialSkills!.people.sakiko.xpRemainders?.expression ?? 0);
    expect(advXpTotal).toBeGreaterThan(baseXpTotal);

    // Dismissing advisors reverts everything to baseline
    let dismissed = reduceState(advised, {
      type: 'society',
      requestId: 'dismiss-uika',
      command: { type: 'dismiss_advisor', bandId: sakikoBand.id, seat: 'music' },
    });
    dismissed = reduceState(dismissed, {
      type: 'society',
      requestId: 'dismiss-umiri',
      command: { type: 'dismiss_advisor', bandId: sakikoBand.id, seat: 'operations' },
    });
    expect(activeBandAdvisorTraits(dismissed, 'sakiko')).toEqual([]);
    const revertedQuote = getLocationServiceQuote(insideLivehouse(dismissed), 'livehouse-practice-1h');
    expect(revertedQuote.livehouse!.skillGain).toBe(liveBaseQuote.livehouse!.skillGain);
  });

  it('exposes 1–3 traits and active advisor status in IdentityCardPanel dossiers for preset and custom NPCs', () => {
    let state = sakikoWorld();
    const sakikoBand = state.livehouse!.bands.find(b => b.founder === 'sakiko')!;
    state = reduceState(state, {
      type: 'society',
      requestId: 'dossier-appoint-mutsumi',
      command: { type: 'appoint_advisor', bandId: sakikoBand.id, seat: 'music', personId: 'bang-mutsumi' },
    });

    const mutsumi = identityStrategyDossier('bang-mutsumi', 'bang-mutsumi', state);
    expect(mutsumi.owner).toBeNull();
    expect(mutsumi.isPresetNpc).toBe(true);
    expect(mutsumi.npcTraits.length).toBeGreaterThanOrEqual(1);
    expect(mutsumi.npcTraits.length).toBeLessThanOrEqual(3);
    expect(mutsumi.advisorPlacements).toEqual([
      { bandId: sakikoBand.id, bandName: sakikoBand.name, seat: 'music', seatLabel: '音乐顾问' },
    ]);

    for (const sampleId of ['majo-sherry', 'watanare-mai', 'fengjin', 'circle-marina', 'toyokawa-kiyoaki']) {
      const dossier = identityStrategyDossier(sampleId, sampleId, state);
      expect(dossier.owner).toBeNull();
      expect(dossier.isPresetNpc).toBe(true);
      expect(dossier.npcTraits.length).toBeGreaterThanOrEqual(1);
      expect(dossier.npcTraits.length).toBeLessThanOrEqual(3);
    }

    state.contacts.push({
      id: 'friend-custom',
      name: '望月纱也',
      tag: '咖啡馆学妹',
      summary: '下课后总在图书馆整理社团手账。',
      affinity: 40,
      status: '熟识',
      portraitId: 'claude',
      sourcePersonId: 'custom-mochizuki',
      isMain: false,
    });
    const customDossier = identityStrategyDossier('friend-custom', 'custom-mochizuki', state);
    expect(customDossier.owner).toBeNull();
    expect(customDossier.isPresetNpc).toBe(false);
    expect(customDossier.npcTraits.length).toBeGreaterThanOrEqual(1);
    expect(customDossier.npcTraits.length).toBeLessThanOrEqual(3);
    expect(customDossier.advisorPlacements).toEqual([]);

    const protagonistDossier = identityStrategyDossier('soyo', 'soyo', state);
    expect(protagonistDossier.owner).toBe('soyo');
    expect(protagonistDossier.npcTraits).toEqual([]);
  });
});
