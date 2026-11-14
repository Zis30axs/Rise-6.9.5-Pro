import { describe, expect, it } from 'vitest';
import {
  FACTION_FOCUS_CATALOG,
  FACTION_SPIRIT_CATALOG,
  applyFactionFocusCommand,
  createFactionFocusState,
  discoverAvailableFactions,
  factionFocusExternalModifiersByOwner,
  isFactionFocusBranchLocked,
  settleFactionFocusState,
} from '../src/runtime/faction-focus';
import {
  buildFactionRuntimeMetas,
  buildFactionViews,
  factionFocusPromptContext,
  factionFocusPromptInstruction,
} from '../src/runtime/faction-focus-world';
import { strategyExternalModifiersByOwner } from '../src/runtime/npc-traits';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, finishPersonalChange, gameMinute } from '../src/runtime/protagonist-world';
import { MUTSUMI_OWNER_ID, calculateModifier } from '../src/runtime/strategy';
import { mutsumiBalanceValue } from '../src/runtime/mutsumi-balance';
import type { WorldState } from '../src/frontend/types';

const KANA_RE = /[\u3040-\u30ff]/;

function advanceClock(state: WorldState, deltaMinutes: number): WorldState {
  const before = structuredClone(state);
  const after = structuredClone(state);
  const total = gameMinute(before) + deltaMinutes;
  after.clock = {
    day: Math.floor(total / 1440) + 1,
    hour: Math.floor((total % 1440) / 60),
    minute: total % 60,
  };
  return parseState(finishPersonalChange(before, after, '时钟推进测试'));
}

