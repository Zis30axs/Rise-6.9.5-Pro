import type { WorldState } from '../frontend/types';
import type { StoreItem } from './convenience-store';
import type { ProtagonistId } from './dual-protagonists';
import { getCampusInterior } from './campus-interiors';
import { allHousings } from './majo-housing';

/** Inclusive integer track. 0 is the left end, COOK_TRACK_END is the right end. */
export const COOK_TRACK_END = 1000;

/** Higher difficulty narrows both bands. Perfect is always strictly shorter than normal. */
export const COOK_ZONE_WIDTHS = {
  1: { normal: 480, perfect: 200 },
  2: { normal: 340, perfect: 120 },
  3: { normal: 220, perfect: 70 },
  4: { normal: 120, perfect: 36 },
} as const;

export type CookDifficulty = keyof typeof COOK_ZONE_WIDTHS;
export type CookTier = 'perfect' | 'normal' | 'fail';
export type CookSide = 'left' | 'right' | 'center';

export const COOK_TIER_LABEL: Record<CookTier, string> = {
  perfect: '完美',
  normal: '普通',
  fail: '失败料理',
};

export const SIDE_LABEL: Record<CookSide, string> = { left: '偏左', right: '偏右', center: '正中' };

export interface CookingZones {
  trackEnd: number;
  normalLo: number;
  normalHi: number;
  perfectLo: number;
  perfectHi: number;
}

export interface CookingSession {
  id: string;
  owner: ProtagonistId;
  recipeId: string;
  roomId: string;
  normalLo: number;
  normalHi: number;
  perfectLo: number;
  perfectHi: number;
  status: 'open' | 'settled';
  position: number | null;
  tier: CookTier | null;
  side: CookSide | null;
  miss: number;
  day: number;
  hour: number;
  minute: number;
}

export interface CookingState {
  version: 1;
  sessions: CookingSession[];
  settledIds: string[];
}

interface DishProfile {
  name: string;
  kcal: number;
  useMinutes: number;
  effects: StoreItem['effects'];
}

interface IngredientPortion {
  id: string;
  quantity: number;
}

export interface CookingRecipe {
  id: string;
  name: string;
  difficulty: CookDifficulty;
  minutes: number;
  energyCost: number;
  ingredients: readonly IngredientPortion[];
  blurb: string;
  dishes: Record<CookTier, DishProfile>;
}

const ingredient = (id: string, name: string, price: number, packSize = 1): StoreItem => Object.freeze({
  id, name, brand: '巷口', tier: 'basic', category: 'ingredient', price, packSize,
  purchaseUnit: packSize > 1 ? '包' : '份', useUnit: '份', kcal: 0, useMinutes: 0,
  effects: Object.freeze({ energy: 0, satiety: 0, stress: 0, health: 0 }),
});

export const cookingIngredientItems: readonly StoreItem[] = Object.freeze([
  ingredient('ingredient-miso', '味噌', 100, 5),
  ingredient('ingredient-tofu', '豆腐', 80),
  ingredient('ingredient-stock', '高汤块', 60, 6),
  ingredient('ingredient-egg', '鸡蛋', 144, 6),
  ingredient('ingredient-sugar', '砂糖', 80, 10),
  ingredient('ingredient-soy', '酱油', 100, 10),
  ingredient('ingredient-rice', '米饭', 90),
  ingredient('ingredient-curry', '咖喱块', 120, 4),
  ingredient('ingredient-vegetable', '蔬菜', 90, 2),
  ingredient('ingredient-meat', '肉', 180),
  ingredient('ingredient-onion', '洋葱', 60, 2),
  ingredient('ingredient-breadcrumb', '面包粉', 80, 8),
  ingredient('ingredient-noodles', '面条', 140, 2),
  ingredient('ingredient-bread', '吐司', 120, 4),
  ingredient('ingredient-chicken', '鸡肉', 140),
  ingredient('ingredient-salmon', '三文鱼', 210),
  ingredient('ingredient-potato', '土豆', 100, 2),
  ingredient('ingredient-scallion', '葱', 60, 4),
  ingredient('ingredient-seaweed', '海苔', 60, 6),
  ingredient('ingredient-cheese', '芝士', 120, 4),
  ingredient('ingredient-butter', '黄油', 90, 6),
  ingredient('ingredient-milk', '牛奶', 120, 3),
  ingredient('ingredient-flour', '面粉', 80, 8),
  ingredient('ingredient-mushroom', '蘑菇', 120, 2),
]);

