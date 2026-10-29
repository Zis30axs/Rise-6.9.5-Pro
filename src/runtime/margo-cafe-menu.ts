import type { WorldState } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';
import { INVENTORY_ITEM_LIMIT, MAX_PURCHASE_QUANTITY, type StoreItem } from './convenience-store';
import { isMargoCafeOpen, MARGO_CAFE_LOCATION_ID, MARGO_CAFE_ROOM_ID } from './margo-cafe-venue';

export const CAFE_DAILY_SPECIAL_ID = 'cafe-daily-special';
export const CAFE_DAILY_SPECIAL_PRICE = 500;
export const CAFE_EMMA_DRINK_ID = 'cafe-emma-sakura';

const drink = (
  id: string, name: string, price: number, kcal: number, useMinutes: number,
  effects: StoreItem['effects'],
): StoreItem => Object.freeze({
  id, name, brand: '玛格咖啡馆', tier: 'standard', category: 'drink', price, packSize: 1,
  purchaseUnit: '杯', useUnit: '杯', kcal, useMinutes, effects: Object.freeze(effects),
});

interface CafeDrink {
  readonly item: StoreItem;
  readonly description: string;
}

const menuDrinks: readonly CafeDrink[] = Object.freeze([
  { item: drink('cafe-espresso', '意式浓缩', 280, 5, 3, { energy: 16, satiety: 0, stress: -2, health: 0 }), description: '短而浓的一啜，苦香停在舌尖。' },
  { item: drink('cafe-americano', '美式咖啡', 320, 8, 5, { energy: 18, satiety: 0, stress: -3, health: 0, morale: 3 }), description: '浓缩加热水，干净，不甜。' },
  { item: drink('cafe-latte', '热拿铁', 440, 150, 8, { energy: 15, satiety: 6, stress: -5, health: 0, morale: 5 }), description: '牛奶裹住浓缩，入口绵软。' },
  { item: drink('cafe-cappuccino', '卡布奇诺', 420, 120, 8, { energy: 15, satiety: 4, stress: -4, health: 0, morale: 5 }), description: '奶泡厚一点，可可粉只撒薄薄一层。' },
  { item: drink('cafe-mocha', '摩卡', 480, 220, 8, { energy: 16, satiety: 8, stress: -5, health: 0, morale: 6 }), description: '巧克力和浓缩缠在一起，甜而不腻。' },
  { item: drink('cafe-pourover', '手冲咖啡', 520, 10, 6, { energy: 18, satiety: 0, stress: -4, health: 0, morale: 4 }), description: '现磨现滤，花香比苦味先到。' },
  { item: drink('cafe-single-origin', '单品手冲', 580, 10, 6, { energy: 18, satiety: 0, stress: -4, health: 0, morale: 6 }), description: '当天一只产地的豆子，单独冲一杯。' },
  { item: drink('cafe-matcha-latte', '抹茶拿铁', 460, 160, 8, { energy: 14, satiety: 6, stress: -5, health: 0, morale: 6 }), description: '抹茶打进热牛奶，苦底还在。' },
]);

const specialPool: readonly CafeDrink[] = Object.freeze([
  { item: drink('cafe-special-citrus', '柑橘冷萃', CAFE_DAILY_SPECIAL_PRICE, 40, 5, { energy: 16, satiety: 1, stress: -4, health: 0, morale: 5 }), description: '果皮香盖过苦味，冰过之后更干净。' },
  { item: drink('cafe-special-brown-sugar', '黑糖脏咖', CAFE_DAILY_SPECIAL_PRICE, 180, 6, { energy: 16, satiety: 7, stress: -5, health: 0, morale: 6 }), description: '黑糖浆沉在杯底，搅开才甜。' },
  { item: drink('cafe-special-osmanthus', '桂花拿铁', CAFE_DAILY_SPECIAL_PRICE, 160, 8, { energy: 14, satiety: 6, stress: -6, health: 0, morale: 7 }), description: '桂花很轻，牛奶把边角磨圆。' },
  { item: drink('cafe-special-charcoal', '炭烧拿铁', CAFE_DAILY_SPECIAL_PRICE, 150, 8, { energy: 16, satiety: 6, stress: -4, health: 0, morale: 4 }), description: '豆子烘得更深，焦香停得住。' },
  { item: drink('cafe-special-sea-salt', '海盐奶油拿铁', CAFE_DAILY_SPECIAL_PRICE, 190, 8, { energy: 15, satiety: 7, stress: -5, health: 0, morale: 6 }), description: '咸味只在第一口，后面是奶。' },
  { item: drink('cafe-special-rose', '玫瑰乌龙拿铁', CAFE_DAILY_SPECIAL_PRICE, 150, 8, { energy: 12, satiety: 5, stress: -6, health: 0, morale: 7 }), description: '花香盖过茶底，适合慢慢喝。' },
]);

