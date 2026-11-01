import type { WorldState } from '../frontend/types';
import { INVENTORY_ITEM_LIMIT } from './convenience-store';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import { adjustEnergy } from './energy';
import { protagonistNames } from './protagonist-world';
import {
  COOK_TIER_LABEL, COOK_TRACK_END, SIDE_LABEL, cookingDishId, cookingRecipes, ingredientById, judgeCooking, kitchenAt,
  kitchenResidences, placeCookingZones, recipeById, zoneWidths,
  type CookDifficulty, type CookSide, type CookTier, type CookingRecipe, type CookingSession, type CookingState, type CookingZones,
} from './cooking-catalog';

export {
  COOK_TRACK_END, COOK_ZONE_WIDTHS, COOK_TIER_LABEL, zoneWidths, cookRandom, placeCookingZones, judgeCooking,
  cookingIngredientItems, cookingRecipes, cookingDishItems, cookingDishId, kitchenResidences, kitchenAt,
} from './cooking-catalog';
export type { CookDifficulty, CookTier, CookSide, CookingZones, CookingRecipe, CookingSession, CookingState, KitchenResidence } from './cooking-catalog';

export function cookingProtagonist(state: WorldState): ProtagonistId {
  const active = state.protagonists?.accounts.active;
  return active && (PROTAGONISTS as readonly string[]).includes(active) ? active : 'soyo';
}

export function openCookingSession(state: WorldState, owner = cookingProtagonist(state)): CookingSession | null {
  return state.cooking?.sessions.find(session => session.owner === owner && session.status === 'open') ?? null;
}

export interface CookingRecipeOption {
  id: string;
  name: string;
  difficulty: CookDifficulty;
  minutes: number;
  energyCost: number;
  blurb: string;
  ingredients: { id: string; name: string; owned: number; needed: number }[];
  blockedReason: string | null;
}

function ownedQuantity(state: WorldState, itemId: string): number {
  return state.inventory.find(entry => entry.itemId === itemId)?.quantity ?? 0;
}

export function cookingRecipeOptions(state: WorldState): readonly CookingRecipeOption[] {
  const kitchen = kitchenAt(state);
  const open = openCookingSession(state);
  return cookingRecipes.map(recipe => {
    const ingredients = recipe.ingredients.map(id => ({
      id, name: ingredientById.get(id)?.name ?? id, owned: ownedQuantity(state, id), needed: 1,
    }));
    let blockedReason: string | null = null;
    if (!kitchen) blockedReason = '这里没有厨房。';
    else if (open) blockedReason = '面前还有一道没做完的料理。';
    else if (state.player.energy < recipe.energyCost) blockedReason = '精力不够，先歇一歇。';
    else if (ingredients.some(item => item.owned < item.needed)) blockedReason = '食材不够，还不能开始。';
    return {
      id: recipe.id, name: recipe.name, difficulty: recipe.difficulty, minutes: recipe.minutes,
      energyCost: recipe.energyCost, blurb: recipe.blurb, ingredients, blockedReason,
    };
  });
}

function fail(message: string): never {
  throw new Error(message);
}

function nextSessionId(state: WorldState, owner: ProtagonistId, recipeId: string): string {
  const clock = state.clock;
  const base = `cook-${owner}-d${clock.day}-h${clock.hour}-m${clock.minute}-${recipeId}`;
  const used = new Set([...(state.cooking?.settledIds ?? []), ...(state.cooking?.sessions ?? []).map(session => session.id)]);
  let sequence = 1;
  while (used.has(`${base}-${sequence}`)) sequence += 1;
  return `${base}-${sequence}`;
}

function storeSession(state: WorldState, session: CookingSession): void {
  const prior = state.cooking ?? { version: 1 as const, sessions: [], settledIds: [] };
  const sessions = prior.sessions.some(item => item.id === session.id)
    ? prior.sessions.map(item => item.id === session.id ? session : item)
    : [...prior.sessions, session];
  const settledIds = [...prior.settledIds];
  if (session.status === 'settled' && !settledIds.includes(session.id)) settledIds.push(session.id);
  while (sessions.length > 8) {
    const index = sessions.findIndex(item => item.status === 'settled');
    if (index < 0) break;
    sessions.splice(index, 1);
  }
  const live = new Set(sessions.filter(item => item.status === 'settled').map(item => item.id));
  while (settledIds.length > 64) {
    const index = settledIds.findIndex(id => !live.has(id));
    if (index < 0) break;
    settledIds.splice(index, 1);
  }
  state.cooking = { version: 1, sessions, settledIds };
}

