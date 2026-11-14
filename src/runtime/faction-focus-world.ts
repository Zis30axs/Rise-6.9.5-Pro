import type { WorldState } from '../frontend/types';
import {
  MUTSUMI_OWNER_ID,
  appendStrategyBalanceAudit,
  clampMutsumiBalance,
  mutsumiBalanceValue,
} from './strategy';
import { activeProtagonist, gameMinute } from './protagonist-world';
import { resolveNpcTraits } from './npc-traits';
import { worldSceneRoster } from './world-presence';
import {
  applyFactionFocusCommand,
  canStartFactionFocus,
  createFactionFocusState,
  defaultFactionEntryState,
  describeFactionCondition,
  discoverAvailableFactions,
  factionFocusCatalogForTemplate,
  factionFocusRateBreakdown,
  factionPersonId,
  factionSpiritById,
  isFactionFocusBranchLocked,
  parseFactionFocusState,
  settleFactionFocusState,
  type FactionEntryState,
  type FactionFocusCommand,
  type FactionFocusDefinition,
  type FactionProfile,
  type FactionRateBreakdown,
  type FactionRuntimeMeta,
  type FactionSpiritDefinition,
} from './faction-focus';

const SEAT_TARGET_MATCH = {
  music: ['practice_skill_rate'],
  social: ['social_xp_rate'],
  operations: ['focus_progress_rate', 'decision_energy_cost'],
} as const;

function advisorSynergyBonusForProfile(world: WorldState, profile: FactionProfile): number {
  let bonus = 0;
  for (const advisor of profile.advisors) {
    const contact = world.contacts?.find(
      row => row.sourcePersonId === advisor.personId || row.id === advisor.personId,
    );
    const traits = resolveNpcTraits({
      id: contact?.id ?? advisor.personId,
      personId: advisor.personId,
      sourcePersonId: contact?.sourcePersonId ?? advisor.personId,
      name: contact?.name ?? advisor.name,
      tag: contact?.tag,
      summary: contact?.summary,
      status: contact?.status,
    });
    if (!traits.length) continue;
    const preferredTargets = SEAT_TARGET_MATCH[advisor.seat];
    const hasExactSynergy = traits.some(tr =>
      tr.modifiers.some(mod => (preferredTargets as readonly string[]).includes(mod.target)),
    );
    bonus += hasExactSynergy ? 0.1 : 0.05;
  }
  return Math.round(bonus * 100) / 100;
}

export function buildFactionRuntimeMetas(world: WorldState): FactionRuntimeMeta[] {
  const profiles = discoverAvailableFactions(world);
  const strategy = world.protagonists?.strategy;
  return profiles.map(profile => ({
    profile,
    advisorTraitBonus: advisorSynergyBonusForProfile(world, profile),
    strategy,
  }));
}

/** UI-originated faction focus commands never advance the authoritative clock. */
export function commitFactionFocusCommand(
  world: WorldState,
  requestId: string,
  command: FactionFocusCommand,
): WorldState {
  if (!world.protagonists) throw new Error('阵营国策需要已启用的四主角世界');
  const next: WorldState = structuredClone(world);
  const at = gameMinute(next);
  const actor = activeProtagonist(next);
  const metas = buildFactionRuntimeMetas(next);
  const metaMap = new Map(metas.map(meta => [meta.profile.id, meta] as const));
  const targetMeta = metaMap.get(command.factionId);
  if (!targetMeta) throw new Error('找不到指定的阵营');
  if (!targetMeta.profile.controllableBy.includes(actor)) {
    throw new Error(`当前视角无权调整「${targetMeta.profile.title}」的阵营国策`);
  }

  const savedRaw = next.protagonists!.factionFocuses ?? createFactionFocusState(at);
  const saved = savedRaw.cursor < at ? settleFactionFocusState(savedRaw, at, metas).state : savedRaw;
  const updated = applyFactionFocusCommand(saved, command, requestId, metaMap);
  if (updated === saved) return world;
  next.protagonists!.factionFocuses = parseFactionFocusState(updated, at);
  next.protagonists!.revision++;
  return next;
}

