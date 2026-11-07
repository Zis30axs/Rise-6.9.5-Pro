import type { StoryAction, WorldState } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';
import { getStoreItem, R27ET1_ITEM_ID } from './convenience-store';

export const CRYCHIC_PHOTO = 'crychic-photo';
export const MYGO_PHOTO = 'mygo-photo';
export const equipmentCatalog = Object.freeze([
  Object.freeze({ id: CRYCHIC_PHOTO, name: 'CRYCHIC 合照', unit: '张',
    owners: ['soyo', 'sakiko'] as readonly ProtagonistId[],
    description: '五个人曾经一起留下的合照。相同的回忆，在不同的人心里有不同的重量。' }),
  Object.freeze({ id: MYGO_PHOTO, name: 'MyGO!!!!! 合照', unit: '张',
    owners: ['soyo'] as readonly ProtagonistId[],
    description: 'MyGO!!!!! 五人在练习室留下的合照。对素世而言，这是值得珍藏的共同回忆。' }),
]);

// Versioned receipts preserve the meaning of already-earned experience.
export const equipmentProfiles = Object.freeze({
  'soyo-music-v1': { owner: 'soyo', musicMajor: true, music: 1.5, major: 1, social: .25,
    description: '那段共同奏响的旋律，依然让她不愿松手。' },
  'sakiko-music-v1': { owner: 'sakiko', musicMajor: true, music: 1.5, major: 1, social: .5,
    description: '她把未能说出口的话，压进下一段旋律里。' },
  'soyo-other-v1': { owner: 'soyo', musicMajor: false, music: 1.5, major: .5, social: .5,
    description: '翻开新的课本，思绪却又回到了旧日的合奏。' },
  'sakiko-other-v1': { owner: 'sakiko', musicMajor: false, music: .5, major: 1.5, social: 1,
    description: '她收好那段回忆，提醒自己把选择的道路走下去。' },
} as const);
export type EquipmentProfileId = keyof typeof equipmentProfiles;
type EquipmentView = Pick<WorldState, 'inventory' | 'academics'>;

export function getEquipmentItem(id: string) {
  return equipmentCatalog.find(item => item.id === id) ?? null;
}
export function equipmentProfile(id: unknown) {
  return typeof id === 'string' && Object.hasOwn(equipmentProfiles, id)
    ? equipmentProfiles[id as EquipmentProfileId] : null;
}
export function photoProfile(state: EquipmentView, owner: ProtagonistId): EquipmentProfileId | null {
  if ((owner !== 'soyo' && owner !== 'sakiko') || !state.academics) return null;
  return `${owner}-${state.academics.majorId === 'music' ? 'music' : 'other'}-v1`;
}
export function equippedProfile(state: EquipmentView, owner: ProtagonistId): EquipmentProfileId | null {
  return state.inventory.some(row => row.itemId === CRYCHIC_PHOTO && row.quantity === 1 && row.equipped === true)
    ? photoProfile(state, owner) : null;
}
export function academicEquipment(state: EquipmentView, owner: ProtagonistId, subjectId: string, isMajorSubject: boolean) {
  const profileId = equippedProfile(state, owner), profile = equipmentProfile(profileId);
  const multiplier = profile ? subjectId.startsWith('music-') ? profile.music : isMajorSubject ? profile.major : 1 : 1;
  return { multiplier, ...(multiplier !== 1 && profileId ? { equipmentProfile: profileId } : {}) };
}
export function historicalAcademicMultiplier(profileId: unknown, majorId: string, subjectId: string, isMajorSubject: boolean): number {
  const profile = equipmentProfile(profileId);
  if (!profile || profile.musicMajor !== (majorId === 'music')) throw new Error('学习记录的合照效果无效。');
  return subjectId.startsWith('music-') ? profile.music : isMajorSubject ? profile.major : 1;
}

/** Only the canonical owner may receive a keepsake; compatibility views never guess an owner. */
export function ensurePersonalKeepsake(state: Pick<WorldState, 'inventory'>, owner: ProtagonistId): void {
  if ((owner === 'soyo' || owner === 'sakiko') && !state.inventory.some(row => row.itemId === CRYCHIC_PHOTO))
    state.inventory.push({ itemId: CRYCHIC_PHOTO, quantity: 1 });
  if (owner === 'soyo' && !state.inventory.some(row => row.itemId === MYGO_PHOTO))
    state.inventory.push({ itemId: MYGO_PHOTO, quantity: 1 });
}
export function validatePersonalEquipment(state: EquipmentView, owner: ProtagonistId): void {
  let special = 0;
  const slots = new Set<EquipmentSlot>();
  for (const row of state.inventory) {
    const item = getEquipmentItem(row.itemId);
    if (item) {
      if (!item.owners.includes(owner) || row.quantity !== 1) throw new Error('合照不属于当前人物。');
      if (row.equipped !== undefined && typeof row.equipped !== 'boolean') throw new Error('珍藏的装备状态无效。');
      if (row.equipped === true) special++;
    } else if (row.equipped !== undefined) {
      if (!isEquipmentSlot(row.equipped) || !canEquipItem(row.itemId, row.equipped) || slots.has(row.equipped))
        throw new Error('物品的装备栏无效或重复。');
      slots.add(row.equipped);
    }
  }
  if (special + Number(slots.has('special')) > 1) throw new Error('特殊装备栏只能使用一件物品。');
  const history = state.academics?.lastGain?.equipmentProfile;
  if (history && equipmentProfile(history)?.owner !== owner) throw new Error('学习加成记录不属于当前人物。');
  if (state.academics?.lastGain?.equipmentId && state.academics.lastGain.equipmentId !== R27ET1_ITEM_ID)
    throw new Error('学习记录的文具效果无效。');
}
export function equipmentQuote(state: EquipmentView, owner: ProtagonistId, itemId: string) {
  const item = getEquipmentItem(itemId);
  const held = state.inventory.find(row => row.itemId === itemId);
  const blockedReason = !item ? '这件物品不能装备。' : !item.owners.includes(owner) ? '这张合照不属于她。'
    : held?.quantity !== 1 ? '背包里没有这件物品。' : null;
  const profileId = item?.id === CRYCHIC_PHOTO ? photoProfile(state, owner) : null;
  return { item, equipped: held?.equipped === true, profileId, profile: equipmentProfile(profileId), blockedReason };
}
export function setEquipment(state: EquipmentView, owner: ProtagonistId, itemId: string, equipped: boolean): boolean {
  const quote = equipmentQuote(state, owner, itemId);
  if (quote.blockedReason) throw new Error(quote.blockedReason);
  if (quote.equipped === equipped) return false;
  for (const row of state.inventory) {
    if (row.itemId === itemId && equipped) row.equipped = true;
    else if (row.itemId === itemId) delete row.equipped;
    else if (equipped && (row.equipped === true || row.equipped === 'special')) delete row.equipped;
  }
  return true;
}

