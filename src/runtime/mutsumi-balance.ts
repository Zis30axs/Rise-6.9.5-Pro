import type { StoryAction, WorldState } from '../frontend/types';
import { activeProtagonist, gameMinute } from './protagonist-world';
import {
  MUTSUMI_BOP_INITIAL,
  MUTSUMI_BOP_MAX,
  MUTSUMI_BOP_MIN,
  MUTSUMI_OWNER_ID,
  appendStrategyBalanceAudit,
  clampMutsumiBalance,
  mutsumiBalanceValue,
  parseStrategyState,
  settleStrategyState,
  type StrategyState,
} from './strategy';
import { worldSceneRoster } from './world-presence';

export { MUTSUMI_OWNER_ID as MUTSUMI_BOP_OWNER_ID, MUTSUMI_BOP_INITIAL, MUTSUMI_BOP_MAX, MUTSUMI_BOP_MIN, mutsumiBalanceValue };

export const MUTSUMI_BOP_MAX_TURN_DELTA = 18;
export const MUTSUMI_BOP_POLE_LEFT = '若叶睦 · 本我';
export const MUTSUMI_BOP_POLE_RIGHT = 'Mortis · 舞台护盾';

export type MutsumiBalanceTierId =
  | 'self_open'
  | 'self_leaning'
  | 'contested'
  | 'mortis_guard'
  | 'mortis_dominion';

export type MutsumiBalanceSide = 'self' | 'balanced' | 'mortis';

export type MutsumiBalanceReasonTag =
  | 'close_proximity'
  | 'explicit_mention'
  | 'sms_mutsumi'
  | 'important_event';

export interface MutsumiBalanceTier {
  id: MutsumiBalanceTierId;
  min: number;
  max: number;
  side: MutsumiBalanceSide;
  label: string;
  sideLabel: string;
  summary: string;
  narrativeHint: string;
}

export const MUTSUMI_BOP_TIERS: readonly MutsumiBalanceTier[] = Object.freeze([
  {
    id: 'self_open',
    min: -100,
    max: -60,
    side: 'self',
    label: '本我敞开',
    sideLabel: '偏向若叶睦（本我）',
    summary: '防卫意识明显退去，愿意顺着自己的真意说话或留下真实神情，Mortis 几乎不再主动接管。',
    narrativeHint:
      '睦当前处于「本我敞开」状态：虽仍话少慢热，但面对善意与信任时不再第一时间逃进退缩或假面，能说出简短真实的感想或亲手递出在意的东西。',
  },
  {
    id: 'self_leaning',
    min: -59,
    max: -25,
    side: 'self',
    label: '本我主导',
    sideLabel: '偏向若叶睦（本我）',
    summary: '主要以本来的若叶睦面对日常，面对追问或冲突时还会停顿退缩，但诚实感化较易奏效。',
    narrativeHint:
      '睦当前处于「本我主导」状态：遇事倾向用真实的沉默或小声坦白回应，除非遭到当场严厉指责或崩溃危机，否则不轻易切入防备假面。',
  },
  {
    id: 'contested',
    min: -24,
    max: 24,
    side: 'balanced',
    label: '静默拉锯',
    sideLabel: '心境拉锯',
    summary: '在本真脆弱与舞台防护壳之间反复拉锯；温和耐心的倾听能让她站稳自己，冷硬施压则会把她推向防线。',
    narrativeHint:
      '睦当前处于「静默拉锯」状态：表达困难而敏锐，容易因为指责、混乱或过度期待而骤然闭嘴；稳定不强求的陪伴能缓慢降低戒备，让她试着说出自己的想法。',
  },
  {
    id: 'mortis_guard',
    min: 25,
    max: 59,
    side: 'mortis',
    label: 'Mortis 戒备接管',
    sideLabel: '偏向 Mortis（舞台护盾）',
    summary: '防卫性的演出意识占了上风：习惯用冷静顺从或戏剧性的礼貌隔开他人，把真实的痛苦锁在壳里。',
    narrativeHint:
      '睦当前处于「Mortis 戒备接管」状态：由保护本体的舞台防卫意识出面周旋——语调会显得更流畅或刻意完美配合，却始终绕开脆弱的真心；强硬逼问只会让她退得更远，唯有先安抚安全感才可能出现松动。',
  },
  {
    id: 'mortis_dominion',
    min: 60,
    max: 100,
    side: 'mortis',
    label: 'Mortis 全面防线',
    sideLabel: '偏向 Mortis（舞台护盾）',
    summary: '防御性的戏剧假面牢牢代替本体应酬一切交锋与舞台重压；只靠三言两语极难立刻撬动，需要持续共情与具体契机。',
    narrativeHint:
      '睦当前处于「Mortis 全面防线」状态：防卫意识「Mortis」全面护主并接管言行（仅保留心理防线质感，禁止将 Mortis 写成重复口癖或搞笑梗）；若非极其诚挚、具体且给予退路的沟通，她不会轻易露出本来的若叶睦。',
  },
]);