export const ingredientById = new Map(cookingIngredientItems.map(item => [item.id, item]));

// Outstanding phone orders paid these prices for one portion per package.
export const legacyCookingIngredientPrices: ReadonlyMap<string, number> = new Map([
  ['ingredient-miso', 120], ['ingredient-tofu', 100], ['ingredient-stock', 80],
  ['ingredient-egg', 150], ['ingredient-sugar', 90], ['ingredient-soy', 110],
  ['ingredient-rice', 100], ['ingredient-curry', 220], ['ingredient-vegetable', 140],
  ['ingredient-meat', 280], ['ingredient-onion', 80], ['ingredient-breadcrumb', 90],
]);

function portion(id: string, quantity = 1): IngredientPortion {
  return { id: `ingredient-${id}`, quantity };
}

// Tune the ordinary serving for each recipe. Doneness adjusts the reward within that serving size.
function recipe(
  details: Omit<CookingRecipe, 'dishes'>,
  kcal: number,
  useMinutes: number,
  effects: StoreItem['effects'],
  variantMinutes = { perfect: useMinutes, fail: Math.max(3, useMinutes - 2) },
): CookingRecipe {
  const { name, difficulty } = details;
  return {
    ...details,
    dishes: {
      normal: { name, kcal, useMinutes, effects: Object.freeze(effects) },
      perfect: {
        name: `完美的${name}`, kcal: Math.round(kcal * 1.10 / 5) * 5, useMinutes: variantMinutes.perfect,
        effects: Object.freeze({ energy: effects.energy + 4, satiety: effects.satiety + 5, stress: effects.stress - 2,
          health: effects.health + 1, morale: (effects.morale ?? 0) + 3 }),
      },
      fail: {
        name: `失败的${name}`, kcal: Math.round(kcal * 0.30 / 5) * 5, useMinutes: variantMinutes.fail,
        effects: Object.freeze({ energy: Math.min(4, Math.floor(effects.energy / 4)), satiety: Math.round(effects.satiety / 4),
          stress: 2 + difficulty, health: difficulty <= 2 ? -1 : -2, morale: difficulty <= 2 ? -2 : -3 }),
      },
    },
  };
}

