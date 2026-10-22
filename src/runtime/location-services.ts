import type { PlayerState, WorldState } from '../frontend/types';
import { advancePlayerNutrition, getServiceTakeawayItem, INVENTORY_ITEM_LIMIT, MAX_PURCHASE_QUANTITY, PACKAGING_FEE } from './convenience-store';
import { adjustEnergy, energyDifference, energyUnits } from './energy';

export interface LocationStatus {
  locationId: string;
  label: string;
  hoursLabel: string;
  isOpen: boolean;
  statusLabel: string;
  minutesUntilOpen: number;
  /** Null means continuously open, without an artificial midnight cutoff. */
  minutesUntilClose: number | null;
  description: string;
}

interface Venue {
  locationId: string;
  label: string;
  hoursLabel: string;
  opens: number | null;
  closes: number | null;
  outdoor: boolean;
  description: string;
}

/** Authored prototype hours describe services at an existing outdoor location. */
const venues: readonly Venue[] = [
  { locationId: 'cafe', label: '街角咖啡店', hoursLabel: '08:00–22:00', opens: 8 * 60, closes: 22 * 60, outdoor: false, description: '露台旁设有外带窗口，可点饮品或甜点，在露台享用。' },
  { locationId: 'street-cafe', label: '街边咖啡馆', hoursLabel: '10:00–次日 02:00', opens: 10 * 60, closes: 2 * 60, outdoor: false, description: '沿街外带窗口营业到次日凌晨两点，可点饮品或甜点，在门前座位享用。' },
  { locationId: 'commercial', label: '城市商业区', hoursLabel: '10:00–22:00', opens: 10 * 60, closes: 22 * 60, outdoor: false, description: '商业街的外带餐点窗口供应简餐和热汤面，取餐后在街边用餐区吃完。' },
  { locationId: 'sports', label: '运动场', hoursLabel: '06:00–22:00', opens: 6 * 60, closes: 22 * 60, outdoor: true, description: '在室外跑道慢跑，或在场边做拉伸；运动会消耗精力并改善游戏中的身心状态。' },
  { locationId: 'pocket-park', label: '口袋公园', hoursLabel: '全天开放', opens: null, closes: null, outdoor: true, description: '可以在长椅上小憩，或沿着公园步道散步。' },
  { locationId: 'city-park', label: '城市公园', hoursLabel: '全天开放', opens: null, closes: null, outdoor: true, description: '可以在树荫下的长椅小憩，也可以沿公园步道散步。' },
  { locationId: 'promenade', label: '林荫步道', hoursLabel: '全天开放', opens: null, closes: null, outdoor: true, description: '沿现有林荫步道散步，花一点时间放松心情。' },
  { locationId: 'bookshop', label: '街角书店', hoursLabel: '09:00–22:00', opens: 9 * 60, closes: 22 * 60, outdoor: false, description: '营业时可在门前书摊选书阅读，沿用学科阅读入口和学习结算。' },
  { locationId: 'convenience', label: '便利店', hoursLabel: '24 小时营业', opens: null, closes: null, outdoor: false, description: '全天可从便利店货架购买商品；购买后进入背包，再从背包使用。' },
];

export function getLocationStatus(locationId: string, clock: WorldState['clock']): LocationStatus | null {
  const venue = venues.find(item => item.locationId === locationId);
  if (!venue) return null;
  const minute = clock.hour * 60 + clock.minute;
  const alwaysOpen = venue.opens === null || venue.closes === null;
  const isOpen = alwaysOpen || (venue.opens! < venue.closes!
    ? minute >= venue.opens! && minute < venue.closes!
    : minute >= venue.opens! || minute < venue.closes!);
  return {
    locationId, label: venue.label, hoursLabel: venue.hoursLabel, isOpen,
    statusLabel: isOpen ? (venue.outdoor ? '开放中' : '营业中') : (venue.outdoor ? '未开放' : '休息中'),
    minutesUntilOpen: isOpen ? 0 : (venue.opens! - minute + 1440) % 1440,
    minutesUntilClose: alwaysOpen ? null : isOpen ? (venue.closes! - minute + 1440) % 1440 : 0,
    description: venue.description,
  };
}

