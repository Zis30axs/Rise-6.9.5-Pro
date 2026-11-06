import type { WorldState } from '../frontend/types';
import type { StoreItem } from './convenience-store';
import type { ProtagonistId } from './dual-protagonists';
import { isInternationalLocation } from './california';

/** A self-contained, fully offline Easter egg. Not a real subscription or reset service. */
export const MYSTERY_VISITOR_ID = 'rare-mysterious-visitor';
export const MYSTERY_VISITOR_NAME = '神秘访客';
export const FULL_RESET_ITEM_ID = 'full-reset-collector-ticket';
export const PRO500_ITEM_ID = 'pro500-collector-ticket';
export const MYSTERY_GIFT_RESET_COUNT = 10;
export const MYSTERY_VISITOR_ONE_IN = 20_000;

const inertEffects = Object.freeze({ energy: 0, satiety: 0, stress: 0, health: 0, morale: 0 });
export const mysteryVisitorItems: readonly StoreItem[] = Object.freeze([
  Object.freeze({
    id: FULL_RESET_ITEM_ID, name: 'Full Reset', brand: '神秘访客', tier: 'premium',
    category: 'collectible', price: 0, packSize: 1, purchaseUnit: '枚', useUnit: '枚',
    kcal: 0, useMinutes: 0, effects: inertEffects,
  }),
  Object.freeze({
    id: PRO500_ITEM_ID, name: 'Pro 500', brand: '神秘访客', tier: 'premium',
    category: 'collectible', price: 0, packSize: 1, purchaseUnit: '张', useUnit: '张',
    kcal: 0, useMinutes: 0, effects: inertEffects,
  }),
]);

export interface MysteryVisitorState {
  /** Shared receipts, but the award belongs to one protagonist's own backpack. */
  claimedBy: Partial<Record<ProtagonistId, true>>;
}

const owners: readonly ProtagonistId[] = ['soyo', 'sakiko', 'emma', 'renako'];
export function parseMysteryVisitorState(value: unknown): MysteryVisitorState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('神秘访客记录格式无效。');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== 1 || !row.claimedBy || typeof row.claimedBy !== 'object' || Array.isArray(row.claimedBy))
    throw new Error('神秘访客领取记录格式无效。');
  const raw = row.claimedBy as Record<string, unknown>;
  if (Object.entries(raw).some(([key, val]) => !owners.includes(key as ProtagonistId) || val !== true))
    throw new Error('神秘访客领取角色无效。');
  return { claimedBy: raw as MysteryVisitorState['claimedBy'] };
}

export function mysteryVisitorClaimed(state: Pick<WorldState, 'mysteryVisitor' | 'protagonists'>): boolean {
  return state.mysteryVisitor?.claimedBy[state.protagonists?.accounts.active ?? 'soyo'] === true;
}

/** FNV-1a yields one stable roll per protagonist/place/day/scene seed.
 * Merely rendering, reopening the map or reloading cannot reroll this chance.
 */
function hash(seed: string): number {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function mysteryVisitorPresent(state: Pick<WorldState, 'clock' | 'locationId' | 'scene' | 'interior' | 'protagonists' | 'mysteryVisitor'>): boolean {
  if (state.interior || mysteryVisitorClaimed(state)) return false;
  // The Tokyo sandtable and existing international novel locations share the same rarity.
  if (!state.scene && !isInternationalLocation(state.locationId)) return false;
  const owner = state.protagonists?.accounts.active ?? 'soyo';
  const seed = state.scene?.seed ?? 'overseas-v1';
  return hash(`mystery-v1|${seed}|${owner}|${state.locationId}|${state.clock.day}`) % MYSTERY_VISITOR_ONE_IN === 0;
}

/** Coordinates are relative to the current encounter origin, not a world position for foreign cities. */
export function mysteryVisitorAnchor(state: Pick<WorldState, 'scene' | 'locationId'>): { x: number; z: number } {
  return state.scene ? { x: state.scene.x + 2, z: state.scene.z + 1.5 } : { x: 2, z: 1.5 };
}