export interface MutsumiBalanceStatus {
  value: number;
  abs: number;
  side: MutsumiBalanceSide;
  tierId: MutsumiBalanceTierId;
  tierLabel: string;
  sideLabel: string;
  poleLeft: string;
  poleRight: string;
  summary: string;
  narrativeHint: string;
  /** Gauge marker 0 (full Self -100) .. 100 (full Mortis +100). */
  markerPercent: number;
}

export interface MutsumiBalanceOpportunity {
  allowed: boolean;
  reasonTags: MutsumiBalanceReasonTag[];
  currentBalance: number;
  status: MutsumiBalanceStatus;
  maxDelta: number;
  activeFocusId: string | null;
}

export interface MutsumiBalanceOpportunityOptions {
  kind?: string;
  messageId?: string;
  hasRelevantMajor?: boolean;
  worldActions?: readonly StoryAction[];
}

const AVE_MUJICA_CIRCLE_PERSON_IDS = new Set([
  'protagonist-sakiko',
  'bang-uika',
  'bang-umiri',
  'bang-nyamu',
]);

const MUTSUMI_MENTION_RE =
  /(?:小睦|若叶睦|Mortis|莫蒂斯|Mutsumi|Ave\s*Mujica|mujica|(?<![和敦])睦(?![邻里共处])|和睦(?:说|聊|谈|见|面|一起|去|发|递))/i;

const CONTINUATION_RE = /(?:追上去|叫住|拉住|回头|背影|她)/;

function hash(value: string): string {
  let a = 2166136261;
  let b = 0x811c9dc7;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ (c + (i & 255)), 16777619);
  }
  return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
}

export function mutsumiBalanceReceiptId(turnId: string): string {
  return `bop:${hash(turnId)}`;
}

export function hasMutsumiBalanceReceipt(strategy: StrategyState | undefined, turnId: string): boolean {
  const id = mutsumiBalanceReceiptId(turnId);
  return !!strategy?.receipts.some(row => row.id === id);
}

export function mutsumiBalanceStatus(rawValue: number): MutsumiBalanceStatus {
  const value = clampMutsumiBalance(rawValue);
  const tier = MUTSUMI_BOP_TIERS.find(entry => value >= entry.min && value <= entry.max) ?? MUTSUMI_BOP_TIERS[2]!;
  return {
    value,
    abs: Math.abs(value),
    side: tier.side,
    tierId: tier.id,
    tierLabel: tier.label,
    sideLabel: tier.sideLabel,
    poleLeft: MUTSUMI_BOP_POLE_LEFT,
    poleRight: MUTSUMI_BOP_POLE_RIGHT,
    summary: tier.summary,
    narrativeHint: tier.narrativeHint,
    markerPercent: Math.round(((value + 100) / 2) * 10) / 10,
  };
}

function contactTargetsMutsumi(state: WorldState, targetId: string): boolean {
  if (targetId === MUTSUMI_OWNER_ID) return true;
  return state.contacts.some(
    c => c.id === targetId && (c.sourcePersonId === MUTSUMI_OWNER_ID || c.id === MUTSUMI_OWNER_ID),
  );
}

function hasTodayAveMujicaBooking(state: WorldState): boolean {
  const registry = state.livehouse;
  if (!registry) return false;
  const now = gameMinute(state);
  const dayStart = Math.floor(now / 1440) * 1440;
  const dayEnd = dayStart + 1440;
  const mujicaIds = new Set(registry.bands.filter(b => b.established === 'ave-mujica').map(b => b.id));
  return registry.bookings.some(booking => {
    const involvesMutsumi = mujicaIds.has(booking.bandId) || booking.memberIds.includes(MUTSUMI_OWNER_ID);
    if (!involvesMutsumi) return false;
    const isToday = booking.start >= dayStart && booking.start < dayEnd;
    const isOngoing = booking.start <= now && now < booking.start + booking.duration;
    return isToday || isOngoing;
  });
}

function lastTurnFocusedMutsumi(state: WorldState): boolean {
  const lastAssistant = [...(state.story ?? [])].reverse().find(row => row.role === 'assistant');
  if (!lastAssistant) return false;
  return /(?:\|若叶睦\||\|Mortis\||小睦|Mortis)/i.test(lastAssistant.text);
}

/**
 * Gate Mutsumi's Balance of Power rules strictly to turns where Mutsumi is
 * within talking distance, directly involved by name/SMS, or affected by an
 * important CRYCHIC / Ave Mujica milestone or extreme breakdown near bandmates.
 */
