import type { PlayerState, WorldState } from '../frontend/types';
import { advancePlayerNutrition, getServiceTakeawayItem, INVENTORY_ITEM_LIMIT, MAX_PURCHASE_QUANTITY, PACKAGING_FEE } from './convenience-store';
import { adjustEnergy, energyDifference, energyUnits } from './energy';

import { cafeServiceLocation, MARGO_CAFE_ROOM_ID } from './margo-cafe-venue';
import { getIllnessDebuffs } from './illness';

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
  { locationId: 'street-cafe', label: '玛格咖啡馆', hoursLabel: '10:00–次日 02:00', opens: 10 * 60, closes: 2 * 60, outdoor: false, description: '宝生玛格经营的街边咖啡馆营业到次日凌晨两点，提供咖啡、茶与当日甜点；可在露台享用，也可从店门进入馆内。' },
  { locationId: 'commercial', label: '城市商业区', hoursLabel: '10:00–22:00', opens: 10 * 60, closes: 22 * 60, outdoor: false, description: '商业街的外带餐点窗口供应简餐和热汤面，取餐后在街边用餐区吃完。' },
  { locationId: 'grand-commercial', label: '大型商业区', hoursLabel: '10:00–23:00', opens: 10 * 60, closes: 23 * 60, outdoor: false, description: '大型商业娱乐区的室外步行广场，连接 Live House、KTV 包厢与商业中心。' },
  { locationId: 'legal-office', label: '枫庭律师事务所', hoursLabel: '09:00–18:00', opens: 9 * 60, closes: 18 * 60, outdoor: false, description: '律所接待区摆着案件卷宗、证物清单和通往模拟质证室的走廊；实务案件由持证律师负责，见习人员在指导下调查和研究证据。' },
  { locationId: 'construction-site', label: '建设工地', hoursLabel: '07:00–18:00', opens: 7 * 60, closes: 18 * 60, outdoor: true, description: '围挡内的建设工地正在招临时工。现场备有安全帽与工作手套，可以接短班清理场地，也可以接长班搬运建材。收工后结算工资。' },
  { locationId: 'sports', label: '运动场', hoursLabel: '06:00–22:00', opens: 6 * 60, closes: 22 * 60, outdoor: true, description: '在室外跑道慢跑，或在场边做拉伸；运动会消耗精力并改善游戏中的身心状态。' },
  { locationId: 'pocket-park', label: '口袋公园', hoursLabel: '全天开放', opens: null, closes: null, outdoor: true, description: '可以在长椅上小憩，或沿着公园步道散步。' },
  { locationId: 'city-park', label: '城市公园', hoursLabel: '全天开放', opens: null, closes: null, outdoor: true, description: '可以在树荫下的长椅小憩，也可以沿公园步道散步。' },
  { locationId: 'promenade', label: '林荫步道', hoursLabel: '全天开放', opens: null, closes: null, outdoor: true, description: '沿现有林荫步道散步，花一点时间放松心情。' },
  { locationId: 'bookshop', label: '街角书店', hoursLabel: '09:00–22:00', opens: 9 * 60, closes: 22 * 60, outdoor: false, description: '营业时可在门前书摊选书阅读，沿用学科阅读入口和学习结算。' },
  { locationId: 'convenience', label: '便利店', hoursLabel: '24 小时营业', opens: null, closes: null, outdoor: false, description: '全天可从便利店货架购买商品；购买后进入背包，再从背包使用。' },
];

export function getLocationStatus(locationId: string, clock: WorldState['clock']): LocationStatus | null {
  const venue = venues.find(item => item.locationId === cafeServiceLocation(locationId));
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
  /** Earned only after the full shift, never billed as a negative price. */
  readonly payout?: number;
  readonly effects: Readonly<LocationServiceEffects>;
}

const effects = (changes: Partial<LocationServiceEffects>): Readonly<LocationServiceEffects> => Object.freeze({
  energy: 0, morale: 0, health: 0, stress: 0, satiety: 0, foodEnergy: 0, ...changes,
});

