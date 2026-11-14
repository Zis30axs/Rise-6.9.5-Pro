import { describe, expect, it } from 'vitest';
import { identityStrategyDossier } from '../src/frontend/identity-strategy';
import { PROTAGONISTS } from '../src/runtime/dual-protagonists';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import {
  NPC_CIRCLE_STATS,
  NPC_CIRCLE_STAT_LABELS,
  NPC_FOCUS_CATALOG,
  NPC_FOCUS_DIRECTORY,
  NPC_FOCUS_OWNER_NAMES,
} from '../src/runtime/npc-focuses';
import { PRESET_NPC_IDS, npcSelfExternalModifiers } from '../src/runtime/npc-traits';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import {
  FOCUS_CATALOG,
  STRATEGY_OWNERS,
  applyStrategyCommand,
  calculateModifier,
  canStartFocus,
  createGameStrategyState,
  createStrategyState,
  focusBranchLocked,
  focusWeight,
  parseStrategyState,
} from '../src/runtime/strategy';
import { strategyPromptContext, validateStrategyNarrativeUpdates } from '../src/runtime/strategy-narrative';

const KANA_RE = /[\u3040-\u30ff]/;

describe('Preset NPC focus trees catalog & constraints', () => {
  it('assigns valid, kana-free 3-node focus trees to all 47 preset NPCs with complete UI directory mapping', () => {
    expect(PRESET_NPC_IDS.length).toBe(47);
    const directoryIds = NPC_FOCUS_DIRECTORY.flatMap(group => group.members.map(m => m.id));
    expect(directoryIds.length).toBe(47);
    expect(new Set(directoryIds)).toEqual(new Set(PRESET_NPC_IDS));
    expect(new Set(STRATEGY_OWNERS)).toEqual(new Set([...PROTAGONISTS, ...PRESET_NPC_IDS]));

    const npcFocusById = new Map(NPC_FOCUS_CATALOG.map(row => [row.id, row] as const));
    expect(npcFocusById.size).toBe(NPC_FOCUS_CATALOG.length);

    for (const npcId of PRESET_NPC_IDS) {
      const displayName = NPC_FOCUS_OWNER_NAMES[npcId]!;
      expect(displayName).toBeTruthy();
      expect(displayName).not.toMatch(KANA_RE);

      const tree = FOCUS_CATALOG.filter(row => row.owner === npcId);
      expect(tree.length).toBeGreaterThanOrEqual(3);
      expect(tree.length).toBeLessThanOrEqual(4);
      expect(tree.some(node => !node.prerequisites)).toBe(true);

      const branchGroups = new Map<string, number>();
      for (const node of tree) {
        expect(node.important).toBeUndefined();
        expect(node.durationMinutes).toBeGreaterThanOrEqual(1440);
        expect(node.durationMinutes % 720).toBe(0);
        expect(node.aiWeight).toBeGreaterThan(0);
        expect(`${node.title}${node.description ?? ''}`).not.toMatch(KANA_RE);
        if (node.branchGroup) {
          branchGroups.set(node.branchGroup, (branchGroups.get(node.branchGroup) ?? 0) + 1);
        }
        if (node.prerequisites && 'completed' in node.prerequisites) {
          const parent = npcFocusById.get(node.prerequisites.completed);
          expect(parent?.owner).toBe(npcId);
        }
        for (const eff of node.onComplete ?? []) {
          if (eff.type === 'add_stat') {
            expect((NPC_CIRCLE_STATS as readonly string[]).includes(eff.key)).toBe(true);
            expect(NPC_CIRCLE_STAT_LABELS[eff.key as keyof typeof NPC_CIRCLE_STAT_LABELS]).not.toMatch(KANA_RE);
          }
        }
      }
      for (const count of branchGroups.values()) {
        expect(count).toBeGreaterThanOrEqual(2);
      }

      // Self traits must leave positive focus progress rate so no NPC stalls indefinitely.
      const baseStrategy = createGameStrategyState(0);
      const rate = calculateModifier(
        { state: baseStrategy, owner: npcId, externalModifiers: npcSelfExternalModifiers(npcId) },
        'focus_progress_rate',
        1,
      ).value;
      expect(rate).toBeGreaterThan(0.5);
    }
  });
});

