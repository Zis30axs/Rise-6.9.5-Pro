import type { WorldAction, WorldState } from './types';
import { acknowledgePhoneRead, locations, parseState } from '../runtime/model';
import { bedRestOptions, campusInteriors } from '../runtime/campus-interiors';
import { getStoreItem } from '../runtime/convenience-store';
import { CAFE_DAILY_SPECIAL_ID } from '../runtime/margo-cafe-menu';
import { locationServiceCatalog } from '../runtime/location-services';
import { lawCases } from '../runtime/law-career';

export const INTERACTION_DURATION_MS = 1200;
export const INTERACTION_EVENT_PROBABILITY = .8;

/** Pose updates and read receipts never start a gameplay interaction. */
export function isGameplayInteraction(action: WorldAction): boolean {
  return !['equip_item', 'unequip_item', 'receive_cafe_gift', 'choose_academics', 'walk', 'interior_walk', 'novel_approach', 'encounter', 'air_traffic_tick', 'read_phone', 'strategy', 'society', 'faction_focus'].includes(action.type);
}

export function interactionLabel(action: WorldAction): string {
  switch (action.type) {
    case 'law_case': return action.phase === 'accept'
      ? '承接' + (lawCases.find(item => item.id === action.caseId)?.title ?? '法律委托')
      : action.phase === 'investigate' ? '调查案件' : action.phase === 'present' ? '提交证据' : '请雪莉协助推理';
    case 'location_service': return locationServiceCatalog.find(item => item.id === action.serviceId)?.label ?? '地点服务';
    case 'pack_service': return `打包${locationServiceCatalog.find(item => item.id === action.serviceId)?.label ?? '餐点'}`;
    case 'buy_item': return `购买${getStoreItem(action.itemId)?.name ?? (action.itemId === CAFE_DAILY_SPECIAL_ID ? '每日特调' : '商品')}`;
    case 'pack_item': return `打包${getStoreItem(action.itemId)?.name ?? '商品'}`;
    case 'use_item': return `使用${getStoreItem(action.itemId)?.name ?? '物品'}`;
    case 'cook_begin': return '下厨';
    case 'cook_cancel': return '离开厨房';
    case 'cook_settle': return '停下指针';
    case 'gift_item': return `赠送${getStoreItem(action.itemId)?.name ?? '物品'}`;
    case 'novel_travel':
    case 'travel': return `前往${locations.find(item => item.id === action.locationId)?.name ?? '目的地'}`;
    case 'enter_interior': return `进入${campusInteriors.find(room => room.id === action.roomId)?.label ?? '室内'}`;
    case 'leave_interior': return '离开房间';
    case 'interior_interact': return campusInteriors.flatMap(room => room.interactions).find(item => item.id === action.interactionId)?.label ?? '室内互动';
    case 'interior_rest': return bedRestOptions.find(option => option.id === action.optionId)?.label ?? '休息';
    case 'interior_study': return '学习';
    case 'read_subject': return '选书阅读';
    case 'ride_transit': return '乘车出行';
    case 'wait': return `休憩 ${action.minutes} 分钟`;
    case 'complete_schedule': return '完成日程';
    case 'choose_academics': return '选择专业';
    default: return '互动';
  }
}

/** Retain only monotonic phone reads received while the transaction was held. */
export function mergeInteractionReceipts(prepared: WorldState, original: WorldState, latest: WorldState): WorldState {
  const observed = parseState(latest);
  const priorReads = new Map(original.phone.map(item => [item.id, item.read]));
  const acknowledged: string[] = [];
  for (const item of observed.phone) {
    if (!priorReads.has(item.id) || (priorReads.get(item.id) && !item.read)) throw new Error('互动期间世界状态已变化，请取消后重试。');
    if (item.read) acknowledged.push(item.id);
    item.read = priorReads.get(item.id)!;
  }
  if (JSON.stringify(observed) !== JSON.stringify(original)) throw new Error('互动期间世界状态已变化，请取消后重试。');
  return acknowledgePhoneRead(prepared, acknowledged);
}

/** Narrative, journal entries and phone chatter alone are not an event effect. */
export function hasInteractionEffect(before: WorldState, after: WorldState): boolean {
  const effects = (state: WorldState) => ({
    clock: state.clock, locationId: state.locationId, roomId: state.interior?.roomId ?? null,
    player: state.player, inventory: state.inventory, academics: state.academics,
    contacts: state.contacts.map(({ id, affinity }) => ({ id, affinity })), schedule: state.schedule,
  });
  return JSON.stringify(effects(before)) !== JSON.stringify(effects(after));
}
