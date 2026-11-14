import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { identityStrategyDossier } from '../src/frontend/identity-strategy';
import { createTavernBridge } from '../src/runtime/bridge';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import {
  applyStoryActions,
  commitStoryTurn,
  createInitialState,
  parseState,
} from '../src/runtime/model';
import { applyNpcPhoneCommand, npcPhoneReplyContext } from '../src/runtime/npc-phone';
import { getSceneArea, sceneLocationId } from '../src/runtime/scene-context';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import {
  FOCUS_CATALOG,
  MUTSUMI_BOP_INITIAL,
  MUTSUMI_OWNER_ID,
  createGameStrategyState,
  focusWeight,
  parseStrategyState,
  settleStrategyState,
} from '../src/runtime/strategy';
import {
  MUTSUMI_BOP_MAX_TURN_DELTA,
  MUTSUMI_BOP_TIERS,
  mutsumiBalanceOpportunity,
  mutsumiBalancePromptInstruction,
  mutsumiBalanceStatus,
  mutsumiBalanceValue,
} from '../src/runtime/mutsumi-balance';
import { npcSelfExternalModifiers } from '../src/runtime/npc-traits';
import { worldScenePeople } from '../src/runtime/world-presence';
import type { WorldState } from '../src/frontend/types';

const KANA_RE = /[\u3040-\u30ff]/;

function makeScene(x: number, z: number, seed: string, encounterId: string | null = null) {
  const area = getSceneArea(x, z);
  expect(area).not.toBeNull();
  return {
    locationId: sceneLocationId(area!.id),
    scene: { areaId: area!.id, x, z, yaw: 0, seed, encounterId },
  };
}

function makeSeededState(seed = 'mutsumi-bop-seed', day = 1): WorldState {
  const raw = createInitialState();
  raw.clock = { day, hour: 15, minute: 0 };
  raw.interior = null;
  const placed = makeScene(0, -6, seed, null);
  raw.locationId = placed.locationId;
  raw.scene = placed.scene;
  return parseState(enableProtagonists(raw));
}

function moveNextToPerson(state: WorldState, personId: string): WorldState {
  const person = worldScenePeople(state).find(p => p.id === personId);
  expect(person).toBeDefined();
  const next = structuredClone(state);
  next.interior = null;
  const placed = makeScene(person!.x - 1, person!.z - 1, state.scene?.seed ?? 'mutsumi-bop-seed', personId);
  next.locationId = placed.locationId;
  next.scene = placed.scene;
  return parseState(next);
}

function moveFarFromPerson(state: WorldState, personId: string): WorldState {
  const person = worldScenePeople(state).find(p => p.id === personId);
  expect(person).toBeDefined();
  const next = structuredClone(state);
  next.interior = null;
  const placed = makeScene(-45, -3, state.scene?.seed ?? 'mutsumi-bop-seed', null);
  expect(Math.hypot(placed.scene.x - person!.x, placed.scene.z - person!.z)).toBeGreaterThan(20);
  next.locationId = placed.locationId;
  next.scene = placed.scene;
  return parseState(next);
}

