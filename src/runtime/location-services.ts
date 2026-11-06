import type { PlayerState, WorldState } from '../frontend/types';
import { advancePlayerNutrition, getServiceTakeawayItem, INVENTORY_ITEM_LIMIT, MAX_PURCHASE_QUANTITY, PACKAGING_FEE } from './convenience-store';
import { adjustEnergy, energyDifference, energyUnits } from './energy';
import { applyOutdoorHealth, exposureSeed, outdoorExertionDrain, outdoorHealthExposure, resolveWeather } from './weather';

import { cafeServiceLocation, MARGO_CAFE_ROOM_ID } from './margo-cafe-venue';
import {
  CIRCLE_CAFE_MENU_IDS, CIRCLE_CAFE_ROOM_ID, CIRCLE_CLOSES, CIRCLE_HOURS_LABEL, CIRCLE_LOCATION_ID,
  CIRCLE_MENU_LOCATION_IDS, CIRCLE_OPENS, CIRCLE_STAFF_NAME, CIRCLE_STUDIO_ROOM_ID,
  circleBorrowedPrice, circleVisitServiceId, isBorrowedLivehouseService, isCircleVenueRoom,
} from './circle-venue';
import { isCircleVisitService, prepareCircleVisitService } from './circle-visit';
import { getIllnessDebuffs } from './illness';
import { hasUsedWeeklyCounseling, activeProtagonistId } from './fengjin-clinic';
import { PRO200_CLAIM_SERVICE_ID, PRO200_RESELL_SERVICE_ID, PRO200_RESALE_YEN, PRO200_GAME_ITEM_ID, pro200ClaimBlocked, californiaLocalClock, isCaliforniaLocalLocation } from './california';
import { isLivehouseVisitService, livehouseBlockedCode, prepareLivehouseService, type LivehouseServiceFacts, type LivehouseBlockedCode } from './livehouse-visit';
import tokyoSandbox from '../../assets/models/unread-city-tokyo-sandbox-data.json';

export const COURT_OBSERVE_ID = 'court-observe';
// The newly imported Tokyo sandbox owns the authored observation details.
const courthouse = tokyoSandbox.landmarks.find(place => place.id === 'courthouse') as {
  services?: { id: string; label: string; minutes: number; price: number;
    energyDelta: number; moraleDelta: number; stressDelta: number; result: string }[];
} | undefined;
const courtObservation = courthouse?.services?.find(service => service.id === COURT_OBSERVE_ID);
if (!courtObservation) throw new Error('东京沙盘缺少法院旁听服务');