/** Read the equipment at the social action, not at the end of a mixed action batch. */
export function socialEquipmentMultiplier(before: WorldState, owner: ProtagonistId, actions: readonly StoryAction[]): number {
  const view: EquipmentView = { inventory: before.inventory.map(row => ({ ...row })), academics: before.academics };
  for (const action of actions) {
    if (action.type === 'social_skill') return equipmentProfile(equippedProfile(view, owner))?.social ?? 1;
    if (action.type === 'equip' || action.type === 'unequip') {
      if (getEquipmentItem(action.itemId)) setEquipment(view, owner, action.itemId, action.type === 'equip');
      else if (getStoreItem(action.itemId)?.equipmentKind)
        setEquipmentSlot(view, action.itemId, action.type === 'unequip' ? null : action.slot ?? 'permanent-1');
    }
  }
  return 1;
}

export function equipmentContext(state: WorldState) {
  const owner = state.protagonists?.accounts.active ?? 'soyo';
  return state.inventory.flatMap(row => {
    if (row.itemId === R27ET1_ITEM_ID) return [{
      itemId: R27ET1_ITEM_ID, name: 'R-27ET1', equipped: r27et1Equipped(state),
      effects: r27et1Equipped(state) ? { learning: R27ET1_STUDY_BONUS } : null,
      description: '在书店旁的文具柜台购买；装备到常驻道具栏后，学习点增加 25%，多支不叠加。',
    }];
    const item = getEquipmentItem(row.itemId);
    if (!item) return [];
    const quote = equipmentQuote(state, owner, item.id);
    return [{ itemId: item.id, name: item.name, equipped: quote.equipped,
      effects: quote.equipped && quote.profile ? { music: quote.profile.music, ...(!quote.profile.musicMajor ? { currentMajor: quote.profile.major } : {}), social: quote.profile.social } : null,
      description: quote.equipped && quote.profile ? quote.profile.description : item.description }];
  });
}

/** Two permanent tools and one special keepsake slot, per protagonist. */
export const EQUIPMENT_SLOTS = ['permanent-1', 'permanent-2', 'special'] as const;
export type EquipmentSlot = typeof EQUIPMENT_SLOTS[number];
export const R27ET1_STUDY_BONUS = 1.25;

export function isEquipmentSlot(value: unknown): value is EquipmentSlot {
  return typeof value === 'string' && EQUIPMENT_SLOTS.some(slot => slot === value);
}
export function canEquipItem(itemId: string, slot: EquipmentSlot): boolean {
  if (getEquipmentItem(itemId)) return slot === 'special';
  const kind = getStoreItem(itemId)?.equipmentKind;
  return kind === (slot === 'special' ? 'special' : 'permanent');
}
export function equippedItem(state: Pick<WorldState, 'inventory'>, slot: EquipmentSlot): string | null {
  return state.inventory.find(item => item.equipped === slot || (slot === 'special' && item.equipped === true))?.itemId ?? null;
}
export function r27et1Equipped(state: Pick<WorldState, 'inventory'>): boolean {
  return state.inventory.some(item => item.itemId === R27ET1_ITEM_ID &&
    item.quantity >= 1 && (item.equipped === 'permanent-1' || item.equipped === 'permanent-2'));
}
/** R27ET1 has one shared 25% bonus, regardless of quantity, on the half-point grid. */
export function studyPointsWithEquipment(state: Pick<WorldState, 'inventory'>, basePoints: number): number {
  return r27et1Equipped(state) ? Math.round(basePoints * R27ET1_STUDY_BONUS * 2) / 2 : basePoints;
}
export function setEquipmentSlot(state: Pick<WorldState, 'inventory'>, itemId: string, slot: EquipmentSlot | null): void {
  const item = state.inventory.find(row => row.itemId === itemId && row.quantity > 0);
  if (!item || !getStoreItem(itemId)?.equipmentKind) throw new Error('背包里没有可装备的这件道具。');
  if (slot !== null && !canEquipItem(itemId, slot)) throw new Error('这件道具不能放在所选装备栏。');
  if (slot !== null) {
    for (const row of state.inventory) {
      if (row.equipped === slot || (slot === 'special' && row.equipped === true)) delete row.equipped;
    }
    item.equipped = slot;
  } else {
    delete item.equipped;
  }
}