function makeMockBridge() {
  const generate = vi.fn(async (_config: { user_input: string; injects: { content: string }[] }) =>
    '<story>|旁白|平静|一阵风吹过行道树。|</story><phone_messages>[]</phone_messages>',
  );
  const script = {
    parent: {
      SillyTavern: {
        getContext: () => ({
          characterId: 0,
          characters: { 0: { avatar: 'mutsumi-bop-test.png' } },
          chatId: 'bop-test',
          mainApi: 'openai',
        }),
      },
    },
    getVariables: () => ({}),
    replaceVariables: vi.fn(),
    eventOn: vi.fn(),
    eventRemoveListener: vi.fn(),
    tavern_events: { CHAT_CHANGED: 'chat_changed' },
    generate,
    stopGenerationById: vi.fn(() => true),
  } as unknown as Window;
  return { generate, bridge: createTavernBridge(script)! };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('unread-city:long-term-memory:settings:v1', JSON.stringify({ enabled: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('若叶睦专属心境天平（Balance of Power）基础与国策联动', () => {
  it('覆盖全部 5 个心理区间、数值钳制、且不含日文假名与非睦归属越权', () => {
    expect(MUTSUMI_BOP_TIERS).toHaveLength(5);
    expect(mutsumiBalanceStatus(-100).tierId).toBe('self_open');
    expect(mutsumiBalanceStatus(-60).tierId).toBe('self_open');
    expect(mutsumiBalanceStatus(-59).tierId).toBe('self_leaning');
    expect(mutsumiBalanceStatus(-25).tierId).toBe('self_leaning');
    expect(mutsumiBalanceStatus(-24).tierId).toBe('contested');
    expect(mutsumiBalanceStatus(15).tierId).toBe('contested');
    expect(mutsumiBalanceStatus(25).tierId).toBe('mortis_guard');
    expect(mutsumiBalanceStatus(59).tierId).toBe('mortis_guard');
    expect(mutsumiBalanceStatus(60).tierId).toBe('mortis_dominion');
    expect(mutsumiBalanceStatus(100).tierId).toBe('mortis_dominion');
    expect(mutsumiBalanceStatus(-180).value).toBe(-100);
    expect(mutsumiBalanceStatus(240).value).toBe(100);

    for (const tier of MUTSUMI_BOP_TIERS) {
      expect(`${tier.label}${tier.sideLabel}${tier.summary}${tier.narrativeHint}`).not.toMatch(KANA_RE);
    }

    const base = createGameStrategyState(0);
    expect(mutsumiBalanceValue(base)).toBe(MUTSUMI_BOP_INITIAL);
    expect(base.people[MUTSUMI_OWNER_ID].balance).toBe(MUTSUMI_BOP_INITIAL);

    // Non-Mutsumi owners must reject forged balance field in save parsing.
    const forged = structuredClone(base) as unknown as Record<string, any>;
    forged.people['bang-anon'].balance = 40;
    expect(() => parseStrategyState(forged, 0)).toThrow();

    // Legacy save lacking bang-mutsumi migrates with initial balance cleanly.
    const legacy = structuredClone(base) as unknown as Record<string, any>;
    delete legacy.people[MUTSUMI_OWNER_ID];
    const migrated = parseStrategyState(legacy, 0);
    expect(mutsumiBalanceValue(migrated)).toBe(MUTSUMI_BOP_INITIAL);
    expect(migrated.people[MUTSUMI_OWNER_ID].balance).toBe(MUTSUMI_BOP_INITIAL);
  });

  it('睦国策树随心境天平动态切换倾向，并保持长/短步时间切片完全确定性', () => {
    const start = createGameStrategyState(0);
    const modifiers = npcSelfExternalModifiers(MUTSUMI_OWNER_ID);
    const honestNode = FOCUS_CATALOG.find(f => f.id === 'mutsumi_say_one_honest_word')!;
    const mortisNode = FOCUS_CATALOG.find(f => f.id === 'mutsumi_mortis_rehearsal')!;

    const highMortis = structuredClone(start);
    highMortis.people[MUTSUMI_OWNER_ID].balance = 45;
    expect(focusWeight(highMortis, MUTSUMI_OWNER_ID, mortisNode, modifiers).value)
      .toBeGreaterThan(focusWeight(highMortis, MUTSUMI_OWNER_ID, honestNode, modifiers).value);

    const openSelf = structuredClone(start);
    openSelf.people[MUTSUMI_OWNER_ID].balance = -20;
    expect(focusWeight(openSelf, MUTSUMI_OWNER_ID, honestNode, modifiers).value)
      .toBeGreaterThan(focusWeight(openSelf, MUTSUMI_OWNER_ID, mortisNode, modifiers).value);

    // Stepping 5 days (7200m) across root + branch completion & midnight ticks must match across slices.
    const longRun = settleStrategyState(start, 7200);
    let chunked = start;
    for (const target of [700, 1439, 1440, 2880, 4319, 4320, 6000, 7200]) {
      chunked = settleStrategyState(chunked, target);
    }
    expect(chunked).toEqual(longRun);
    // Completed root shifted balance away from +15 toward Self (-8) plus midnight baseline drift.
    expect(longRun.people[MUTSUMI_OWNER_ID].completed).toContain('mutsumi_cucumber_seedlings');
    expect(mutsumiBalanceValue(longRun)).toBeLessThan(MUTSUMI_BOP_INITIAL);
  });
});

describe('条件门控注入与交涉感化结算', () => {
  it('普通无关回合绝不注入天平提示与状态载荷，且拒绝凭空篡改 mutsumi_balance', async () => {
    const far = moveFarFromPerson(makeSeededState(), MUTSUMI_OWNER_ID);

    expect(mutsumiBalanceOpportunity(far, '去图书馆看会儿书').allowed).toBe(false);
    // Avoid false positive on Chinese word "家庭和睦".
    expect(mutsumiBalanceOpportunity(far, '祝大家家庭和睦平安').allowed).toBe(false);

    const h = makeMockBridge();
    try {
      await h.bridge.generate('去便利店买一瓶乌龙茶', far);
      const config = h.generate.mock.calls[0]![0];
      expect(config.user_input).not.toContain('"mutsumiBalance"');
      expect(config.injects[0]!.content).toContain('若叶睦心境天平未开启');
      expect(config.injects[0]!.content).not.toContain('当前天平：');
    } finally {
      h.bridge.dispose();
    }

    expect(() =>
      commitStoryTurn(
        far,
        '去买一瓶乌龙茶',
        {
          text: '|旁白|平静|店里很安静。|',
          phoneMessages: [],
          worldActions: [{ type: 'mutsumi_balance', delta: -10, reason: '无关回合试图偷改心境' }],
        },
        { userId: 'u-unauth', assistantId: 'a-unauth' },
      ),
    ).toThrow();
  });

  it('在近距离对话、明确点名/短信、重大事件或极化危机在场时注入规则并正常结算', async () => {
    const base = makeSeededState();
    const near = moveNextToPerson(base, MUTSUMI_OWNER_ID);
    const oppNear = mutsumiBalanceOpportunity(near, '看着她');
    expect(oppNear.allowed).toBe(true);
    expect(oppNear.reasonTags).toContain('close_proximity');

    const far = moveFarFromPerson(base, MUTSUMI_OWNER_ID);
    const oppMention = mutsumiBalanceOpportunity(far, '想先去找小睦聊聊昨晚排练的事');
    expect(oppMention.allowed).toBe(true);
    expect(oppMention.reasonTags).toContain('explicit_mention');

    const withMajor = structuredClone(far);
    withMajor.protagonists!.strategy!.majorQueue!.push({
      id: 'major:sakiko:100:sakiko_redefine_band',
      owner: 'sakiko',
      focusId: 'sakiko_redefine_band',
      at: 100,
    });
    const oppMajor = mutsumiBalanceOpportunity(withMajor, '整理背包');
    expect(oppMajor.allowed).toBe(true);
    expect(oppMajor.reasonTags).toContain('important_event');

    // Near turn injects concise BoP payload & persuasion instructions into bridge prompt.
    const h = makeMockBridge();
    try {
      await h.bridge.generate('轻声问她今天是不是很累，告诉她不想开口也可以先休息', near);
      const config = h.generate.mock.calls[0]![0];
      expect(config.user_input).toContain('"mutsumiBalance"');
      expect(config.injects[0]!.content).toContain('若叶睦·心境天平');
      expect(config.injects[0]!.content).toContain('mutsumi_balance');
      expect(config.injects[0]!.content).not.toMatch(KANA_RE);
    } finally {
      h.bridge.dispose();
    }

    // Valid persuasion commit shifts Mutsumi toward Self and remains replay-idempotent.
    const parsedReply = parseGeneratedStory(
      `<story>|若叶睦|沉默|……嗯。谢谢。|</story><phone_messages>[]</phone_messages><world_actions>[{"type":"mutsumi_balance","delta":-16,"reason":"耐心倾听且未逼迫她当场解释，她稍微放下了防线"}]</world_actions>`,
      near,
    );
    const committed = commitStoryTurn(
      near,
      '轻声问她今天是不是很累，告诉她不想开口也可以先休息',
      parsedReply,
      { userId: 'u-bop-1', assistantId: 'a-bop-1' },
    );
    expect(mutsumiBalanceValue(committed.protagonists?.strategy)).toBe(-1);
    const historyRow = committed.protagonists!.strategy!.history.find(hRow => hRow.kind === 'balance');
    expect(historyRow?.owner).toBe(MUTSUMI_OWNER_ID);
    expect(historyRow?.subject).toBe('mutsumi_balance');

    // Replay same turn ID must not double-subtract -16.
    const replayed = commitStoryTurn(
      committed,
      '轻声问她今天是不是很累，告诉她不想开口也可以先休息',
      parsedReply,
      { userId: 'u-bop-1', assistantId: 'a-bop-1' },
    );
    expect(mutsumiBalanceValue(replayed.protagonists?.strategy)).toBe(-1);

    // Tampered delta on same turn ID must reject.
    expect(() =>
      commitStoryTurn(
        committed,
        '轻声问她今天是不是很累',
        {
          text: '|若叶睦|沉默|……嗯。|',
          phoneMessages: [],
          worldActions: [{ type: 'mutsumi_balance', delta: -12, reason: '篡改数值' }],
        },
        { userId: 'u-bop-1', assistantId: 'a-bop-1' },
      ),
    ).toThrow();
  });

  it('限制每轮 delta 幅度与次数，并在睦短信回复上下文注入状态、而在他人短信中保持隐身', () => {
    const base = makeSeededState();
    const near = moveNextToPerson(base, MUTSUMI_OWNER_ID);

    expect(() =>
      applyStoryActions(near, [
        { type: 'mutsumi_balance', delta: -(MUTSUMI_BOP_MAX_TURN_DELTA + 1), reason: '超限一步感化' },
      ]),
    ).toThrow();
    expect(() =>
      applyStoryActions(near, [
        { type: 'mutsumi_balance', delta: 0, reason: '零变化无效' },
      ]),
    ).toThrow();
    expect(() =>
      applyStoryActions(near, [
        { type: 'mutsumi_balance', delta: -5, reason: '第一次' },
        { type: 'mutsumi_balance', delta: -5, reason: '第二次' },
      ]),
    ).toThrow();

    // Multiple sequential preview actions push cleanly toward [-100, +100] clamps.
    let progressed = near;
    for (let i = 0; i < 8; i++) {
      progressed = applyStoryActions(progressed, [
        { type: 'mutsumi_balance', delta: 15, reason: `连续舞台压迫第 ${i + 1} 次` },
      ]);
    }
    expect(mutsumiBalanceValue(progressed.protagonists?.strategy)).toBe(100);
    expect(mutsumiBalanceStatus(100).tierId).toBe('mortis_dominion');

    // Direct NPC SMS reply context includes mutsumiBalance only for Mutsumi.
    const extraContacts = [...progressed.contacts];
    if (!extraContacts.some(c => c.id === MUTSUMI_OWNER_ID || c.sourcePersonId === MUTSUMI_OWNER_ID)) {
      extraContacts.push({
        id: MUTSUMI_OWNER_ID,
        name: '若叶睦',
        tag: '吉他手',
        status: '沉默寡言的吉他手',
        affinity: 62,
        portraitId: 'deepseek',
        summary: '少言的同伴',
        relationNote: '',
        isMain: false,
        sourcePersonId: MUTSUMI_OWNER_ID,
      });
    }
    if (!extraContacts.some(c => c.id === 'bang-anon' || c.sourcePersonId === 'bang-anon')) {
      extraContacts.push({
        id: 'bang-anon',
        name: '千早爱音',
        tag: '吉他手',
        status: '爱凑热闹的同伴',
        affinity: 70,
        portraitId: 'xiaoyang',
        summary: '开朗的吉他手',
        relationNote: '',
        isMain: false,
        sourcePersonId: 'bang-anon',
      });
    }
    const smsState = parseState({
      ...progressed,
      contacts: extraContacts,
    });
    personState(smsState, 'soyo').contacts = structuredClone(extraContacts);
    applyNpcPhoneCommand(smsState, 'soyo', { type: 'send_npc_message', npcId: MUTSUMI_OWNER_ID, text: '今天还好吗' }, 'req-sms-mutsumi-1');
    applyNpcPhoneCommand(smsState, 'soyo', { type: 'send_npc_message', npcId: 'bang-anon', text: '走去喝奶茶' }, 'req-sms-anon-1');
    const mutsumiPending = smsState.protagonists!.npcPhone!.messages.find(m => m.responderId === MUTSUMI_OWNER_ID)!;
    const mutsumiCtx = npcPhoneReplyContext(smsState, mutsumiPending.id);
    expect((mutsumiCtx.actor as Record<string, unknown>).mutsumiBalance).toBeDefined();

    const anonPending = smsState.protagonists!.npcPhone!.messages.find(m => m.responderId === 'bang-anon')!;
    const anonCtx = npcPhoneReplyContext(smsState, anonPending.id);
    expect((anonCtx.actor as Record<string, unknown>).mutsumiBalance).toBeUndefined();

    // Instruction text stays kana-free in both states.
    expect(mutsumiBalancePromptInstruction(mutsumiBalanceOpportunity(near, ''))).not.toMatch(KANA_RE);
  });

  it('查身份全知档案仅向若叶睦本人暴露心境天平，其余 NPC 与主角均返回 null', () => {
    const base = makeSeededState();
    const mutsumiDossier = identityStrategyDossier('mutsumi', MUTSUMI_OWNER_ID, base);
    expect(mutsumiDossier.mutsumiBalance).not.toBeNull();
    expect(mutsumiDossier.mutsumiBalance!.value).toBe(MUTSUMI_BOP_INITIAL);
    expect(mutsumiDossier.mutsumiBalance!.poleLeft).toBe('若叶睦 · 本我');
    expect(mutsumiDossier.mutsumiBalance!.poleRight).toBe('Mortis · 舞台护盾');

    const anonDossier = identityStrategyDossier('anon', 'bang-anon', base);
    expect(anonDossier.mutsumiBalance).toBeNull();

    const soyoDossier = identityStrategyDossier('soyo', 'protagonist-soyo', base);
    expect(soyoDossier.mutsumiBalance).toBeNull();

    const sakikoDossier = identityStrategyDossier('sakiko', 'protagonist-sakiko', base);
    expect(sakikoDossier.mutsumiBalance).toBeNull();
  });
});