export function applyCookingBegin(state: WorldState, recipeId: string, owner: ProtagonistId): void {
  const recipe = recipeById.get(recipeId);
  if (!recipe) fail('没有这道菜。');
  const kitchen = kitchenAt(state);
  if (!kitchen) fail('这里没有厨房。');
  if (openCookingSession(state, owner)) fail('面前还有一道没做完的料理。');
  if (state.player.energy < recipe.energyCost) fail('精力不够，先歇一歇。');
  if (recipe.ingredients.some(id => ownedQuantity(state, id) < 1)) fail('食材不够，还不能开始。');
  const seed = [state.scene?.seed ?? 'unread-city', owner, recipe.id, state.clock.day, state.clock.hour, state.clock.minute, state.cooking?.sessions.length ?? 0, state.journal.length].join('|');
  const zones = placeCookingZones(recipe.difficulty, seed);
  storeSession(state, {
    id: nextSessionId(state, owner, recipe.id), owner, recipeId: recipe.id, roomId: kitchen.roomId,
    normalLo: zones.normalLo, normalHi: zones.normalHi, perfectLo: zones.perfectLo, perfectHi: zones.perfectHi,
    status: 'open', position: null, tier: null, side: null, miss: 0,
    day: state.clock.day, hour: state.clock.hour, minute: state.clock.minute,
  });
}

export function applyCookingCancel(state: WorldState, sessionId: string, owner: ProtagonistId): void {
  const session = state.cooking?.sessions.find(item => item.id === sessionId);
  if (!session || session.status !== 'open') fail('没有还在做的料理。');
  if (session.owner !== owner) fail('这道料理是另一位主角开始的。');
  state.cooking = { ...state.cooking!, sessions: state.cooking!.sessions.filter(item => item.id !== sessionId) };
}

function takeIngredients(state: WorldState, recipe: CookingRecipe): void {
  const next = state.inventory.map(entry => ({ ...entry }));
  for (const itemId of recipe.ingredients) {
    const row = next.find(entry => entry.itemId === itemId);
    if (!row || row.quantity < 1) fail('食材不够，这道料理没有做成。');
    row.quantity -= 1;
  }
  state.inventory = next.filter(entry => entry.quantity > 0);
}

function giveDish(state: WorldState, itemId: string): void {
  const held = state.inventory.find(entry => entry.itemId === itemId);
  if (held && held.quantity >= INVENTORY_ITEM_LIMIT) fail('背包里放不下这道料理了。');
  if (held) held.quantity += 1;
  else state.inventory = [...state.inventory, { itemId, quantity: 1 }];
}

export function applyCookingSettle(
  state: WorldState,
  sessionId: string,
  position: number,
  owner: ProtagonistId,
  advance: (state: WorldState, minutes: number) => void,
  note: (state: WorldState, message: string, stableId?: string) => void,
): void {
  if (state.cooking?.settledIds.includes(sessionId)) return;
  const session = state.cooking?.sessions.find(item => item.id === sessionId);
  if (session?.status === 'settled') return;
  if (!session) fail('找不到这道料理。');
  if (session.owner !== owner) fail('这道料理是另一位主角开始的。');
  if (!Number.isInteger(position) || position < 0 || position > COOK_TRACK_END) fail('指针位置无效。');
  const recipe = recipeById.get(session.recipeId);
  const kitchen = kitchenResidences().find(item => item.roomId === session.roomId);
  if (!recipe || !kitchen || kitchenAt(state)?.roomId !== session.roomId) fail('人已经不在这间厨房了。');
  if (state.player.energy < recipe.energyCost) fail('精力不够，这道料理没有做成。');
  const judgment = judgeCooking(session, position);
  const dishId = cookingDishId(recipe.id, judgment.tier);
  if ((state.inventory.find(entry => entry.itemId === dishId)?.quantity ?? 0) >= INVENTORY_ITEM_LIMIT) fail('背包里放不下这道料理了。');
  takeIngredients(state, recipe);
  advance(state, recipe.minutes);
  state.player.energy = adjustEnergy(state.player.energy, -recipe.energyCost);
  giveDish(state, dishId);
  const settled: CookingSession = {
    ...session, status: 'settled', position, tier: judgment.tier, side: judgment.side, miss: judgment.miss,
    day: state.clock.day, hour: state.clock.hour, minute: state.clock.minute,
  };
  storeSession(state, settled);
  const ingredients = recipe.ingredients.map(id => ingredientById.get(id)?.name ?? id).join('、');
  const clock = `第 ${settled.day} 天 ${String(settled.hour).padStart(2, '0')}:${String(settled.minute).padStart(2, '0')}`;
  note(state, `下厨：${recipe.name}，难度${recipe.difficulty}，${COOK_TIER_LABEL[judgment.tier]}。指针 ${position}（${SIDE_LABEL[judgment.side]}，偏离完美区 ${judgment.miss}；完美区 ${session.perfectLo}–${session.perfectHi}，普通区 ${session.normalLo}–${session.normalHi}）。食材 ${ingredients}。地点 ${kitchen.label}。下厨者 ${protagonistNames[owner]}。${clock}。成品 ${recipe.dishes[judgment.tier].name}。耗时 ${recipe.minutes} 分钟。`, session.id);
}

