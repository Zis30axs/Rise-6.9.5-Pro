import type { WorldAction, WorldState } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';
import { getStoreItem, INVENTORY_ITEM_LIMIT } from './convenience-store';
import { INTERACTION_EVENT_MAX_DAILY_OFFERS } from './interaction-event-rate';
import { MARGO_CAFE_OWNER_ID, MARGO_CAFE_ROOM_ID, isMargoCafeOpen } from './margo-cafe-venue';
import { residentById, residentPresence } from './npc-cast';

/** Only the most recent receipt per protagonist is needed for the daily cap. */
export interface MargoCafeReceipt {
  id: string;
  owner: ProtagonistId;
  day: number;
  at: number;
  giverId: string;
  itemId: string;
}
export interface MargoCafeState {
  version: 1;
  receipts: MargoCafeReceipt[];
  /** Exists only in a prepared interaction; accept and decline both clear it. */
  pending?: MargoCafeReceipt;
}
export interface MargoCafeOffer extends MargoCafeReceipt {
  giverName: string;
  itemName: string;
  preview: string;
  text: string;
}

const gifts = [
  { giverId: 'majo-margo', itemId: 'takeaway-eat-dessert' },
  { giverId: 'majo-emma', itemId: 'takeaway-eat-dessert' },
  { giverId: 'majo-hiro', itemId: 'takeaway-drink-tea' },
  { giverId: 'majo-anan', itemId: 'takeaway-eat-dessert' },
  { giverId: 'majo-noa', itemId: 'takeaway-drink-latte' },
] as const;
const ownerOf = (state: WorldState): ProtagonistId => state.protagonists?.accounts.active ?? 'soyo';
const minuteOf = (clock: WorldState['clock']) => (clock.day - 1) * 1440 + clock.hour * 60 + clock.minute;
const receiptId = (row: Omit<MargoCafeReceipt, 'id' | 'itemId'>) => `margo-cafe:${row.owner}:${row.day}:${row.at}:${row.giverId}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const isCafe = (state: WorldState) => state.locationId === MARGO_CAFE_ROOM_ID && state.interior?.roomId === MARGO_CAFE_ROOM_ID && isMargoCafeOpen(state.clock);
const ownReceipt = (state: WorldState) => state.margoCafeDaily?.receipts.find(row => row.owner === ownerOf(state));
const alreadyClaimed = (state: WorldState) => ownReceipt(state)?.day === state.clock.day;

function liveGifts(state: WorldState) {
  const owner = ownerOf(state);
  return gifts.filter(gift => {
    if (owner === 'emma' && gift.giverId === 'majo-emma') return false;
    const presence = residentPresence(gift.giverId, state.clock);
    const owned = state.inventory.find(item => item.itemId === gift.itemId)?.quantity ?? 0;
    return presence?.locationId === MARGO_CAFE_ROOM_ID && presence.available && owned < INVENTORY_ITEM_LIMIT;
  });
}

/** This event consumes the same offered check as the generic interaction event. */
function currentOfferedCheck(state: WorldState) {
  const owner = ownerOf(state), at = minuteOf(state.clock);
  const checks = state.interactionEventRate?.checks ?? [];
  const latest = [...checks].reverse().find(row => row.owner === owner);
  if (!latest || latest.at !== at || latest.locationId !== MARGO_CAFE_ROOM_ID || !latest.offered) return null;
  const today = checks.filter(row => row.owner === owner && Math.floor(row.at / 1440) === state.clock.day - 1 && row.offered);
  return today.length <= INTERACTION_EVENT_MAX_DAILY_OFFERS ? latest : null;
}

function eligibleTrigger(action: WorldAction): boolean {
  return ['travel', 'novel_travel', 'enter_interior', 'location_service', 'pack_service', 'interior_interact', 'wait'].includes(action.type);
}

function giftText(giverId: string, owner: ProtagonistId): string {
  switch (giverId) {
    case 'majo-margo':
      return '玛格把一份封好的甜点推过柜台，笑着说：|宝生玛格|happy|今天请你试试。不过，夸奖可不能算进账单里哦？|她指了指包装上的口味标记，又把一支小叉放在旁边。';
    case 'majo-emma':
      return '艾玛看了看手里的两份甜点，鼓起勇气递来其中一份。|樱羽艾玛|shy|这个……如果你愿意的话，要不要收下？不喜欢也没关系的！|她等你点头才松开手，随后露出一点安心的笑。';
    case 'majo-hiro':
      return owner === 'emma'
        ? '希罗将封好的热茶递给艾玛，先认真确认杯盖已经扣紧。|二阶堂希罗|relieved|艾玛，杯子还热，慢一点拿。今天就在这里好好歇一会儿吧。|她没有再多叮嘱，只把纸巾放在旁边。'
        : '希罗将一杯封好的热茶放到桌边，先认真确认杯盖已经扣紧。|二阶堂希罗|neutral|这是还没开封的一杯。如果你愿意收下，请小心烫。|她的语气郑重，等你同意后才递过来。';
    case 'majo-anan':
      return owner === 'emma'
        ? '安安把速写本转向艾玛，纸上画着一块甜点和一只小手，旁边写着「给艾玛。吾辈……不是吃不下。」她把一份封好的甜点轻轻推近，等艾玛自己接过。'
        : '安安在速写本上画了一块甜点，旁边写着「吾辈有多的一份……愿意的话，拿去吧。」她把封好的甜点轻轻推近，用笔尖点了一下包装上的口味。';
    case 'majo-noa':
      return '诺亚举起一杯封好的拿铁，看着奶咖分出的颜色笑了。|城崎诺亚|happy|像把云朵装进杯子里了哟♪ 这一杯送给你，要不要看看它晃起来的颜色呢？|她托住杯底，把杯子稳稳放在你面前。';
    default: throw new Error('咖啡馆赠礼人物无效。');
  }
}

function offerFor(row: MargoCafeReceipt): MargoCafeOffer {
  const giverName = residentById(row.giverId)!.name;
  const itemName = getStoreItem(row.itemId)!.name;
  return { ...row, giverName, itemName, preview: `${giverName}想送你一份${itemName}，要接受吗？`, text: giftText(row.giverId, row.owner) };
}

/** A stable draw prevents retries or a reopened pending interaction changing the giver. */
export function getMargoCafeOffer(state: WorldState, action: WorldAction): MargoCafeOffer | null {
  if (!eligibleTrigger(action) || !isCafe(state) || alreadyClaimed(state) || !currentOfferedCheck(state)) return null;
  // The shopkeeper must be present; guests cannot run an unattended or closed cafe.
  if (residentPresence(MARGO_CAFE_OWNER_ID, state.clock)?.locationId !== MARGO_CAFE_ROOM_ID) return null;
  const candidates = liveGifts(state);
  if (!candidates.length) return null;
  const owner = ownerOf(state), at = minuteOf(state.clock), day = state.clock.day;
  let sample = 2166136261;
  for (const letter of `${owner}:${day}:${at}`) sample = Math.imul(sample ^ letter.charCodeAt(0), 16777619);
  const gift = candidates[(sample >>> 0) % candidates.length]!;
  const row = { owner, day, at, giverId: gift.giverId, itemId: gift.itemId };
  return offerFor({ ...row, id: receiptId(row) });
}

export function stageMargoCafeOffer(state: WorldState, offer: MargoCafeOffer): WorldState {
  const expected = getMargoCafeOffer(state, { type: 'wait', minutes: 1 });
  if (!expected || expected.id !== offer.id || expected.itemId !== offer.itemId) throw new Error('咖啡馆赠礼选择已失效。');
  const { id, owner, day, at, giverId, itemId } = expected;
  return { ...state, margoCafeDaily: { version: 1, receipts: clone(state.margoCafeDaily?.receipts ?? []), pending: { id, owner, day, at, giverId, itemId } } };
}

/** Declining keeps the shared cooldown stamp but never leaves a claimable token. */
export function dismissMargoCafeOffer(state: WorldState): WorldState {
  if (!state.margoCafeDaily?.pending) return state;
  return { ...state, margoCafeDaily: { version: 1, receipts: clone(state.margoCafeDaily.receipts) } };
}

/** Internal action only: neither item IDs nor quantities come from model output. */
export function applyMargoCafeGift(state: WorldState, offerId: string): WorldState {
  const prior = state.margoCafeDaily?.receipts.find(row => row.id === offerId);
  if (prior && prior.owner === ownerOf(state)) return clone(state);
  const pending = state.margoCafeDaily?.pending;
  if (!pending || pending.id !== offerId || pending.owner !== ownerOf(state) || pending.day !== state.clock.day || pending.at !== minuteOf(state.clock)) throw new Error('咖啡馆赠礼选择已失效。');
  const expected = getMargoCafeOffer(state, { type: 'wait', minutes: 1 });
  if (!expected || expected.id !== pending.id || expected.itemId !== pending.itemId || expected.giverId !== pending.giverId) throw new Error('咖啡馆赠礼人物已离开、库存已满或本日已领取。');
  const next = clone(state);
  const inventory = next.inventory.find(row => row.itemId === expected.itemId);
  if (inventory) inventory.quantity++;
  else next.inventory.push({ itemId: expected.itemId, quantity: 1 });
  next.margoCafeDaily = { version: 1, receipts: [...(next.margoCafeDaily?.receipts ?? []).filter(row => row.owner !== expected.owner), { ...pending }] };
  const at = `第 ${next.clock.day} 天 ${String(next.clock.hour).padStart(2, '0')}:${String(next.clock.minute).padStart(2, '0')}`;
  next.story = [...next.story, { id: expected.id, role: 'assistant' as const, text: expected.text, participantIds: [expected.giverId] }].slice(-40);
  const entries = [...next.journal, { id: `${expected.id}:receipt`, text: `在玛格咖啡馆接受${expected.giverName}的赠礼：${expected.itemName} ×1，已放入背包。`, at }];
  const storyIds = new Set(next.story.filter(row => row.role === 'assistant').map(row => row.id));
  while (entries.length > 100) {
    const index = entries.findIndex(row => {
      const match = /^(.*):wa:[0-9a-f]{24}$/.exec(row.id);
      return !match || !storyIds.has(match[1]);
    });
    entries.splice(index < 0 ? 0 : index, 1);
  }
  next.journal = entries;
  return next;
}

/** Reconstruct only known fields, including the temporary token used by reducers. */
export function parseMargoCafeState(value: unknown, clock: WorldState['clock']): MargoCafeState {
  const fail = (): never => { throw new Error('存档 margoCafeDaily 无效。'); };
  const exact = (raw: unknown, fields: string[]) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !fields.includes(key))) return fail();
    return raw as Record<string, unknown>;
  };
  const state = exact(value, ['version', 'receipts', 'pending']);
  if (state.version !== 1 || !Array.isArray(state.receipts) || state.receipts.length > 3) return fail();
  const parseReceipt = (raw: unknown): MargoCafeReceipt => {
    const row = exact(raw, ['id', 'owner', 'day', 'at', 'giverId', 'itemId']);
    if (typeof row.owner !== 'string' || !['soyo', 'sakiko', 'emma'].includes(row.owner) || !Number.isSafeInteger(row.at) || !Number.isSafeInteger(row.day)) return fail();
    const at = row.at as number, day = row.day as number, owner = row.owner as ProtagonistId;
    if (at < 0 || at > minuteOf(clock) || day !== Math.floor(at / 1440) + 1 || day > clock.day) return fail();
    const gift = gifts.find(gift => gift.giverId === row.giverId && gift.itemId === row.itemId);
    if (!gift || (owner === 'emma' && gift.giverId === 'majo-emma')) return fail();
    const receipt = { owner, day, at, giverId: gift.giverId, itemId: gift.itemId };
    if (row.id !== receiptId(receipt)) return fail();
    return { ...receipt, id: row.id as string };
  };
  const receipts = state.receipts.map(parseReceipt);
  if (new Set(receipts.map(row => row.owner)).size !== receipts.length) return fail();
  const pending = Object.hasOwn(state, 'pending') ? parseReceipt(state.pending) : undefined;
  if (pending && (pending.at !== minuteOf(clock) || pending.day !== clock.day || receipts.some(row => row.owner === pending.owner && row.day >= pending.day))) return fail();
  return { version: 1, receipts, ...(pending ? { pending } : {}) };
}
