import type { WorldState, PlayerState } from '../frontend/types';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import { activeProtagonist, protagonistNames } from './protagonist-world';
import { worldScenePeople, worldScenePosition } from './world-presence';
import { getCampusInterior, INTERIOR_INTERACTION_RANGE } from './campus-interiors';
import { getCookingRecipe, cookingQuality, COOKING_QUALITY_LABEL, type CookingQuality } from './cooking-recipes';
import { INVENTORY_ITEM_LIMIT } from './convenience-store';
import { adjustEnergy } from './energy';

export interface CookedDish {
  id: string;
  owner: ProtagonistId;
  chef: ProtagonistId;
  recipeId: string;
  quality: CookingQuality;
  servings: number;
  at: number;
}
export interface CookingEvent {
  id: string;
  owner: ProtagonistId;
  kind: 'cooked' | 'eaten';
  recipeId: string;
  quality: CookingQuality;
  at: number;
}
/** Shared state but all inventory and proficiency are private to each protagonist. */
export interface CookingState {
  version: 1;
  serial: number;
  experience: Record<ProtagonistId, number>;
  dishes: CookedDish[];
  pending: CookingEvent[];
}
export const COOKING_KITCHENS: Readonly<Record<string, string>> = Object.freeze({
  'dorm-room': 'dorm-kitchen',
  'toyokawa-house': 'toyokawa-kitchen',
  'emma-yuki-home': 'emma-home-kitchen',
  'majo-studio': 'studio-kitchen',
  'amaori-family-home': 'amaori-kitchen',
});
const MAX_DISHES = 100;
const MAX_PENDING = 100;
const MAX_SERIAL = 1_000_000;
const MAX_EXPERIENCE = 10000;
const DAY_MAX = 365000 * 1440;
export function createCookingState(): CookingState {
  return { version: 1, serial: 0, experience: { soyo: 0, sakiko: 0, emma: 0, renako: 0 },
    dishes: [], pending: [] };
}
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const isOwner = (v: unknown): v is ProtagonistId => PROTAGONISTS.includes(v as ProtagonistId);
const isQuality = (v: unknown): v is CookingQuality => ['failed', 'ordinary', 'perfect'].includes(String(v));
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length
  && Object.keys(v).every(key => keys.includes(key));
