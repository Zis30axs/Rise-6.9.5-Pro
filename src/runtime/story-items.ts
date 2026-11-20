import type { WorldState } from '../frontend/types';
import type { StoreItem } from './convenience-store';

const profiles = {
  collectible: { minutes: 0, kcal: 0, satiety: 0 },
  tool: { minutes: 1, kcal: 0, satiety: 0 },
  supply: { minutes: 1, kcal: 0, satiety: 0 },
  meal: { minutes: 12, kcal: 420, satiety: 25 },
  snack: { minutes: 4, kcal: 120, satiety: 8 },
  drink: { minutes: 3, kcal: 30, satiety: 2 },
} as const;
export interface StoryItemDetails {
  name: string;
  description: string;
  category: keyof typeof profiles;
  unit: string;
  kcal?: number;
  useMinutes?: number;
  effects?: Partial<StoreItem['effects']>;
}
export interface RegisteredStoryItem { itemId: string; definition: StoryItemDetails }
export const MAX_STORY_ITEM_TYPES = 1024;
const effectKeys = ['energy', 'satiety', 'stress', 'health', 'morale'] as const;

function fields(raw: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !allowed.includes(key)))
    throw new Error('剧情物品的字段无效。');
  return raw as Record<string, unknown>;
}
function label(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/u.test(value))
    throw new Error('剧情物品的名称、描述或单位无效。');
  return value.trim();
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max)
    throw new Error('剧情物品的数值超出范围。');
  return value;
}
export function storyItemId(value: unknown): string {
  if (typeof value !== 'string' || value.length > 80 || !/^story-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
    throw new Error('原创物品需要独立的 story- 编号。');
  return value;
}
export function parseStoryItemDetails(raw: unknown): StoryItemDetails {
  const row = fields(raw, ['name', 'description', 'category', 'unit', 'kcal', 'useMinutes', 'effects']);
  if (typeof row.category !== 'string' || !Object.hasOwn(profiles, row.category)) throw new Error('剧情物品类别无效。');
  const category = row.category as StoryItemDetails['category'];
  const result: StoryItemDetails = { name: label(row.name, 80), description: label(row.description, 360), category, unit: label(row.unit, 8) };
  if ('kcal' in row) result.kcal = integer(row.kcal, 0, ['meal', 'snack', 'drink'].includes(category) ? 3000 : 0);
  if ('useMinutes' in row) result.useMinutes = integer(row.useMinutes, 0, category === 'collectible' ? 0 : 1440);
  if ('effects' in row) {
    if (category === 'collectible') throw new Error('纪念品没有消耗效果。');
    const props = fields(row.effects, effectKeys);
    result.effects = Object.fromEntries(effectKeys.filter(key => Object.hasOwn(props, key)).map(key => [key, integer(props[key], -100, 100)]));
  }
  return result;
}
export function parseStoryItemCatalog(raw: unknown): RegisteredStoryItem[] {
  if (!Array.isArray(raw) || raw.length > MAX_STORY_ITEM_TYPES) throw new Error('剧情物品目录无效。');
  const seen = new Set<string>();
  return raw.map(value => {
    const row = fields(value, ['itemId', 'definition']);
    const itemId = storyItemId(row.itemId);
    if (seen.has(itemId)) throw new Error('存档中有重复的剧情物品编号。');
    seen.add(itemId);
    return { itemId, definition: parseStoryItemDetails(row.definition) };
  });
}
export function storyInventoryItem({ itemId, definition }: RegisteredStoryItem): StoreItem {
  const p = profiles[definition.category];
  return { id: itemId, name: definition.name, description: definition.description, brand: '随身物品',
    category: definition.category, price: 0, tier: 'standard', packSize: 1, purchaseUnit: definition.unit, useUnit: definition.unit,
    useMinutes: definition.useMinutes ?? p.minutes, kcal: definition.kcal ?? p.kcal,
    effects: { energy: 0, satiety: p.satiety, stress: 0, health: 0, ...definition.effects } };
}
/** The inventory already describes held items. Recall mentioned or recent depleted items by ID. */
export function knownStoryItems(state: WorldState, input: string) {
  const held = new Set(state.inventory.map(entry => entry.itemId));
  const depleted = (state.storyItems ?? []).filter(row => !held.has(row.itemId));
  const recent = new Set(depleted.slice(-16));
  return depleted.filter(row => recent.has(row) || input.includes(row.definition.name) || input.includes(row.itemId))
    .map(row => ({ itemId: row.itemId, name: row.definition.name }));
}

export const STORY_ITEM_INSTRUCTION =
  '原创物品：可以按剧情自由命名、描述礼物、发现物或制成品。只有当前主角确实收到、拾取或完成制作时，在 <world_actions> 提交 {"type":"create_item","itemId":"story-black-cat-cookie","quantity":2,"reason":"立希把两块亲手烤的曲奇交到我手上","definition":{"name":"立希的黑猫曲奇","description":"猫耳边缘烤得酥脆，纸袋上画了一枚鼓槌。","category":"snack","unit":"块","kcal":95,"effects":{"satiety":6}}}。新 ID 自拟，以 story- 开头，后接小写英文或数字，可用短横分词，最长80位。name、description、category、unit 必填。类别有 collectible（纪念品）、tool（可重复使用）、supply（一次性用品）、meal、snack、drink；后三种可指定每份 kcal（0–3000）。可用物品可选 useMinutes（0–1440）和 effects（energy、satiety、stress、health、morale 各 -100 至 100 的整数）；省略时按类别结算。每次取得 quantity 为1–20。已登记的原创物品再次获得时复用 itemId 并省略 definition；背包与 knownStoryItems 可查。使用或赠出沿用 use 或 gift，同轮先创建再引用。系统已有商品、专属奖励和地点礼物沿用原行动。提议、拒收和回忆不入包，同一次交付只提交一次。';