export interface LocationServiceEffects {
  energy: number;
  morale: number;
  health: number;
  stress: number;
  satiety: number;
  foodEnergy: number;
}
export interface LocationService {
  readonly id: string;
  readonly locationIds: readonly string[];
  readonly label: string;
  readonly description: string;
  readonly minutes: number;
  readonly price: number;
  readonly effects: Readonly<LocationServiceEffects>;
}

const effects = (changes: Partial<LocationServiceEffects>): Readonly<LocationServiceEffects> => Object.freeze({
  energy: 0, morale: 0, health: 0, stress: 0, satiety: 0, foodEnergy: 0, ...changes,
});

/** One action pays, spends time, and consumes the service; no inventory is created. */
export const locationServiceCatalog: readonly LocationService[] = Object.freeze([
  { id: 'drink-coffee', locationIds: ['cafe', 'street-cafe'], label: '喝美式咖啡', description: '在外带窗口点一杯美式，在室外座位喝完。', minutes: 10, price: 16, effects: effects({ energy: 18, morale: 3, stress: -3, foodEnergy: 10 }) },
  { id: 'drink-latte', locationIds: ['cafe', 'street-cafe'], label: '喝拿铁', description: '在外带窗口点一杯拿铁，在室外座位慢慢喝完。', minutes: 15, price: 22, effects: effects({ energy: 15, morale: 5, stress: -5, satiety: 6, foodEnergy: 150 }) },
  { id: 'drink-tea', locationIds: ['cafe', 'street-cafe'], label: '喝热茶', description: '在外带窗口点一杯热茶，在室外座位歇一会儿。', minutes: 10, price: 12, effects: effects({ energy: 8, morale: 5, stress: -5 }) },
  { id: 'eat-dessert', locationIds: ['cafe', 'street-cafe'], label: '吃一份甜点', description: '在外带窗口取一份当日甜点，在室外座位吃完。', minutes: 15, price: 18, effects: effects({ energy: 10, morale: 6, stress: -4, satiety: 12, foodEnergy: 260 }) },
  { id: 'eat-meal', locationIds: ['commercial'], label: '吃简餐', description: '从沿街餐点窗口取一份饭菜，在街边用餐区吃完。', minutes: 20, price: 18, effects: effects({ energy: 22, morale: 4, health: 1, stress: -4, satiety: 40, foodEnergy: 600 }) },
  { id: 'eat-noodles', locationIds: ['commercial'], label: '吃热汤面', description: '从沿街餐点窗口取一碗热汤面，在街边用餐区吃完。', minutes: 15, price: 15, effects: effects({ energy: 18, morale: 3, stress: -3, satiety: 32, foodEnergy: 480 }) },
  { id: 'jog', locationIds: ['sports'], label: '慢跑', description: '在室外跑道慢跑一段时间，结束后在场边调整呼吸。', minutes: 20, price: 0, effects: effects({ energy: -10, morale: 8, health: 2, stress: -8 }) },
  { id: 'stretch', locationIds: ['sports'], label: '拉伸', description: '在运动场边做一组轻量拉伸。', minutes: 10, price: 0, effects: effects({ energy: -2, morale: 4, health: 1, stress: -4 }) },
  { id: 'park-rest', locationIds: ['pocket-park', 'city-park'], label: '长椅小憩', description: '在公园长椅坐下休息，活动结束后仍留在公园。', minutes: 20, price: 0, effects: effects({ energy: 6, morale: 8, stress: -8 }) },
  { id: 'take-stroll', locationIds: ['pocket-park', 'city-park', 'promenade'], label: '沿步道散步', description: '沿所在区域的步道慢慢走一段，活动结束后仍留在当前地点。', minutes: 20, price: 0, effects: effects({ energy: -3, morale: 7, health: 1, stress: -6 }) },
].map(service => Object.freeze({ ...service, locationIds: Object.freeze(service.locationIds) })));

export function getLocationServices(state: Pick<WorldState, 'locationId' | 'interior'>): readonly LocationService[] {
  return state.interior ? [] : locationServiceCatalog.filter(service => service.locationIds.includes(state.locationId));
}

