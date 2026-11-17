import type { WorldState } from '../frontend/types';
import { live2dPeople, type Live2dOutfit } from './live2d-pack';
import { live2dIdentity } from './live2d-identity';
import { activeProtagonist, protagonistNames } from './protagonist-world';
import { allResidentCast } from './npc-cast';
import { worldSceneContext } from './world-presence';

/** Appearance is narrative state. A Live2D model is only one possible picture of it. */
export const WARDROBE_CATEGORIES = [
  { id: 'casual', label: '便服' },
  { id: 'school', label: '制服' },
  { id: 'work', label: '工作装' },
  { id: 'performance', label: '演出服' },
  { id: 'formal', label: '礼服' },
  { id: 'warm', label: '保暖装' },
  { id: 'summer', label: '夏装' },
] as const;
export type WardrobeCategory = typeof WARDROBE_CATEGORIES[number]['id'];
export const WARDROBE_DETAIL_LABELS = {
  hair: '发型', top: '上身', bottom: '下身', layer: '内搭',
  bra: '内衣', underwear: '内裤', accessories: '配饰', appearance: '外观',
} as const;
export type WardrobeDetailKey = keyof typeof WARDROBE_DETAIL_LABELS;
export type WardrobeDetails = Partial<Record<WardrobeDetailKey, string>>;
export interface WardrobeEntry {
  category?: WardrobeCategory;
  /** Explicit player outfit selection; never accepts a model-supplied asset path. */
  outfitId?: string;
  details?: WardrobeDetails;
  /** Stable narrative turn that last wrote this entry, for replay protection. */
  changedTurnId?: string;
}
export type WardrobeState = Partial<Record<string, WardrobeEntry>>;
export interface WardrobeUpdate {
  person: string;
  category?: WardrobeCategory;
  details?: WardrobeDetails;
}
const categories = new Set<string>(WARDROBE_CATEGORIES.map(item => item.id));
export function wardrobeIdentity(value: string): string | null {
  if (['emma', 'protagonist-emma', 'majo-emma'].includes(value)) return 'emma';
  if (['renako', 'protagonist-renako', 'watanare-renako'].includes(value)) return 'renako';
  return live2dIdentity(value)
    ?? allResidentCast.find(person => person.id === value || person.name === value)?.id
    ?? null;
}
const people = new Set<string>([
  ...live2dPeople, 'emma', 'renako',
  ...allResidentCast.map(({ id }) => wardrobeIdentity(id)).filter(id => id !== null),
]);
const detailKeys = new Set<string>(Object.keys(WARDROBE_DETAIL_LABELS));

