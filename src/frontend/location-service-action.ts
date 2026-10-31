import { getLocationServiceQuote, getTakeawayQuote } from '../runtime/location-services';
import { formatGameNumber } from './format-game-number';
import { runInteraction } from './interaction-action';
import type { ShellActions, ShellModel, WorldState } from './types';

type Quote = ReturnType<typeof getLocationServiceQuote>;
export type ServiceEffectKey = Exclude<keyof Quote['changes'], 'balance'>;
const labels: Record<ServiceEffectKey, string> = { energy: '精力', morale: '精神', health: '健康', stress: '压力', satiety: '饱腹', foodEnergy: '食物能量储备' };
export function signedServiceEffect(value: number) { return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatGameNumber(Math.abs(value))}`; }
export function serviceEffects(quote: Quote) {
  return (Object.keys(labels) as ServiceEffectKey[])
    .filter(key => quote.changes[key] !== 0 || quote.service?.effects[key])
    .map(key => ({ key, label: labels[key], value: quote.changes[key], unit: key === 'foodEnergy' ? ' kcal' : '', harmful: key === 'stress' ? quote.changes[key] > 0 : quote.changes[key] < 0 }));
}
const absoluteMinutes = (clock: WorldState['clock']) => clock.day * 1440 + clock.hour * 60 + clock.minute;

/** Both service surfaces show success only after the same authoritative save has completed. */
export async function completeLocationService(model: ShellModel, actions: ShellActions, serviceId: string): Promise<string | null> {
  const before = model.state;
  const quote = getLocationServiceQuote(before, serviceId);
  if (model.busy || quote.blockedReason || !quote.service) return null;
  if (!await runInteraction(model, actions, { type: 'location_service', serviceId })) return null;
  const saved = model.state;
  const changes = (Object.keys(labels) as ServiceEffectKey[]).filter(key => saved.player[key] !== before.player[key])
    .map(key => `${labels[key]} ${signedServiceEffect(Number((saved.player[key] - before.player[key]).toFixed(2)))}${key === 'foodEnergy' ? ' kcal' : ''}`).join(' · ');
  const time = `${String(saved.clock.hour).padStart(2, '0')}:${String(saved.clock.minute).padStart(2, '0')}`;
  const balance = Number((saved.player.balance - before.player.balance).toFixed(2));
  const actor = saved.protagonists?.accounts.active ?? 'soyo';
  const learned = serviceId === 'court-observe'
    ? (saved.courtroom?.observationKnowledge?.[actor] ?? 0) - (before.courtroom?.observationKnowledge?.[actor] ?? 0) : 0;
  return `${quote.service.label}已完成 · 本次共 ${absoluteMinutes(saved.clock) - absoluteMinutes(before.clock)} 分钟 · 第 ${saved.clock.day} 天 ${time}${balance ? ` · ${quote.payout ? '工资' : '余额'} ${signedServiceEffect(balance)} 元` : ''}${changes ? ` · ${changes}` : ''}${serviceId === 'court-observe' ? ` · 法庭见闻 +${learned}` : ''}。已保存；后续事件见正文与状态。`;
}

export async function packageLocationService(model: ShellModel, actions: ShellActions, serviceId: string): Promise<string | null> {
  const before = model.state;
  const quote = getTakeawayQuote(before, serviceId, 1);
  if (model.busy || quote.blockedReason || !quote.item) return null;
  if (!await runInteraction(model, actions, { type: 'pack_service', serviceId, quantity: 1 })) return null;
  return `${quote.item.name}打包完成（商品及包装费 ¥${formatGameNumber(quote.totalPrice)}） · 已保存，当前携带物品与后续事件见背包、正文及状态。`;
}