/** Settle all active Faction Focus trees on the authoritative game clock inside finishPersonalChange. */
export function settleFactionFocusWorld(before: WorldState, after: WorldState): void {
  if (!after.protagonists) return;
  const start = gameMinute(before);
  const end = gameMinute(after);
  if (end < start) throw new Error('阵营国策时钟不能倒退');
  const saved = after.protagonists.factionFocuses ?? createFactionFocusState(start);
  if (saved.cursor > start) throw new Error('阵营国策时钟超越了权威时间');

  const metas = buildFactionRuntimeMetas(after);
  const { state: settled, completed } = settleFactionFocusState(saved, end, metas);
  after.protagonists.factionFocuses = settled;

  const strategy = after.protagonists.strategy;
  if (strategy && completed.length > 0) {
    const mutsumi = strategy.people[MUTSUMI_OWNER_ID];
    for (const ev of completed) {
      if (mutsumi && typeof ev.shiftMutsumiBalance === 'number' && ev.shiftMutsumiBalance !== 0) {
        mutsumi.balance = clampMutsumiBalance(
          mutsumiBalanceValue(strategy) + ev.shiftMutsumiBalance,
        );
        const signed = ev.shiftMutsumiBalance >= 0 ? `+${ev.shiftMutsumiBalance}` : `${ev.shiftMutsumiBalance}`;
        appendStrategyBalanceAudit(
          strategy,
          `ffb:${ev.factionId}:${ev.focusId}:${ev.at}`,
          `阵营国策「${ev.title}」完成，影响若叶睦心理天平（${signed}）`,
        );
      }
    }
  }
}

export type FactionPromptReason =
  | 'manual_prompt_opt_in'
  | 'scene_member_present'
  | 'explicit_mention'
  | 'livehouse_booking_day';

export interface FactionPromptSnapshotItem {
  id: string;
  title: string;
  subtitle: string;
  reasons: FactionPromptReason[];
  activeFocus: {
    id: string;
    title: string;
    progressPercent: number;
    description: string;
  } | null;
  spirits: { title: string; summary: string }[];
  advisors: string[];
}

export interface FactionPromptContext {
  factions: FactionPromptSnapshotItem[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inputMentionsFaction(input: string, profile: FactionProfile): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (profile.template === 'mygo' && /mygo/i.test(trimmed)) return true;
  if (profile.template === 'ave_mujica' && /ave\s*mujica|mujica/i.test(trimmed)) return true;
  if (profile.title.length >= 2) {
    const re = new RegExp(escapeRegExp(profile.title), 'i');
    if (re.test(trimmed)) return true;
  }
  return false;
}

/**
 * Authorize faction focus context ONLY when relevant to the turn (opt-in toggle,
 * co-located non-self faction members in scene range, explicit user mention, or
 * a same-day Livehouse booking). Returns null on unrelated everyday turns.
 */
export function factionFocusPromptContext(
  world: WorldState,
  userInput: string,
  kind?: string,
): FactionPromptContext | null {
  if (!world.protagonists?.factionFocuses || kind === 'contact_introduction') return null;

  const owner = activeProtagonist(world);
  const selfPersonId = factionPersonId(owner);
  const factionState = world.protagonists.factionFocuses;
  const profiles = discoverAvailableFactions(world);
  const roster = worldSceneRoster(world);
  const nearbyMemberIds = new Set(
    roster
      .filter(row => row.canTalk)
      .map(row => row.person.id),
  );
  const dayStart = (world.clock.day - 1) * 1440;
  const dayEnd = dayStart + 1440;
  const todayBandIds = new Set(
    (world.livehouse?.bookings ?? [])
      .filter(b => b.start >= dayStart && b.start < dayEnd)
      .map(b => b.bandId),
  );

  const triggered: { score: number; item: FactionPromptSnapshotItem }[] = [];

  for (const profile of profiles) {
    const entry = factionState.factions[profile.id];
    if (!entry) continue;
    const hasPayload = !!entry.active || entry.spirits.length > 0;
    if (!hasPayload) continue;

    const reasons: FactionPromptReason[] = [];
    let score = 0;

    if (entry.includeInPrompt) {
      reasons.push('manual_prompt_opt_in');
      score += 1;
    }
    const otherMemberNearby = profile.memberIds.some(
      id => id !== selfPersonId && nearbyMemberIds.has(id),
    );
    if (otherMemberNearby) {
      reasons.push('scene_member_present');
      score += 4;
    }
    if (inputMentionsFaction(userInput, profile)) {
      reasons.push('explicit_mention');
      score += 5;
    }
    if (profile.bandId && todayBandIds.has(profile.bandId)) {
      reasons.push('livehouse_booking_day');
      score += 3;
    }

    if (reasons.length === 0) continue;

    const catalog = factionFocusCatalogForTemplate(entry.template);
    const activeDef = entry.active ? catalog.find(f => f.id === entry.active!.id) ?? null : null;
    const spirits = entry.spirits
      .map(sp => factionSpiritById(sp.id))
      .filter((sp): sp is FactionSpiritDefinition => sp !== null)
      .map(sp => ({ title: sp.title, summary: sp.summary }));

    triggered.push({
      score: score + (profile.controllableBy.includes(owner) ? 2 : 0),
      item: {
        id: profile.id,
        title: profile.title,
        subtitle: profile.subtitle,
        reasons,
        activeFocus: entry.active && activeDef
          ? {
            id: activeDef.id,
            title: activeDef.title,
            progressPercent: Math.min(100, Math.round((entry.active.progress / activeDef.durationMinutes) * 100)),
            description: activeDef.description,
          }
          : null,
        spirits,
        advisors: profile.advisors.map(a => a.name),
      },
    });
  }

  if (!triggered.length) return null;
  triggered.sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));
  return { factions: triggered.slice(0, 2).map(row => row.item) };
}