/** One action pays, spends time, and consumes the service; no inventory is created. */
export const locationServiceCatalog: readonly LocationService[] = Object.freeze([
  { id: 'drink-coffee', locationIds: ['cafe', 'street-cafe'], label: '喝美式咖啡', description: '点一杯美式咖啡，坐下喝完。', minutes: 10, price: 320, effects: effects({ energy: 18, morale: 3, stress: -3, foodEnergy: 10 }) },
  { id: 'drink-latte', locationIds: ['cafe', 'street-cafe'], label: '喝拿铁', description: '点一杯拿铁，坐下慢慢喝完。', minutes: 15, price: 440, effects: effects({ energy: 15, morale: 5, stress: -5, satiety: 6, foodEnergy: 150 }) },
  { id: 'drink-tea', locationIds: ['cafe', 'street-cafe'], label: '喝热茶', description: '点一杯热茶，坐下歇一会儿。', minutes: 10, price: 240, effects: effects({ energy: 8, morale: 5, stress: -5 }) },
  { id: 'eat-dessert', locationIds: ['cafe', 'street-cafe'], label: '吃一份甜点', description: '点一份当日甜点，坐下吃完。', minutes: 15, price: 360, effects: effects({ energy: 10, morale: 6, stress: -4, satiety: 12, foodEnergy: 260 }) },
  { id: 'eat-meal', locationIds: ['commercial'], label: '吃简餐', description: '从沿街餐点窗口取一份饭菜，在街边用餐区吃完。', minutes: 20, price: 360, effects: effects({ energy: 22, morale: 4, health: 1, stress: -4, satiety: 40, foodEnergy: 600 }) },
  { id: 'eat-noodles', locationIds: ['commercial'], label: '吃热汤面', description: '从沿街餐点窗口取一碗热汤面，在街边用餐区吃完。', minutes: 15, price: 300, effects: effects({ energy: 18, morale: 3, stress: -3, satiety: 32, foodEnergy: 480 }) },
  { id: 'eat-mall-meal', locationIds: ['grand-commercial'], label: '吃商场快餐', description: '在商业区美食广场点一份快餐，坐下吃完。', minutes: 20, price: 420, effects: effects({ energy: 24, morale: 5, health: 1, stress: -5, satiety: 45, foodEnergy: 650 }) },
  { id: 'browse-music-store', locationIds: ['grand-commercial'], label: '逛音乐周边店', description: '浏览商业区唱片店的乐器配件与黑胶唱片，放松心情。', minutes: 15, price: 0, effects: effects({ energy: -2, morale: 8, stress: -6 }) },
  { id: 'construction-clear', locationIds: ['construction-site'], label: '清理施工场地', description: '戴好安全帽和手套，清运碎料、整理工具与清扫施工通道。', minutes: 120, price: 0, payout: 3200, effects: effects({ energy: -40, morale: -3, stress: 5 }) },
  { id: 'construction-carry', locationIds: ['construction-site'], label: '搬运建筑材料', description: '跟随现场工人运送木板和成捆建材，完成四小时的重体力班次。', minutes: 240, price: 0, payout: 6800, effects: effects({ energy: -75, morale: -6, stress: 10 }) },
  { id: 'jog', locationIds: ['sports'], label: '慢跑', description: '在室外跑道慢跑一段时间，结束后在场边调整呼吸。', minutes: 20, price: 0, effects: effects({ energy: -10, morale: 8, health: 2, stress: -8 }) },
  { id: 'stretch', locationIds: ['sports'], label: '拉伸', description: '在运动场边做一组轻量拉伸。', minutes: 10, price: 0, effects: effects({ energy: -2, morale: 4, health: 1, stress: -4 }) },
  { id: 'park-rest', locationIds: ['pocket-park', 'city-park'], label: '长椅小憩', description: '在公园长椅坐下休息，活动结束后仍留在公园。', minutes: 20, price: 0, effects: effects({ energy: 6, morale: 8, stress: -8 }) },
  { id: 'take-stroll', locationIds: ['pocket-park', 'city-park', 'promenade'], label: '沿步道散步', description: '沿所在区域的步道慢慢走一段，活动结束后仍留在当前地点。', minutes: 20, price: 0, effects: effects({ energy: -3, morale: 7, health: 1, stress: -6 }) },
  { id: 'clinic-treatment', locationIds: ['commercial', 'grand-commercial', 'pocket-park'], label: '诊所全科问诊', description: '到街区综合全科诊所挂号问诊，进行听诊体检与用药调理。', minutes: 30, price: 1800, effects: effects({ energy: 15, health: 35, stress: -15, satiety: 5, foodEnergy: 100 }) },
  { id: 'campus-infirmary', locationIds: ['sports', 'promenade'], label: '校医室问诊检查', description: '到校园保健室测量体温与血压，领取基础常用药品并安静休息。', minutes: 20, price: 450, effects: effects({ energy: 10, health: 25, stress: -10 }) },
].map(service => Object.freeze({ ...service, locationIds: Object.freeze(service.locationIds) })));

