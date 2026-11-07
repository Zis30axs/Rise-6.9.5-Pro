import type { WorldState } from '../frontend/types';
import type { StoreItem } from './convenience-store';
import type { ProtagonistId } from './dual-protagonists';
import { gameCalendar } from './game-calendar';

/** Small fictional overseas extension. No foreign coordinate is placed on the Tokyo 3D map. */
export const californiaPlaces = [
  { id: 'haneda-airport', name: '东京羽田国际机场', subtitle: '国际航站楼', description: '通往旧金山的国际航班从这里出发，须先到东京的南门交通站转乘机场接驳车。' },
  { id: 'sfo-airport', name: '旧金山国际机场', subtitle: '加州 · 入境大厅', description: '旧金山湾区的国际航空门户，可以搭乘机场接驳车前往市区，也可以购票返回东京。' },
  { id: 'california-openai', name: 'OpenAI 办公地点', subtitle: '加州 · 旧金山', description: 'OpenAI 访客大厅设有专门的登记柜台，开放时可申请领取 Pro200 收藏券。' },
  { id: 'california-anthropic', name: 'Anthropic 访客中心', subtitle: '加州 · 旧金山', description: '湾区另一家 AI 公司，设有安静的访客大厅与研究展示区。神秘研究者偶尔会在附近出现。' },
  { id: 'california-market', name: '湾区二手交易市场', subtitle: '加州 · 旧金山', description: '湾区的收藏品交易市场，常有商人收购各式纪念券，其中也包括 Pro200。' },
] as const;

const foreignLocationIds: ReadonlySet<string> = new Set(californiaPlaces.map(place => place.id));
export function isInternationalLocation(locationId: string): boolean {
  return foreignLocationIds.has(locationId);
}

/** The airport belongs to California even though its ID is sfo-airport. */
export function isCaliforniaLocalLocation(id: string): boolean {
  return id === 'sfo-airport' || id.startsWith('california-');
}

export interface InternationalLeg {
  from: string;
  to: string;
  minutes: number;
  fare: number;
  method: string;
}
const travelLegs: readonly InternationalLeg[] = [
  { from: 'bus-stop', to: 'haneda-airport', minutes: 50, fare: 1200, method: '机场接驳车' },
  { from: 'haneda-airport', to: 'sfo-airport', minutes: 600, fare: 48000, method: '东京至旧金山国际航班' },
  { from: 'sfo-airport', to: 'california-openai', minutes: 65, fare: 2600, method: '湾区机场接驳车' },
  { from: 'california-openai', to: 'california-market', minutes: 25, fare: 520, method: '湾区有轨电车' },
  { from: 'california-openai', to: 'california-anthropic', minutes: 20, fare: 450, method: '湾区市内接驳车' },
  { from: 'california-anthropic', to: 'california-market', minutes: 15, fare: 350, method: '湾区市内接驳车' },
];

export function internationalLeg(from: string, to: string): InternationalLeg | null {
  const outward = travelLegs.find(leg => leg.from === from && leg.to === to);
  if (outward) return outward;
  const inward = travelLegs.find(leg => leg.from === to && leg.to === from);
  return inward ? { ...inward, from, to } : null;
}

export function internationalConnections(from: string): InternationalLeg[] {
  return travelLegs.flatMap(leg => leg.from === from ? [leg]
    : leg.to === from ? [{ ...leg, from, to: leg.from }] : []);
}

/** Derived Pacific time only; the persisted world clock stays on Tokyo civil time. */
function nthSunday(year: number, month: number, nth: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return 1 + ((7 - weekday) % 7) + 7 * (nth - 1);
}
export function californiaOffsetMinutes(clock: WorldState['clock']): number {
  const date = gameCalendar(clock.day);
  const utc = Date.UTC(date.year, date.month - 1, date.date, clock.hour, clock.minute) - 9 * 60 * 60_000;
  const spring = Date.UTC(date.year, 2, nthSunday(date.year, 3, 2), 10);
  const fall = Date.UTC(date.year, 10, nthSunday(date.year, 11, 1), 9);
  return utc >= spring && utc < fall ? -16 * 60 : -17 * 60;
}
export function californiaLocalClock(clock: WorldState['clock']) {
  const minute = clock.hour * 60 + clock.minute + californiaOffsetMinutes(clock);
  const local = ((minute % 1440) + 1440) % 1440;
  return { day: clock.day + Math.floor(minute / 1440), hour: Math.floor(local / 60), minute: local % 60 };
}

export const PRO200_GAME_ITEM_ID = 'pro200-game-voucher';
export const PRO200_CLAIM_SERVICE_ID = 'openai-pro200-claim';
export const PRO200_RESELL_SERVICE_ID = 'pro200-resell';
export const PRO200_RESALE_YEN = 180000;
export const PRO200_COOLDOWN_DAYS = 7;

/** A non-consumable, non-purchasable fictional item, unrelated to real OpenAI accounts. */
export const pro200GameItem: StoreItem = Object.freeze({
  id: PRO200_GAME_ITEM_ID,
  name: 'Pro200 收藏券',
  brand: '湾区收藏品',
  tier: 'premium',
  category: 'collectible',
  price: 0,
  packSize: 1,
  purchaseUnit: '张',
  useUnit: '张',
  kcal: 0,
  useMinutes: 0,
  effects: Object.freeze({ energy: 0, satiety: 0, stress: 0, health: 0, morale: 0 }),
});

export interface CaliforniaState {
  claims: Partial<Record<ProtagonistId, number>>;
}

const owners = ['soyo', 'sakiko', 'emma', 'renako'] as const;
export function parseCaliforniaState(value: unknown): CaliforniaState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('存档格式无效：加州交易记录。');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 1 || !Object.hasOwn(row, 'claims') || !row.claims
    || typeof row.claims !== 'object' || Array.isArray(row.claims)) throw new Error('存档格式无效：加州领取记录。');
  const raw = row.claims as Record<string, unknown>;
  if (Object.keys(raw).some(key => !owners.includes(key as ProtagonistId))) throw new Error('存档格式无效：加州领取角色。');
  const claims: CaliforniaState['claims'] = {};
  for (const owner of owners) {
    if (!Object.hasOwn(raw, owner)) continue;
    const day = raw[owner];
    if (!Number.isSafeInteger(day) || (day as number) < 1 || (day as number) > 365000)
      throw new Error('存档格式无效：加州领取日期。');
    claims[owner] = day as number;
  }
  return { claims };
}

export function pro200ClaimBlocked(state: Pick<WorldState, 'clock' | 'inventory' | 'california'>, owner: ProtagonistId): string | null {
  const last = state.california?.claims[owner];
  if (last !== undefined && state.clock.day - last < PRO200_COOLDOWN_DAYS) {
    const remaining = PRO200_COOLDOWN_DAYS - (state.clock.day - last);
    return '已经领取过 Pro200，请在 ' + remaining + ' 天后再来。';
  }
  if ((state.inventory.find(entry => entry.itemId === PRO200_GAME_ITEM_ID)?.quantity ?? 0) >= 999)
    return '随身背包里的 Pro200 已达到存放上限。';
  return null;
}