export function factionFocusPromptInstruction(context: FactionPromptContext | null): string {
  if (!context || context.factions.length === 0) return '';
  return [
    '仅在本轮已触发的阵营上下文中参考 `summary.factionFocus`：',
    '- activeFocus 代表该阵营成员近期正在推进的共同方向或磨合课题，只能作为对话氛围、动机或计划背景来描写，不可把尚未完成（progressPercent < 100）的计划提前写成既成事实；',
    '- spirits 代表该阵营已经达成的集体共识与默契气质，请在同场成员协作、练琴或交流时自然体现；',
    '- 严禁将未在场人物的私人动向剧透给当前视角不知道的角色，也禁止在正文或对白中出现“阵营国策”“加成”“百分比”“系统提示”等游戏术语。',
  ].join('\n');
}

export type FactionNodeStatus = 'completed' | 'active' | 'available' | 'branch_locked' | 'locked';

export interface FactionNodeView {
  definition: FactionFocusDefinition;
  status: FactionNodeStatus;
  progress: number;
  progressPercent: number;
  prerequisiteText: string;
  availableText: string;
  spiritDefinitions: FactionSpiritDefinition[];
}

export interface FactionViewModel {
  profile: FactionProfile;
  entry: FactionEntryState;
  canManage: boolean;
  rateBreakdown: FactionRateBreakdown;
  spirits: FactionSpiritDefinition[];
  nodes: FactionNodeView[];
}

/** Build structured view data for SocietyPanel / FactionFocusSection without duplicating conditions in Vue. */
export function buildFactionViews(world: WorldState): FactionViewModel[] {
  const actor = activeProtagonist(world);
  const factionState = world.protagonists?.factionFocuses;
  const metas = buildFactionRuntimeMetas(world);

  return metas.map(meta => {
    const { profile } = meta;
    const savedEntry = factionState?.factions[profile.id];
    const entry = savedEntry && savedEntry.template === profile.template
      ? savedEntry
      : defaultFactionEntryState(profile.id, profile.template, profile.defaultController);
    const rateBreakdown = factionFocusRateBreakdown(entry, meta);
    const catalog = factionFocusCatalogForTemplate(profile.template);

    const nodes: FactionNodeView[] = catalog.map(def => {
      const isCompleted = entry.completed.includes(def.id);
      const isActive = entry.active?.id === def.id;
      const isBranchLocked = !isCompleted && !isActive && isFactionFocusBranchLocked(entry, def);
      const canStart = !isCompleted && !isActive && !isBranchLocked && canStartFactionFocus(entry, def, meta);
      const status: FactionNodeStatus = isCompleted
        ? 'completed'
        : isActive
          ? 'active'
          : isBranchLocked
            ? 'branch_locked'
            : canStart
              ? 'available'
              : 'locked';
      const progress = isActive ? entry.active!.progress : isCompleted ? def.durationMinutes : 0;
      const progressPercent = isCompleted
        ? 100
        : isActive
          ? Math.min(100, Math.round((progress / def.durationMinutes) * 100))
          : 0;
      return {
        definition: def,
        status,
        progress,
        progressPercent,
        prerequisiteText: def.prerequisites ? describeFactionCondition(def.prerequisites) : '起点国策',
        availableText: def.available ? describeFactionCondition(def.available) : '',
        spiritDefinitions: (def.grantsSpirits ?? [])
          .map(id => factionSpiritById(id))
          .filter((s): s is FactionSpiritDefinition => s !== null),
      };
    });

    const spirits = entry.spirits
      .map(s => factionSpiritById(s.id))
      .filter((s): s is FactionSpiritDefinition => s !== null);

    return {
      profile,
      entry,
      canManage: profile.controllableBy.includes(actor),
      rateBreakdown,
      spirits,
      nodes,
    };
  });
}
