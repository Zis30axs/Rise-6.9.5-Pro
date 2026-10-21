import type { WorldState } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';

/**
 * Extractive, provenance-bound seven-game-day memory. This is a compact record
 * of saved events, NOT an LLM-written fact and never an authority for balances,
 * locations, actions or phone delivery.
 */
export interface WeeklyEvidence { id: string; at: number; text: string }
export interface ClosedWeek { week: number; text: string; sources: string[] }
export interface PersonWeeklyMemory { openWeek: number; entries: WeeklyEvidence[]; closed: ClosedWeek[] }
export interface WeeklyMemory {
  version: 1;
  startedAt: number;
  people: Record<ProtagonistId, PersonWeeklyMemory>;
}

const WEEK_MINUTES = 7 * 1440;
const MAX_MINUTE = 525_599_999;
const OPEN_LIMIT = 49;
const CLOSED_LIMIT = 12;
const SUMMARY_LIMIT = 1800;
const EVENT_TEXT_LIMIT = 180;
const weekAt = (at: number) => Math.floor(at / WEEK_MINUTES) + 1;
const dayAt = (at: number) => Math.floor(at / 1440) + 1;
const nowMinute = (clock: WorldState['clock']) => (clock.day - 1) * 1440 + clock.hour * 60 + clock.minute;
const idPattern = /^[A-Za-z0-9][\w:.-]{0,127}$/;
const timePattern = /^第 (\d+) 天 (\d{2}):(\d{2})$/;

export function createWeeklyMemory(at: number): WeeklyMemory {
  const person = (): PersonWeeklyMemory => ({ openWeek: weekAt(at), entries: [], closed: [] });
  return { version: 1, startedAt: at, people: { soyo: person(), sakiko: person() } };
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
function text(x: unknown, max: number): string {
  return typeof x === 'string' && !!x.trim() && x.length <= max && !/[\u0000-\u001f]/.test(x) ? x : error();
}
function identity(x: unknown): string {
  return typeof x === 'string' && idPattern.test(x) ? x : error();
}
function list<T>(x: unknown, max: number, parse: (item: unknown) => T): T[] {
  return Array.isArray(x) && x.length <= max ? x.map(parse) : error();
}

/** Old 1.12 saves without this optional block initialize at their current time. */
export function parseWeeklyMemory(raw: unknown, clock: WorldState['clock']): WeeklyMemory {
  const row = object(raw, ['version', 'startedAt', 'people']);
  if (row.version !== 1) return error();
  const now = nowMinute(clock);
  const startedAt = int(row.startedAt, 0, now);
  const people = object(row.people, ['soyo', 'sakiko']);
  const person = (rawPerson: unknown): PersonWeeklyMemory => {
    const p = object(rawPerson, ['openWeek', 'entries', 'closed']);
    const openWeek = int(p.openWeek, weekAt(startedAt), weekAt(now));
    const entries = list(p.entries, OPEN_LIMIT, rawEntry => {
      const e = object(rawEntry, ['id', 'at', 'text']);
      const at = int(e.at, startedAt, now);
      if (weekAt(at) !== openWeek) return error();
      return { id: identity(e.id), at, text: text(e.text, EVENT_TEXT_LIMIT) };
    });
    if (new Set(entries.map(e => e.id)).size !== entries.length) return error();
    const closed = list(p.closed, CLOSED_LIMIT, rawWeek => {
      const w = object(rawWeek, ['week', 'text', 'sources']);
      const week = int(w.week, weekAt(startedAt), openWeek - 1);
      const sources = list(w.sources, OPEN_LIMIT, identity);
      if (new Set(sources).size !== sources.length) return error();
      return { week, text: text(w.text, SUMMARY_LIMIT), sources };
    });
    if (new Set(closed.map(w => w.week)).size !== closed.length
      || closed.some((w, i) => i > 0 && closed[i - 1].week >= w.week)) return error();
    return { openWeek, entries, closed };
  };
  return { version: 1, startedAt, people: { soyo: person(people.soyo), sakiko: person(people.sakiko) } };
}

/** Restrict regex cleanup to formatting. No claimed facts are inferred or modified. */
export function evidenceText(source: string): string {
  return source
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
  let index = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i], b = rows[index];
    if (importance(a) < importance(b) || (importance(a) === importance(b) && a.at < b.at)) index = i;
  }
  rows.splice(index, 1);
}
function close(person: PersonWeeklyMemory): void {
  if (!person.entries.length) return;
  const group = new Map<number, WeeklyEvidence[]>();
  for (const entry of person.entries) {
    const day = dayAt(entry.at);
    group.set(day, [...(group.get(day) ?? []), entry]);
  }
  // Reserve evidence from every represented day before ranking the remaining
  // significant entries. An ordinary daily routine cannot crowd out all others.
  const selected: WeeklyEvidence[] = [];
  for (const values of group.values()) {
    selected.push([...values].sort((a, b) => importance(b) - importance(a) || b.at - a.at)[0]);
  }
  const seen = new Set(selected.map(e => e.id));
  for (const entry of [...person.entries].sort((a, b) => importance(b) - importance(a) || b.at - a.at)) {
    if (selected.length >= 28) break;
    if (!seen.has(entry.id)) { selected.push(entry); seen.add(entry.id); }
  }
  selected.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const chunks: string[] = [], sources: string[] = [];
  let remaining = SUMMARY_LIMIT;
  for (const e of selected) {
    const at = e.at % 1440;
    const stamp = '第' + dayAt(e.at) + '天 ' + String(Math.floor(at / 60)).padStart(2, '0') + ':' + String(at % 60).padStart(2, '0') + ' ';
    const chunk = stamp + e.text;
    if (chunk.length + (chunks.length ? 1 : 0) > remaining) continue;
    chunks.push(chunk); sources.push(e.id); remaining -= chunk.length + 1;
  }
  if (chunks.length) {
    person.closed.push({ week: person.openWeek, text: chunks.join('；'), sources });
    person.closed = person.closed.slice(-CLOSED_LIMIT);
  }
}
function advance(person: PersonWeeklyMemory, targetWeek: number): void {
  if (targetWeek <= person.openWeek) return;
  close(person);
  person.openWeek = targetWeek;
  person.entries = [];
}

