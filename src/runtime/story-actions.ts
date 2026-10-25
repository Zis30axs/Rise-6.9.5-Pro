import type { StoryAction, WorldState } from '../frontend/types';
import { sceneLandmarks } from '../frontend/scene-layout';
import { PROTAGONISTS } from './dual-protagonists';
import { sceneLocationId } from './scene-context';
import { campusInteriors } from './campus-interiors';
import { getAcademicSubjectById } from './academics';
import { getServiceTakeawayItem, getStoreItem, storeCatalog } from './convenience-store';
import { locationServiceCatalog } from './location-services';

export const STORY_ACTION_LIMITS = {
  actions: 12, minutes: 10080, studyMinMinutes: 15, studyMaxMinutes: 240,
  quantity: 20, relationshipDelta: 20, activityDelta: 100,
  balanceDelta: 100000, foodEnergyDelta: 20000, transferCents: 10_000_000,
} as const;

function invalid(path: string): never { throw new Error(`剧情行动无效：${path}。本轮正文、消息和状态均未写入。`); }
function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
  const own = Object.keys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) return invalid(`${path} 字段`);
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, path: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\u0000')) return invalid(path);
  return value.trim();
}
function number(value: unknown, min: number, max: number, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return invalid(path);
  return value;
}
const destinationIds = new Set([...sceneLandmarks.map(item => sceneLocationId(item.id)), ...campusInteriors.map(item => item.id)]);
function destination(value: unknown, path: string): string {
  if (typeof value !== 'string' || !destinationIds.has(value)) return invalid(path);
  return value;
}

