import type { WorldState } from '../frontend/types';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import { pruneVariableEcho } from './prompt-pruning';

/**
 * One omniscient world-level archive. Evidence identifies who experienced each
 * event, but summaries are authored by the existing story LLM for BOTH people.
 * The archive is never authoritative for balances, locations, decisions or
 * material that an individual protagonist has actually learned.
 */
export interface WeeklyEvidence { id: string; owner: ProtagonistId; at: number; text: string }
export interface ClosedWeek {
  week: number;
  /** Kept until the story LLM summarizes this week; then compacted away. */
  evidence: WeeklyEvidence[];
  summary: string | null;
  sources: string[];
}
export interface WeeklyMemory {
  version: 1;
  startedAt: number;
  openWeek: number;
  entries: WeeklyEvidence[];
  closed: ClosedWeek[];
}

const WEEK_MINUTES = 7 * 1440;
const OPEN_LIMIT = 56;
const DAILY_LIMIT = 8;
const CLOSED_LIMIT = 12;
const CLOSED_EVIDENCE_LIMIT = 28;
const SUMMARY_LIMIT = 1800;
const EVENT_TEXT_LIMIT = 180;
const weekAt = (at: number) => Math.floor(at / WEEK_MINUTES) + 1;
const dayAt = (at: number) => Math.floor(at / 1440) + 1;
const nowMinute = (clock: WorldState['clock']) => (clock.day - 1) * 1440 + clock.hour * 60 + clock.minute;
const idPattern = /^[A-Za-z0-9][\w:.-]{0,127}$/;
const sourcePattern = /^(?:soyo|sakiko|emma):[A-Za-z0-9][\w:.-]{0,127}$/;
const timePattern = /^第 (\d+) 天 (\d{2}):(\d{2})$/;

export function createWeeklyMemory(at: number): WeeklyMemory {
  return { version: 1, startedAt: at, openWeek: weekAt(at), entries: [], closed: [] };
}
function error(): never { throw new Error('双主角状态：七日记忆无效，原存档已保留。'); }
function object(x: unknown, keys: string[]): Record<string, unknown> {
  if (!x || typeof x !== 'object' || Array.isArray(x)
    || Object.keys(x).length !== keys.length || Object.keys(x).some(k => !keys.includes(k))) return error();
  return x as Record<string, unknown>;
}
function int(x: unknown, min: number, max: number): number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= min && x <= max ? x : error();
}
function safeText(x: unknown, max: number): string {
  return typeof x === 'string' && !!x.trim() && x.length <= max && !/[\u0000-\u001f]/.test(x) ? x : error();
}
function identity(x: unknown): string { return typeof x === 'string' && idPattern.test(x) ? x : error(); }
function ownerId(x: unknown): ProtagonistId { return PROTAGONISTS.includes(x as ProtagonistId) ? x as ProtagonistId : error(); }
function list<T>(x: unknown, max: number, parse: (item: unknown) => T): T[] {
  return Array.isArray(x) && x.length <= max ? x.map(parse) : error();
}
const key = (e: WeeklyEvidence) => e.owner + ':' + e.id;
function evidenceList(raw: unknown, max: number, start: number, end: number, week: number): WeeklyEvidence[] {
  const entries = list(raw, max, rawEntry => {
    const e = object(rawEntry, ['id', 'owner', 'at', 'text']);
    const at = int(e.at, start, end);
    if (weekAt(at) !== week) return error();
    return { id: identity(e.id), owner: ownerId(e.owner), at, text: safeText(e.text, EVENT_TEXT_LIMIT) };
  });
  if (new Set(entries.map(key)).size !== entries.length) return error();
  return entries;
}

