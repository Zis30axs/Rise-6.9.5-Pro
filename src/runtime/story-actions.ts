import type { StoryAction, WorldState } from '../frontend/types';
import { sceneLandmarks } from '../frontend/scene-layout';
import { PROTAGONISTS } from './dual-protagonists';
import { sceneLocationId } from './scene-context';
import { campusInteriors } from './campus-interiors';
import { getAcademicSubjectById } from './academics';
import { isSocialSkillId, type SocialDeviation } from './social-skills';
import { worldScenePeople, worldScenePosition } from './world-presence';
import { personState } from './protagonist-world';
import { getServiceTakeawayItem, getStoreItem, storeCatalog } from './convenience-store';
import { cookedDishQuote } from './cooking';
import { isCafeStoryItem } from './margo-cafe-menu';
import { locationServiceCatalog } from './location-services';
import { agendaTargetProtagonist, parseAgendaDraft, socialMinute } from './social-agenda';
import { validateCourtDocketOffers, validateCourtSpecial, validateCourtOpen, validateCourtFeeQuote, validateCourtStep, validateCourtAssist, validateCourtSettlement, validateCourtFulfillment, validateCourtFinish } from './courtroom';

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
  if (value.filter(item => !!item && typeof item === 'object' && (item as Record<string, unknown>).type === 'social_skill').length > 1)
    return invalid('每轮最多一次社交技能练习');
  if (value.filter(item => !!item && typeof item === 'object' && (item as Record<string, unknown>).type === 'exchange_contact').length > 1)
    return invalid('每轮最多直接交换一位新联系人的号码');
  if (value.filter(item => !!item && typeof item === 'object' && (item as Record<string, unknown>).type === 'social_invite').length > 3)
    return invalid('每轮最多三项邀约');
  const courtActions = value.filter(item => !!item && typeof item === 'object' &&
    /^court_(?:docket|special|open|quote|step|assist|finish|settlement|fulfill)$/.test(String((item as Record<string,unknown>).type)))
    .map(item => String((item as Record<string,unknown>).type));
  // A fresh insight or an explicit Sherry handover may be settled in the same response.
  const allowedPair = courtActions.length === 2 &&
    ((courtActions[0] === 'court_step' || courtActions[0] === 'court_assist') && courtActions[1] === 'court_finish');
  if (courtActions.length > 2 || (courtActions.length === 2 && !allowedPair))
    return invalid('同一轮仅允许单项庭审操作，或庭审进展/正式接手后立即结案');
  return value.map((raw, index) => {
    const path = `行动 ${index + 1}`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid(path);
    switch ((raw as Record<string, unknown>).type) {
      case 'go_home': {
        record(raw, ['type'], path);
        return { type: 'go_home' };
      }
      case 'exchange_contact': {
        const item = record(raw, ['type', 'npcId', 'consentQuote'], path);
        if (typeof item.npcId !== 'string') return invalid(`${path} 新联系人身份`);
        const position = worldScenePosition(state);
        const person = worldScenePeople(state).find(row => row.id === item.npcId && !row.protagonistId);
        if (!position || !person || Math.hypot(position.x - person.x, position.z - person.z) > 7)
          return invalid(`${path} 双方必须实际见面`);
        if (state.contacts.some(contact => contact.id === person.id || contact.sourcePersonId === person.id))
          return invalid(`${path} 已经交换过联系方式`);
        return { type: 'exchange_contact', npcId: person.id, consentQuote: text(item.consentQuote, 300, `${path} 对方的确认`) };
      }
      case 'send_sms': {
        const item = record(raw, ['type', 'targetId', 'text'], path);
        const justExchanged = value.slice(0, index).some(prior => !!prior && typeof prior === 'object' &&
          (prior as Record<string, unknown>).type === 'exchange_contact' && (prior as Record<string, unknown>).npcId === item.targetId);
        if (typeof item.targetId !== 'string' || !state.contacts.some(row => row.id === item.targetId || row.sourcePersonId === item.targetId) && !justExchanged)
          return invalid(`${path} 短信收件人需要已有联系方式`);
        return { type: 'send_sms', targetId: item.targetId, text: text(item.text, 1000, `${path} 短信正文`) };
      }
      case 'social_invite': {
        const hasResponse = Object.hasOwn(raw, 'responseQuote');
        const hasAgenda = Object.hasOwn(raw,'agenda');
        const item = record(raw, ['type', 'targetId', 'source', 'locationId', 'day', 'time', 'message', 'outcome', ...(hasResponse ? ['responseQuote'] : []), ...(hasAgenda ? ['agenda'] : [])], path);
        if(hasAgenda && (item.source !== 'meeting' || item.outcome !== 'accepted')) return invalid(`${path} 私人赴约日程只能随当面明确同意创建`);
        if (item.source !== 'meeting' && item.source !== 'sms') return invalid(`${path} 邀约渠道`);
        if (!['pending', 'accepted', 'declined'].includes(String(item.outcome))) return invalid(`${path} 邀约状态`);
        const targetId = typeof item.targetId === 'string' ? item.targetId : '';
        const contact = state.contacts.find(row => row.id === targetId || row.sourcePersonId === targetId);
        const justExchanged = value.slice(0, index).some(prior => !!prior && typeof prior === 'object' &&
          (prior as Record<string, unknown>).type === 'exchange_contact' && (prior as Record<string, unknown>).npcId === targetId);
        if (item.source === 'sms') {
          if ((!contact && !justExchanged) || item.outcome !== 'pending' || hasResponse) return invalid(`${path} 短信邀约先等待对方回复`);
        } else {
          const position = worldScenePosition(state);
          const person = worldScenePeople(state).find(row => row.id === (contact?.sourcePersonId ?? targetId) || row.contactId === targetId);
          const counterpart = person?.protagonistId ? personState(state, person.protagonistId) : null;
          if (!position || !person || Math.hypot(position.x - person.x, position.z - person.z) > 7 ||
            (counterpart && (counterpart.locationId !== state.locationId || counterpart.interior?.roomId !== state.interior?.roomId)))
            return invalid(`${path} 当面邀约必须双方实际在场`);
          if (item.outcome !== 'pending' && !hasResponse || item.outcome === 'pending' && hasResponse)
            return invalid(`${path} 邀约回应证据`);
        }
        if (typeof item.locationId !== 'string') return invalid(`${path} 邀约地点`);
        const date = number(item.day, state.clock.day, Math.min(365000, state.clock.day + 90), `${path} 日期`);
        const time = text(item.time, 5, `${path} 时间`);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return invalid(`${path} 时间格式`);
        const minute = Number(time.slice(0,2)) * 60 + Number(time.slice(3));
        if (date === state.clock.day && minute <= state.clock.hour * 60 + state.clock.minute) return invalid(`${path} 约定时间已过`);
        return { type: 'social_invite', targetId: contact?.id ?? targetId,
          source: item.source, locationId: destination(item.locationId, `${path} 邀约地点`), day: date, time,
          message: text(item.message, 500, `${path} 邀约内容`), outcome: item.outcome as 'pending' | 'accepted' | 'declined',
          ...(hasResponse ? { responseQuote: text(item.responseQuote, 300, `${path} 回应原话`) } : {}),
          ...(hasAgenda ? {agenda:parseAgendaDraft(item.agenda,{day:date,time},socialMinute(state))} : {}) };
      }
      case 'social_agenda': {
        const hasAgenda=Object.hasOwn(raw,'agenda');
        const item=record(raw,['type','invitationId','decision','triggerId','reason',...(hasAgenda?['agenda']:[])],path);
        const invitationId=text(item.invitationId,128,`${path} 邀约 ID`);
        const invitation=state.protagonists?.socialInvitations?.find(row=>row.id===invitationId);
        if(!invitation||invitation.status!=='accepted') return invalid(`${path} 只允许修改真实已同意的邀约`);
        if(agendaTargetProtagonist(state,invitation)===state.protagonists?.accounts.active) return invalid(`${path} 不能替当前玩家控制的主角更改私人决定`);
        if(!['plan','revise','cancel','no_show'].includes(String(item.decision))) return invalid(`${path} 计划决定`);
        const decision=item.decision as 'plan'|'revise'|'cancel'|'no_show';
        if((decision==='plan'||decision==='revise')!==hasAgenda) return invalid(`${path} 计划字段`);
        const triggerId=text(item.triggerId,128,`${path} 变更原因 ID`);
        const reason=text(item.reason,240,`${path} 具体依据`);
        return { type:'social_agenda', invitationId, decision, triggerId, reason,
          ...(hasAgenda ? { agenda: parseAgendaDraft(item.agenda, invitation, socialMinute(state),
            decision==='revise' ? (invitation.agenda?.steps.filter(step=>step.done) ?? []) : []) } : {}) };
      }
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
        if (typeof item.serviceId !== 'string' || !locationServiceCatalog.some(service => service.id === item.serviceId && !service.reveal)) return invalid(`${path} 地点服务`);
        return { type: 'service', serviceId: item.serviceId };
      }
      case 'buy':
      case 'pack': {
        const item = record(raw, ['type', 'itemId', 'quantity'], path);
        const product = storeCatalog.find(product => product.id === item.itemId);
        const cafeCup = item.type === 'buy' && typeof item.itemId === 'string' && isCafeStoryItem(state, item.itemId);
        if (typeof item.itemId !== 'string' || (!product && !cafeCup) || (item.type === 'pack' && (!product || product.category === 'cigarette'))) return invalid(`${path} 商品`);
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
      case 'eat_cooked': {
        const item = record(raw, ['type', 'dishId'], path);
        if (typeof item.dishId !== 'string' || cookedDishQuote(state, item.dishId).blockedReason)
          return invalid(`${path} 料理份数或归属`);
        return { type: 'eat_cooked', dishId: item.dishId };
      }
      case 'share_meal': {
        const item = record(raw, ['type', 'dishId', 'npcId', 'consentQuote'], path);
        if (typeof item.dishId !== 'string' || typeof item.npcId !== 'string')
          return invalid(`${path} 共餐身份`);
        const quote = cookedDishQuote(state, item.dishId, item.npcId);
        if (quote.blockedReason || !quote.person) return invalid(`${path} 共餐须有两份料理且 NPC 当面在场`);
        return { type: 'share_meal', dishId: item.dishId, npcId: quote.person.id,
          consentQuote: text(item.consentQuote, 300, `${path} NPC 当面同意共餐原话`) };
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
      case 'social_skill': {
        const hasNpcId = Object.hasOwn(raw, 'npcId');
        const item = record(raw, ['type', 'skillId', 'deviation', 'reason', ...(hasNpcId ? ['npcId'] : [])], path);
        if (!isSocialSkillId(item.skillId)) return invalid(`${path} 技能类型`);
        if (hasNpcId && (typeof item.npcId !== 'string' || !state.contacts.some(contact => contact.id === item.npcId)))
          return invalid(`${path} 联系人`);
        return { type: 'social_skill', skillId: item.skillId,
          deviation: number(item.deviation, 0, 3, `${path} 人格偏离程度`) as SocialDeviation,
          reason: text(item.reason, 240, `${path} 本轮练习依据`), ...(hasNpcId ? { npcId: item.npcId as string } : {}) };
      }
      case 'court_docket': {
        const item = record(raw, ['type','offers'],path);
        return { type:'court_docket', offers:validateCourtDocketOffers(item.offers,state) };
      }
      case 'court_special': return validateCourtSpecial(raw,state);
      case 'court_open': return validateCourtOpen(raw,state);
      case 'court_quote': return validateCourtFeeQuote(raw,state);
      case 'court_step': return validateCourtStep(raw,state);
      case 'court_assist': return validateCourtAssist(raw,state);
      case 'court_settlement': return validateCourtSettlement(raw,state);
      case 'court_fulfill': return validateCourtFulfillment(raw,state);
      case 'court_finish': return validateCourtFinish(raw,state);
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
