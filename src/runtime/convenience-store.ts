import type { PlayerState, WorldState } from '../frontend/types';
import { adjustEnergy, energyDifference } from './energy';
import { locationServiceCatalog } from './location-services';

export interface StoreItem {
  readonly id: string;
  readonly name: string;
  readonly brand: string;
  readonly tier: 'basic' | 'standard' | 'premium';
  readonly category: 'meal' | 'snack' | 'drink' | 'cigarette' | 'medicine';
  readonly price: number;
  readonly packSize: number;
  readonly purchaseUnit: string;
  readonly useUnit: string;
  readonly kcal: number;
  readonly useMinutes: number;
  readonly effects: Readonly<{ energy: number; satiety: number; stress: number; health: number; morale?: number }>;
}

/** Fictional products and game effects, per single use. Prices are per package. */
export const storeCatalog: readonly StoreItem[] = Object.freeze([
  { id: 'meal-basic', name: '家常饭团', brand: '晨巷', tier: 'basic', category: 'meal', price: 160, packSize: 1, purchaseUnit: '份', useUnit: '份', kcal: 350, useMinutes: 10, effects: { energy: 18, satiety: 25, stress: -3, health: 0 } },
  { id: 'meal-standard', name: '鸡肉便当', brand: '晴盒', tier: 'standard', category: 'meal', price: 360, packSize: 1, purchaseUnit: '份', useUnit: '份', kcal: 650, useMinutes: 15, effects: { energy: 30, satiety: 45, stress: -6, health: 2 } },
  { id: 'meal-premium', name: '鲜蔬双拼饭', brand: '禾序', tier: 'premium', category: 'meal', price: 640, packSize: 1, purchaseUnit: '份', useUnit: '份', kcal: 720, useMinutes: 20, effects: { energy: 38, satiety: 55, stress: -10, health: 4 } },
  { id: 'snack-basic', name: '脆盐饼干', brand: '小咔', tier: 'basic', category: 'snack', price: 80, packSize: 1, purchaseUnit: '包', useUnit: '包', kcal: 180, useMinutes: 3, effects: { energy: 8, satiety: 10, stress: -3, health: -1 } },
  { id: 'snack-standard', name: '可可夹心棒', brand: '可谷', tier: 'standard', category: 'snack', price: 180, packSize: 1, purchaseUnit: '包', useUnit: '包', kcal: 240, useMinutes: 4, effects: { energy: 14, satiety: 15, stress: -7, health: 0 } },
  { id: 'snack-premium', name: '混合坚果', brand: '林拾', tier: 'premium', category: 'snack', price: 320, packSize: 1, purchaseUnit: '包', useUnit: '包', kcal: 300, useMinutes: 5, effects: { energy: 20, satiety: 20, stress: -8, health: 2 } },
  { id: 'drink-basic', name: '柠檬汽水', brand: '泡晴', tier: 'basic', category: 'drink', price: 60, packSize: 1, purchaseUnit: '瓶', useUnit: '瓶', kcal: 120, useMinutes: 2, effects: { energy: 8, satiety: 2, stress: -4, health: -1 } },
  { id: 'drink-standard', name: '原味酸奶', brand: '白牧', tier: 'standard', category: 'drink', price: 160, packSize: 1, purchaseUnit: '瓶', useUnit: '瓶', kcal: 180, useMinutes: 3, effects: { energy: 15, satiety: 8, stress: -5, health: 1 } },
  { id: 'drink-premium', name: '谷物鲜乳', brand: '禾沐', tier: 'premium', category: 'drink', price: 280, packSize: 1, purchaseUnit: '瓶', useUnit: '瓶', kcal: 240, useMinutes: 4, effects: { energy: 22, satiety: 12, stress: -7, health: 2 } },
  { id: 'cigarette-basic', name: '灰桥香烟', brand: '灰桥', tier: 'basic', category: 'cigarette', price: 500, packSize: 20, purchaseUnit: '盒', useUnit: '支', kcal: 0, useMinutes: 5, effects: { energy: 25, satiety: 0, stress: -20, health: -8 } },
  { id: 'cigarette-standard', name: '夜渡香烟', brand: '夜渡', tier: 'standard', category: 'cigarette', price: 1000, packSize: 20, purchaseUnit: '盒', useUnit: '支', kcal: 0, useMinutes: 5, effects: { energy: 35, satiety: 0, stress: -30, health: -6 } },
  { id: 'cigarette-premium', name: '青屿香烟', brand: '青屿', tier: 'premium', category: 'cigarette', price: 1800, packSize: 20, purchaseUnit: '盒', useUnit: '支', kcal: 0, useMinutes: 5, effects: { energy: 40, satiety: 0, stress: -35, health: -8 } },
  { id: 'medicine-cold', name: '感冒退热颗粒', brand: '仁和堂', tier: 'standard', category: 'medicine', price: 480, packSize: 3, purchaseUnit: '盒', useUnit: '袋', kcal: 15, useMinutes: 3, effects: { energy: 12, health: 25, stress: -5, satiety: 0, morale: 5 } },
  { id: 'medicine-gastro', name: '温和健胃整肠片', brand: '健宁', tier: 'standard', category: 'medicine', price: 420, packSize: 4, purchaseUnit: '盒', useUnit: '片', kcal: 20, useMinutes: 3, effects: { energy: 10, health: 20, satiety: 15, stress: -6, morale: 4 } },
  { id: 'medicine-soothe', name: '草本安神舒压水', brand: '清心堂', tier: 'standard', category: 'medicine', price: 560, packSize: 1, purchaseUnit: '瓶', useUnit: '瓶', kcal: 25, useMinutes: 4, effects: { energy: 8, health: 10, stress: -35, satiety: 0, morale: 25 } },
  { id: 'medicine-vitality', name: '医用营养机能饮', brand: '力维他', tier: 'standard', category: 'medicine', price: 320, packSize: 1, purchaseUnit: '瓶', useUnit: '瓶', kcal: 150, useMinutes: 2, effects: { energy: 28, health: 15, stress: -8, satiety: 8, morale: 6 } },
].map(item => Object.freeze({ ...item, effects: Object.freeze(item.effects) })) as StoreItem[]);