/** Pay for the portion plus packaging now; nutrition is settled only on later use. */
export function getTakeawayQuote(state: WorldState, serviceId: string, quantity = 1) {
  const service = locationServiceCatalog.find(entry => entry.id === serviceId) ?? null;
  const item = getServiceTakeawayItem(serviceId);
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_PURCHASE_QUANTITY;
  const packagingFee = validQuantity ? quantity * PACKAGING_FEE : 0;
  const totalPrice = item && validQuantity ? item.price * quantity + packagingFee : 0;
  const unitsAdded = item && validQuantity ? quantity : 0;
  const owned = state.inventory.find(entry => entry.itemId === item?.id)?.quantity ?? 0;
  const status = getLocationStatus(state.locationId, state.clock);
  let blockedReason = !service || !item ? '这项活动不提供食物打包。'
    : !validQuantity ? `打包数量必须是 1–${MAX_PURCHASE_QUANTITY} 的整数。`
      : state.interior || !service.locationIds.includes(state.locationId) ? '当前地点不提供这份餐点，请先到达对应地点。'
        : !status || !status.isOpen ? '当前店铺已打烊，无法打包。' : null;
  if (!blockedReason && owned + unitsAdded > INVENTORY_ITEM_LIMIT) blockedReason = `每种商品最多保存 ${INVENTORY_ITEM_LIMIT} 个使用单位。`;
  if (!blockedReason && state.player.balance < totalPrice) blockedReason = `余额不足，含打包费共需 ${totalPrice} 元。`;
  return { service, item, quantity, packagingFee, totalPrice, unitsAdded, owned, blockedReason };
}

export interface LocationServiceQuote {
  service: LocationService | null;
  minutes: number;
  price: number;
  playerAfter: PlayerState;
  changes: LocationServiceEffects & { balance: number };
  blockedReason: string | null;
}

/** Preview is pure and shares authored costs, hours and nutrition with commit. */
export function getLocationServiceQuote(state: WorldState, serviceId: string): LocationServiceQuote {
  const service = locationServiceCatalog.find(item => item.id === serviceId) ?? null;
  const minutes = service?.minutes ?? 0;
  const price = service?.price ?? 0;
  const status = getLocationStatus(state.locationId, state.clock);
  let blockedReason: string | null = !service ? '不存在的地点活动。'
    : state.interior || !service.locationIds.includes(state.locationId) ? '当前地点不提供这项活动，请先到达对应地点。'
      : !status ? '当前地点没有已设定的开放安排。' : null;
  if (!blockedReason && status && !status.isOpen) blockedReason = `当前${status.label}${status.statusLabel}，开放时间 ${status.hoursLabel}。`;
  if (!blockedReason && status?.minutesUntilClose != null && minutes > status.minutesUntilClose) {
    blockedReason = `距打烊只剩 ${status.minutesUntilClose} 分钟，这项活动需要 ${minutes} 分钟，请下次营业时再来。`;
  }
  if (!blockedReason && state.player.balance < price) blockedReason = `余额不足，这项活动需要 ${price} 元。`;
  if (!blockedReason && service && energyUnits(state.player.energy) < energyUnits(-service.effects.energy)) {
    blockedReason = `精力不足，这项活动需要 ${-service.effects.energy} 点精力。`;
  }
  const endDay = state.clock.day + Math.floor((state.clock.hour * 60 + state.clock.minute + minutes) / 1440);
  if (!blockedReason && endDay > 365000) blockedReason = '已到达最大天数，无法继续推进。';
  const playerAfter = blockedReason ? { ...state.player } : advancePlayerNutrition(state.player, state.clock, minutes);
  if (service && !blockedReason) {
    playerAfter.balance -= price;
    playerAfter.energy = adjustEnergy(playerAfter.energy, service.effects.energy);
    for (const key of ['morale', 'health', 'stress', 'satiety'] as const) {
      playerAfter[key] = Math.min(100, Math.max(0, playerAfter[key] + service.effects[key]));
    }
    playerAfter.foodEnergy = Math.min(3000, Math.max(0, playerAfter.foodEnergy + service.effects.foodEnergy));
  }
  const changes = {
    energy: energyDifference(playerAfter.energy, state.player.energy),
    morale: playerAfter.morale - state.player.morale,
    health: playerAfter.health - state.player.health,
    stress: playerAfter.stress - state.player.stress,
    satiety: playerAfter.satiety - state.player.satiety,
    foodEnergy: playerAfter.foodEnergy - state.player.foodEnergy,
    balance: playerAfter.balance - state.player.balance,
  };
  return { service, minutes, price, playerAfter, changes, blockedReason };
}