/** Legacy 1.12 saves lacking the optional memory block initialize at now. */
export function parseWeeklyMemory(raw: unknown, clock: WorldState['clock']): WeeklyMemory {
  const row = object(raw, ['version', 'startedAt', 'openWeek', 'entries', 'closed']);
  if (row.version !== 1) return error();
  const now = nowMinute(clock);
  const startedAt = int(row.startedAt, 0, now);
  const openWeek = int(row.openWeek, weekAt(startedAt), weekAt(now));
  const entries = evidenceList(row.entries, OPEN_LIMIT, startedAt, now, openWeek);
  const closed = list(row.closed, CLOSED_LIMIT, rawWeek => {
    const w = object(rawWeek, ['week', 'evidence', 'summary', 'sources']);
    const week = int(w.week, weekAt(startedAt), openWeek - 1);
    const evidence = evidenceList(w.evidence, CLOSED_EVIDENCE_LIMIT, startedAt, now, week);
    const sources = list(w.sources, CLOSED_EVIDENCE_LIMIT, source =>
      typeof source === 'string' && sourcePattern.test(source) ? source : error());
    if (new Set(sources).size !== sources.length) return error();
    const summary = w.summary === null ? null : safeText(w.summary, SUMMARY_LIMIT);
    if ((summary === null && (!evidence.length || !sources.length))
      || (summary !== null && evidence.length !== 0)) return error();
    if (summary === null && sources.join('|') !== evidence.map(key).join('|')) return error();
    return { week, evidence, summary, sources };
  });
  if (new Set(closed.map(w => w.week)).size !== closed.length
    || closed.some((w, i) => i > 0 && closed[i - 1].week >= w.week)) return error();
  return { version: 1, startedAt, openWeek, entries, closed };
}

/** Formatting cleanup only: never infer facts or modify the original source. */
export function evidenceText(source: string): string {
  return pruneVariableEcho(source)
    .replace(/\|([^|\n]{1,40})\|([^|\n]{1,20})\|([^|\n]{1,300})\|/g, '$1说：“$3”')
    .replace(/[\r\n\t ]+/g, ' ').trim();
}
function importance(entry: WeeklyEvidence): number {
  if (/和解|决裂|告白|家庭|重大决定|毕业|退学|答应|拒绝/.test(entry.text)) return 6;
  if (/^(shared:|sent:|peek:)/.test(entry.id)) return 5;
  if (/^story:/.test(entry.id)) return 4;
  if (/:(decision|message|order|travel|study)(?::|$)/.test(entry.id)) return 3;
  return 1;
}
function evictLowest(rows: WeeklyEvidence[]): void {
  if (!rows.length) return;
  let at = 0;
  for (let i = 1; i < rows.length; i++) {
    if (importance(rows[i]) < importance(rows[at])
      || (importance(rows[i]) === importance(rows[at]) && rows[i].at < rows[at].at)) at = i;
  }
  rows.splice(at, 1);
}
function close(memory: WeeklyMemory): void {
  if (!memory.entries.length) return;
  const group = new Map<number, WeeklyEvidence[]>();
  for (const e of memory.entries) group.set(dayAt(e.at), [...(group.get(dayAt(e.at)) ?? []), e]);
  const selected: WeeklyEvidence[] = [];
  for (const day of group.values()) {
    for (const owner of PROTAGONISTS) {
      const chosen = day.filter(e => e.owner === owner).sort((a, b) => importance(b) - importance(a) || b.at - a.at)[0];
      if (chosen) selected.push(chosen);
    }
  }
  const seen = new Set(selected.map(key));
  for (const e of [...memory.entries].sort((a, b) => importance(b) - importance(a) || b.at - a.at)) {
    if (selected.length >= CLOSED_EVIDENCE_LIMIT) break;
    if (!seen.has(key(e))) { selected.push(e); seen.add(key(e)); }
  }
  selected.sort((a, b) => a.at - b.at || a.owner.localeCompare(b.owner) || a.id.localeCompare(b.id));
  memory.closed.push({ week: memory.openWeek, evidence: selected, summary: null, sources: selected.map(key) });
  memory.closed = memory.closed.slice(-CLOSED_LIMIT);
}
function advance(memory: WeeklyMemory, targetWeek: number): void {
  if (targetWeek <= memory.openWeek) return;
  close(memory);
  memory.openWeek = targetWeek;
  memory.entries = [];
}

