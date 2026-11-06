import type { WorldState } from '../frontend/types';
import { getStoreItem, R27ET1_ITEM_ID } from './convenience-store';

export const EQUIPMENT_SLOTS = ['permanent-1', 'permanent-2', 'special'] as const;
export type EquipmentSlot = typeof EQUIPMENT_SLOTS[number];
export const R27ET1_STUDY_BONUS = 1.25;

export function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return typeof value === 'string' && EQUIPMENT_SLOTS.some(slot => slot === value);
}

export function canEquipItem(itemId: string, slot: EquipmentSlot): boolean {
  const kind = getStoreItem(itemId)?.equipmentKind;
  return kind === (slot === 'special' ? 'special' : 'permanent');
}

export function equippedItem(state: Pick<WorldState, 'inventory'>, slot: EquipmentSlot): string | null {
  return state.inventory.find(item => item.equipped === slot)?.itemId ?? null;
}

export function r27et1Equipped(state: Pick<WorldState, 'inventory'>): boolean {
  return state.inventory.some(item => item.itemId === R27ET1_ITEM_ID
    && item.quantity >= 1 && (item.equipped === 'permanent-1' || item.equipped === 'permanent-2'));
}

/** Keep all academic points on the save format's half-point grid. */
export function studyPointsWithEquipment(state: Pick<WorldState, 'inventory'>, basePoints: number): number {
  return r27et1Equipped(state) ? Math.round(basePoints * R27ET1_STUDY_BONUS * 2) / 2 : basePoints;
}

/** Equipment is a property of each protagonist's existing inventory item. */
export function setEquipmentSlot(state: Pick<WorldState, 'inventory'>, itemId: string, slot: EquipmentSlot | null): void {
  const item = state.inventory.find(row => row.itemId === itemId && row.quantity > 0);
  if (!item || !getStoreItem(itemId)?.equipmentKind) throw new Error('背包里没有可装备的这件道具。');
  if (slot !== null && !canEquipItem(itemId, slot)) throw new Error('这件道具不能放在所选装备栏。');
  if (slot !== null) {
    for (const row of state.inventory) if (row.equipped === slot) delete row.equipped;
    item.equipped = slot;
  } else {
    delete item.equipped;
  }
}
