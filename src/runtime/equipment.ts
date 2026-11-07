import type { StoryAction, WorldState } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';

export const CRYCHIC_PHOTO = 'crychic-photo';
export const equipmentCatalog = Object.freeze([
  Object.freeze({ id: CRYCHIC_PHOTO, name: 'CRYCHIC 合照', unit: '张',
    owners: ['soyo', 'sakiko'] as readonly ProtagonistId[],
    description: '五个人曾经一起留下的合照。相同的回忆，在不同的人心里有不同的重量。' }),
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
}
export function validatePersonalEquipment(state: EquipmentView, owner: ProtagonistId): void {
  let equipped = 0;
  for (const row of state.inventory) {
    const item = getEquipmentItem(row.itemId);
    if (item && (!item.owners.includes(owner) || row.quantity !== 1)) throw new Error('合照不属于当前人物。');
    if (row.equipped !== undefined && (!item || typeof row.equipped !== 'boolean')) throw new Error('物品的装备状态无效。');
    if (row.equipped) equipped++;
  }
  if (equipped > 1) throw new Error('每人只能装备一件物品。');
  const history = state.academics?.lastGain?.equipmentProfile;
  if (history && equipmentProfile(history)?.owner !== owner) throw new Error('学习加成记录不属于当前人物。');
}
export function equipmentQuote(state: EquipmentView, owner: ProtagonistId, itemId: string) {
  const item = getEquipmentItem(itemId);
  const held = state.inventory.find(row => row.itemId === itemId);
  const blockedReason = !item ? '这件物品不能装备。' : !item.owners.includes(owner) ? '这张合照不属于她。'
    : held?.quantity !== 1 ? '背包里没有这件物品。' : null;
  const profileId = item ? photoProfile(state, owner) : null;
  return { item, equipped: held?.equipped === true, profileId, profile: equipmentProfile(profileId), blockedReason };
}
export function setEquipment(state: EquipmentView, owner: ProtagonistId, itemId: string, equipped: boolean): boolean {
  const quote = equipmentQuote(state, owner, itemId);
  if (quote.blockedReason) throw new Error(quote.blockedReason);
  if (quote.equipped === equipped) return false;
  for (const row of state.inventory) {
    if (row.itemId === itemId && equipped) row.equipped = true;
    else if (row.itemId === itemId || equipped) delete row.equipped;
  }
  return true;
}

/** Read the equipment at the social action, not at the end of a mixed action batch. */
export function socialEquipmentMultiplier(before: WorldState, owner: ProtagonistId, actions: readonly StoryAction[]): number {
  const view: EquipmentView = { inventory: before.inventory.map(row => ({ ...row })), academics: before.academics };
  for (const action of actions) {
    if (action.type === 'social_skill') return equipmentProfile(equippedProfile(view, owner))?.social ?? 1;
    if (action.type === 'equip' || action.type === 'unequip') setEquipment(view, owner, action.itemId, action.type === 'equip');
  }
  return 1;
}

export function equipmentContext(state: WorldState) {
  const owner = state.protagonists?.accounts.active ?? 'soyo';
  return state.inventory.flatMap(row => {
    const item = getEquipmentItem(row.itemId);
    if (!item) return [];
    const quote = equipmentQuote(state, owner, item.id);
    return [{ itemId: item.id, name: item.name, equipped: quote.equipped,
      effects: quote.equipped && quote.profile ? { music: quote.profile.music, ...(!quote.profile.musicMajor ? { currentMajor: quote.profile.major } : {}), social: quote.profile.social } : null,
      description: quote.equipped && quote.profile ? quote.profile.description : item.description }];
  });
}