export const cookingRecipes: readonly CookingRecipe[] = Object.freeze([
  recipe({
    id: 'miso-soup', name: '味噌汤', difficulty: 1, minutes: 12, energyCost: 2,
    ingredients: [portion('miso'), portion('tofu'), portion('stock')],
    blurb: '豆腐切成小块，关小火再化开味噌。',
  }, 130, 8, { energy: 7, satiety: 11, stress: -3, health: 1, morale: 2 }),
  recipe({
    id: 'seaweed-rice-ball', name: '海苔饭团', difficulty: 1, minutes: 6, energyCost: 1,
    ingredients: [portion('rice'), portion('seaweed')],
    blurb: '趁米饭还有余温捏成团，最后包上海苔。',
  }, 310, 8, { energy: 14, satiety: 24, stress: -2, health: 0, morale: 1 }),
  recipe({
    id: 'scallion-egg-drop-soup', name: '葱花蛋汤', difficulty: 1, minutes: 8, energyCost: 1,
    ingredients: [portion('egg'), portion('stock'), portion('scallion')],
    blurb: '让蛋液沿锅边滑进高汤，起锅前撒葱花。',
  }, 120, 6, { energy: 6, satiety: 10, stress: -3, health: 0, morale: 2 }),
  recipe({
    id: 'butter-toast', name: '黄油吐司', difficulty: 1, minutes: 6, energyCost: 1,
    ingredients: [portion('bread'), portion('butter')],
    blurb: '吐司两面烘脆，趁热抹一层黄油。',
  }, 220, 5, { energy: 9, satiety: 14, stress: -2, health: 0, morale: 1 }),
  recipe({
    id: 'egg-roll', name: '煎蛋卷', difficulty: 2, minutes: 18, energyCost: 3,
    ingredients: [portion('egg'), portion('sugar'), portion('soy')],
    blurb: '蛋液分次铺薄，每一层刚凝住就卷起来。',
  }, 165, 10, { energy: 10, satiety: 15, stress: -2, health: 0, morale: 2 }),
  recipe({
    id: 'egg-fried-rice', name: '蛋炒饭', difficulty: 2, minutes: 16, energyCost: 3,
    ingredients: [portion('rice'), portion('egg', 2), portion('vegetable'), portion('soy')],
    blurb: '鸡蛋刚炒散时下米饭，翻到饭粒松开。',
  }, 505, 12, { energy: 23, satiety: 34, stress: -3, health: 0, morale: 2 }),
  recipe({
    id: 'vegetable-noodle-soup', name: '青菜汤面', difficulty: 2, minutes: 15, energyCost: 3,
    ingredients: [portion('noodles'), portion('vegetable'), portion('stock'), portion('soy'), portion('scallion')],
    blurb: '面条煮软前放青菜，留一点葱花给清汤。',
  }, 440, 13, { energy: 19, satiety: 31, stress: -3, health: 1, morale: 2 }),
  recipe({
    id: 'mushroom-soy-tofu', name: '蘑菇烧豆腐', difficulty: 2, minutes: 16, energyCost: 3,
    ingredients: [portion('tofu'), portion('mushroom'), portion('soy'), portion('stock')],
    blurb: '蘑菇炒香后加豆腐和高汤，小火把汤汁收浓。',
  }, 240, 10, { energy: 13, satiety: 20, stress: -3, health: 2, morale: 2 }),
  recipe({
    id: 'milk-pudding', name: '牛奶布丁', difficulty: 2, minutes: 18, energyCost: 3,
    ingredients: [portion('milk'), portion('egg'), portion('sugar')],
    blurb: '蛋奶液过筛后小火蒸，凝住就关火。',
  }, 205, 6, { energy: 9, satiety: 12, stress: -6, health: 0, morale: 5 }),
  recipe({
    id: 'potato-cheese-toast', name: '土豆芝士吐司', difficulty: 2, minutes: 18, energyCost: 3,
    ingredients: [portion('bread'), portion('potato'), portion('cheese'), portion('butter')],
    blurb: '把土豆泥铺上吐司，烤到芝士冒泡。',
  }, 365, 10, { energy: 16, satiety: 28, stress: -3, health: 0, morale: 3 }),
  recipe({
    id: 'curry-rice', name: '咖喱饭', difficulty: 3, minutes: 30, energyCost: 5,
    ingredients: [portion('rice'), portion('curry'), portion('vegetable'), portion('meat')],
    blurb: '肉和蔬菜炖软后化开咖喱，浇在热饭上。',
  }, 640, 16, { energy: 28, satiety: 43, stress: -5, health: 1, morale: 4 }, { perfect: 18, fail: 12 }),
  recipe({
    id: 'chicken-egg-rice', name: '鸡肉滑蛋盖饭', difficulty: 3, minutes: 23, energyCost: 4,
    ingredients: [portion('rice'), portion('chicken'), portion('egg'), portion('onion'), portion('soy')],
    blurb: '鸡肉和洋葱先煮入味，蛋液凝住时滑到饭上。',
  }, 575, 14, { energy: 26, satiety: 40, stress: -4, health: 1, morale: 3 }),
  recipe({
    id: 'cream-mushroom-pasta', name: '奶油蘑菇面', difficulty: 3, minutes: 26, energyCost: 5,
    ingredients: [portion('noodles'), portion('mushroom'), portion('milk'), portion('butter'), portion('flour')],
    blurb: '边搅边往黄油面糊里加牛奶，再拌入炒香的蘑菇。',
  }, 540, 14, { energy: 24, satiety: 38, stress: -4, health: 0, morale: 4 }),
  recipe({
    id: 'butter-salmon-rice', name: '黄油三文鱼饭', difficulty: 3, minutes: 24, energyCost: 4,
    ingredients: [portion('rice'), portion('salmon'), portion('butter'), portion('soy')],
    blurb: '三文鱼皮朝下煎脆，临出锅淋一点酱油。',
  }, 580, 14, { energy: 25, satiety: 39, stress: -4, health: 2, morale: 3 }),
  recipe({
    id: 'hamburg', name: '汉堡排', difficulty: 4, minutes: 40, energyCost: 8,
    ingredients: [portion('meat'), portion('onion'), portion('egg'), portion('breadcrumb')],
    blurb: '洋葱末拌进肉馅，先煎出表面焦香，再慢慢煎透。',
  }, 475, 16, { energy: 25, satiety: 35, stress: -5, health: 1, morale: 5 }, { perfect: 18, fail: 12 }),
  recipe({
    id: 'cheese-chicken-gratin', name: '芝士鸡肉焗土豆', difficulty: 4, minutes: 36, energyCost: 7,
    ingredients: [portion('potato'), portion('chicken'), portion('milk'), portion('cheese'), portion('flour'), portion('butter')],
    blurb: '鸡肉、土豆和白酱铺在烤盘里，等芝士上色。',
  }, 650, 16, { energy: 29, satiety: 44, stress: -6, health: 1, morale: 5 }),
]);