const emmaDrink: CafeDrink = {
  item: drink(CAFE_EMMA_DRINK_ID, '粉樱热可可', 380, 210, 8, { energy: 12, satiety: 8, stress: -8, health: 0, morale: 8 }),
  description: '热牛奶里化开一点樱粉色的可可，甜度压得很低。',
};

/** Spoken only when this cup is actually handed to Emma. */
export const EMMA_CAFE_SERVING_TEXT = '玛格把一杯粉色的热可可推到艾玛面前，杯沿只留了一小圈奶泡。|宝生玛格|开心|菜单上没有这杯。甜度我压过了，别告诉别人我偏心。|';

export const cafeSpecialIds: ReadonlySet<string> = new Set(specialPool.map(drink => drink.item.id));

/** Cups that can sit in a backpack. The daily slot itself is not an item. */
export function cafeInventoryItems(): readonly StoreItem[] {
  return [...menuDrinks, ...specialPool, emmaDrink].map(drink => drink.item);
}

export function atMargoCafe(state: Pick<WorldState, 'locationId' | 'interior'>): boolean {
  if (state.interior && state.interior.roomId !== MARGO_CAFE_ROOM_ID) return false;
  return state.locationId === MARGO_CAFE_LOCATION_ID || state.locationId === MARGO_CAFE_ROOM_ID;
}

function hash(seed: string): number {
  let sample = 2166136261;
  for (const letter of seed) sample = Math.imul(sample ^ letter.charCodeAt(0), 16777619);
  return sample >>> 0;
}

/** Same save seed and game day always pick the same cup. */
export function dailySpecialDrink(state: Pick<WorldState, 'clock' | 'scene'>): CafeDrink {
  const seed = state.scene?.seed ?? 'novel-world-v1';
  return specialPool[hash(`${seed}:margo-cafe-special:${state.clock.day}`) % specialPool.length]!;
}

export function cafeOwner(state: WorldState): ProtagonistId {
  return state.protagonists?.accounts.active ?? 'soyo';
}

function specialBoughtToday(state: WorldState, owner: ProtagonistId): boolean {
  return state.margoCafeDaily?.specials?.some(row => row.owner === owner && row.day === state.clock.day) ?? false;
}

export interface CafeMenuEntry {
  purchaseId: string;
  itemId: string;
  name: string;
  description: string;
  price: number;
  kind: 'drink' | 'daily' | 'emma';
  soldOut: boolean;
  blockedReason: string | null;
}

export interface CafePurchaseQuote {
  recognized: boolean;
  item: StoreItem | null;
  quantity: number;
  totalPrice: number;
  unitsAdded: number;
  blockedReason: string | null;
  kind: 'drink' | 'daily' | 'emma' | null;
  journal: string;
}

function closedReason(): string {
  return '咖啡馆还没开门，营业时间是 10:00 到次日 02:00。';
}

export function getCafeMenu(state: WorldState, owner = cafeOwner(state)): readonly CafeMenuEntry[] {
  const rows: CafeMenuEntry[] = menuDrinks.map(drink => {
    const quote = getCafePurchaseQuote(state, drink.item.id, 1, owner);
    return {
      purchaseId: drink.item.id, itemId: drink.item.id, name: drink.item.name, description: drink.description,
      price: drink.item.price, kind: 'drink', soldOut: false, blockedReason: quote.blockedReason,
    };
  });
  const special = dailySpecialDrink(state);
  const specialQuote = getCafePurchaseQuote(state, CAFE_DAILY_SPECIAL_ID, 1, owner);
  const soldOut = specialBoughtToday(state, owner);
  rows.push({
    purchaseId: CAFE_DAILY_SPECIAL_ID, itemId: special.item.id, name: special.item.name, description: special.description,
    price: CAFE_DAILY_SPECIAL_PRICE, kind: 'daily', soldOut, blockedReason: specialQuote.blockedReason,
  });
  if (owner === 'emma') {
    const quote = getCafePurchaseQuote(state, CAFE_EMMA_DRINK_ID, 1, owner);
    rows.push({
      purchaseId: emmaDrink.item.id, itemId: emmaDrink.item.id, name: emmaDrink.item.name, description: emmaDrink.description,
      price: emmaDrink.item.price, kind: 'emma', soldOut: false, blockedReason: quote.blockedReason,
    });
  }
  return rows;
}