/** A narrow action language; no dynamic keys, arbitrary object patches, or executable model data. */
export function validateStoryActions(value: unknown, state: WorldState): StoryAction[] {
  if (!Array.isArray(value) || value.length > STORY_ACTION_LIMITS.actions) return invalid('每轮最多 12 项行动');
  return value.map((raw, index) => {
    const path = `行动 ${index + 1}`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid(path);
    switch ((raw as Record<string, unknown>).type) {
      case 'travel': {
        const item = record(raw, ['type', 'locationId'], path);
        return { type: 'travel', locationId: destination(item.locationId, `${path} 地点`) };
      }
      case 'rest': {
        const item = record(raw, ['type', 'minutes', 'kind'], path);
        if (item.kind !== 'sleep' && item.kind !== 'rest' && item.kind !== 'wait') return invalid(`${path} 休息类型`);
        return { type: 'rest', kind: item.kind, minutes: number(item.minutes, 1, STORY_ACTION_LIMITS.minutes, `${path} 分钟`) };
      }
      case 'service': {
        const item = record(raw, ['type', 'serviceId'], path);
        if (typeof item.serviceId !== 'string' || !locationServiceCatalog.some(service => service.id === item.serviceId)) return invalid(`${path} 地点服务`);
        return { type: 'service', serviceId: item.serviceId };
      }
      case 'buy':
      case 'pack': {
        const item = record(raw, ['type', 'itemId', 'quantity'], path);
        const product = storeCatalog.find(product => product.id === item.itemId);
        if (typeof item.itemId !== 'string' || !product || (item.type === 'pack' && product.category === 'cigarette')) return invalid(`${path} 商品`);
        return { type: item.type as 'buy' | 'pack', itemId: item.itemId, quantity: number(item.quantity, 1, STORY_ACTION_LIMITS.quantity, `${path} 数量`) };
      }
      case 'takeaway': {
        const item = record(raw, ['type', 'serviceId', 'quantity'], path);
        if (typeof item.serviceId !== 'string' || !getServiceTakeawayItem(item.serviceId)) return invalid(`${path} 打包餐点`);
        return { type: 'takeaway', serviceId: item.serviceId, quantity: number(item.quantity, 1, STORY_ACTION_LIMITS.quantity, `${path} 数量`) };
      }
      case 'gift': {
        const item = record(raw, ['type', 'itemId', 'quantity', 'npcId', 'affinityDelta', 'reason'], path);
        if (typeof item.itemId !== 'string' || !getStoreItem(item.itemId)) return invalid(`${path} 礼物`);
        if (typeof item.npcId !== 'string' || !state.contacts.some(contact => contact.id === item.npcId)) return invalid(`${path} 收礼人`);
        return { type: 'gift', itemId: item.itemId, npcId: item.npcId,
          quantity: number(item.quantity, 1, STORY_ACTION_LIMITS.quantity, `${path} 数量`),
          affinityDelta: number(item.affinityDelta, 0, STORY_ACTION_LIMITS.relationshipDelta, `${path} 送礼增益`),
          reason: text(item.reason, 240, `${path} 送礼依据`) };
      }
      case 'use': {
        const item = record(raw, ['type', 'itemId'], path);
        if (typeof item.itemId !== 'string' || !getStoreItem(item.itemId)) return invalid(`${path} 商品`);
        return { type: 'use', itemId: item.itemId };
      }
      case 'interact': {
        const item = record(raw, ['type', 'interactionId'], path);
        if (typeof item.interactionId !== 'string' || !campusInteriors.some(room => room.interactions.some(interaction => interaction.id === item.interactionId))) return invalid(`${path} 室内交互`);
        return { type: 'interact', interactionId: item.interactionId };
      }
      case 'study': {
        const item = record(raw, ['type', 'subjectId', 'minutes'], path);
        if (typeof item.subjectId !== 'string' || !getAcademicSubjectById(item.subjectId)) return invalid(`${path} 学科`);
        return { type: 'study', subjectId: item.subjectId, minutes: number(item.minutes, STORY_ACTION_LIMITS.studyMinMinutes, STORY_ACTION_LIMITS.studyMaxMinutes, `${path} 学习分钟`) };
      }
      case 'schedule': {
        const item = record(raw, ['type', 'title', 'locationId', 'time'], path);
        const time = text(item.time, 5, `${path} 日程时间`);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return invalid(`${path} 日程时间`);
        return { type: 'schedule', title: text(item.title, 120, `${path} 日程标题`), locationId: destination(item.locationId, `${path} 日程地点`), time };
      }
      case 'complete_schedule': {
        const item = record(raw, ['type', 'id'], path);
        if (typeof item.id !== 'string' || !state.schedule.some(entry => entry.id === item.id)) return invalid(`${path} 日程`);
        return { type: 'complete_schedule', id: item.id };
      }
      case 'relationship': {
        const item = record(raw, ['type', 'npcId', 'delta', 'reason'], path);
        if (typeof item.npcId !== 'string' || !state.contacts.some(contact => contact.id === item.npcId)) return invalid(`${path} 联系人`);
        return { type: 'relationship', npcId: item.npcId, delta: number(item.delta, -STORY_ACTION_LIMITS.relationshipDelta, STORY_ACTION_LIMITS.relationshipDelta, `${path} 关系变化`), reason: text(item.reason, 240, `${path} 关系依据`) };
      }
      case 'transfer': {
        const item = record(raw, ['type', 'from', 'to', 'cents', 'reason'], path);
        const party = (value: unknown, label: string): string => {
          if (typeof value !== 'string' || !/^[A-Za-z0-9][\w:.-]{0,79}$/.test(value)) return invalid(`${path} ${label}`);
          if ((PROTAGONISTS as readonly string[]).includes(value) || /^protagonist-(?:soyo|sakiko|emma)$/.test(value) ||
            state.contacts.some(contact => contact.id === value || contact.sourcePersonId === value)) return value;
          return invalid(`${path} ${label}`);
        };
        const from = party(item.from, '付款方'), to = party(item.to, '收款方');
        if (from === to) return invalid(`${path} 转账双方`);
        return { type: 'transfer', from, to, cents: number(item.cents, 1, STORY_ACTION_LIMITS.transferCents, `${path} 金额`), reason: text(item.reason, 240, `${path} 转账依据`) };
      }
      case 'activity': {
        const item = record(raw, ['type', 'label', 'minutes', 'effects'], path);
        const effects = record(item.effects, ['energy', 'morale', 'stress', 'health', 'balance', 'satiety', 'foodEnergy'], `${path} 影响`);
        return { type: 'activity', label: text(item.label, 160, `${path} 活动`), minutes: number(item.minutes, 1, STORY_ACTION_LIMITS.minutes, `${path} 分钟`), effects: {
          energy: number(effects.energy, -100, 100, `${path} 精力`),
          morale: number(effects.morale, -100, 100, `${path} 精神`),
          stress: number(effects.stress, -100, 100, `${path} 压力`),
          health: number(effects.health, -100, 100, `${path} 健康`),
          balance: number(effects.balance, -STORY_ACTION_LIMITS.balanceDelta, STORY_ACTION_LIMITS.balanceDelta, `${path} 余额`),
          satiety: number(effects.satiety, -100, 100, `${path} 饱腹`),
          foodEnergy: number(effects.foodEnergy, -STORY_ACTION_LIMITS.foodEnergyDelta, STORY_ACTION_LIMITS.foodEnergyDelta, `${path} 食物能量`),
        } };
      }
      default: return invalid(`${path} 类型`);
    }
  });
}

/** Canonical validated fields yield a stable 96-bit replay fingerprint, never an authorization token. */
export function storyActionFingerprint(actions: readonly StoryAction[]): string {
  const source = JSON.stringify(actions);
  return [2166136261, 2246822519, 3266489917].map(seed => {
    let hash = seed;
    for (let index = 0; index < source.length; index++) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }).join('');
}