export const recipeById = new Map(cookingRecipes.map(recipe => [recipe.id, recipe]));

export function zoneWidths(difficulty: number): { normal: number; perfect: number } {
  if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3 && difficulty !== 4) throw new Error('料理难度无效。');
  return COOK_ZONE_WIDTHS[difficulty];
}

/** Deterministic unit interval. Same seed always yields the same sequence. */
export function cookRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  let state = hash >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    state ^= state >>> 14;
    return (state >>> 0) / 4294967296;
  };
}

/** Normal band lies on the track; perfect is placed inside it, edges included. */
export function placeCookingZones(difficulty: number, seed: string): CookingZones {
  const { normal, perfect } = zoneWidths(difficulty);
  const random = cookRandom(seed);
  const normalLo = Math.floor(random() * (COOK_TRACK_END - normal + 1));
  const normalHi = normalLo + normal;
  const perfectLo = normalLo + Math.floor(random() * (normal - perfect + 1));
  const perfectHi = perfectLo + perfect;
  return { trackEnd: COOK_TRACK_END, normalLo, normalHi, perfectLo, perfectHi };
}

export function judgeCooking(zones: Pick<CookingZones, 'normalLo' | 'normalHi' | 'perfectLo' | 'perfectHi'>, position: number): { tier: CookTier; side: CookSide; miss: number } {
  const perfect = position >= zones.perfectLo && position <= zones.perfectHi;
  const normal = position >= zones.normalLo && position <= zones.normalHi;
  const tier: CookTier = perfect ? 'perfect' : normal ? 'normal' : 'fail';
  const center = (zones.perfectLo + zones.perfectHi) / 2;
  const side: CookSide = position < center ? 'left' : position > center ? 'right' : 'center';
  const miss = perfect ? 0 : position < zones.perfectLo ? zones.perfectLo - position : position - zones.perfectHi;
  return { tier, side, miss };
}

export function cookingDishId(recipeId: string, tier: CookTier): string {
  return `dish-${recipeId}-${tier}`;
}

const dishItems = Object.freeze(cookingRecipes.flatMap(recipe => (['perfect', 'normal', 'fail'] as const).map(tier => {
  const profile = recipe.dishes[tier];
  const item: StoreItem = {
    id: cookingDishId(recipe.id, tier), name: profile.name, brand: '自家厨房',
    tier: tier === 'perfect' ? 'premium' : tier === 'normal' ? 'standard' : 'basic',
    category: 'meal', price: 0, packSize: 1, purchaseUnit: '份', useUnit: '份',
    kcal: profile.kcal, useMinutes: profile.useMinutes, effects: profile.effects,
  };
  return Object.freeze(item);
})));

export function cookingDishItems(): readonly StoreItem[] {
  return dishItems;
}

const KITCHEN_WORD = /厨房|料理/;

export interface KitchenResidence {
  housingId: string;
  roomId: string;
  label: string;
}

export function kitchenResidences(): readonly KitchenResidence[] {
  const found: KitchenResidence[] = [];
  for (const housing of allHousings) {
    const interior = getCampusInterior(housing.interiorId);
    const described = KITCHEN_WORD.test(`${housing.description} ${interior?.description ?? ''}`);
    const obstacle = interior?.obstacles.some(item => item.id.includes('kitchen')) ?? false;
    if (!described && !obstacle) continue;
    if (found.some(item => item.roomId === housing.interiorId)) continue;
    found.push({ housingId: housing.id, roomId: housing.interiorId, label: housing.label });
  }
  return found;
}

export function kitchenAt(state: Pick<WorldState, 'interior'>): KitchenResidence | null {
  const roomId = state.interior?.roomId;
  if (!roomId) return null;
  return kitchenResidences().find(item => item.roomId === roomId) ?? null;
}