export function mutsumiBalanceOpportunity(
  state: WorldState,
  input = '',
  options?: MutsumiBalanceOpportunityOptions,
): MutsumiBalanceOpportunity {
  const currentBalance = mutsumiBalanceValue(state.protagonists?.strategy);
  const status = mutsumiBalanceStatus(currentBalance);
  const activeFocusId = state.protagonists?.strategy?.people?.[MUTSUMI_OWNER_ID]?.active?.id ?? null;

  if (options?.kind === 'contact_introduction') {
    return {
      allowed: false,
      reasonTags: [],
      currentBalance,
      status,
      maxDelta: MUTSUMI_BOP_MAX_TURN_DELTA,
      activeFocusId,
    };
  }

  const tags: MutsumiBalanceReasonTag[] = [];
  const roster = worldSceneRoster(state);
  const inTalkRange = roster.some(entry => entry.person.id === MUTSUMI_OWNER_ID && entry.canTalk);
  const encounterIsMutsumi =
    !!state.scene?.encounterId && contactTargetsMutsumi(state, state.scene.encounterId);
  if (inTalkRange || encounterIsMutsumi) {
    tags.push('close_proximity');
  }

  const cleanInput = input.trim();
  const explicitTextMention =
    MUTSUMI_MENTION_RE.test(cleanInput) ||
    (CONTINUATION_RE.test(cleanInput) && lastTurnFocusedMutsumi(state));
  if (explicitTextMention) {
    tags.push('explicit_mention');
  }

  let smsTargetsMutsumi = false;
  if (options?.kind === 'npc_phone_reply' && options.messageId) {
    const msg = state.protagonists?.npcPhone?.messages.find(m => m.id === options.messageId);
    if (msg && (msg.responderId === MUTSUMI_OWNER_ID || msg.targetId === MUTSUMI_OWNER_ID || msg.targetId === 'ave-mujica')) {
      smsTargetsMutsumi = true;
    }
  } else if (options?.kind === 'band_invitation_reply' && options.messageId) {
    const invite = state.livehouse?.invitations.find(i => i.messageId === options.messageId);
    if (invite?.personId === MUTSUMI_OWNER_ID) {
      smsTargetsMutsumi = true;
    }
  }
  if (
    options?.worldActions?.some(
      action =>
        (action.type === 'send_sms' || action.type === 'social_invite') &&
        contactTargetsMutsumi(state, action.targetId),
    )
  ) {
    smsTargetsMutsumi = true;
  }
  if (smsTargetsMutsumi) {
    tags.push('sms_mutsumi');
  }

  const hasStrategyMajor =
    options?.hasRelevantMajor === true ||
    (state.protagonists?.strategy?.majorQueue ?? []).some(m => m.owner === 'soyo' || m.owner === 'sakiko');
  const mujicaConcertDay = hasTodayAveMujicaBooking(state);
  const extremeWithBandmates =
    status.abs >= 60 &&
    roster.some(entry => entry.canTalk && AVE_MUJICA_CIRCLE_PERSON_IDS.has(entry.person.id)) &&
    (activeProtagonist(state) === 'sakiko' || activeProtagonist(state) === 'soyo');

  if (hasStrategyMajor || mujicaConcertDay || extremeWithBandmates) {
    tags.push('important_event');
  }

  return {
    allowed: tags.length > 0,
    reasonTags: tags,
    currentBalance,
    status,
    maxDelta: MUTSUMI_BOP_MAX_TURN_DELTA,
    activeFocusId,
  };
}

export function mutsumiBalancePromptSummary(
  opportunity: MutsumiBalanceOpportunity,
  focusTitle?: string | null,
): Record<string, unknown> | undefined {
  if (!opportunity.allowed) return undefined;
  return {
    characterId: MUTSUMI_OWNER_ID,
    characterName: '若叶睦',
    poleLeft: opportunity.status.poleLeft,
    poleRight: opportunity.status.poleRight,
    value: opportunity.currentBalance,
    tierId: opportunity.status.tierId,
    tierLabel: opportunity.status.tierLabel,
    triggerReasons: opportunity.reasonTags,
    ...(opportunity.activeFocusId
      ? { activeFocus: { id: opportunity.activeFocusId, title: focusTitle ?? opportunity.activeFocusId } }
      : {}),
  };
}

