/** Stable, offline-only cooking catalog. Ingredients are normal shop inventory units. */
export type CookingDifficulty = 'easy' | 'normal' | 'hard' | 'expert';
export type CookingQuality = 'failed' | 'ordinary' | 'perfect';
export interface CookingIngredient {
  id: string; name: string; price: number;
}
export interface CookingRecipe {
  id: string; name: string; difficulty: CookingDifficulty;
  minutes: number; energyCost: number; servings: number; kcal: number;
  ingredients: readonly { itemId: string; quantity: number }[];
}
export const COOKING_INGREDIENTS: readonly CookingIngredient[] = Object.freeze([
  { id: 'ingredient-egg', name: '鲜鸡蛋', price: 60 },
  { id: 'ingredient-bread', name: '吐司面包', price: 100 },
  { id: 'ingredient-rice', name: '白米', price: 110 },
  { id: 'ingredient-vegetable', name: '新鲜蔬菜', price: 140 },
  { id: 'ingredient-chicken', name: '鸡肉', price: 280 },
  { id: 'ingredient-curry', name: '咖喱块', price: 120 },
  { id: 'ingredient-pork', name: '猪排肉', price: 320 },
  { id: 'ingredient-flour', name: '面粉与面包糠', price: 100 },
  { id: 'ingredient-milk', name: '牛奶', price: 160 },
  { id: 'ingredient-beef', name: '牛肉片', price: 480 },
  { id: 'ingredient-tofu', name: '豆腐', price: 120 },
]);
const need = (itemId: string, quantity: number) => ({ itemId: 'ingredient-' + itemId, quantity });
export const COOKING_RECIPES: readonly CookingRecipe[] = Object.freeze([
  { id: 'fried-egg', name: '煎蛋', difficulty: 'easy', minutes: 10, energyCost: 2, servings: 1, kcal: 180, ingredients: [need('egg', 2)] },
  { id: 'sandwich', name: '蔬菜三明治', difficulty: 'easy', minutes: 12, energyCost: 3, servings: 2, kcal: 320, ingredients: [need('bread', 2), need('vegetable', 1)] },
  { id: 'fried-rice', name: '蔬菜炒饭', difficulty: 'normal', minutes: 20, energyCost: 5, servings: 2, kcal: 520, ingredients: [need('rice', 2), need('egg', 1), need('vegetable', 1)] },
  { id: 'curry-rice', name: '鸡肉咖喱饭', difficulty: 'normal', minutes: 25, energyCost: 6, servings: 2, kcal: 650, ingredients: [need('rice', 2), need('chicken', 1), need('curry', 1)] },
  { id: 'omurice', name: '蛋包饭', difficulty: 'hard', minutes: 30, energyCost: 7, servings: 2, kcal: 630, ingredients: [need('rice', 2), need('egg', 2), need('chicken', 1)] },
  { id: 'tonkatsu', name: '炸猪排', difficulty: 'hard', minutes: 35, energyCost: 8, servings: 2, kcal: 700, ingredients: [need('pork', 2), need('egg', 1), need('flour', 1)] },
  { id: 'cream-stew', name: '奶油炖菜', difficulty: 'expert', minutes: 35, energyCost: 9, servings: 2, kcal: 580, ingredients: [need('milk', 1), need('chicken', 1), need('vegetable', 2)] },
  { id: 'sukiyaki', name: '寿喜烧', difficulty: 'expert', minutes: 45, energyCost: 10, servings: 2, kcal: 760, ingredients: [need('beef', 2), need('tofu', 1), need('vegetable', 2)] },
]);
export const COOKING_DIFFICULTY: Readonly<Record<CookingDifficulty, { label: string; perfect: number; ordinary: number }>> = Object.freeze({
  easy: { label: '简单', perfect: 0.20, ordinary: 0.50 },
  normal: { label: '普通', perfect: 0.12, ordinary: 0.38 },
  hard: { label: '困难', perfect: 0.07, ordinary: 0.25 },
  expert: { label: '大师', perfect: 0.04, ordinary: 0.16 },
});
export const COOKING_QUALITY_LABEL: Readonly<Record<CookingQuality, string>> =
  { failed: '失败', ordinary: '普通', perfect: '完美' };
export function getCookingRecipe(id: string): CookingRecipe | null {
  return COOKING_RECIPES.find(recipe => recipe.id === id) ?? null;
}
/** 0..1 dial, one perfect segment with ordinary shoulders; the rest fails. */
export function cookingZones(difficulty: CookingDifficulty, center: number) {
  const config = COOKING_DIFFICULTY[difficulty];
  const half = config.perfect / 2, outer = config.ordinary / 2 + half;
  return {
    perfectStart: center - half, perfectEnd: center + half,
    ordinaryStart: center - outer, ordinaryEnd: center + outer,
  };
}
export function drawCookingCenter(difficulty: CookingDifficulty, sample: number): number {
  const config = COOKING_DIFFICULTY[difficulty];
  const margin = (config.ordinary + config.perfect) / 2;
  if (!Number.isFinite(sample) || sample < 0 || sample > 1) throw new Error('随机表盘位置无效');
  return margin + sample * (1 - 2 * margin);
}
export function cookingQuality(difficulty: CookingDifficulty, center: number, needle: number): CookingQuality {
  if (![center, needle].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw new Error('烹饪指针位置无效');
  const z = cookingZones(difficulty, center);
  const eps = 1e-8;
  if (needle >= z.perfectStart - eps && needle <= z.perfectEnd + eps) return 'perfect';
  if (needle >= z.ordinaryStart - eps && needle <= z.ordinaryEnd + eps) return 'ordinary';
  return 'failed';
}
