import type { GeneratedStory, WorldState } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';
import { parseNovelDialogue } from '../frontend/novel-dialogue';
import { backgroundLifeSummary } from './background-life';
import { activeProtagonist, otherProtagonist, personState, protagonistNames, protagonistsNearby } from './protagonist-world';

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
  const other = otherProtagonist(owner);
  const nearby = !!state.protagonists && protagonistsNearby(state);
  const recentLife = backgroundLifeSummary(state, owner).slice(-6).map(entry => ({ ...entry, text: entry.text.slice(0, 240) }));
  const recentSources = new Set(recentLife.map(entry => sourceId(entry.id)));
  return {
    owner,
    recentLife,
    knownExchanges: state.journal.filter(entry => /^(shared:|sent:|peek:)/.test(entry.id) && !recentSources.has(sourceId(entry.id))).slice(-3)
      .map(entry => ({ id: entry.id, at: entry.at, text: entry.text.slice(0, 240) })),
    counterpartInScene: nearby ? { id: other, name: protagonistNames[other], locationId: state.locationId } : null,
    continuation: '这些是已经发生并保存的本人经历和交流记录。承接其结果，不重新执行、扣款、发消息或重复演出；记录中的说法不等于已验证的世界事实。',
  };
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
  return null;
}

/**
 * Called after the authoritative foreground turn and background settlement, before save.
 * Project only witnessed utterances and actual message events, never another viewpoint's prose.
 */
export function recordProtagonistNarrative(before: WorldState, after: WorldState, reply: GeneratedStory, turnId: string): WorldState {
  if (!after.protagonists || before.story.some(entry => entry.id === turnId)) return after;
  const next: WorldState = JSON.parse(JSON.stringify(after));
  const owner = activeProtagonist(next), other = otherProtagonist(owner);
  const at = `第 ${next.clock.day} 天 ${String(next.clock.hour).padStart(2, '0')}:${String(next.clock.minute).padStart(2, '0')}`;

  // The receiver's saved event is canonical; a remote message does not require co-location.
  for (const [index] of reply.phoneMessages.entries()) {
    const messageId = `${turnId}:phone:${index}`;
    const message = next.phone.find(row => row.id === messageId && row.npcId === `protagonist-${other}`);
    if (!message) continue;
    appendJournal(next, other, { id: `sent:${messageId}`, at: message.at,
      text: `已向${protagonistNames[owner]}发送手机消息：“${message.text.slice(0, 880)}”；发送不代表对方已读。` });
  }

  // There is no per-line timeline. A turn with movement or other activities cannot
  // prove who heard which line, even if its endpoints happen to be the same place.
  const stableScene = !reply.worldActions?.some(action => action.type !== 'rest' || action.kind !== 'wait');
  if (!before.protagonists || !stableScene || !protagonistsNearby(before) || !protagonistsNearby(next)) return next;
  const savedText = next.story.find(entry => entry.id === turnId && entry.role === 'assistant')?.text;
  if (!savedText) return next;
  const dialogue = parseNovelDialogue(savedText).flatMap(segment => {
    const speaker = speakerId(segment.speaker);
    return speaker ? [`${protagonistNames[speaker]}说：“${segment.text.slice(0, 180)}”`] : [];
  }).slice(0, 6);
  if (!dialogue.length) return next;
  const text = `在场听到的对话（仅记录说法）：${dialogue.join('；')}`.slice(0, 1000);
  for (const listener of [owner, other]) appendJournal(next, listener, { id: `shared:${turnId}`, at, text });
  return next;
}