export const CONSTRUCTION_BACKEND_JOB_ID = 'construction-backend-recruitment';
// The original 200-yuan pay line is part of the advertisement joke; this shift settles in JPY without conversion.
const CONSTRUCTION_BACKEND_PAY_YEN = 6800;

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
export const venues: readonly Venue[] = [
  { locationId: 'cafe', label: '街角咖啡店', hoursLabel: '08:00–22:00', opens: 8 * 60, closes: 22 * 60, outdoor: false, description: '露台旁设有外带窗口，可点饮品或甜点，在露台享用。' },
  { locationId: 'street-cafe', label: '玛格咖啡馆', hoursLabel: '10:00–次日 02:00', opens: 10 * 60, closes: 2 * 60, outdoor: false, description: '宝生玛格经营的街边咖啡馆营业到次日凌晨两点，提供咖啡、茶与当日甜点；可在露台享用，也可从店门进入馆内。' },
  { locationId: 'commercial', label: '城市商业区', hoursLabel: '10:00–22:00', opens: 10 * 60, closes: 22 * 60, outdoor: false, description: '商业街的外带餐点窗口供应简餐和热汤面，取餐后在街边用餐区吃完。' },
  { locationId: 'grand-commercial', label: '大型商业区', hoursLabel: '10:00–23:00', opens: 10 * 60, closes: 23 * 60, outdoor: false, description: '大型商业娱乐区的室外步行广场，连接 Live House、KTV 包厢与商业中心。' },
  { locationId: 'livehouse', label: 'Live House', hoursLabel: '16:00–23:00', opens: 16 * 60, closes: 23 * 60, outdoor: false, description: '新宿大型商业区里的 Live House。可以买票看排期演出，也可以按小时租练习室。' },
  { locationId: 'takao-mountain', label: '高尾山风景区', hoursLabel: '06:00–21:00', opens: 6 * 60, closes: 21 * 60, outdoor: true, description: '近郊名山自然风景名胜，拥有绿荫登山步道、山顶全景展望台、山间老字号茶屋与山麓天然温泉。' },
  { locationId: 'courthouse', label: '魔女审判最高法庭', hoursLabel: '09:00–17:00', opens: 9 * 60, closes: 17 * 60, outdoor: false, description: '新沙盘中的法庭外广场和东侧公开入口。' },
  { locationId: 'court-hearing', label: '魔女审判最高法庭', hoursLabel: '09:00–17:00', opens: 9 * 60, closes: 17 * 60, outdoor: false, description: '公开旁听席与正式审理共用的法庭。不得干预正在进行的案件。' },
  { locationId: 'legal-office', label: '枫庭律师事务所', hoursLabel: '09:00–18:00', opens: 9 * 60, closes: 18 * 60, outdoor: false, description: '律所接待区摆着案件卷宗、证物清单和通往模拟质证室的走廊；实务案件由持证律师负责，见习人员在指导下调查和研究证据。' },
  { locationId: 'clinic', label: '街区全科诊所', hoursLabel: '08:00–22:00', opens: 8 * 60, closes: 22 * 60, outdoor: false, description: '环境明亮整洁的街区全科门诊，由风堇医生常驻坐诊，提供体征检查、用药调理与每周谈心疏导。' },
  { locationId: 'haneda-airport', label: '东京羽田国际机场', hoursLabel: '全天开放', opens: null, closes: null, outdoor: false, description: '国际航班值机与出发大厅。前往旧金山须先到达机场。' },
  { locationId: 'sfo-airport', label: '旧金山国际机场', hoursLabel: '全天开放', opens: null, closes: null, outdoor: false, description: '国际到达大厅与机场联运站，可前往旧金山或返回羽田。' },
  { locationId: 'california-openai', label: 'OpenAI 办公地点', hoursLabel: '09:00–18:00', opens: 9 * 60, closes: 18 * 60, outdoor: false, description: '访客大厅内设有领取柜台，每位访客每七日可领取一次 Pro200 收藏券。' },
  { locationId: 'california-market', label: '湾区二手交易市场', hoursLabel: '10:00–20:00', opens: 10 * 60, closes: 20 * 60, outdoor: false, description: '本地收藏品市场，欢迎携带 Pro200 收藏券前来交易。' },
  { locationId: 'construction-site', label: '建设工地', hoursLabel: '07:00–18:00', opens: 7 * 60, closes: 18 * 60, outdoor: true, description: '围挡内的建设工地正在招临时工。现场备有安全帽与工作手套，可以接短班清理场地，也可以接长班搬运建材。收工后结算工资。' },
  { locationId: 'sports', label: '运动场', hoursLabel: '06:00–22:00', opens: 6 * 60, closes: 22 * 60, outdoor: true, description: '在室外跑道慢跑，或在场边做拉伸；运动会消耗精力并改善游戏中的身心状态。' },
  { locationId: 'pocket-park', label: '口袋公园', hoursLabel: '全天开放', opens: null, closes: null, outdoor: true, description: '可以在长椅上小憩，或沿着公园步道散步。' },
  { locationId: 'city-park', label: '城市公园', hoursLabel: '全天开放', opens: null, closes: null, outdoor: true, description: '可以在树荫下的长椅小憩，也可以沿公园步道散步。' },
  { locationId: 'promenade', label: '林荫步道', hoursLabel: '全天开放', opens: null, closes: null, outdoor: true, description: '沿现有林荫步道散步，花一点时间放松心情。' },
  { locationId: 'bookshop', label: '街角书店', hoursLabel: '09:00–22:00', opens: 9 * 60, closes: 22 * 60, outdoor: false, description: '营业时可在门前书摊选书阅读，沿用学科阅读入口和学习结算。' },
  { locationId: 'convenience', label: '便利店', hoursLabel: '24 小时营业', opens: null, closes: null, outdoor: false, description: '全天可从便利店货架购买商品；购买后进入背包，再从背包使用。' },
  { locationId: CIRCLE_LOCATION_ID, label: 'CiRCLE 现场屋', hoursLabel: CIRCLE_HOURS_LABEL, opens: CIRCLE_OPENS, closes: CIRCLE_CLOSES, outdoor: false, description: `现场屋门前广场连通一楼咖啡厅与侧翼练团室。咖啡厅由${CIRCLE_STAFF_NAME}接待，可点美式、拿铁和一份甜点。` },
  { locationId: CIRCLE_CAFE_ROOM_ID, label: 'CiRCLE 咖啡厅', hoursLabel: CIRCLE_HOURS_LABEL, opens: CIRCLE_OPENS, closes: CIRCLE_CLOSES, outdoor: false, description: `${CIRCLE_STAFF_NAME}在柜台接待。菜单是美式、拿铁和一份甜点，坐下喝完或吃完。` },
  { locationId: CIRCLE_STUDIO_ROOM_ID, label: 'CiRCLE 练团室', hoursLabel: CIRCLE_HOURS_LABEL, opens: CIRCLE_OPENS, closes: CIRCLE_CLOSES, outdoor: false, description: '侧翼隔音练团室，靠墙放着鼓组、吉他音箱和谱架。' },
];