describe('Save compatibility, isolation, and autonomous NPC progression', () => {
  it('migrates legacy 4-protagonist strategy saves without NPC entries and keeps manual locks intact', () => {
    const initialized = enableProtagonists(createInitialState());
    const legacySave = structuredClone(initialized);
    const peopleRecord = legacySave.protagonists!.strategy!.people as Record<string, unknown>;
    for (const key of Object.keys(peopleRecord)) {
      if (!(PROTAGONISTS as readonly string[]).includes(key)) {
        delete peopleRecord[key];
      }
    }

    const migrated = parseState(legacySave);
    for (const owner of PROTAGONISTS) {
      expect(migrated.protagonists!.strategy!.people[owner].controller).toBe('manual');
    }
    for (const npcId of PRESET_NPC_IDS) {
      expect(migrated.protagonists!.strategy!.people[npcId].controller).toBe('auto');
      expect(migrated.protagonists!.strategy!.people[npcId].includeInPrompt).toBe(false);
    }
    expect(parseState(JSON.parse(JSON.stringify(migrated))).protagonists!.strategy)
      .toEqual(migrated.protagonists!.strategy);

    // Forged unknown owner keys are still strictly rejected.
    const forged = structuredClone(initialized);
    (forged.protagonists!.strategy!.people as Record<string, unknown>).forged_npc = createStrategyState(0).people.soyo;
    expect(() => parseStrategyState(forged.protagonists!.strategy, forged.protagonists!.strategy!.cursor)).toThrow(/人物/);

    // UI/player commands cannot manually override NPCs.
    expect(() => applyStrategyCommand(
      initialized.protagonists!.strategy!,
      { type: 'start_focus', owner: 'bang-tomori', focusId: 'tomori_notebook_fragments' },
      'bad-npc-cmd',
    )).toThrow(/命令参数/);
    expect(() => validateStrategyNarrativeUpdates(
      [{ owner: 'bang-tomori', focusId: 'tomori_notebook_fragments', note: 'invalid' }],
      initialized.protagonists!.strategy,
    )).toThrow(/主角身份/);
  });

  it('progresses NPC focuses offline via canonical clock & self-traits without polluting prompts or majorQueue', () => {
    let state = enableProtagonists(createInitialState());
    state = reduceState(state, {
      type: 'strategy',
      requestId: 'soyo-prompt-on',
      command: { type: 'set_control', owner: 'soyo', controller: 'manual', includeInPrompt: true },
    });
    state = reduceState(state, {
      type: 'strategy',
      requestId: 'soyo-start-root',
      command: { type: 'start_focus', owner: 'soyo', focusId: 'soyo_face_past' },
    });

    const advanceByWaits = (start: typeof state, totalMinutes: number) => {
      let cur = start;
      for (let rem = totalMinutes; rem > 0;) {
        const chunk = Math.min(120, rem);
        cur = reduceState(cur, { type: 'wait', minutes: chunk });
        rem -= chunk;
      }
      return cur;
    };

    // Advance 6 game hours (360 minutes): self traits scale NPC progress rate without exceeding limits.
    const afterQuarterDay = advanceByWaits(state, 360);
    const strat6h = afterQuarterDay.protagonists!.strategy!;
    // Taki (+0.18 rate) progresses faster than baseline 360.
    expect(strat6h.people['bang-taki'].active?.id).toBe('taki_ring_shift_balance');
    expect(strat6h.people['bang-taki'].active?.progress).toBeGreaterThan(360);
    // Kiyoaki (-0.08 rate) progresses slower than baseline 360.
    expect(strat6h.people['toyokawa-kiyoaki'].active?.id).toBe('kiyoaki_clean_apartment_desk');
    expect(strat6h.people['toyokawa-kiyoaki'].active?.progress).toBeLessThan(360);

    // Prompt context must still contain ONLY explicitly opted-in playable protagonists.
    const promptCtx = strategyPromptContext(strat6h);
    expect(promptCtx?.focuses.map(f => f.owner)).toEqual(['soyo']);

    // Advance 10 full game days: NPCs complete multi-stage/branch trees and adjust circle stats.
    const after10Days = advanceByWaits(state, 14400);
    const strat10d = after10Days.protagonists!.strategy!;
    expect(strat10d.people['bang-tomori'].completed).toContain('tomori_notebook_fragments');
    expect(strat10d.people['bang-tomori'].completed.length).toBeGreaterThanOrEqual(2);
    // Mutually exclusive branch completed locks its sibling permanently.
    const tomoriDoneSecond = strat10d.people['bang-tomori'].completed[1]!;
    const tomoriSiblingId = tomoriDoneSecond === 'tomori_cry_on_stage'
      ? 'tomori_revisit_old_spring'
      : 'tomori_cry_on_stage';
    const tomoriSiblingDef = FOCUS_CATALOG.find(f => f.id === tomoriSiblingId)!;
    expect(focusBranchLocked(strat10d, 'bang-tomori', tomoriSiblingDef)).toBe(true);
    expect(canStartFocus(strat10d, 'bang-tomori', tomoriSiblingDef)).toBe(false);

    // Circle stats advance cleanly while NPCs never inject items into playable-only majorQueue.
    expect(strat10d.stats.mygo_band_cohesion).toBeGreaterThan(0);
    expect(strat10d.stats.majo_neighborhood_bond).toBeGreaterThan(0);
    expect(strat10d.stats.watanare_quintet_bond).toBeGreaterThan(0);
    expect((strat10d.majorQueue ?? []).every(item => (PROTAGONISTS as readonly string[]).includes(item.owner))).toBe(true);

    // Identity dossier keeps `owner === null` for existing contracts while surfacing live NPC focus trees.
    const tomoriDossier = identityStrategyDossier('bang-tomori', 'bang-tomori', after10Days);
    expect(tomoriDossier.owner).toBeNull();
    expect(tomoriDossier.npcStrategyOwner).toBe('bang-tomori');
    expect(tomoriDossier.npcCompleted.length).toBeGreaterThanOrEqual(2);
    expect(tomoriDossier.npcFocusNodes.length).toBe(3);
    expect(tomoriDossier.history.length).toBeGreaterThan(0);
    expect(tomoriDossier.history.every(row => !row.subject.includes('_'))).toBe(true);

    // World flags meaningfully shift BanG Dream NPC AI weights.
    const crychicWorld = structuredClone(strat6h);
    crychicWorld.flags.crychic_reunited = true;
    const wReunited = focusWeight(crychicWorld, 'bang-tomori', FOCUS_CATALOG.find(f => f.id === 'tomori_revisit_old_spring')!);
    const breakWorld = structuredClone(strat6h);
    breakWorld.flags.sakiko_final_break = true;
    const wBroken = focusWeight(breakWorld, 'bang-tomori', FOCUS_CATALOG.find(f => f.id === 'tomori_revisit_old_spring')!);
    expect(wReunited.value).toBeGreaterThan(wBroken.value);
  });
});