export function wardrobeCategory(outfit: Live2dOutfit): WardrobeCategory {
  return (['performance','school','work','formal','casual','warm','summer'] as const)
    .find(category => outfit.tags.includes(category)) ?? 'casual';
}
export function wardrobeCategoryLabel(category?: WardrobeCategory): string {
  return WARDROBE_CATEGORIES.find(item => item.id === category)?.label ?? '日常';
}
function validDetails(value: unknown, source: string): WardrobeDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(source + '衣着细节无效');
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).some(key => !detailKeys.has(key))) throw new Error(source + '衣着字段无效');
  const output: WardrobeDetails = {};
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val !== 'string' || !val.trim() || val.length > 160 || val.includes('\u0000'))
      throw new Error(source + '衣着文字无效');
    output[key as WardrobeDetailKey] = val.trim();
  }
  return output;
}
/** Old saves simply have no wardrobe, and retain the old Live2D starting behavior. */
export function parseWardrobeState(value: unknown): WardrobeState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('存档衣柜格式无效');
  const rows = value as Record<string, unknown>, result: WardrobeState = {};
  if (Object.keys(rows).length > people.size) throw new Error('存档衣柜人数无效');
  for (const [name, raw] of Object.entries(rows)) {
    if (!people.has(name) || !raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('存档衣柜人物无效');
    const row = raw as Record<string, unknown>;
    if (Object.keys(row).some(key => !['category', 'outfitId', 'details', 'changedTurnId'].includes(key)))
      throw new Error('存档衣柜字段无效');
    const entry: WardrobeEntry = {};
    if (Object.hasOwn(row, 'category')) {
      if (typeof row.category !== 'string' || !categories.has(row.category)) throw new Error('存档衣柜类别无效');
      entry.category = row.category as WardrobeCategory;
    }
    if (Object.hasOwn(row, 'outfitId')) {
      if (typeof row.outfitId !== 'string' || !row.outfitId.trim() || row.outfitId.length > 128)
        throw new Error('存档衣柜服装ID无效');
      entry.outfitId = row.outfitId;
    }
    if (Object.hasOwn(row, 'details')) entry.details = validDetails(row.details, '存档');
    if (Object.hasOwn(row, 'changedTurnId')) {
      if (typeof row.changedTurnId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(row.changedTurnId))
        throw new Error('存档衣柜回执无效');
      entry.changedTurnId = row.changedTurnId;
    }
    result[name] = entry;
  }
  return result;
}
/** LLM can choose a broad category and edit any textual layer, but not asset IDs. */
export function validateWardrobeUpdates(value: unknown, state: WorldState): WardrobeUpdate[] {
  if (!Array.isArray(value) || value.length > 4) throw new Error('衣着更新最多四人，本轮未保存');
  const inScene = wardrobeParticipants(state, worldSceneContext(state)?.nearbyPeople ?? []);
  const seen = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('衣着更新格式无效');
    const row = raw as Record<string, unknown>;
    if (Object.keys(row).some(key => !['person', 'category', 'details'].includes(key)) ||
      typeof row.person !== 'string' || !people.has(row.person))
      throw new Error('衣着更新人物或字段无效');
    const person = row.person;
    if (!inScene.has(person) || seen.has(person)) throw new Error('衣着更新只能针对本轮在场的人物，每人一次');
    seen.add(person);
    const entry: WardrobeUpdate = { person };
    if (Object.hasOwn(row, 'category')) {
      if (typeof row.category !== 'string' || !categories.has(row.category))
        throw new Error('衣着大类无效');
      entry.category = row.category as WardrobeCategory;
    }
    if (Object.hasOwn(row, 'details')) entry.details = validDetails(row.details, '剧情');
    if (!entry.category && !Object.keys(entry.details ?? {}).length)
      throw new Error('衣着更新必须提供服装类别或改变的细节');
    return entry;
  });
}
/** The bridge supplies this internal receipt; model text cannot create it. */
export function seedWardrobe(state: WorldState, bootstrap: WardrobeState | undefined): WorldState {
  if (!bootstrap || !Object.keys(bootstrap).length) return state;
  const checked=parseWardrobeState(bootstrap), merged:WardrobeState={...state.wardrobe};
  for (const name of Object.keys(checked)) {
    if (!merged[name]) merged[name]=checked[name];
  }
  return {...state, wardrobe:merged};
}
export function commitWardrobeUpdates(state: WorldState, updates: readonly WardrobeUpdate[], turnId: string): WorldState {
  if (!updates.length) return state;
  const wardrobe: WardrobeState = { ...state.wardrobe };
  for (const update of updates) {
    const prior = wardrobe[update.person] ?? {};
    wardrobe[update.person] = {
      ...prior,
      ...(update.category ? { category: update.category, outfitId: undefined } : {}),
      ...(update.details ? { details: { ...prior.details, ...update.details } } : {}),
      changedTurnId: turnId,
    };
    // An absent outfitId is represented by absence, not an undefined save field.
    if (update.category) delete wardrobe[update.person]!.outfitId;
  }
  return { ...state, wardrobe };
}
function wardrobeParticipants(state: WorldState, nearbyPeople: readonly { id: string; name: string }[]): Map<string, string> {
  const owner = activeProtagonist(state);
  const visible = new Map<string, string>([[owner, protagonistNames[owner]]]);
  for (const row of nearbyPeople) {
    const id = wardrobeIdentity(row.id);
    if (id) visible.set(id, row.name);
  }
  return visible;
}

/** Send authorable IDs and existing continuity as request data, including for static portraits. */
export function wardrobeStoryContext(state: WorldState, nearbyPeople: readonly { id: string; name: string }[]) {
  return Array.from(wardrobeParticipants(state, nearbyPeople), ([person, name]) => {
    const entry = state.wardrobe?.[person];
    const clothing = wardrobeText(entry) || (entry?.category ? wardrobeCategoryLabel(entry.category) : '');
    return { person, name, ...(clothing ? { clothing } : {}) };
  });
}
export function wardrobeText(entry?: WardrobeEntry): string {
  if (!entry?.details) return '';
  return (Object.keys(WARDROBE_DETAIL_LABELS) as WardrobeDetailKey[])
    .filter(key => entry.details?.[key])
    .map(key => WARDROBE_DETAIL_LABELS[key] + '：' + entry.details![key])
    .join('；');
}