export const MAX_PURCHASE_QUANTITY = 20;
export const INVENTORY_ITEM_LIMIT = 999;
export const PACKAGING_FEE = 40;
export const initialPlayerNeeds = Object.freeze({ health: 90, stress: 25, satiety: 70, foodEnergy: 1200, morale: 70 });

export function getStoreItem(itemId: string): StoreItem | null {
  return getInventoryCatalog().find(item => item.id === itemId) ?? null;
}

const takeawayProducts = [
  { serviceId: 'drink-coffee', name: '打包美式咖啡', category: 'drink', unit: '杯' },
  { serviceId: 'drink-latte', name: '打包拿铁', category: 'drink', unit: '杯' },
  { serviceId: 'drink-tea', name: '打包热茶', category: 'drink', unit: '杯' },
  { serviceId: 'eat-dessert', name: '打包甜点', category: 'snack', unit: '份' },
  { serviceId: 'eat-meal', name: '打包简餐', category: 'meal', unit: '份' },
  { serviceId: 'eat-noodles', name: '打包热汤面', category: 'meal', unit: '份' },
] as const;

/** Derive packaged food from the service facts; buying it never consumes it. */
export function getServiceTakeawayItem(serviceId: string): StoreItem | null {
  const product = takeawayProducts.find(item => item.serviceId === serviceId);
  const service = product && locationServiceCatalog.find(item => item.id === serviceId);
  if (!product || !service) return null;
  return { id: `takeaway-${service.id}`, name: product.name, brand: '现制餐饮', tier: 'standard', category: product.category,
    price: service.price, packSize: 1, purchaseUnit: product.unit, useUnit: product.unit, kcal: service.effects.foodEnergy,
    useMinutes: service.minutes, effects: { energy: service.effects.energy, satiety: service.effects.satiety,
      stress: service.effects.stress, health: service.effects.health, morale: service.effects.morale } };
}

export function getInventoryCatalog(): readonly StoreItem[] {
  return [...storeCatalog, ...takeawayProducts.map(product => getServiceTakeawayItem(product.serviceId)!)];
}

export function getStoreAvailability(state: Pick<WorldState, 'locationId' | 'interior'>) {
  const available = state.locationId === 'convenience' && !state.interior;
  return { available, blockedReason: available ? null : '请先到达便利店门前再购买。' };
}