export type CookingLlmPayload = {
  status: 'open';
  recipeId: string;
  recipeName: string;
  difficulty: number;
  cookId: ProtagonistId;
  cookName: string;
  kitchenRoomId: string;
  kitchen: string;
  ingredients: { id: string; name: string }[];
  zones: CookingZones;
  startedAt: { day: number; hour: number; minute: number };
} | {
  status: 'settled';
  recipeId: string;
  recipeName: string;
  difficulty: number;
  tier: CookTier;
  tierLabel: string;
  position: number;
  side: CookSide;
  sideLabel: string;
  miss: number;
  zones: CookingZones;
  ingredients: { id: string; name: string }[];
  cookId: ProtagonistId;
  cookName: string;
  kitchenRoomId: string;
  kitchen: string;
  time: { day: number; hour: number; minute: number };
  elapsedMinutes: number;
  dishName: string;
};

function zonesOf(session: CookingSession): CookingZones {
  return {
    trackEnd: COOK_TRACK_END,
    normalLo: session.normalLo, normalHi: session.normalHi,
    perfectLo: session.perfectLo, perfectHi: session.perfectHi,
  };
}

/** Facts for the narrator. Numbers are already saved; this object does not ask anyone to change them. */
export function cookingLlmPayload(state: WorldState, owner = cookingProtagonist(state)): CookingLlmPayload | null {
  const open = openCookingSession(state, owner);
  const session = open ?? [...(state.cooking?.sessions ?? [])].reverse().find(item => item.owner === owner && item.status === 'settled') ?? null;
  if (!session) return null;
  if (session.status === 'settled' && !state.journal.slice(-12).some(entry => entry.id === session.id)) return null;
  const recipe = recipeById.get(session.recipeId);
  const kitchen = kitchenResidences().find(item => item.roomId === session.roomId);
  if (!recipe || !kitchen) return null;
  const ingredients = recipe.ingredients.map(id => ({ id, name: ingredientById.get(id)?.name ?? id }));
  const shared = {
    recipeId: recipe.id, recipeName: recipe.name, difficulty: recipe.difficulty,
    cookId: owner, cookName: protagonistNames[owner], kitchenRoomId: kitchen.roomId, kitchen: kitchen.label,
    ingredients, zones: zonesOf(session),
  };
  if (session.status === 'open') {
    return { status: 'open', ...shared, startedAt: { day: session.day, hour: session.hour, minute: session.minute } };
  }
  if (session.position === null || !session.tier || !session.side) return null;
  return {
    status: 'settled', ...shared, tier: session.tier, tierLabel: COOK_TIER_LABEL[session.tier],
    position: session.position, side: session.side, sideLabel: SIDE_LABEL[session.side], miss: session.miss,
    time: { day: session.day, hour: session.hour, minute: session.minute },
    elapsedMinutes: recipe.minutes, dishName: recipe.dishes[session.tier].name,
  };
}

const SESSION_KEYS = ['id', 'owner', 'recipeId', 'roomId', 'normalLo', 'normalHi', 'perfectLo', 'perfectHi', 'status', 'position', 'tier', 'side', 'miss', 'day', 'hour', 'minute'];

function invalid(path: string): never {
  throw new Error(`存档格式无效：${path}。原存档已保留，请先备份并检查数据。`);
}

