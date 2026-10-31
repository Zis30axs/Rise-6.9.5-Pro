/**
 * Fixed real-world chronicle: one authoritative GMT+8 civil timeline shared by
 * all four viewpoints. No timers, network calls, RNG, or independent LLM.
 *
 * The event data is offline and immutable. Its publication gate is conservative:
 * - verified instants: at the reported instant (round seconds UP a minute);
 * - an event with an end instant: only after the recorded end;
 * - day-only results with a verified GMT+8 date: no earlier than the NEXT day;
 * - provisional day-only dates: no earlier than TWO days afterward, because
 *   their source day may be one day behind GMT+8.
 *
 * The resulting event is offered only on the next normal PLAYER-initiated model
 * request. A successful, persisted turn acknowledges the exact offered batch;
 * cancellation, failed generation and failed commit must not consume history.
 */
import data from './world-chronicle-data.json' with { type: 'json' };
import type { WorldState } from '../frontend/types';
import { GAME_DAY_LIMIT, gameDayFromISO } from './game-calendar';

const MINUTES_PER_DAY = 1440;
const RECENT_WINDOW_MINUTES = 30 * MINUTES_PER_DAY;
const BATCH_LIMIT = 4;
const MAX_GAME_MINUTE = GAME_DAY_LIMIT * MINUTES_PER_DAY - 1;

export interface WorldChronicleState {
  /** Most recent game minute that was successfully checked for due history. */
  handledThroughMinute: number;
}

export interface WorldChronicleReceipt {
  /** The exact request-time gate: never acknowledge events using post-action time. */
  fromMinute: number;
  throughMinute: number;
  eventIds: string[];
}

interface ChronicleSource {
  id: string;
  dateGMT8: string;
  dateConversionStatus: string;
  dateTimePrecision: string;
  eventAtGMT8?: string;
  eventEndAtGMT8?: string;
  location: string;
  category: string;
  title: string;
  fact: string;
  priority: number;
  narrativeTone: string;
  npcReactionChance: number;
}

export interface OfferedHistoricalEvent {
  id: string;
  dateGMT8: string;
  availableAtGMT8: string;
  location: string;
  category: string;
  title: string;
  fact: string;
  importance: number;
  narrativeTone: string;
  /** Narrative interest suggestion, NOT a pre-rolled model decision. */
  npcReactionChance: number;
}

export interface WorldChronicleBatch {
  receipt: WorldChronicleReceipt;
  events: OfferedHistoricalEvent[];
}

function dayStartMinute(date: string): number {
  return (gameDayFromISO(date) - 1) * MINUTES_PER_DAY;
}

function instantMinute(stamp: string): number {
  const match = /^(\\d{4}-\\d{2}-\\d{2})T([01]\\d|2[0-3]):([0-5]\\d):([0-5]\\d)\\+08:00$/.exec(stamp);
  if (!match) throw new Error('世界纪年表存在非 GMT+8 时间戳');
  return dayStartMinute(match[1]) + Number(match[2]) * 60 + Number(match[3]) + (Number(match[4]) ? 1 : 0);
}

function availableMinute(row: ChronicleSource): number {
  if (row.eventEndAtGMT8) return instantMinute(row.eventEndAtGMT8);
  if (row.eventAtGMT8) return instantMinute(row.eventAtGMT8);
  const offset = row.dateConversionStatus === 'verified_day_no_result_timestamp' ? 1 : 2;
  return dayStartMinute(row.dateGMT8) + offset * MINUTES_PER_DAY;
}

const entries = (data.events as readonly ChronicleSource[])
  .map(event => ({ event, at: availableMinute(event) }))
  .sort((a, b) => a.at - b.at || a.event.id.localeCompare(b.event.id));

if (data.timeZone !== 'UTC+08:00' || new Set(entries.map(row => row.event.id)).size !== entries.length) {
  throw new Error('世界纪年表数据必须使用 GMT+8 且事件 ID 唯一');
}

export function parseWorldChronicleState(value: unknown): WorldChronicleState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('世界纪年表存档无效');
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== 1 || !Object.hasOwn(raw, 'handledThroughMinute')
    || typeof raw.handledThroughMinute !== 'number' || !Number.isSafeInteger(raw.handledThroughMinute)
    || raw.handledThroughMinute < -1 || raw.handledThroughMinute > MAX_GAME_MINUTE) {
    throw new Error('世界纪年表游标无效');
  }
  return { handledThroughMinute: raw.handledThroughMinute };
}

function clockMinute(clock: WorldState['clock']): number {
  return (clock.day - 1) * MINUTES_PER_DAY + clock.hour * 60 + clock.minute;
}

function formatMinute(minute: number): string {
  const date = new Date(Date.UTC(2025, 7, 28) + Math.floor(minute / MINUTES_PER_DAY) * 86400000)
    .toISOString().slice(0, 10);
  const rem = minute % MINUTES_PER_DAY;
  return date + ' ' + String(Math.floor(rem / 60)).padStart(2, '0') + ':' + String(rem % 60).padStart(2, '0') + ' GMT+8';
}

/**
 * Only newly available, reasonably recent events are injected. If the player
 * advances many weeks, stale news is silently passed over when newer news is
 * acknowledged; the narrator must never read an entire backlog on one turn.
 */
export function pendingWorldChronicle(state: Pick<WorldState, 'clock' | 'worldChronicle'>): WorldChronicleBatch | null {
  const now = clockMinute(state.clock);
  const from = state.worldChronicle?.handledThroughMinute ?? -1;
  if (now <= from) return null;
  const available = entries.filter(row => row.at > from && row.at <= now
    && now - row.at <= RECENT_WINDOW_MINUTES);
  if (!available.length) return null;
  const selected = available
    .sort((a, b) => b.event.priority - a.event.priority || b.at - a.at || a.event.id.localeCompare(b.event.id))
    .slice(0, BATCH_LIMIT)
    .sort((a, b) => a.at - b.at || a.event.id.localeCompare(b.event.id));
  return {
    receipt: { fromMinute: from, throughMinute: now, eventIds: selected.map(row => row.event.id) },
    events: selected.map(({ event, at }) => ({
      id: event.id, dateGMT8: event.dateGMT8, availableAtGMT8: formatMinute(at),
      location: event.location, category: event.category, title: event.title, fact: event.fact,
      importance: event.priority, narrativeTone: event.narrativeTone,
      npcReactionChance: event.npcReactionChance,
    })),
  };
}

/** Apply exactly the injected set, and only after the ENTIRE turn committed. */
export function acknowledgeWorldChronicle(
  requestState: Pick<WorldState, 'clock' | 'worldChronicle'>,
  committed: WorldState,
  receipt?: WorldChronicleReceipt,
): WorldState {
  if (!receipt) return committed;
  const expected = pendingWorldChronicle(requestState)?.receipt;
  if (!expected || receipt.fromMinute !== expected.fromMinute
    || receipt.throughMinute !== expected.throughMinute
    || !Array.isArray(receipt.eventIds)
    || receipt.eventIds.length !== expected.eventIds.length
    || receipt.eventIds.some((id, index) => id !== expected.eventIds[index])) {
    throw new Error('世界纪年表回执与本轮注入不符；未保存剧情，请重试。');
  }
  return { ...committed, worldChronicle: { handledThroughMinute: expected.throughMinute } };
}