export function getLocationServices(state: Pick<WorldState, 'locationId' | 'interior'>): readonly LocationService[] {
  return state.interior && state.interior.roomId !== MARGO_CAFE_ROOM_ID ? []
    : locationServiceCatalog.filter(service => service.locationIds.includes(cafeServiceLocation(state.locationId)));
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
      : !getLocationServices(state).some(entry => entry.id === serviceId) ? '当前地点不提供这份餐点，请先到达对应地点。'
        : !status || !status.isOpen ? '当前店铺已打烊，无法打包。' : null;
  if (!blockedReason && owned + unitsAdded > INVENTORY_ITEM_LIMIT) blockedReason = `每种商品最多保存 ${INVENTORY_ITEM_LIMIT} 个使用单位。`;
  if (!blockedReason && state.player.balance < totalPrice) blockedReason = `余额不足，含打包费共需 ${totalPrice} 日元。`;
  return { service, item, quantity, packagingFee, totalPrice, unitsAdded, owned, blockedReason };
}

export interface LocationServiceQuote {
  service: LocationService | null;
  minutes: number;
  price: number;
  payout: number;
  playerAfter: PlayerState;
  changes: LocationServiceEffects & { balance: number };
  blockedReason: string | null;
}

/** Preview is pure and shares authored costs, hours and nutrition with commit. */
export function getLocationServiceQuote(state: WorldState, serviceId: string): LocationServiceQuote {
  const service = locationServiceCatalog.find(item => item.id === serviceId) ?? null;
  const minutes = service?.minutes ?? 0;
  const price = service?.price ?? 0;
  const payout = service?.payout ?? 0;
  const status = getLocationStatus(state.locationId, state.clock);
  let blockedReason: string | null = !service ? '不存在的地点活动。'
    : !getLocationServices(state).some(entry => entry.id === serviceId) ? '当前地点不提供这项活动，请先到达对应地点。'
      : !status ? '当前地点没有已设定的开放安排。' : null;
  if (!blockedReason && service?.id === 'construction-carry') {
    const debuffs = getIllnessDebuffs(state.player);
    if (debuffs.prohibitHeavyLabor) {
      blockedReason = debuffs.heavyLaborReason ?? '身体抱恙，无法承担高强度重体力劳动。';
    }
  }
  if (!blockedReason && status && !status.isOpen) blockedReason = `当前${status.label}${status.statusLabel}，开放时间 ${status.hoursLabel}。`;
  if (!blockedReason && status?.minutesUntilClose != null && minutes > status.minutesUntilClose) {
    blockedReason = `距打烊只剩 ${status.minutesUntilClose} 分钟，这项活动需要 ${minutes} 分钟，请下次营业时再来。`;
  }
  if (!blockedReason && state.player.balance < price) blockedReason = `余额不足，这项活动需要 ${price} 日元。`;
  if (!blockedReason && state.player.balance + payout - price > 20_000_000) blockedReason = '余额已接近上限，暂时无法领取这笔工资。';
  if (!blockedReason && service && energyUnits(state.player.energy) < energyUnits(-service.effects.energy)) {
    blockedReason = `精力不足，这项活动需要 ${-service.effects.energy} 点精力。`;
  }
  const endDay = state.clock.day + Math.floor((state.clock.hour * 60 + state.clock.minute + minutes) / 1440);
  if (!blockedReason && endDay > 365000) blockedReason = '已到达最大天数，无法继续推进。';
  const playerAfter = blockedReason ? { ...state.player } : advancePlayerNutrition(state.player, state.clock, minutes);
  if (service && !blockedReason) {
    playerAfter.balance += payout - price;
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
  return { service, minutes, price, payout, playerAfter, changes, blockedReason };
}