/** Story buy may name a visible cup. Hidden flavors and Emma's cup stay off other people's orders. */
export function isCafeStoryItem(state: WorldState, itemId: string): boolean {
  if (menuDrinks.some(drink => drink.item.id === itemId) || itemId === CAFE_DAILY_SPECIAL_ID) return true;
  return itemId === CAFE_EMMA_DRINK_ID && cafeOwner(state) === 'emma';
}

export function getCafePurchaseQuote(state: WorldState, itemId: string, quantity = 1, owner = cafeOwner(state)): CafePurchaseQuote {
  const daily = itemId === CAFE_DAILY_SPECIAL_ID;
  const emma = itemId === CAFE_EMMA_DRINK_ID;
  const listed = menuDrinks.find(drink => drink.item.id === itemId) ?? null;
  const recognized = daily || emma || !!listed;
  const empty: CafePurchaseQuote = { recognized, item: null, quantity, totalPrice: 0, unitsAdded: 0, blockedReason: null, kind: null, journal: '' };
  if (!recognized) return { ...empty, recognized: false, blockedReason: '不存在的商品。' };
  if (emma && owner !== 'emma') return { ...empty, blockedReason: '这杯不在菜单上。' };
  const drink = daily ? dailySpecialDrink(state) : emma ? emmaDrink : listed!;
  const kind = daily ? 'daily' : emma ? 'emma' : 'drink';
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_PURCHASE_QUANTITY;
  const units = daily ? (quantity === 1 ? 1 : 0) : validQuantity ? quantity : 0;
  const totalPrice = units ? drink.item.price * units : 0;
  const owned = state.inventory.find(entry => entry.itemId === drink.item.id)?.quantity ?? 0;
  let blockedReason: string | null = null;
  if (daily && quantity !== 1) blockedReason = '每日特调一次只能买一杯。';
  else if (!daily && !validQuantity) blockedReason = `购买数量必须是 1–${MAX_PURCHASE_QUANTITY} 的整数。`;
  else if (!atMargoCafe(state)) blockedReason = '请先到玛格咖啡馆再点单。';
  else if (!isMargoCafeOpen(state.clock)) blockedReason = closedReason();
  else if (daily && specialBoughtToday(state, owner)) blockedReason = '今日特调已经卖完了。';
  else if (owned + units > INVENTORY_ITEM_LIMIT) blockedReason = `每种商品最多保存 ${INVENTORY_ITEM_LIMIT} 个使用单位。`;
  else if (state.player.balance < totalPrice) blockedReason = `余额不足，这杯需要 ${totalPrice} 日元。`;
  const journal = kind === 'emma'
    ? `在玛格咖啡馆买下${drink.item.name}，支付 ${totalPrice} 日元，已放入背包。`
    : kind === 'daily'
      ? `购买今日特调「${drink.item.name}」1 杯，支付 ${totalPrice} 日元；背包增加 1 杯。`
      : `购买${drink.item.name} ${units} ${drink.item.purchaseUnit}，支付 ${totalPrice} 日元；背包增加 ${units} ${drink.item.useUnit}。`;
  return { recognized: true, item: drink.item, quantity: units || quantity, totalPrice, unitsAdded: units, blockedReason, kind, journal };
}

/** Remember today's special for this protagonist without dropping gift receipts. */
export function rememberCafeSpecial(state: WorldState, owner: ProtagonistId, itemId: string): void {
  const prior = state.margoCafeDaily;
  const specials = [...(prior?.specials ?? []).filter(row => row.owner !== owner), { owner, day: state.clock.day, itemId }];
  state.margoCafeDaily = {
    version: 1,
    receipts: prior?.receipts ? prior.receipts.map(row => ({ ...row })) : [],
    ...(prior?.pending ? { pending: { ...prior.pending } } : {}),
    specials,
  };
}