export function mutsumiBalancePromptInstruction(opportunity: MutsumiBalanceOpportunity): string {
  if (!opportunity.allowed) {
    return '【若叶睦心境天平未开启】本轮不涉及若叶睦心境交涉，禁止输出 mutsumi_balance。';
  }
  const s = opportunity.status;
  const signed = s.value > 0 ? `+${s.value}` : String(s.value);
  return [
    '【若叶睦·心境天平（若叶睦本我 ↔ Mortis 舞台护盾）】',
    `当前天平：${signed}（区间：${s.tierLabel}；-100 为「${s.poleLeft}」，+100 为「${s.poleRight}」）。`,
    `性格与防卫表现：${s.narrativeHint}`,
    '严谨忠于原作设定：禁止将「Mortis」写成重复口癖或搞笑梗；她只是睦在舞台与压力下的心理防卫意识与保护壳。',
    `若本轮与睦的交流、舞台事件或短信沟通构成了真实的情感安抚感化、防线松动或施压激化，可在 <world_actions> 输出至多 1 项 {"type":"mutsumi_balance","delta":非零整数(${-opportunity.maxDelta}到${opportunity.maxDelta}),"reason":"简短客观依据"}：`,
    '- 负数 delta（-1 到 -18）：向「若叶睦（本我）」回稳——须有耐心倾听、尊重其沉默与退路、接住真实心意等具体契机；防卫深时普通轻聊至多 -2～-6，直击心结才可更深。',
    '- 正数 delta（+1 到 +18）：向「Mortis（舞台护盾）」强化防线——须有苛责失误、强硬逼迫回应或重压冲突等实际刺激。',
    '仅普通寒暄、路过或未发生心境偏移时省略该行动；不得只在正文写明感化成功而不提交行动。',
  ].join('\n');
}

export function validateMutsumiBalanceDelta(delta: unknown): number {
  if (
    typeof delta !== 'number' ||
    !Number.isSafeInteger(delta) ||
    delta === 0 ||
    Math.abs(delta) > MUTSUMI_BOP_MAX_TURN_DELTA
  ) {
    throw new Error(`若叶睦心境天平偏移无效：必须为 -${MUTSUMI_BOP_MAX_TURN_DELTA} 到 +${MUTSUMI_BOP_MAX_TURN_DELTA} 的非零整数`);
  }
  return delta;
}

export function applyMutsumiBalanceTurn(
  before: WorldState,
  committed: WorldState,
  actions: readonly StoryAction[],
  turnId: string,
  replayTurnId?: string,
): WorldState {
  const action = actions.find(
    (entry): entry is Extract<StoryAction, { type: 'mutsumi_balance' }> => entry.type === 'mutsumi_balance',
  );
  if (!action) return committed;

  const isPreview = turnId === 'preview';
  let receiptId = mutsumiBalanceReceiptId(turnId);
  if (isPreview) {
    let seq = committed.protagonists?.strategy?.history.length ?? 0;
    const cursor = committed.protagonists?.strategy?.cursor ?? 0;
    while (committed.protagonists?.strategy?.history.some(row => row.id === `bop:p:${cursor}:${seq}`)) seq++;
    receiptId = `bop:p:${cursor}:${seq}`;
  }
  const signature = `bop:${hash(JSON.stringify({ delta: action.delta, reason: action.reason }))}`;
  if (!isPreview) {
    const priorReceipt =
      before.protagonists?.strategy?.receipts.find(row => row.id === receiptId) ??
      committed.protagonists?.strategy?.receipts.find(row => row.id === receiptId);
    if (priorReceipt) {
      if (priorReceipt.command !== signature) {
        throw new Error('相同剧情 ID 的心境天平变化不一致，禁止重复结算');
      }
      return committed;
    }
    if (replayTurnId) {
      throw new Error('重复剧情 ID 不得新增原先没有的心境天平效果');
    }
  }

  if (!committed.protagonists?.strategy) {
    throw new Error('国策存档未初始化，无法结算若叶睦心境天平');
  }

  const nextStrategy: StrategyState = structuredClone(committed.protagonists.strategy);
  const prev = mutsumiBalanceValue(nextStrategy);
  const nextValue = clampMutsumiBalance(prev + action.delta);
  nextStrategy.people[MUTSUMI_OWNER_ID].balance = nextValue;
  const signedDelta = action.delta > 0 ? `+${action.delta}` : String(action.delta);
  const auditNote = `${action.reason}（${signedDelta} → ${nextValue}）`.slice(0, 180);
  appendStrategyBalanceAudit(nextStrategy, receiptId, auditNote);
  if (!isPreview) {
    nextStrategy.receipts.push({ id: receiptId, command: signature });
    nextStrategy.receipts = nextStrategy.receipts.slice(-160);
  }
  const settled = settleStrategyState(nextStrategy, nextStrategy.cursor);
  const validated = parseStrategyState(settled, settled.cursor);

  return {
    ...committed,
    protagonists: {
      ...committed.protagonists,
      revision: committed.protagonists.revision + 1,
      strategy: validated,
    },
  };
}