export function getPurchaseQuote(state: WorldState, itemId: string, quantity = 1) {
  const item = storeCatalog.find(item => item.id === itemId) ?? null;
  const owned = state.inventory.find(entry => entry.itemId === itemId)?.quantity ?? 0;
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_PURCHASE_QUANTITY;
  const totalPrice = item && validQuantity ? item.price * quantity : 0;
  const unitsAdded = item && validQuantity ? item.packSize * quantity : 0;
  let blockedReason = !item ? '不存在的商品。' : !validQuantity ? `购买数量必须是 1–${MAX_PURCHASE_QUANTITY} 的整数。` : getStoreAvailability(state).blockedReason;
  if (!blockedReason && owned + unitsAdded > INVENTORY_ITEM_LIMIT) blockedReason = `每种商品最多保存 ${INVENTORY_ITEM_LIMIT} 个使用单位。`;
  if (!blockedReason && state.player.balance < totalPrice) blockedReason = '余额不足，无法购买这些商品。';
  return { item, quantity, totalPrice, unitsAdded, owned, blockedReason };
}

export function getPackItemQuote(state: WorldState, itemId: string, quantity = 1) {
  const quote = getPurchaseQuote(state, itemId, quantity);
  const packagingFee = Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_PURCHASE_QUANTITY ? quantity * PACKAGING_FEE : 0;
  const totalPrice = quote.totalPrice + packagingFee;
  let blockedReason = quote.blockedReason;
  if (quote.item?.category === 'cigarette') blockedReason = '只有食物和饮品提供加价打包。';
  if (!blockedReason && state.player.balance < totalPrice) blockedReason = `余额不足，含打包费共需 ${totalPrice} 元。`;
  return { ...quote, packagingFee, totalPrice, blockedReason };
}

/** Absolute quarter-hour boundaries make hunger independent of action splitting. */
export function advancePlayerNutrition(player: PlayerState, clock: WorldState['clock'], minutes: number): PlayerState {
  const before = clock.day * 1440 + clock.hour * 60 + clock.minute;
  const hunger = Math.floor((before + minutes) / 15) - Math.floor(before / 15);
  return { ...player, foodEnergy: Math.max(0, player.foodEnergy - minutes * 2), satiety: Math.max(0, player.satiety - hunger) };
}

export function getUseItemQuote(state: WorldState, itemId: string) {
  const item = getStoreItem(itemId);
  const owned = state.inventory.find(entry => entry.itemId === itemId)?.quantity ?? 0;
  const minutes = item?.useMinutes ?? 0;
  let blockedReason = !item ? '不存在的商品。' : owned < 1 ? '背包里没有这件商品。' : null;
  if (!blockedReason && item && state.player.health < -item.effects.health) blockedReason = '健康不足，请先恢复健康再使用这件商品。';
  const endDay = state.clock.day + Math.floor((state.clock.hour * 60 + state.clock.minute + minutes) / 1440);
  if (!blockedReason && endDay > 365000) blockedReason = '已到达最大天数，无法继续推进。';
  const playerAfter = blockedReason ? { ...state.player } : advancePlayerNutrition(state.player, state.clock, minutes);
  if (item && !blockedReason) {
    playerAfter.energy = adjustEnergy(playerAfter.energy, item.effects.energy);
    for (const key of ['health', 'stress', 'satiety'] as const) playerAfter[key] = Math.min(100, Math.max(0, playerAfter[key] + item.effects[key]));
    playerAfter.morale = Math.min(100, Math.max(0, playerAfter.morale + (item.effects.morale ?? 0)));
    playerAfter.foodEnergy = Math.min(3000, playerAfter.foodEnergy + item.kcal);
  }
  const changes = { energy: energyDifference(playerAfter.energy, state.player.energy), health: playerAfter.health - state.player.health,
    ...(item?.effects.morale !== undefined ? { morale: playerAfter.morale - state.player.morale } : {}),
    stress: playerAfter.stress - state.player.stress, satiety: playerAfter.satiety - state.player.satiety, foodEnergy: playerAfter.foodEnergy - state.player.foodEnergy };
  return { item, owned, minutes, playerAfter, changes, blockedReason };
}