/** Called only on the candidate save snapshot; cancellation never persists it. */
export function recordWeeklyEvidence(state: WorldState, owner: ProtagonistId, entry: WeeklyEvidence): void {
  if (!state.protagonists || !Number.isSafeInteger(entry.at)) return;
  const memory = state.protagonists.weeklyMemory ??= createWeeklyMemory(nowMinute(state.clock));
  if (entry.at < memory.startedAt || entry.at > nowMinute(state.clock) || !idPattern.test(entry.id)) return;
  const p = memory.people[owner], targetWeek = weekAt(entry.at);
  if (targetWeek < p.openWeek) return;
  advance(p, targetWeek);
  if (p.entries.some(e => e.id === entry.id)) return;
  const cleaned = evidenceText(entry.text).slice(0, EVENT_TEXT_LIMIT);
  if (!cleaned) return;
  p.entries.push({ id: entry.id, at: entry.at, text: cleaned });
  // Per-day quota and global quota prevent long idle jumps from flooding
  // the save or overriding the other days' meaningful events.
  const today = p.entries.filter(e => dayAt(e.at) === dayAt(entry.at));
  if (today.length > 7) {
    const candidate = [...today];
    evictLowest(candidate);
    const keep = new Set(candidate.map(e => e.id));
    p.entries = p.entries.filter(e => dayAt(e.at) !== dayAt(entry.at) || keep.has(e.id));
  }
  while (p.entries.length > OPEN_LIMIT) evictLowest(p.entries);
}

export function recordWeeklyStory(state: WorldState, owner: ProtagonistId, turnId: string, story: string): void {
  const at = nowMinute(state.clock);
  const compact = evidenceText(story);
  // Front and closing lines preserve both the setup and a possible resolution.
  const excerpt = compact.length <= EVENT_TEXT_LIMIT ? compact
    : compact.slice(0, 88) + '…' + compact.slice(-88);
  recordWeeklyEvidence(state, owner, { id: 'story:' + turnId, at, text: excerpt });
}

/** Compare journals by stable ID instead of re-uploading or replaying old facts. */
export function captureNewJournalEvidence(before: WorldState, after: WorldState): void {
  if (!after.protagonists) return;
  for (const owner of ['soyo', 'sakiko'] as const) {
    const source = (state: WorldState) => state.protagonists
      ? (state.protagonists.accounts.active === owner ? state.journal : state.protagonists.inactive.journal)
      : (owner === 'soyo' ? state.journal : []);
    const existing = new Set(source(before).map(row => row.id));
    for (const row of source(after)) {
      if (existing.has(row.id)) continue;
      const match = timePattern.exec(row.at);
      if (!match) continue;
      const day = Number(match[1]), hour = Number(match[2]), minute = Number(match[3]);
      if (day < 1 || hour > 23 || minute > 59) continue;
      recordWeeklyEvidence(after, owner, { id: row.id, at: (day - 1) * 1440 + hour * 60 + minute, text: row.text });
    }
  }
}

/** Close a finished 7-game-day period, even when it has no additional events. */
export function settleWeeklyMemory(state: WorldState): void {
  if (!state.protagonists) return;
  const memory = state.protagonists.weeklyMemory ??= createWeeklyMemory(nowMinute(state.clock));
  const current = weekAt(nowMinute(state.clock));
  for (const owner of ['soyo', 'sakiko'] as const) advance(memory.people[owner], current);
}

/** Read only the current protagonist's two most recent closed weeks. */
export function weeklyMemoryContext(state: WorldState, owner: ProtagonistId): { week: number; text: string }[] {
  return (state.protagonists?.weeklyMemory?.people[owner].closed ?? []).slice(-2).map(w => ({ week: w.week, text: w.text }));
}