export function getLocationStatus(locationId: string, clock: WorldState['clock']): LocationStatus | null {
  const venue = venues.find(item => item.locationId === cafeServiceLocation(locationId));
  if (!venue) return null;
  // The world keeps one clock; only venue opening hours use California's local time.
  const local = isCaliforniaLocalLocation(locationId) ? californiaLocalClock(clock) : clock;
  const minute = local.hour * 60 + local.minute;
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
  /** The work is revealed only after the character applies in the location panel. */
  readonly reveal?: string;
  /** Logged after completion, instead of repeating a misleading recruitment advert. */
  readonly completionDescription?: string;
  readonly effects: Readonly<LocationServiceEffects>;
}

const effects = (changes: Partial<LocationServiceEffects>): Readonly<LocationServiceEffects> => Object.freeze({
  energy: 0, morale: 0, health: 0, stress: 0, satiety: 0, foodEnergy: 0, ...changes,
});

/** One action pays, spends time, and consumes the service; no inventory is created. */
const authoredLocationServices: readonly LocationService[] = Object.freeze([
  { id: PRO200_CLAIM_SERVICE_ID, locationIds: ['california-openai'], label: '领取 Pro200 凭证', description: '在访客登记台领取一张 Pro200 收藏券。每人每七日限领一张。', minutes: 15, price: 0, effects: effects({ energy: -1, morale: 3 }) },
  { id: PRO200_RESELL_SERVICE_ID, locationIds: ['california-market'], label: '出售 Pro200 凭证', description: '将背包中的一张 Pro200 收藏券出售给收藏品商人。', minutes: 20, price: 0, payout: PRO200_RESALE_YEN, effects: effects({ energy: -2, morale: 5 }) },
  { id: COURT_OBSERVE_ID, locationIds: ['court-hearing'], label: courtObservation.label,
    description: '在公开旁听席安静观看法庭辩论与证据质证，学习法律程序，不介入正式在审案件。',
    completionDescription: courtObservation.result, minutes: courtObservation.minutes,
    price: courtObservation.price, effects: effects({ energy: courtObservation.energyDelta,
      morale: courtObservation.moraleDelta, stress: courtObservation.stressDelta }) },
  { id: 'drink-coffee', locationIds: ['cafe', 'street-cafe'], label: '喝美式咖啡', description: '点一杯美式咖啡，坐下喝完。', minutes: 10, price: 320, effects: effects({ energy: 18, morale: 3, stress: -3, foodEnergy: 10 }) },
  { id: 'drink-latte', locationIds: ['cafe', 'street-cafe'], label: '喝拿铁', description: '点一杯拿铁，坐下慢慢喝完。', minutes: 15, price: 440, effects: effects({ energy: 15, morale: 5, stress: -5, satiety: 6, foodEnergy: 150 }) },
  { id: 'drink-tea', locationIds: ['cafe', 'street-cafe'], label: '喝热茶', description: '点一杯热茶，坐下歇一会儿。', minutes: 10, price: 240, effects: effects({ energy: 8, morale: 5, stress: -5 }) },
  { id: 'eat-dessert', locationIds: ['cafe', 'street-cafe'], label: '吃一份甜点', description: '点一份当日甜点，坐下吃完。', minutes: 15, price: 360, effects: effects({ energy: 10, morale: 6, stress: -4, satiety: 12, foodEnergy: 260 }) },
  { id: 'eat-meal', locationIds: ['commercial'], label: '吃简餐', description: '从沿街餐点窗口取一份饭菜，在街边用餐区吃完。', minutes: 20, price: 360, effects: effects({ energy: 22, morale: 4, health: 1, stress: -4, satiety: 40, foodEnergy: 600 }) },
  { id: 'eat-noodles', locationIds: ['commercial'], label: '吃热汤面', description: '从沿街餐点窗口取一碗热汤面，在街边用餐区吃完。', minutes: 15, price: 300, effects: effects({ energy: 18, morale: 3, stress: -3, satiety: 32, foodEnergy: 480 }) },
  { id: 'eat-mall-meal', locationIds: ['grand-commercial'], label: '吃商场快餐', description: '在商业区美食广场点一份快餐，坐下吃完。', minutes: 20, price: 420, effects: effects({ energy: 24, morale: 5, health: 1, stress: -5, satiety: 45, foodEnergy: 650 }) },
  { id: 'browse-music-store', locationIds: ['grand-commercial'], label: '逛音乐周边店', description: '浏览商业区唱片店的乐器配件与黑胶唱片，放松心情。', minutes: 15, price: 0, effects: effects({ energy: -2, morale: 8, stress: -6 }) },
  { id: 'livehouse-watch-1800', locationIds: ['livehouse'], label: '看 18:00 的演出', description: '买票看 18:00 这场已经排好的演出。', minutes: 80, price: 2800, effects: effects({ energy: -8, morale: 14, stress: -12, satiety: -4, foodEnergy: -40 }) },
  { id: 'livehouse-watch-1930', locationIds: ['livehouse'], label: '看 19:30 的演出', description: '买票看 19:30 这场已经排好的演出。', minutes: 80, price: 2800, effects: effects({ energy: -8, morale: 14, stress: -12, satiety: -4, foodEnergy: -40 }) },
  { id: 'livehouse-practice-1h', locationIds: ['livehouse'], label: '租练习室一小时', description: '按小时租练习室，一个人练。', minutes: 60, price: 1600, effects: effects({ energy: -8, morale: 3, stress: -4 }) },
  { id: 'livehouse-practice-2h', locationIds: ['livehouse'], label: '租练习室两小时', description: '按小时租练习室，一个人练。', minutes: 120, price: 3000, effects: effects({ energy: -16, morale: 4, stress: -6 }) },
  { id: 'livehouse-practice-1h-band', locationIds: ['livehouse'], label: '和熟人一起练一小时', description: '按小时租练习室，并和愿意来的 MyGO 成员一起练。', minutes: 60, price: 1600, effects: effects({ energy: -8, morale: 3, stress: -4 }) },
  { id: 'livehouse-practice-2h-band', locationIds: ['livehouse'], label: '和熟人一起练两小时', description: '按小时租练习室，并和愿意来的 MyGO 成员一起练。', minutes: 120, price: 3000, effects: effects({ energy: -16, morale: 4, stress: -6 }) },
  { id: 'takao-hiking', locationIds: ['takao-mountain', 'takao-summit'], label: '登山步道健行', description: '沿绿荫葱郁的高尾山自然步道拾级而上。在负氧离子与清凉山风中健行攀登，强身健体、大幅清降压力，让神经彻底放松。', minutes: 50, price: 0, effects: effects({ energy: -20, health: 8, morale: 18, stress: -35, satiety: -15, foodEnergy: -250 }) },
  { id: 'takao-observation', locationIds: ['takao-mountain', 'takao-summit'], label: '山顶观景台眺望', description: '伫立在海拔599米的高尾山顶展望台极目远眺。俯瞰关东平原的壮阔天际线与连绵群山，心胸豁然开朗，治愈烦闷心绪。', minutes: 20, price: 0, effects: effects({ energy: -2, health: 2, morale: 15, stress: -20 }) },
  { id: 'takao-onsen', locationIds: ['takao-mountain', 'takao-onsen'], label: '山麓温泉浸泡', description: '沉浸在高尾山麓温热宜人的天然药汤与露天汤泉中。热气蒸腾间驱散周身寒气与酸痛疲劳，深层调理体虚，舒缓压力。', minutes: 45, price: 850, effects: effects({ energy: 35, health: 25, morale: 20, stress: -40, satiety: -5 }) },
  { id: 'takao-teahouse', locationIds: ['takao-mountain', 'takao-teahouse'], label: '山间茶屋特色餐饮', description: '在半山腰绿意盎然的老字号茶屋落座，享用炭火现烤的热乎三福芝麻团子与现沏高山煎茶。软糯甜润、暖胃舒心，快速补充活动能量。', minutes: 25, price: 460, effects: effects({ energy: 15, health: 5, morale: 12, stress: -15, satiety: 40, foodEnergy: 480 }) },
  { id: 'takao-cablecar', locationIds: ['takao-mountain'], label: '登山索道观光', description: '乘坐复古索道缆车从山麓直升半山腰，隔着林海俯瞰峡谷青翠景观，省去大段爬坡体能消耗，惬意饱览山川风貌。', minutes: 15, price: 490, effects: effects({ energy: 5, health: 1, morale: 10, stress: -12 }) },
  { id: 'construction-clear', locationIds: ['construction-site'], label: '清理施工场地', description: '戴好安全帽和手套，清运碎料、整理工具与清扫施工通道。', minutes: 120, price: 0, payout: 3200, effects: effects({ energy: -40, morale: -3, stress: 5 }) },
  { id: 'construction-carry', locationIds: ['construction-site'], label: '搬运建筑材料', description: '跟随现场工人运送木板和成捆建材，完成四小时的重体力班次。', minutes: 240, price: 0, payout: 6800, effects: effects({ energy: -75, morale: -6, stress: 10 }) },
  {
    id: CONSTRUCTION_BACKEND_JOB_ID, locationIds: ['construction-site'],
    label: '急聘后端开发工程师（两名）',
    description: [
      '有偿急聘两名后端开发人员！',
      '技术要求：熟悉 Java、Python、Go、Node.js 等主流语言者优先；',
      '熟悉 Spring Boot、Django、Gin，高并发、分布式系统、微服务、数据库优化和缓存设计者优先；',
      '掌握 Docker、Kubernetes、CI/CD 工具链者优先；',
      '会 Rust 或有区块链开发经验，工资双倍！',
      '工作条件：当天不用带电脑。'
    ].join('\n'),
    reveal: `工头把你领到卡车后端，掀开篷布：“后端开发，就是从车后端开始干活！4900 袋水泥，等着卸车！”他晃了晃那张还写着“200 元/人”“Rust 或区块链经验工资双倍”的招工单，又递来现场工单：本班四小时，每人实领 ${CONSTRUCTION_BACKEND_PAY_YEN} 日元。要接下这班吗？`,
    completionDescription: '原以为是写程序，到了车尾才发现要卸 4900 袋水泥。你戴好安全帽，与工友们忙完了一整个卸货班次。',
    minutes: 240, price: 0, payout: CONSTRUCTION_BACKEND_PAY_YEN,
    effects: effects({ energy: -75, morale: -6, stress: 10 }),
  },
  { id: 'jog', locationIds: ['sports'], label: '慢跑', description: '在室外跑道慢跑一段时间，结束后在场边调整呼吸。', minutes: 20, price: 0, effects: effects({ energy: -10, morale: 8, health: 2, stress: -8 }) },
  { id: 'stretch', locationIds: ['sports'], label: '拉伸', description: '在运动场边做一组轻量拉伸。', minutes: 10, price: 0, effects: effects({ energy: -2, morale: 4, health: 1, stress: -4 }) },
  { id: 'park-rest', locationIds: ['pocket-park', 'city-park'], label: '长椅小憩', description: '在公园长椅坐下休息，活动结束后仍留在公园。', minutes: 20, price: 0, effects: effects({ energy: 6, morale: 8, stress: -8 }) },
  { id: 'take-stroll', locationIds: ['pocket-park', 'city-park', 'promenade'], label: '沿步道散步', description: '沿所在区域的步道慢慢走一段，活动结束后仍留在当前地点。', minutes: 20, price: 0, effects: effects({ energy: -3, morale: 7, health: 1, stress: -6 }) },
  { id: 'clinic-treatment', locationIds: ['commercial', 'grand-commercial', 'pocket-park', 'clinic'], label: '诊所全科问诊', description: '到街区全科诊所向风堇医生挂号问诊，进行听诊体检与用药调理。', minutes: 30, price: 1800, effects: effects({ energy: 15, health: 35, stress: -15, satiety: 5, foodEnergy: 100 }) },
  { id: 'clinic-counseling', locationIds: ['commercial', 'grand-commercial', 'pocket-park', 'clinic'], label: '风堇的谈心调理', description: '在诊所安静温馨的茶歇角与风堇医生轻声交谈。感受她如母亲般温暖包容的关切与开导，清空一切心理重压并重新充盈充沛精力。（每周限一次）', minutes: 40, price: 0, effects: effects({ energy: 100, morale: 25, health: 15, stress: -100, satiety: 5, foodEnergy: 100 }) },
  { id: 'campus-infirmary', locationIds: ['sports', 'promenade'], label: '校医室问诊检查', description: '到校园保健室测量体温与血压，领取基础常用药品并安静休息。', minutes: 20, price: 450, effects: effects({ energy: 10, health: 25, stress: -10 }) },
].map(service => Object.freeze({ ...service, locationIds: Object.freeze(service.locationIds) })));