function bad(): never { throw new Error('烹饪状态无效，原存档已保留。'); }
export function parseCookingState(value: unknown, now: number): CookingState {
  if (!exact(value, ['version', 'serial', 'experience', 'dishes', 'pending']) ||
      value.version !== 1 || !isInt(value.serial, 0, MAX_SERIAL) ||
      !exact(value.experience, [...PROTAGONISTS]) || !Array.isArray(value.dishes) ||
      !Array.isArray(value.pending) || value.dishes.length > MAX_DISHES || value.pending.length > MAX_PENDING) return bad();
  const exp = value.experience as Record<string, unknown>;
  if (PROTAGONISTS.some(id => !isInt(exp[id], 0, MAX_EXPERIENCE))) return bad();
  const ids = new Set<string>();
  const dishes: CookedDish[] = value.dishes.map(raw => {
    if (!exact(raw, ['id', 'owner', 'chef', 'recipeId', 'quality', 'servings', 'at']) ||
        typeof raw.id !== 'string' || !/^dish-[1-9]\d{0,6}$/.test(raw.id) || ids.has(raw.id) ||
        Number(raw.id.slice(5)) > value.serial || !isOwner(raw.owner) || !isOwner(raw.chef) ||
        typeof raw.recipeId !== 'string' || !getCookingRecipe(raw.recipeId) ||
        !isQuality(raw.quality) || !isInt(raw.servings, 1, INVENTORY_ITEM_LIMIT) ||
        !isInt(raw.at, 0, Math.min(now, DAY_MAX))) return bad();
    ids.add(raw.id);
    return { id: raw.id, owner: raw.owner, chef: raw.chef, recipeId: raw.recipeId,
      quality: raw.quality, servings: raw.servings, at: raw.at };
  });
  const pending: CookingEvent[] = value.pending.map(raw => {
    if (!exact(raw, ['id', 'owner', 'kind', 'recipeId', 'quality', 'at']) ||
        typeof raw.id !== 'string' || !/^cooking-[1-9]\d{0,6}$/.test(raw.id) || ids.has(raw.id) ||
        Number(raw.id.slice(8)) > value.serial || !isOwner(raw.owner) ||
        (raw.kind !== 'cooked' && raw.kind !== 'eaten') ||
        typeof raw.recipeId !== 'string' || !getCookingRecipe(raw.recipeId) ||
        !isQuality(raw.quality) || !isInt(raw.at, 0, Math.min(now, DAY_MAX))) return bad();
    ids.add(raw.id);
    return { id: raw.id, owner: raw.owner, kind: raw.kind, recipeId: raw.recipeId, quality: raw.quality, at: raw.at };
  });
  return { version: 1, serial: value.serial,
    experience: Object.fromEntries(PROTAGONISTS.map(id => [id, exp[id]])) as CookingState['experience'],
    dishes, pending };
}
const minute = (state: WorldState) => (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
export function cookingSkill(experience: number) {
  return experience < 30 ? { level: 1, label: '初学者' }
    : experience < 100 ? { level: 2, label: '熟悉灶台' }
      : experience < 240 ? { level: 3, label: '熟练' }
        : experience < 500 ? { level: 4, label: '擅长料理' }
          : { level: 5, label: '料理达人' };
}
export function cookQuote(state: WorldState, recipeId: string, owner = activeProtagonist(state)) {
  const recipe = getCookingRecipe(recipeId);
  const roomId = state.interior?.roomId ?? '';
  const room = getCampusInterior(roomId);
  const interaction = room?.interactions.find(item => item.id === COOKING_KITCHENS[roomId]);
  const counts = recipe?.ingredients.map(row => ({
    ...row, owned: state.inventory.find(item => item.itemId === row.itemId)?.quantity ?? 0,
  })) ?? [];
  const shelf = (state.cooking ?? createCookingState()).dishes.filter(row => row.owner === owner);
  const emptySlots = shelf.length < MAX_DISHES;
  const enough = counts.every(row => row.owned >= row.quantity);
  const clockOverflows = recipe && state.clock.day + Math.floor((state.clock.hour * 60 + state.clock.minute + recipe.minutes) / 1440) > 365000;
  const near = state.interior && interaction && Math.hypot(state.interior.x - interaction.x, state.interior.z - interaction.z) <= INTERIOR_INTERACTION_RANGE;
  const reason = !recipe ? '不存在的菜谱。'
    : !interaction || !near ? '请先到厨房料理台旁。'
      : !enough ? '背包里的食材不足。'
        : state.player.energy < recipe.energyCost ? '精力不足，暂时无法做这道菜。'
          : !emptySlots ? '成品批次过多，请先食用或整理料理。'
            : (state.cooking?.pending.length ?? 0) >= MAX_PENDING ? '尚未叙述的料理记录过多，请先继续一段故事。'
              : clockOverflows ? '已到达最大游戏天数。' : null;
  return { recipe, counts, blockedReason: reason };
}
function cooking(state: WorldState): CookingState { return state.cooking ??= createCookingState(); }
function issue(state: WorldState, prefix: 'dish' | 'cooking'): string {
  const c = cooking(state);
  if (c.serial >= MAX_SERIAL) throw new Error('烹饪记录数量已达到上限。');
  return prefix + '-' + ++c.serial;
}
function appendEvent(state: WorldState, owner: ProtagonistId, kind: CookingEvent['kind'], recipeId: string, quality: CookingQuality) {
  cooking(state).pending.push({ id: issue(state, 'cooking'), owner,
    kind, recipeId, quality, at: minute(state) });
}
/** Called only by the authoritative WorldAction reducer. No LLM decisions or requests. */
export function settleCooking(state: WorldState, recipeId: string, center: number, needle: number,
  advance: (state: WorldState, minutes: number) => void,
  owner: ProtagonistId = activeProtagonist(state)): { quality: CookingQuality; text: string } {
  const q = cookQuote(state, recipeId, owner);
  if (q.blockedReason || !q.recipe) throw new Error(q.blockedReason ?? '料理无法开始。');
  const quality = cookingQuality(q.recipe.difficulty, center, needle);
  advance(state, q.recipe.minutes);
  state.player.energy = adjustEnergy(state.player.energy, -q.recipe.energyCost);
  for (const row of q.recipe.ingredients) state.inventory = state.inventory.flatMap(held =>
    held.itemId !== row.itemId ? [held] : held.quantity > row.quantity
      ? [{ ...held, quantity: held.quantity - row.quantity }] : []);
  const c = cooking(state);
  const xp = quality === 'perfect' ? 9 : quality === 'ordinary' ? 6 : 3;
  c.experience[owner] = Math.min(MAX_EXPERIENCE, c.experience[owner] + xp);
  const id = issue(state, 'dish');
  c.dishes.push({ id, owner, chef: owner, recipeId, quality, servings: q.recipe.servings, at: minute(state) });
  appendEvent(state, owner, 'cooked', recipeId, quality);
  return { quality, text: `${protagonistNames[owner]}制作${q.recipe.name}：${COOKING_QUALITY_LABEL[quality]}品质，${q.recipe.servings} 份已放入料理背包；耗时 ${q.recipe.minutes} 分钟，消耗食材和精力，厨艺经验 +${xp}。` };
}
export function cookedDishQuote(state: WorldState, dishId: string, sharingNpcId?: string,
  owner: ProtagonistId = activeProtagonist(state), worldAuthority?: WorldState) {
  const dish = (state.cooking ?? createCookingState()).dishes.find(row => row.id === dishId && row.owner === owner) ?? null;
  const recipe = dish && getCookingRecipe(dish.recipeId);
  const people = sharingNpcId ? worldScenePeople(worldAuthority?.protagonists
    ? { ...state, protagonists: worldAuthority.protagonists } : state) : [];
  const person = sharingNpcId ? people.find(row => (row.id === sharingNpcId || row.contactId === sharingNpcId)
    && !row.protagonistId) ?? null : null;
  const pos = worldScenePosition(state);
  const inRange = person && pos && Math.hypot(pos.x - person.x, pos.z - person.z) <= 7;
  const duration = 10;
  const over = state.clock.day + Math.floor((state.clock.hour * 60 + state.clock.minute + duration) / 1440) > 365000;
  const reason = !dish || !recipe ? '没有这份料理。'
    : sharingNpcId && (!person || !inRange) ? '共餐对象不在身边。'
      : dish.servings < (sharingNpcId ? 2 : 1) ? '料理份数不足。'
        : (state.cooking?.pending.length ?? 0) >= MAX_PENDING && !sharingNpcId
          ? '尚未叙述的料理记录过多，请先继续一段故事。'
          : over ? '已到达最大游戏天数。' : null;
  return { dish, recipe, person, minutes: duration, blockedReason: reason };
}
function clamp(value: number, min = 0, max = 100) { return Math.min(max, Math.max(min, value)); }
function nourish(player: PlayerState, quality: CookingQuality, kcal: number): void {
  const fraction = quality === 'failed' ? 0.18 : quality === 'ordinary' ? 1 : 1.08;
  player.foodEnergy = clamp(player.foodEnergy + Math.round(kcal * fraction), 0, 3000);
  player.satiety = clamp(player.satiety + (quality === 'failed' ? 5 : quality === 'perfect' ? 44 : 33));
  player.energy = adjustEnergy(player.energy, quality === 'failed' ? 0 : quality === 'perfect' ? 22 : 14);
  player.morale = clamp(player.morale + (quality === 'failed' ? -3 : quality === 'perfect' ? 9 : 5));
  player.stress = clamp(player.stress + (quality === 'failed' ? 4 : quality === 'perfect' ? -7 : -4));
}
/** Authoritative one-serving consumption, optionally two only after an NPC accepted in prose. */
export function settleCookedDish(state: WorldState, dishId: string, npcId: string | null,
  advance: (state: WorldState, minutes: number) => void,
  owner: ProtagonistId = activeProtagonist(state), worldAuthority?: WorldState): string {
  const q = cookedDishQuote(state, dishId, npcId ?? undefined, owner, worldAuthority);
  if (q.blockedReason || !q.dish || !q.recipe) throw new Error(q.blockedReason ?? '无法享用料理。');
  advance(state, q.minutes);
  nourish(state.player, q.dish.quality, q.recipe.kcal);
  const dish = cooking(state).dishes.find(row => row.id === dishId)!;
  dish.servings -= npcId ? 2 : 1;
  if (dish.servings <= 0) cooking(state).dishes = cooking(state).dishes.filter(row => row.id !== dishId);
  if (!npcId) appendEvent(state, owner, 'eaten', q.recipe.id, q.dish.quality);
  const name = npcId ? q.person?.name : null;
  return `${protagonistNames[owner]}${name ? '与' + name + '共餐' : '食用'}${q.recipe.name}（${COOKING_QUALITY_LABEL[q.dish.quality]}品质），消耗 ${npcId ? 2 : 1} 份，耗时 ${q.minutes} 分钟；营养与身心变化已结算。`;
}
/** A successfully persisted foreground story acknowledges only previously seen events. */
export function acknowledgeCookingNarrative(before: WorldState, after: WorldState): void {
  if (!after.cooking || !before.cooking) return;
  const owner = activeProtagonist(before);
  const seen = new Set(before.cooking.pending.filter(e => e.owner === owner).map(e => e.id));
  after.cooking.pending = after.cooking.pending.filter(e => !seen.has(e.id));
}
export function cookingNarrativeContext(state: WorldState) {
  const owner = activeProtagonist(state), c = state.cooking ?? createCookingState();
  return {
    skill: cookingSkill(c.experience[owner]), experience: c.experience[owner],
    dishes: c.dishes.filter(item => item.owner === owner).map(item => ({
      id: item.id, recipe: getCookingRecipe(item.recipeId)?.name, quality: item.quality,
      servings: item.servings, chef: protagonistNames[item.chef],
    })),
    unreported: c.pending.filter(item => item.owner === owner).map(item => ({
      kind: item.kind, recipe: getCookingRecipe(item.recipeId)?.name, quality: item.quality,
      at: item.at,
    })),
  };
}