/** Records are accumulated inside the same candidate save as the story/phone. */
export function recordWeeklyEvidence(state: WorldState, owner: ProtagonistId, event: Omit<WeeklyEvidence, 'owner'>): void {
  if (!state.protagonists || !Number.isSafeInteger(event.at)) return;
  const memory = state.protagonists.weeklyMemory ??= createWeeklyMemory(nowMinute(state.clock));
  if (event.at < memory.startedAt || event.at > nowMinute(state.clock) || !idPattern.test(event.id)) return;
  const targetWeek = weekAt(event.at);
  if (targetWeek < memory.openWeek) return;
  advance(memory, targetWeek);
  if (memory.entries.some(e => e.id === event.id && e.owner === owner)) return;
  const content = evidenceText(event.text).slice(0, EVENT_TEXT_LIMIT);
  if (!content) return;
  memory.entries.push({ owner, id: event.id, at: event.at, text: content });
  const day = dayAt(event.at);
  const today = memory.entries.filter(e => dayAt(e.at) === day);
  if (today.length > DAILY_LIMIT) {
    const trimmed = [...today];
    evictLowest(trimmed);
    const keep = new Set(trimmed.map(key));
    memory.entries = memory.entries.filter(e => dayAt(e.at) !== day || keep.has(key(e)));
  }
  while (memory.entries.length > OPEN_LIMIT) evictLowest(memory.entries);
}

export function recordWeeklyStory(state: WorldState, owner: ProtagonistId, turnId: string, story: string): void {
  const compact = evidenceText(story);
  const excerpt = compact.length <= EVENT_TEXT_LIMIT ? compact : compact.slice(0, 88) + '…' + compact.slice(-88);
  recordWeeklyEvidence(state, owner, { id: 'story:' + turnId, at: nowMinute(state.clock), text: excerpt });
}

/** Detect newly saved, source-identified journal entries for each protagonist. */
export function captureNewJournalEvidence(before: WorldState, after: WorldState): void {
  if (!after.protagonists) return;
  for (const owner of PROTAGONISTS) {
    const personJournal = (s: WorldState) => {
      const p = s.protagonists;
      if (!p) return owner === 'soyo' ? s.journal : [];
      if (p.accounts.active === owner) return s.journal;
      const others = PROTAGONISTS.filter(id => id !== p.accounts.active);
      return owner === others[0] ? p.inactive.journal : p.third.journal;
    };
    const old = new Set(personJournal(before).map(row => row.id));
    for (const row of personJournal(after)) {
      if (old.has(row.id)) continue;
      const match = timePattern.exec(row.at);
      if (!match) continue;
      const day = Number(match[1]), hour = Number(match[2]), minute = Number(match[3]);
      if (day < 1 || hour > 23 || minute > 59) continue;
      recordWeeklyEvidence(after, owner, { id: row.id, at: (day - 1) * 1440 + hour * 60 + minute, text: row.text });
    }
  }
}

export function settleWeeklyMemory(state: WorldState): void {
  if (!state.protagonists) return;
  const memory = state.protagonists.weeklyMemory ??= createWeeklyMemory(nowMinute(state.clock));
  advance(memory, weekAt(nowMinute(state.clock)));
}

/** Full omniscient evidence goes to the author model, not into character knowledge. */
export function weeklyMemoryContext(state: WorldState) {
  const memory = state.protagonists?.weeklyMemory;
  if (!memory) return { summaries: [], pending: null };
  const summaries = memory.closed.filter(c => c.summary !== null).slice(-2)
    .map(c => ({ week: c.week, text: c.summary! }));
  const next = memory.closed.find(c => c.summary === null);
  return {
    summaries,
    pending: next ? { week: next.week, evidence: next.evidence.map(e => ({
      owner: e.owner, day: dayAt(e.at), id: e.id, text: e.text,
    })) } : null,
  };
}

/** Apply one model-produced weekly summary, only if that exact week is pending. */
export function applyWeeklySummary(state: WorldState, value: { week: number; text: string } | undefined): void {
  if (!value) return;
  const memory = state.protagonists?.weeklyMemory;
  if (!memory) throw new Error('七日摘要不能写入未启用双主角的存档。');
  const previous = memory.closed.find(w => w.week === value.week);
  if (previous?.summary !== null && previous?.summary !== undefined) {
    if (previous.summary !== value.text) throw new Error('七日摘要内容发生冲突，未保存本轮。');
    return;
  }
  const pending = memory.closed.find(w => w.summary === null);
  if (!pending || pending.week !== value.week || !previous) throw new Error('七日摘要对应的周次已经变化，未保存本轮。');
  if (!value.text.trim() || value.text.length > SUMMARY_LIMIT || /[\u0000-\u001f]/.test(value.text)) {
    throw new Error('七日摘要格式无效，未保存本轮。');
  }
  previous.summary = value.text.trim();
  previous.evidence = []; // sources remain as provenance without duplicating old prose.
}