function exact(value: unknown, keys: string[], path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
  const own = Object.keys(value);
  if (own.length !== keys.length || own.some(key => !keys.includes(key))) return invalid(`${path} 字段`);
  return value as Record<string, unknown>;
}

function int(value: unknown, min: number, max: number, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return invalid(path);
  return value;
}

function parseSession(value: unknown, index: number): CookingSession {
  const path = `cooking.sessions[${index}]`;
  const row = exact(value, SESSION_KEYS, path);
  const id = typeof row.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(row.id) && row.id.length <= 128 ? row.id : invalid(`${path}.id`);
  const owner = typeof row.owner === 'string' && (PROTAGONISTS as readonly string[]).includes(row.owner) ? row.owner as ProtagonistId : invalid(`${path}.owner`);
  const recipe = typeof row.recipeId === 'string' ? recipeById.get(row.recipeId) : null;
  if (!recipe) return invalid(`${path}.recipeId`);
  if (typeof row.roomId !== 'string' || !kitchenResidences().some(item => item.roomId === row.roomId)) return invalid(`${path}.roomId`);
  const widths = zoneWidths(recipe.difficulty);
  const normalLo = int(row.normalLo, 0, COOK_TRACK_END, `${path}.normalLo`);
  const normalHi = int(row.normalHi, 0, COOK_TRACK_END, `${path}.normalHi`);
  const perfectLo = int(row.perfectLo, 0, COOK_TRACK_END, `${path}.perfectLo`);
  const perfectHi = int(row.perfectHi, 0, COOK_TRACK_END, `${path}.perfectHi`);
  if (normalHi - normalLo !== widths.normal || perfectHi - perfectLo !== widths.perfect) return invalid(`${path} 区间`);
  if (perfectLo < normalLo || perfectHi > normalHi) return invalid(`${path} 区间`);
  if (row.status !== 'open' && row.status !== 'settled') return invalid(`${path}.status`);
  const day = int(row.day, 1, 365000, `${path}.day`);
  const hour = int(row.hour, 0, 23, `${path}.hour`);
  const minute = int(row.minute, 0, 59, `${path}.minute`);
  const miss = int(row.miss, 0, COOK_TRACK_END, `${path}.miss`);
  if (row.status === 'open') {
    if (row.position !== null || row.tier !== null || row.side !== null || miss !== 0) return invalid(`${path} 未完成`);
    return { id, owner, recipeId: recipe.id, roomId: row.roomId, normalLo, normalHi, perfectLo, perfectHi, status: 'open', position: null, tier: null, side: null, miss: 0, day, hour, minute };
  }
  const position = int(row.position, 0, COOK_TRACK_END, `${path}.position`);
  const judgment = judgeCooking({ normalLo, normalHi, perfectLo, perfectHi }, position);
  if (row.tier !== judgment.tier || row.side !== judgment.side || miss !== judgment.miss) return invalid(`${path} 判定`);
  return { id, owner, recipeId: recipe.id, roomId: row.roomId, normalLo, normalHi, perfectLo, perfectHi, status: 'settled', position, tier: judgment.tier, side: judgment.side, miss, day, hour, minute };
}

export function parseCookingState(value: unknown): CookingState {
  const row = exact(value, ['version', 'sessions', 'settledIds'], 'cooking');
  if (row.version !== 1) return invalid('cooking.version');
  if (!Array.isArray(row.sessions) || row.sessions.length > 8) return invalid('cooking.sessions');
  if (!Array.isArray(row.settledIds) || row.settledIds.length > 64) return invalid('cooking.settledIds');
  const sessions = row.sessions.map((item, index) => parseSession(item, index));
  if (new Set(sessions.map(session => session.id)).size !== sessions.length) return invalid('cooking.sessions 重复');
  const settledIds = row.settledIds.map((item, index) => typeof item === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(item) && item.length <= 128 ? item : invalid(`cooking.settledIds[${index}]`));
  if (new Set(settledIds).size !== settledIds.length) return invalid('cooking.settledIds 重复');
  const openOwners = sessions.filter(session => session.status === 'open').map(session => session.owner);
  if (new Set(openOwners).size !== openOwners.length) return invalid('cooking 未完成重复');
  for (const session of sessions) {
    if (session.status === 'settled' && !settledIds.includes(session.id)) return invalid('cooking 已完成记录');
    if (session.status === 'open' && settledIds.includes(session.id)) return invalid('cooking 未完成记录');
  }
  return { version: 1, sessions, settledIds };
}