const circleCafeMenu = new Set<string>(CIRCLE_CAFE_MENU_IDS);
const withCircleCafe = (service: LocationService): LocationService => circleCafeMenu.has(service.id)
  ? Object.freeze({ ...service, locationIds: Object.freeze([...service.locationIds, ...CIRCLE_MENU_LOCATION_IDS]) })
  : service;
const circleBorrowedServices = authoredLocationServices.flatMap(service => {
  const id = circleVisitServiceId(service.id) ?? (isBorrowedLivehouseService(service) ? `circle-borrow-${service.id}` : null);
  if (!id) return [];
  return [Object.freeze({
    ...service,
    id,
    locationIds: Object.freeze([CIRCLE_LOCATION_ID, CIRCLE_STUDIO_ROOM_ID]),
    price: circleBorrowedPrice(service.price),
  })];
});
export const locationServiceCatalog: readonly LocationService[] = Object.freeze([
  ...authoredLocationServices.map(withCircleCafe),
  ...circleBorrowedServices,
]);

export const COURT_OBSERVE_MAX_MINUTES = 480;
export const COURT_OBSERVE_MAX_KNOWLEDGE = 100;

/** Upper safety bound only: the story LLM chooses the actual knowledge awarded. */
export function courtObservationKnowledgeCap(minutes: number): number {
  return Math.min(minutes, COURT_OBSERVE_MAX_KNOWLEDGE);
}

