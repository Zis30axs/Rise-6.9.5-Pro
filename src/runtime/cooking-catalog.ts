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

export interface CookingRecipe {
  id: string;
  name: string;
  difficulty: CookDifficulty;
  minutes: number;
  energyCost: number;
  ingredients: readonly string[];
  blurb: string;
  dishes: Record<CookTier, DishProfile>;
}

const ingredient = (id: string, name: string, price: number): StoreItem => Object.freeze({
  id, name, brand: '巷口', tier: 'basic', category: 'ingredient', price, packSize: 1,
  purchaseUnit: '份', useUnit: '份', kcal: 0, useMinutes: 1,
  effects: Object.freeze({ energy: 0, satiety: 0, stress: 0, health: 0 }),
});

export const cookingIngredientItems: readonly StoreItem[] = Object.freeze([
  ingredient('ingredient-miso', '味噌', 120),
  ingredient('ingredient-tofu', '豆腐', 100),
  ingredient('ingredient-stock', '高汤块', 80),
  ingredient('ingredient-egg', '鸡蛋', 150),
  ingredient('ingredient-sugar', '砂糖', 90),
  ingredient('ingredient-soy', '酱油', 110),
  ingredient('ingredient-rice', '米饭', 100),
  ingredient('ingredient-curry', '咖喱块', 220),
  ingredient('ingredient-vegetable', '蔬菜', 140),
  ingredient('ingredient-meat', '肉', 280),
  ingredient('ingredient-onion', '洋葱', 80),
  ingredient('ingredient-breadcrumb', '面包粉', 90),
]);

const dish = (name: string, kcal: number, useMinutes: number, effects: StoreItem['effects']): DishProfile => ({
  name, kcal, useMinutes, effects: Object.freeze(effects),
});

export const cookingRecipes: readonly CookingRecipe[] = Object.freeze([
  {
    id: 'miso-soup', name: '味噌汤', difficulty: 1, minutes: 12, energyCost: 2,
    ingredients: ['ingredient-miso', 'ingredient-tofu', 'ingredient-stock'],
    blurb: '味噌、豆腐和高汤，火候宽容一些。',
    dishes: {
      perfect: dish('完美的味噌汤', 220, 8, { energy: 16, satiety: 22, stress: -6, health: 2, morale: 6 }),
      normal: dish('味噌汤', 160, 8, { energy: 10, satiety: 16, stress: -3, health: 1, morale: 2 }),
      fail: dish('失败的味噌汤', 40, 6, { energy: 2, satiety: 4, stress: 6, health: -2, morale: -4 }),
    },
  },
  {
    id: 'egg-roll', name: '煎蛋卷', difficulty: 2, minutes: 18, energyCost: 3,
    ingredients: ['ingredient-egg', 'ingredient-sugar', 'ingredient-soy'],
    blurb: '蛋液要卷得均匀，甜咸停在一层上。',
    dishes: {
      perfect: dish('完美的煎蛋卷', 340, 10, { energy: 22, satiety: 30, stress: -6, health: 2, morale: 6 }),
      normal: dish('煎蛋卷', 260, 10, { energy: 14, satiety: 22, stress: -3, health: 1, morale: 2 }),
      fail: dish('失败的煎蛋卷', 70, 8, { energy: 2, satiety: 6, stress: 8, health: -3, morale: -5 }),
    },
  },
  {
    id: 'curry-rice', name: '咖喱饭', difficulty: 3, minutes: 30, energyCost: 5,
    ingredients: ['ingredient-rice', 'ingredient-curry', 'ingredient-vegetable', 'ingredient-meat'],
    blurb: '饭、咖喱、蔬菜和肉要一起炖到收汁。',
    dishes: {
      perfect: dish('完美的咖喱饭', 760, 18, { energy: 36, satiety: 52, stress: -8, health: 3, morale: 8 }),
      normal: dish('咖喱饭', 600, 16, { energy: 24, satiety: 40, stress: -4, health: 1, morale: 3 }),
      fail: dish('失败的咖喱饭', 180, 12, { energy: 4, satiety: 10, stress: 10, health: -4, morale: -6 }),
    },
  },
  {
    id: 'hamburg', name: '汉堡排', difficulty: 4, minutes: 40, energyCost: 8,
    ingredients: ['ingredient-meat', 'ingredient-onion', 'ingredient-egg', 'ingredient-breadcrumb'],
    blurb: '肉饼厚，窗口窄，停早停晚都不行。',
    dishes: {
      perfect: dish('完美的汉堡排', 700, 18, { energy: 34, satiety: 50, stress: -8, health: 3, morale: 8 }),
      normal: dish('汉堡排', 540, 16, { energy: 22, satiety: 38, stress: -4, health: 1, morale: 3 }),
      fail: dish('失败的汉堡排', 160, 12, { energy: 3, satiety: 8, stress: 12, health: -5, morale: -6 }),
    },
  },
]);

export const ingredientById = new Map(cookingIngredientItems.map(item => [item.id, item]));
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

export function cookingDishItems(): readonly StoreItem[] {
  return cookingRecipes.flatMap(recipe => (['perfect', 'normal', 'fail'] as const).map(tier => {
    const profile = recipe.dishes[tier];
    const item: StoreItem = {
      id: cookingDishId(recipe.id, tier), name: profile.name, brand: '自家厨房',
      tier: tier === 'perfect' ? 'premium' : tier === 'normal' ? 'standard' : 'basic',
      category: 'meal', price: 0, packSize: 1, purchaseUnit: '份', useUnit: '份',
      kcal: profile.kcal, useMinutes: profile.useMinutes, effects: profile.effects,
    };
    return Object.freeze(item);
  }));
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
