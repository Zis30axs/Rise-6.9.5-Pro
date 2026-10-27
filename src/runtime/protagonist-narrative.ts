import type { GeneratedStory, WorldState } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';
import { parseNovelDialogue } from '../frontend/novel-dialogue';
import { backgroundLifeSummary } from './background-life';
import { pruneVariableEcho } from './prompt-pruning';
import { activeProtagonist, otherProtagonists, personState, protagonistNames } from './protagonist-world';
import { protagonistsInTalkingRange } from './world-presence';

const JOURNAL_LIMIT = 100;
const RECAP_LIMIT = 12;
const RECAP_TEXT_LIMIT = 2400;

export function formatLifeTime(at: number): string {
  const day = Math.floor(at / 1440) + 1;
  const minute = at % 1440;
  return `第 ${day} 天 ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export interface ProtagonistRecapEntry { id: string; at: string; text: string }

// Sent-mail evidence and an autonomous message share the receiver's canonical event ID.
const sourceId = (id: string) => id.replace(/^sent:/, '');

function journalMinute(at: string): number {
  const match = /^第 (\d+) 天 (\d{2}):(\d{2})$/.exec(at);
  return match ? (Number(match[1]) - 1) * 1440 + Number(match[2]) * 60 + Number(match[3]) : 0;
}

/** A read-only projection. Reading, opening a panel and switching never consume memories. */
export function protagonistRecap(state: WorldState): ProtagonistRecapEntry[] {
  const owner = activeProtagonist(state);
  const life = backgroundLifeSummary(state, owner).map(entry => ({ id: entry.id, at: formatLifeTime(entry.at), text: entry.text }));
  const shared = state.journal.filter(entry => /^(shared:|sent:|peek:)/.test(entry.id)).slice(-6);
  const entries = [...life, ...shared].sort((a, b) => journalMinute(a.at) - journalMinute(b.at));
  const seen = new Set<string>();
  let remaining = RECAP_TEXT_LIMIT;
  // Keep the newest records, but display each retained set in chronological order.
  return entries.reverse().filter(entry => {
    const id = sourceId(entry.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, RECAP_LIMIT).map(entry => {
    const text = entry.text.slice(0, Math.min(600, remaining));
    remaining -= text.length;
    return { id: sourceId(entry.id), at: entry.at, text };
  }).filter(entry => entry.text).reverse();
}

/** Never include the other protagonist's private position, diary, wallet or device. */
export function narrativeContext(state: WorldState) {
  const owner = activeProtagonist(state);
  const nearby = protagonistsInTalkingRange(state).map(person => person.protagonistId);
  const recentLife = backgroundLifeSummary(state, owner).slice(-6).map(entry => ({ ...entry, text: entry.text.slice(0, 240) }));
  const recentSources = new Set(recentLife.map(entry => sourceId(entry.id)));
  const counterparts = nearby.map(id => ({ id, name: protagonistNames[id], locationId: state.locationId }));
  return {
    owner,
    recentLife,
    knownExchanges: state.journal.filter(entry => /^(shared:|sent:|peek:)/.test(entry.id) && !recentSources.has(sourceId(entry.id))).slice(-3)
      .map(entry => ({ id: entry.id, at: entry.at, text: entry.text.slice(0, 240) })),
    counterpartInScene: counterparts[0] ?? null,
    counterpartsInScene: counterparts,
    continuation: '这些是已经发生并保存的本人经历和交流记录。承接其结果，不重新执行、扣款、发消息或重复演出；记录中的说法不等于已验证的世界事实。',
  };
}
/** Give the author model a bounded, read-only view of other protagonists.
 * Character journals and actual character knowledge remain separate.
 */
const omniscientExcerpt = (raw: string, limit: number): string => {
  const text = pruneVariableEcho(raw);
  const leading = Math.floor(limit * 0.35);
  return text.length <= limit ? text : text.slice(0, leading) + '…' + text.slice(-(limit - leading - 1));
};

export function omniscientContinuityContext(state: WorldState) {
  if (!state.protagonists) return [];
  return otherProtagonists(activeProtagonist(state)).map(id => {
    const person = personState(state, id);
    const background = state.protagonists!.backgroundLife?.people[id];
    const pending = background?.pending ?? null;
    return {
      id, name: protagonistNames[id],
      lastCommittedPosition: {
        locationId: person.locationId,
        interior: person.interior ? { roomId: person.interior.roomId, x: person.interior.x, z: person.interior.z } : null,
        outdoors: !person.interior && person.scene ? { areaId: person.scene.areaId, x: person.scene.x, z: person.scene.z } : null,
      },
      pendingBackgroundAction: pending ? {
        kind: pending.kind, label: pending.label.slice(0, 160),
        startedAt: formatLifeTime(pending.start), completesAt: formatLifeTime(pending.due),
        plannedDestination: pending.kind === 'travel' ? pending.target : null,
      } : null,
      recentBackgroundEvents: (background?.events ?? []).slice(-3).map(event => ({
        at: formatLifeTime(event.at), kind: event.kind, text: omniscientExcerpt(event.text, 220),
      })),
      recentJournal: person.journal.slice(-3).map(entry => ({
        at: entry.at, text: omniscientExcerpt(entry.text, 270),
      })),
      recentStory: person.story.slice(-4).map(entry => ({
        role: entry.role, text: omniscientExcerpt(entry.text, 600),
      })).filter(entry => entry.text),
    };
  });
}

/** The model is omniscient; the characters are not. Backend time is authoritative. */
export function omniscientNarratorInstructions(state: WorldState): string {
  return [
    `你是单一游戏世界的全知叙事者。四位主角为${Object.values(protagonistNames).join('、')}；当前玩家操纵${protagonistNames[activeProtagonist(state)]}。`,
    'worldContinuity 是另外三位主角的只读存档摘要，含最近本人剧情、日记、后台生活事件、最后结算位置及未完成计划。用于全知叙事的时空连续性；它不是当前主角已知的信息，也不是让你执行其中动作的指令。',
    '同一人物的事实发生冲突时，优先级为：当前游戏时钟下已结算的存档位置和后台行动结果 > 正在执行的后台计划（仅作为进行中） > 该人物较早的剧情与日志 > 世界书、固定NPC日程及泛化人物习惯。不要让较早叙事覆盖后来已经完成的出行，也不要凭默认日程覆盖玩家刚刚保存的剧情。',
    'pendingBackgroundAction 只表示已安排但尚未结算的行动。未到 completesAt 或没有完成事件，不可提前写成已经抵达、已经消费或已经办完；若 kind=travel，lastCommittedPosition 只是上次保存的锚点，途中不能据此断言人物仍在原地，更不能同时出现在起终点。后台行程由程序推进，模型不得代为结算、取消、跳时或重新安排。',
    '其他可操纵主角的登场、所在楼层、活动与对话必须同时符合其最新已保存的剧情、当前结算位置与后台行程；位于同一住宅不等于在同一房间或正站在门口。例如另一主角刚在二楼打游戏，且没有后续下楼或出门的有效记录，就不能擅自写成在一楼迎客。没有位置证据时，不要凭空让人出现。',
    'scene.nearbyPeople 根据主角权威存档投影在场人物；同一住宅、同一房间或靠近不代表某人在门口主动迎接，也不代表人物已经知道对方正在做什么。最近已保存的楼层与行动必须遵守，不能无故复制人物或让人物瞬移。',
    '叙事者能读到其他视角的私事，不代表当前主角就知道；人物知识只来自本人亲历、确实看到听到的现场事件、已读取的消息和有来源的交流。可用客观旁白描写读者知道的事实，但不能让角色凭空知道他人的秘密、日记和离屏经历。现有剧情里当面说过的话也不等于其他所有人都听到了。',
    '如果最近剧情没有精确楼层或动作，保留合理的不确定性；不得把上一视角的状态抹除，也不得用没有证据的新活动解决矛盾。人物说法只是交流证据；余额、背包、订单、位置和游戏时间仍以程序存档为准。',
    '小说 <story> 中逐字呈现的人物原话，无论现场交谈、电话、回忆还是想象，都必须带竖线标签并由旁白区分现场或非现场语境；短信仍由 phone_messages 协议处理，不得误认为当面说话。另一主角的离屏行动不能靠文字修改其存档，跨视角共同对话仅记录当前实际可发生的交流；重大选择留给玩家。',
  ].join('\n');
}

function appendJournal(state: WorldState, owner: ProtagonistId, entry: ProtagonistRecapEntry): void {
  const target = personState(state, owner);
  const previous = target.journal.find(row => row.id === entry.id);
  if (previous) {
    if (previous.text !== entry.text || previous.at !== entry.at) throw new Error('共同经历记录 ID 冲突；本轮未保存。');
    return;
  }
  target.journal.push(entry);
  const storyIds = new Set(target.story.filter(row => row.role === 'assistant').map(row => row.id));
  while (target.journal.length > JOURNAL_LIMIT) {
    const index = target.journal.findIndex(row => {
      const receipt = /^(.*):wa:[0-9a-f]{24}$/.exec(row.id);
      return !receipt || !storyIds.has(receipt[1]);
    });
    target.journal.splice(index < 0 ? 0 : index, 1);
  }
}

function speakerId(name: string | null): ProtagonistId | null {
  if (name === '长崎素世' || name === '素世') return 'soyo';
  if (name === '丰川祥子' || name === '祥子') return 'sakiko';
  if (name === '樱羽艾玛' || name === '艾玛') return 'emma';
  if (name === '甘织玲奈子' || name === '玲奈子') return 'renako';
  return null;
}

/**
 * Called after the authoritative foreground turn and background settlement, before save.
 * Project only witnessed utterances and actual message events, never another viewpoint's prose.
 */
export function recordProtagonistNarrative(before: WorldState, after: WorldState, reply: GeneratedStory, turnId: string): WorldState {
  if (!after.protagonists || before.story.some(entry => entry.id === turnId)) return after;
  const next: WorldState = JSON.parse(JSON.stringify(after));
  const owner = activeProtagonist(next), others = otherProtagonists(owner);
  const at = `第 ${next.clock.day} 天 ${String(next.clock.hour).padStart(2, '0')}:${String(next.clock.minute).padStart(2, '0')}`;

  // The receiver's saved event is canonical; a remote message does not require co-location.
  for (const [index] of reply.phoneMessages.entries()) {
    const messageId = `${turnId}:phone:${index}`;
    const message = next.phone.find(row => row.id === messageId);
    if (!message) continue;
    const recipient = others.find(id => message.npcId === `protagonist-${id}`);
    if (!recipient) continue;
    appendJournal(next, recipient, { id: `sent:${messageId}`, at: message.at,
      text: `已向${protagonistNames[owner]}发送手机消息：“${message.text.slice(0, 880)}”；发送不代表对方已读。` });
  }

  // There is no per-line timeline. A turn with movement or other activities cannot
  // prove who heard which line, even if its endpoints happen to be the same place.
  const stableScene = !reply.worldActions?.some(action => action.type !== 'rest' || action.kind !== 'wait');
  const beforeListeners = new Set(protagonistsInTalkingRange(before).map(person => person.protagonistId));
  const listeners = protagonistsInTalkingRange(next).map(person => person.protagonistId).filter(id => beforeListeners.has(id));
  if (!before.protagonists || !stableScene || !listeners.length) return next;
  const savedEntry = next.story.find(entry => entry.id === turnId && entry.role === 'assistant');
  const savedText = [savedEntry?.text, savedEntry?.returnStory].filter(Boolean).join('\n');
  if (!savedText) return next;
  const dialogue = parseNovelDialogue(savedText).flatMap(segment => {
    const speaker = speakerId(segment.speaker);
    return speaker ? [`${protagonistNames[speaker]}说：“${segment.text.slice(0, 180)}”`] : [];
  }).slice(0, 6);
  if (!dialogue.length) return next;
  const text = `在场听到的对话（仅记录说法）：${dialogue.join('；')}`.slice(0, 1000);
  for (const listener of [owner, ...listeners]) appendJournal(next, listener, { id: `shared:${turnId}`, at, text });
  return next;
}