/** Reuse the authored 30-minute activity for any integer minute duration.
 * Effects scale by elapsed time; knowledge does NOT use this formula.
 * Nonzero costs/benefits have a minimum unit to avoid zero-cost one-minute farming.
 */
export function courtObservationServiceForMinutes(minutes: number): LocationService {
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > COURT_OBSERVE_MAX_MINUTES)
    throw new Error('法院旁听时长必须是 1–480 分钟的整数。');
  const base = locationServiceCatalog.find(service => service.id === COURT_OBSERVE_ID)!;
  if (minutes === base.minutes) return base;
  const ratio = minutes / base.minutes;
  const scale = (value: number) => value === 0 ? 0 : Math.sign(value) * Math.max(1, Math.round(Math.abs(value) * ratio));
  const adjusted = effects(Object.fromEntries(Object.entries(base.effects)
    .map(([key, value]) => [key, scale(value)])) as Partial<LocationServiceEffects>);
  return { ...base, minutes, effects: adjusted };
}

export function getLocationServices(state: Pick<WorldState, 'locationId' | 'interior'> & Partial<Pick<WorldState, 'academics'>>): readonly LocationService[] {
  const roomId = state.interior?.roomId;
  if (roomId && roomId !== MARGO_CAFE_ROOM_ID && roomId !== 'court-hearing' && roomId !== 'livehouse' && !isCircleVenueRoom(roomId)) return [];
  return locationServiceCatalog.filter(service => service.locationIds.includes(cafeServiceLocation(state.locationId))
    && (service.id !== CONSTRUCTION_BACKEND_JOB_ID || state.academics?.majorId === 'computer-science'));
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
  /** Empty unless this outdoor job rolled a chill or heatstroke. */
  weatherLog: string;
  blockedReason: string | null;
  /** Present for Live House tickets and practice rooms. */
  blockedCode?: LivehouseBlockedCode | null;
  livehouse?: LivehouseServiceFacts;
}

