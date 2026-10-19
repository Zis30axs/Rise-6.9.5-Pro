import type { CharacterContact, CharacterPortraitId, ContactProfileDraft, ContactProfileInput } from '../frontend/types';
import { characterForPerson } from '../frontend/character-appearance';

/** Only built-in artwork can be selected; profiles never introduce executable image URLs. */
export const characterPortraitIds = ['deepseek', 'xiaoyang', 'claude'] as const;
export const CONTACT_PROFILE_LIMITS = { contacts: 50, id: 80, name: 40, summary: 500 } as const;
export const EMPTY_CHARACTER_SUMMARY = '尚未填写人物介绍。';

export function isCharacterPortraitId(value: unknown): value is CharacterPortraitId {
  return characterPortraitIds.includes(value as CharacterPortraitId);
}

export function legacyCharacterProfile(id: string): Pick<CharacterContact, 'portraitId' | 'sourcePersonId' | 'isMain'> {
  return { portraitId: characterForPerson(id), sourcePersonId: id.startsWith('ped-') ? id : null, isMain: true };
}

/** Reconstruct just the supported profile fields, with tighter bounds for new edits. */
export function validateContactProfileInput(value: unknown): ContactProfileInput {
  const fail = (detail: string): never => { throw new Error(`人物档案无效：${detail}。`); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('请填写姓名、立绘和介绍');
  const input = value as Record<string, unknown>;
  const fields = Object.keys(input);
  const required = ['id', 'name', 'portraitId', 'summary'];
  if (required.some(key => !Object.hasOwn(input, key)) || fields.some(key => ![...required, 'sourcePersonId'].includes(key))) return fail('字段');
  const identifier = (item: unknown, label: string) => {
    if (typeof item !== 'string' || item.length > CONTACT_PROFILE_LIMITS.id || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(item)) return fail(label);
    return item;
  };
  const boundedText = (item: unknown, label: string, max: number) => {
    if (typeof item !== 'string' || item.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item)) return fail(label);
    return item.trim();
  };
  const id = identifier(input.id, '联系人 ID');
  const name = boundedText(input.name, '姓名最多40字', CONTACT_PROFILE_LIMITS.name);
  if (!name || /[\r\n\t]/.test(name)) return fail('姓名');
  const summary = boundedText(input.summary, '介绍最多500字', CONTACT_PROFILE_LIMITS.summary) || EMPTY_CHARACTER_SUMMARY;
  if (!isCharacterPortraitId(input.portraitId)) return fail('请选择已有立绘');
  const sourcePersonId = input.sourcePersonId === undefined ? undefined : input.sourcePersonId === null ? null : identifier(input.sourcePersonId, '来源人物 ID');
  return { id, name, portraitId: input.portraitId, summary, ...(sourcePersonId !== undefined ? { sourcePersonId } : {}) };
}

export function validateContactProfileDraft(value: unknown): ContactProfileDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('人物档案无效：请填写姓名、立绘和介绍。');
  const draft = value as Record<string, unknown>;
  if (Object.hasOwn(draft, 'id')) return validateContactProfileInput(draft);
  const { id: _id, ...validated } = validateContactProfileInput({ ...draft, id: 'draft-contact' });
  return validated;
}