describe('HoI4-style Faction Focus Trees', () => {
  it('contains zero Japanese kana in faction focus and spirit catalogs and resolves all 4 core trees cleanly', () => {
    for (const focus of FACTION_FOCUS_CATALOG) {
      expect(KANA_RE.test(focus.title)).toBe(false);
      expect(KANA_RE.test(focus.description)).toBe(false);
      expect(focus.durationMinutes).toBeGreaterThanOrEqual(2880);
    }
    for (const spirit of FACTION_SPIRIT_CATALOG) {
      expect(KANA_RE.test(spirit.title)).toBe(false);
      expect(KANA_RE.test(spirit.summary)).toBe(false);
      expect(spirit.modifiers.length).toBeGreaterThan(0);
    }

    const base = enableProtagonists(createInitialState());
    const profiles = discoverAvailableFactions(base);
    expect(profiles.map(p => p.id)).toEqual(
      expect.arrayContaining([
        'band:established-mygo',
        'band:established-ave-mujica',
        'circle:majo-circle',
        'circle:watanare-quintet',
      ]),
    );
  });

  it('enforces prerequisites, cabinet advisor speed/seat gating, exclusive branches, and Shared Faction Spirit propagation', () => {
    let state = enableProtagonists(createInitialState());

    // 1. MyGO!!!!! prerequisite chain, exclusive branches, and Faction Spirit across Soyo & Tomori
    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-ctl-1',
      command: {
        type: 'set_faction_control',
        factionId: 'band:established-mygo',
        controller: 'manual',
        includeInPrompt: false,
      },
    });
    expect(() =>
      reduceState(state, {
        type: 'faction_focus',
        requestId: 'ff-bad-prereq',
        command: {
          type: 'start_faction_focus',
          factionId: 'band:established-mygo',
          focusId: 'faction_mygo_cabinet_sync',
        },
      }),
    ).toThrow(/未满足/);

    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-start-root',
      command: {
        type: 'start_faction_focus',
        factionId: 'band:established-mygo',
        focusId: 'faction_mygo_practice_anchor',
      },
    });
    state = advanceClock(state, 2880);
    expect(state.protagonists!.factionFocuses!.factions['band:established-mygo']!.completed).toContain(
      'faction_mygo_practice_anchor',
    );

    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-start-sync',
      command: {
        type: 'start_faction_focus',
        factionId: 'band:established-mygo',
        focusId: 'faction_mygo_cabinet_sync',
      },
    });
    state = advanceClock(state, 2880);
    expect(state.protagonists!.factionFocuses!.factions['band:established-mygo']!.completed).toContain(
      'faction_mygo_cabinet_sync',
    );

    // Pick Branch A (faction_mygo_small_stage) and verify Branch B becomes mutually locked and Spirit applies to BOTH Soyo & Tomori
    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-start-branch-a',
      command: {
        type: 'start_faction_focus',
        factionId: 'band:established-mygo',
        focusId: 'faction_mygo_small_stage',
      },
    });
    state = advanceClock(state, 4320);

    const mygoEntry = state.protagonists!.factionFocuses!.factions['band:established-mygo']!;
    expect(mygoEntry.completed).toContain('faction_mygo_small_stage');
    expect(mygoEntry.spirits.map(s => s.id)).toContain('mygo_shared_harmony');

    const largerVenueDef = FACTION_FOCUS_CATALOG.find(f => f.id === 'faction_mygo_larger_venue')!;
    expect(isFactionFocusBranchLocked(mygoEntry, largerVenueDef)).toBe(true);

    const external = strategyExternalModifiersByOwner(state);
    const soyoPractice = calculateModifier(
      { state: state.protagonists!.strategy!, owner: 'soyo', externalModifiers: external.soyo },
      'practice_skill_rate',
      1,
    );
    const tomoriPractice = calculateModifier(
      { state: state.protagonists!.strategy!, owner: 'bang-tomori', externalModifiers: external['bang-tomori'] },
      'practice_skill_rate',
      1,
    );
    expect(soyoPractice.value).toBeGreaterThan(1);
    expect(tomoriPractice.value).toBeGreaterThan(1);
    expect(soyoPractice.breakdown.some(row => row.source.includes('同频五人音色'))).toBe(true);
    expect(tomoriPractice.breakdown.some(row => row.source.includes('同频五人音色'))).toBe(true);

    // 2. Cabinet Advisor seat gating & speed synergy on founder-managed band (Ave Mujica)
    let mujicaState = enableProtagonists(createInitialState());
    mujicaState = reduceState(mujicaState, { type: 'switch_protagonist', target: 'sakiko' });
    mujicaState = reduceState(mujicaState, {
      type: 'faction_focus',
      requestId: 'ff-sakiko-ctl',
      command: {
        type: 'set_faction_control',
        factionId: 'band:established-ave-mujica',
        controller: 'manual',
        includeInPrompt: false,
      },
    });
    mujicaState = reduceState(mujicaState, {
      type: 'faction_focus',
      requestId: 'ff-mj-root',
      command: {
        type: 'start_faction_focus',
        factionId: 'band:established-ave-mujica',
        focusId: 'faction_mujica_stage_protocol',
      },
    });
    mujicaState = advanceClock(mujicaState, 2880);

    // Without any advisor seat yet, cabinet_engine (requires minAdvisors: 1) is blocked
    expect(() =>
      reduceState(mujicaState, {
        type: 'faction_focus',
        requestId: 'ff-mj-need-adv',
        command: {
          type: 'start_faction_focus',
          factionId: 'band:established-ave-mujica',
          focusId: 'faction_mujica_cabinet_engine',
        },
      }),
    ).toThrow(/未满足/);

    // Appoint Mutsumi via SocietyPanel -> unlocks cabinet_engine AND boosts speed rate above 1.15
    mujicaState = reduceState(mujicaState, {
      type: 'society',
      requestId: 'soc-adv-mutsumi',
      command: {
        type: 'appoint_advisor',
        bandId: 'established-ave-mujica',
        seat: 'music',
        personId: 'bang-mutsumi',
      },
    });
    const mujicaView = buildFactionViews(mujicaState).find(v => v.profile.id === 'band:established-ave-mujica')!;
    expect(mujicaView.rateBreakdown.seatBonus).toBe(0.15);
    expect(mujicaView.rateBreakdown.traitBonus).toBeGreaterThan(0);
    expect(mujicaView.rateBreakdown.totalRate).toBeGreaterThan(1.15);

    mujicaState = reduceState(mujicaState, {
      type: 'faction_focus',
      requestId: 'ff-mj-cab',
      command: {
        type: 'start_faction_focus',
        factionId: 'band:established-ave-mujica',
        focusId: 'faction_mujica_cabinet_engine',
      },
    });
    // Completes faster than 2880m thanks to advisor synergy!
    mujicaState = advanceClock(mujicaState, 2400);
    expect(mujicaState.protagonists!.factionFocuses!.factions['band:established-ave-mujica']!.completed).toContain(
      'faction_mujica_cabinet_engine',
    );
  });

  it('couples Ave Mujica faction branches directly to Mutsumi Balance of Power and isolates protagonist permissions', () => {
    let state = enableProtagonists(createInitialState());

    // Soyo cannot steer Ave Mujica, Emma, or Watanare factions
    expect(() =>
      reduceState(state, {
        type: 'faction_focus',
        requestId: 'ff-unauth-soyo',
        command: {
          type: 'set_faction_control',
          factionId: 'band:established-ave-mujica',
          controller: 'manual',
          includeInPrompt: false,
        },
      }),
    ).toThrow(/无权/);

    // Switch to Sakiko and steer Ave Mujica down Mutual Shield (-14 toward Self)
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-sakiko-ctl',
      command: {
        type: 'set_faction_control',
        factionId: 'band:established-ave-mujica',
        controller: 'manual',
        includeInPrompt: false,
      },
    });
    state = reduceState(state, {
      type: 'society',
      requestId: 'ff-sakiko-adv',
      command: {
        type: 'appoint_advisor',
        bandId: 'established-ave-mujica',
        seat: 'music',
        personId: 'bang-mutsumi',
      },
    });
    const balanceBefore = mutsumiBalanceValue(state.protagonists!.strategy);

    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-mj-1',
      command: { type: 'start_faction_focus', factionId: 'band:established-ave-mujica', focusId: 'faction_mujica_stage_protocol' },
    });
    state = advanceClock(state, 2600);
    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-mj-2',
      command: { type: 'start_faction_focus', factionId: 'band:established-ave-mujica', focusId: 'faction_mujica_cabinet_engine' },
    });
    state = advanceClock(state, 2600);
    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-mj-3',
      command: { type: 'start_faction_focus', factionId: 'band:established-ave-mujica', focusId: 'faction_mujica_mutual_shield' },
    });
    state = advanceClock(state, 3900);

    const entry = state.protagonists!.factionFocuses!.factions['band:established-ave-mujica']!;
    expect(entry.completed).toContain('faction_mujica_mutual_shield');
    expect(entry.spirits.map(s => s.id)).toContain('mujica_warm_harbor');
    // Balance shifted noticeably toward Self (-14 relative to natural drift across settled days)
    expect(mutsumiBalanceValue(state.protagonists!.strategy)).toBeLessThan(balanceBefore - 5);
    expect(
      state.protagonists!.strategy!.history.some(
        h => h.owner === MUTSUMI_OWNER_ID && h.kind === 'balance' && h.id.startsWith('ffb:band:established-ave-mujica:'),
      ),
    ).toBe(true);
  });

  it('grants generic HoI4 faction focus trees to player-founded circles and coalitions', () => {
    let state = enableProtagonists(createInitialState());

    // Emma can control Majo circle directly
    state = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-emma-ctl',
      command: {
        type: 'set_faction_control',
        factionId: 'circle:majo-circle',
        controller: 'manual',
        includeInPrompt: false,
      },
    });

    // Soyo creates a custom social circle, invites known contact Sakiko (who accepts), and forms a coalition
    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    state = reduceState(state, {
      type: 'society',
      requestId: 'ff-circle-create',
      command: {
        type: 'create_circle',
        id: 'roof-club',
        title: '长台夜话茶社',
      },
    });
    state = reduceState(state, {
      type: 'society',
      requestId: 'ff-circle-invite',
      command: {
        type: 'invite_circle',
        circleId: 'roof-club',
        personId: 'protagonist-sakiko',
      },
    });

    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    state = reduceState(state, {
      type: 'society',
      requestId: 'ff-circle-accept',
      command: {
        type: 'accept_circle',
        invitationId: 'ff-circle-invite',
        accepted: true,
      },
    });

    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    state = reduceState(state, {
      type: 'society',
      requestId: 'ff-union-create',
      command: {
        type: 'create_union',
        id: 'tea-alliance',
        title: '街区音乐联合阵线',
        groupId: 'circle:roof-club',
      },
    });

    const unionProfile = discoverAvailableFactions(state).find(p => p.id === 'union:tea-alliance');
    expect(unionProfile).toBeDefined();
    expect(unionProfile!.template).toBe('generic_faction');
    expect(unionProfile!.memberIds).toEqual(expect.arrayContaining(['protagonist-soyo', 'protagonist-sakiko']));

    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-union-start',
      command: {
        type: 'start_faction_focus',
        factionId: 'union:tea-alliance',
        focusId: 'faction_generic_charter',
      },
    });
    state = advanceClock(state, 2880);
    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-union-drill',
      command: {
        type: 'start_faction_focus',
        factionId: 'union:tea-alliance',
        focusId: 'faction_generic_internal_drill',
      },
    });
    state = advanceClock(state, 4320);

    const factionMods = factionFocusExternalModifiersByOwner(state);
    expect(factionMods.soyo?.some(m => m.source.includes('内部磨合默契'))).toBe(true);
    expect(factionMods.sakiko?.some(m => m.source.includes('内部磨合默契'))).toBe(true);
  });

  it('maintains chunk invariance, command idempotency, save round-trip, and legacy migration', () => {
    const base = enableProtagonists(createInitialState());
    const metas = buildFactionRuntimeMetas(base);
    const metaMap = new Map(metas.map(m => [m.profile.id, m] as const));

    let seed = createFactionFocusState(gameMinute(base));
    seed = applyFactionFocusCommand(
      seed,
      { type: 'set_faction_control', factionId: 'circle:watanare-quintet', controller: 'manual', includeInPrompt: false },
      'req-1',
      metaMap,
    );
    expect(
      applyFactionFocusCommand(
        seed,
        { type: 'set_faction_control', factionId: 'circle:watanare-quintet', controller: 'manual', includeInPrompt: false },
        'req-1',
        metaMap,
      ),
    ).toBe(seed);
    expect(() =>
      applyFactionFocusCommand(
        seed,
        { type: 'set_faction_control', factionId: 'circle:watanare-quintet', controller: 'auto', includeInPrompt: false },
        'req-1',
        metaMap,
      ),
    ).toThrow(/不一致/);

    const longRun = settleFactionFocusState(seed, seed.cursor + 3600, metas).state;
    let chunked = seed;
    const stepSizes = [17, 143, 600, 840, 1000, 1000];
    for (const step of stepSizes) {
      chunked = settleFactionFocusState(chunked, chunked.cursor + step, metas).state;
    }
    expect(chunked).toEqual(longRun);

    const parsedRoundTrip = parseState(JSON.parse(JSON.stringify(base)));
    expect(parsedRoundTrip.protagonists!.factionFocuses).toEqual(base.protagonists!.factionFocuses);

    const legacySave = structuredClone(base);
    delete legacySave.protagonists!.factionFocuses;
    const migrated = parseState(legacySave);
    expect(migrated.protagonists!.factionFocuses?.version).toBe(1);
    expect(Object.keys(migrated.protagonists!.factionFocuses!.factions)).toContain('band:established-mygo');
  });

  it('gates LLM prompt injection strictly behind authorization, explicit mention, proximity, or concert day', () => {
    let state = enableProtagonists(createInitialState());
    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-prompt-ctl',
      command: {
        type: 'set_faction_control',
        factionId: 'band:established-mygo',
        controller: 'manual',
        includeInPrompt: false,
      },
    });
    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-prompt-start',
      command: {
        type: 'start_faction_focus',
        factionId: 'band:established-mygo',
        focusId: 'faction_mygo_practice_anchor',
      },
    });

    // Ensure other core factions aren't randomly opt-in before travelling
    state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-mj-off',
      command: {
        type: 'set_faction_control',
        factionId: 'band:established-ave-mujica',
        controller: 'manual',
        includeInPrompt: false,
      },
    });
    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });

    // Move Soyo home so no band member stands within talk distance
    state = reduceState(state, { type: 'novel_travel', locationId: 'soyo-house' });

    // 1. Ordinary unrelated turn in private room -> strictly null & zero instructions
    const unrelated = factionFocusPromptContext(state, '自己在房间里喝一口乌龙茶休息', 'story');
    expect(unrelated).toBeNull();
    expect(factionFocusPromptInstruction(unrelated)).toBe('');

    // 2. Contact introduction -> suppressed
    const intro = factionFocusPromptContext(state, '介绍新朋友 MyGO!!!!!', 'contact_introduction');
    expect(intro).toBeNull();

    // 3. Explicit mention -> triggers concisely
    const mentioned = factionFocusPromptContext(state, '今晚聊聊 MyGO!!!!! 下周排练的时间安排', 'story');
    expect(mentioned).not.toBeNull();
    expect(mentioned!.factions[0]!.id).toBe('band:established-mygo');
    expect(mentioned!.factions[0]!.reasons).toContain('explicit_mention');
    expect(mentioned!.factions[0]!.activeFocus?.id).toBe('faction_mygo_practice_anchor');
    expect(factionFocusPromptInstruction(mentioned)).toContain('summary.factionFocus');

    // 4. Opt-in toggle (includeInPrompt = true) -> triggers even without mention
    state = reduceState(state, {
      type: 'faction_focus',
      requestId: 'ff-prompt-optin',
      command: {
        type: 'set_faction_control',
        factionId: 'band:established-mygo',
        controller: 'manual',
        includeInPrompt: true,
      },
    });
    const optedIn = factionFocusPromptContext(state, '自己在房间里翻看旧笔记本', 'story');
    expect(optedIn).not.toBeNull();
    expect(optedIn!.factions[0]!.reasons).toContain('manual_prompt_opt_in');
  });
});