/** Preview is pure and shares authored costs, hours and nutrition with commit. */
export function getLocationServiceQuote(state: WorldState, serviceId: string, worldAuthority?: WorldState, requestedMinutes?: number): LocationServiceQuote {
  const prepared = isLivehouseVisitService(serviceId) ? prepareLivehouseService(state, serviceId, worldAuthority)
    : isCircleVisitService(serviceId) ? prepareCircleVisitService(state, serviceId, worldAuthority) : null;
  const service = prepared?.service ?? (serviceId === COURT_OBSERVE_ID && requestedMinutes !== undefined
    ? courtObservationServiceForMinutes(requestedMinutes)
    : locationServiceCatalog.find(item => item.id === serviceId) ?? null);
  const minutes = service?.minutes ?? 0;
  const price = service?.price ?? 0;
  const payout = service?.payout ?? 0;
  const status = getLocationStatus(state.locationId, state.clock);
  let blockedReason: string | null = prepared?.blockedReason ?? (!service ? '不存在的地点活动。'
    : service.id === CONSTRUCTION_BACKEND_JOB_ID && state.academics?.majorId !== 'computer-science' ? '这份招聘只接受计算机专业的应聘者。'
      : !getLocationServices(state).some(entry => entry.id === serviceId) ? '当前地点不提供这项活动，请先到达对应地点。'
      : !status ? '当前地点没有已设定的开放安排。' : null);
  if (!blockedReason && service?.id === COURT_OBSERVE_ID && state.courtroom?.active)
    blockedReason = '正式庭审正在进行，旁听不能插入玩家案件。';
  if (!blockedReason && (service?.id === 'construction-carry' || service?.id === CONSTRUCTION_BACKEND_JOB_ID)) {
    const debuffs = getIllnessDebuffs(state.player);
    if (debuffs.prohibitHeavyLabor) {
      blockedReason = debuffs.heavyLaborReason ?? '身体抱恙，无法承担高强度重体力劳动。';
    }
  }
  if (!blockedReason && service?.id === PRO200_CLAIM_SERVICE_ID)
    blockedReason = pro200ClaimBlocked(state, activeProtagonistId(state, worldAuthority));
  if (!blockedReason && service?.id === PRO200_RESELL_SERVICE_ID &&
    !state.inventory.some(entry => entry.itemId === PRO200_GAME_ITEM_ID && entry.quantity > 0))
    blockedReason = '背包中没有可出售的 Pro200 凭证。';
  if (!blockedReason && service?.id === 'clinic-counseling') {
    if (hasUsedWeeklyCounseling(state, undefined, worldAuthority)) {
      blockedReason = '本周已经找风堇医生谈过心了，请遵循医嘱好好休养，下周再来吧。';
    }
  }
  if (!blockedReason && status && !status.isOpen) blockedReason = `当前${status.label}${status.statusLabel}，开放时间 ${status.hoursLabel}。`;
  if (!blockedReason && status?.minutesUntilClose != null && minutes > status.minutesUntilClose) {
    blockedReason = `距打烊只剩 ${status.minutesUntilClose} 分钟，这项活动需要 ${minutes} 分钟，请下次营业时再来。`;
  }
  if (!blockedReason && state.player.balance < price) blockedReason = `余额不足，这项活动需要 ${price} 日元。`;
  if (!blockedReason && state.player.balance + payout - price > 20_000_000) blockedReason =
    service?.id === PRO200_RESELL_SERVICE_ID ? '余额已接近上限，暂时无法完成出售。' : '余额已接近上限，暂时无法领取这笔工资。';
  const outdoor = !state.interior && venues.some(venue => venue.locationId === state.locationId && venue.outdoor);
  const weatherDrain = service ? outdoorExertionDrain(resolveWeather(state).id, outdoor, service.effects.energy) : 0;
  const neededEnergy = service ? Math.max(0, -service.effects.energy) + weatherDrain : 0;
  if (!blockedReason && neededEnergy > 0 && energyUnits(state.player.energy) < energyUnits(neededEnergy)) {
    blockedReason = `精力不足，这项活动需要 ${neededEnergy} 点精力。`;
  }
  const endDay = state.clock.day + Math.floor((state.clock.hour * 60 + state.clock.minute + minutes) / 1440);
  if (!blockedReason && endDay > 365000) blockedReason = '已到达最大天数，无法继续推进。';
  const playerAfter = blockedReason ? { ...state.player } : advancePlayerNutrition(state.player, state.clock, minutes);
  let weatherLog = '';
  if (service && !blockedReason) {
    playerAfter.balance += payout - price;
    playerAfter.energy = adjustEnergy(playerAfter.energy, service.effects.energy - weatherDrain);
    for (const key of ['morale', 'health', 'stress', 'satiety'] as const) {
      playerAfter[key] = Math.min(100, Math.max(0, playerAfter[key] + service.effects[key]));
    }
    playerAfter.foodEnergy = Math.min(3000, Math.max(0, playerAfter.foodEnergy + service.effects.foodEnergy));
    if (outdoor && service.effects.energy < 0) {
      const exposed = applyOutdoorHealth(playerAfter, outdoorHealthExposure(resolveWeather(state), exposureSeed(state.clock, 'service', `${service.id}@${state.locationId}`)));
      playerAfter.health = exposed.player.health;
      weatherLog = exposed.log;
    }
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
  const blockedCode = prepared ? livehouseBlockedCode(blockedReason, prepared.blockedCode) : undefined;
  const livehouse = prepared ? { ...prepared.facts, blockedCode: blockedCode ?? null, commit: blockedReason ? null : prepared.facts.commit } : undefined;
  return { service, minutes, price, payout, playerAfter, changes, weatherLog, blockedReason, ...(prepared ? { blockedCode, livehouse } : {}) };
}
