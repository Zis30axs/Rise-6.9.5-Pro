import type { AirlinerPass, AirTrafficState } from '../frontend/types';

export const AIRLINER_DURATION_MS = 40000 as const;
export const AIRLINER_COOLDOWN_MS = 180000;
const MAX_TIMESTAMP = 8_000_000_000_000_000;
const MAX_SEQUENCE = 1_000_000_000;

export function createAirTrafficState(): AirTrafficState {
  return { sequence: 0, nextAmbientAt: 0, cooldownUntil: 0, lastFlight: null };
}

function invalid(path: string): never {
  throw new Error(`存档格式无效：airTraffic.${path}。原存档已保留，请先备份并检查数据。`);
}
function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
  const ownKeys = Object.keys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => !keys.includes(key))) return invalid(`${path} 字段`);
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return invalid(path);
  return value;
}

/** Reconstruct a bounded allowlist; saved fields never become executable configuration. */
export function parseAirTrafficState(value: unknown): AirTrafficState {
  const item = record(value, ['sequence', 'nextAmbientAt', 'cooldownUntil', 'lastFlight'], 'state');
  const sequence = integer(item.sequence, 0, MAX_SEQUENCE, 'sequence');
  const nextAmbientAt = integer(item.nextAmbientAt, 0, MAX_TIMESTAMP, 'nextAmbientAt');
  const cooldownUntil = integer(item.cooldownUntil, 0, MAX_TIMESTAMP, 'cooldownUntil');
  let lastFlight: AirlinerPass | null = null;
  if (item.lastFlight !== null) {
    const flight = record(item.lastFlight, ['id', 'source', 'startedAt', 'durationMs', 'routeIndex'], 'lastFlight');
    if (typeof flight.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(flight.id)) return invalid('lastFlight.id');
    if (flight.source !== 'ambient' && flight.source !== 'story') return invalid('lastFlight.source');
    if (flight.durationMs !== AIRLINER_DURATION_MS) return invalid('lastFlight.durationMs');
    lastFlight = {
      id: flight.id, source: flight.source,
      startedAt: integer(flight.startedAt, 1, MAX_TIMESTAMP - 360000, 'lastFlight.startedAt'),
      durationMs: AIRLINER_DURATION_MS,
      routeIndex: integer(flight.routeIndex, 0, 3, 'lastFlight.routeIndex') as AirlinerPass['routeIndex'],
    };
  }
  if ((sequence === 0) !== (lastFlight === null)) return invalid('sequence 与 lastFlight 不一致');
  if (lastFlight ? cooldownUntil !== lastFlight.startedAt + AIRLINER_COOLDOWN_MS || nextAmbientAt < cooldownUntil || nextAmbientAt > lastFlight.startedAt + 360000 : cooldownUntil !== 0) return invalid('冷却与航班时间不一致');
  return { sequence, nextAmbientAt, cooldownUntil, lastFlight };
}

function timestamp(now: number): number {
  if (!Number.isSafeInteger(now) || now < 1 || now > MAX_TIMESTAMP - 360000) throw new Error('空中事件时间无效，世界状态未更新。');
  return now;
}
function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) { result ^= value.charCodeAt(i); result = Math.imul(result, 16777619); }
  return result >>> 0;
}

export function getActiveAirliner(traffic: AirTrafficState, now = Date.now()): AirlinerPass | null {
  const flight = traffic.lastFlight;
  return flight && now >= flight.startedAt && now < flight.startedAt + flight.durationMs ? flight : null;
}

export function canTriggerAirliner(traffic: AirTrafficState, now = Date.now()): boolean {
  return Number.isSafeInteger(now) && now >= 1 && now <= MAX_TIMESTAMP - 360000 && traffic.sequence < MAX_SEQUENCE && now >= traffic.cooldownUntil;
}

/** One accepted event sets both display and cooldown; repeated ticks never replay a pass. */
export function triggerAirliner(traffic: AirTrafficState, now: number, source: AirlinerPass['source'], eventId: string): AirTrafficState {
  const time = timestamp(now);
  if (!canTriggerAirliner(traffic, time)) throw new Error('客机经过仍在冷却中，本轮正文和事件均未写入，请重试。');
  const sequence = traffic.sequence + 1;
  const sample = hash(`${eventId}|${sequence}|${time}`);
  return parseAirTrafficState({
    sequence, nextAmbientAt: time + AIRLINER_COOLDOWN_MS + sample % 180001,
    cooldownUntil: time + AIRLINER_COOLDOWN_MS,
    lastFlight: { id: eventId, source, startedAt: time, durationMs: AIRLINER_DURATION_MS, routeIndex: (sample >>> 8) % 4 },
  });
}

/** Schedule only one future pass, never catch up missed flights after a suspended tab. */
export function advanceAirTraffic(traffic: AirTrafficState, now: number, seed = 'unread-city'): AirTrafficState {
  const next = parseAirTrafficState(traffic);
  const time = timestamp(now);
  if (next.nextAmbientAt === 0) {
    next.nextAmbientAt = time + 45000 + hash(`${seed}|${time}`) % 45001;
    return next;
  }
  if (time < next.nextAmbientAt || !canTriggerAirliner(next, time)) return next;
  return triggerAirliner(next, time, 'ambient', `airliner-ambient-${next.sequence + 1}`);
}

/** Current sky facts for narration. Last flights remain history after the visual expires. */
export function getAirTrafficContext(traffic: AirTrafficState, now = Date.now()) {
  const active = getActiveAirliner(traffic, now);
  return {
    count: traffic.sequence,
    active: active ? { ...active, kind: 'airliner', altitude: '高空', description: '一架远处的客机正在高空平稳经过。' } : null,
    lastFlight: traffic.lastFlight,
    canTriggerPass: canTriggerAirliner(traffic, now),
    cooldownSeconds: Math.max(0, Math.ceil((traffic.cooldownUntil - now) / 1000)),
  };
}
