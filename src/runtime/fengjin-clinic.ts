import type { WorldState } from '../frontend/types';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';

export interface FengjinCounselingReceipt {
  owner: ProtagonistId;
  week: number;
  day: number;
  at: number;
}

export interface FengjinClinicState {
  version: 1;
  counselingReceipts: FengjinCounselingReceipt[];
}

export const FENGJIN_COUNSELING_SERVICE_ID = 'clinic-counseling';

export function getGameWeek(clock: WorldState['clock']): number {
  return Math.floor((clock.day - 1) / 7) + 1;
}

export function activeProtagonistId(state: WorldState, worldAuthority?: WorldState): ProtagonistId {
  return state.protagonists?.accounts.active ?? worldAuthority?.protagonists?.accounts.active ?? 'soyo';
}

export function hasUsedWeeklyCounseling(state: WorldState, protagonist?: ProtagonistId, worldAuthority?: WorldState): boolean {
  const owner = protagonist ?? activeProtagonistId(state, worldAuthority);
  const week = getGameWeek(state.clock);
  const receipts = (state.fengjinClinic ?? worldAuthority?.fengjinClinic)?.counselingReceipts ?? [];
  if (receipts.some(r => r.owner === owner && r.week === week)) return true;
  const stableId = `fengjin-counseling:${owner}:week-${week}`;
  return state.journal.some(entry => entry.id === stableId);
}

export function recordFengjinCounseling(state: WorldState, clock: WorldState['clock'], worldAuthority?: WorldState): FengjinClinicState {
  const owner = activeProtagonistId(state, worldAuthority);
  const week = getGameWeek(clock);
  const at = (clock.day - 1) * 1440 + clock.hour * 60 + clock.minute;
  const sourceClinic = state.fengjinClinic ?? worldAuthority?.fengjinClinic;
  const existing = (sourceClinic?.counselingReceipts ?? []).filter(
    r => !(r.owner === owner && r.week === week),
  );
  const newReceipt: FengjinCounselingReceipt = { owner, week, day: clock.day, at };
  return {
    version: 1,
    counselingReceipts: [...existing, newReceipt].slice(-40),
  };
}

export function parseFengjinClinicState(value: unknown): FengjinClinicState {
  const fail = (): never => { throw new Error('存档 fengjinClinic 无效。'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !Array.isArray(row.counselingReceipts)) return fail();
  const counselingReceipts: FengjinCounselingReceipt[] = [];
  for (const item of row.counselingReceipts) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return fail();
    const r = item as Record<string, unknown>;
    if (typeof r.owner !== 'string' || !PROTAGONISTS.includes(r.owner as ProtagonistId)) return fail();
    if (typeof r.week !== 'number' || !Number.isSafeInteger(r.week) || r.week < 1) return fail();
    if (typeof r.day !== 'number' || !Number.isSafeInteger(r.day) || r.day < 1) return fail();
    if (typeof r.at !== 'number' || !Number.isSafeInteger(r.at) || r.at < 0) return fail();
    counselingReceipts.push({
      owner: r.owner as ProtagonistId,
      week: r.week,
      day: r.day,
      at: r.at,
    });
  }
  return { version: 1, counselingReceipts };
}
