import { describe, expect, it } from 'vitest';
import { commitStoryTurn, parseState, reduceState, STATE_LIMITS } from '../src/runtime/model';
import { createInitialState } from './fixtures/phone-state';
import { characterForPerson } from '../src/frontend/character-appearance';
import { EMPTY_CHARACTER_SUMMARY, validateContactProfileDraft } from '../src/runtime/characters';
import { getSceneContext, getScenePeople } from '../src/runtime/scene-context';
import { withoutContactProfiles } from './legacy-state';
import type { ContactProfileInput, WorldAction } from '../src/frontend/types';

function encounter() {
  const walked = reduceState(createInitialState(), { type: 'walk', x: 0, z: 18, yaw: 0, seed: 'contact-profiles' });
  const person = getScenePeople(walked.scene!)[0];
  return { person, state: reduceState(walked, { type: 'encounter', personId: person.id }) };
}
const profile = (id = 'new-friend'): ContactProfileInput => ({ id, name: '顾晚晴', portraitId: 'deepseek', summary: '喜欢晚间散步，刚刚在校园相识。', sourcePersonId: null });
const save = (input = profile()): WorldAction => ({ type: 'save_contact', ...input });

describe('confirmed main characters', () => {
  it('strictly migrates 1.10 contacts and retains all historical progress and phone IDs', () => {
    const state = createInitialState();
    state.player.energy = 43.29; state.inventory = [{ itemId: 'meal-standard', quantity: 3 }]; state.phone[0].read = true;
    const legacy = { ...withoutContactProfiles(state), schema_version: '1.10.0' };
    const original = JSON.stringify(legacy);
    const migrated = parseState(JSON.parse(original));
    expect(migrated).toEqual(state);
    for (const contact of migrated.contacts) expect(contact).toMatchObject({ portraitId: characterForPerson(contact.id), isMain: true, sourcePersonId: null });
    expect(JSON.stringify(legacy)).toBe(original);
    expect(() => parseState({ ...legacy, contacts: state.contacts })).toThrow(/字段/);
  });

  it('keeps supported long legacy descriptions instead of losing a valid save', () => {
    const state = createInitialState();
    const legacy = { ...withoutContactProfiles(state), schema_version: '1.10.0' };
    legacy.contacts[0].name = '名'.repeat(80); legacy.contacts[0].summary = '介'.repeat(2000);
    expect(parseState(legacy).contacts[0]).toMatchObject({ name: legacy.contacts[0].name, summary: legacy.contacts[0].summary });
    expect(parseState(parseState(legacy)).contacts[0]).toMatchObject({ name: legacy.contacts[0].name, summary: legacy.contacts[0].summary });
  });

  it('promotes an actual stranger without changing identity, records the profile in the chat and restores it', () => {
    const { person, state } = encounter(); const original = JSON.stringify(state);
    const action = save({ ...profile(person.id), sourcePersonId: person.id });
    const confirmed = reduceState(state, action);
    const contact = confirmed.contacts.at(-1)!;
    expect(contact).toMatchObject({ ...profile(person.id), sourcePersonId: person.id, isMain: true, affinity: 0 });
    expect(confirmed.scene?.encounterId).toBe(person.id);
    const restored = parseState(JSON.parse(JSON.stringify(confirmed)));
    const visible = getScenePeople(restored.scene!, restored.contacts).find(item => item.id === person.id)!;
    expect(visible).toMatchObject({ id: person.id, name: '顾晚晴', portraitId: 'deepseek', description: contact.summary, contactId: person.id, isMain: true, candidateName: person.name });
    expect(getSceneContext(restored.scene, null, restored.contacts)?.encounter).toMatchObject({ id: person.id, name: contact.name, portraitId: 'deepseek', isMain: true });
    expect(restored.story.at(-1)).toMatchObject({ role: 'assistant', participantIds: [person.id] });
    expect(restored.story.at(-1)?.text).toContain(contact.summary);
    expect(restored.journal.at(-1)?.text).toContain('人物档案已记录');
    expect(restored.phone).toEqual(state.phone); expect(restored.player).toEqual(state.player); expect(restored.clock).toEqual(state.clock);
    expect(JSON.stringify(state)).toBe(original);
    expect(reduceState(restored, action)).toEqual(restored);
  });

  it('updates a known profile without resetting relations, messages or stable IDs', () => {
    const state = createInitialState(); state.contacts[0].affinity = 73;
    const edited = reduceState(state, save({ ...profile('lin'), name: '林知夏' }));
    expect(edited.contacts[0]).toMatchObject({ id: 'lin', name: '林知夏', affinity: 73, tag: state.contacts[0].tag, status: state.contacts[0].status, portraitId: 'deepseek', isMain: true });
    expect(edited.phone).toEqual(state.phone);
    expect(edited.contacts[1]).toEqual(state.contacts[1]);
  });

  it('rejects unknown or changed source identities, duplicate names and unsupported artwork atomically', () => {
    const { person, state } = encounter(); const original = JSON.stringify(state);
    const invalid = [
      { ...profile(), sourcePersonId: 'ped-missing' },
      { ...profile(), sourcePersonId: person.id },
      { ...profile(), name: '林同学' },
      { ...profile(), name: '名'.repeat(41) },
      { ...profile(), summary: '介'.repeat(501) },
      { ...profile(), id: 'a'.repeat(81) },
      { ...profile(), portraitId: 'https://evil.test/picture' },
      { ...profile(), arbitrary: 'field' },
      { ...profile(), name: '\u0000' },
    ];
    for (const input of invalid) expect(() => reduceState(state, { type: 'save_contact', ...input } as WorldAction)).toThrow();
    expect(JSON.stringify(state)).toBe(original);
    const confirmed = reduceState(state, save({ ...profile(person.id), sourcePersonId: person.id }));
    expect(() => reduceState(confirmed, save({ ...profile(person.id), sourcePersonId: null }))).toThrow(/来源身份/);
  });

  it('allows explicitly empty intros and validates drafts without allocating a contact or executing markup', () => {
    const state = createInitialState(); const original = JSON.stringify(state);
    expect(validateContactProfileDraft({ name: '新朋友', portraitId: 'claude', summary: '' })).toEqual({ name: '新朋友', portraitId: 'claude', summary: EMPTY_CHARACTER_SUMMARY });
    const inert = '<img src=x onerror=alert(1)>';
    const next = reduceState(state, save({ ...profile(), summary: inert }));
    expect(next.contacts.at(-1)?.summary).toBe(inert);
    expect(JSON.stringify(state)).toBe(original);
    expect(() => validateContactProfileDraft(JSON.parse('{"name":"新朋友","portraitId":"claude","summary":"a","__proto__":{}}'))).toThrow(/字段/);
  });

  it('bounds contacts and profile events while allowing edits at the capacity limit', () => {
    let state = createInitialState();
    for (let i = state.contacts.length; i < 50; i++) state = reduceState(state, save({ ...profile(`person-${i}`), name: `联系人${i}` }));
    expect(state.contacts).toHaveLength(50); expect(state.story).toHaveLength(STATE_LIMITS.story);
    expect(() => reduceState(state, save())).toThrow(/50/);
    expect(reduceState(state, save({ ...profile('person-2'), name: '已编辑' })).contacts.find(item => item.id === 'person-2')?.name).toBe('已编辑');
    expect(parseState(state)).toEqual(state);
  });

  it('rejects corrupt 1.11 profiles and participant evidence without polluting live state', () => {
    const state = createInitialState(); const original = JSON.stringify(state);
    for (const patch of [{ portraitId: 'missing' }, { sourcePersonId: '<script>' }, { isMain: 'true' }, { extra: true }]) {
      expect(() => parseState({ ...state, contacts: [{ ...state.contacts[0], ...patch }, state.contacts[1]] })).toThrow(/存档格式无效/);
    }
    for (const participantIds of [['bad id'], ['a', 'a'], Array.from({ length: 9 }, (_, i) => `p-${i}`), 'a']) expect(() => parseState({ ...state, story: [{ ...state.story[0], participantIds }] })).toThrow(/participantIds/);
    expect(JSON.stringify(state)).toBe(original);
  });
});

describe('participant evidence for compact character context', () => {
  it('tags plain stranger conversations with the stable encounter and keeps evidence across rename and reload', () => {
    const { state, person } = encounter();
    const committed = commitStoryTurn(state, '你好。', { text: '她停下脚步，与你聊起今天的天气。', phoneMessages: [] }, { userId: 'talk-user', assistantId: 'talk-assistant' });
    expect(committed.story.slice(-2).map(item => item.participantIds)).toEqual([[person.id], [person.id]]);
    const renamed = reduceState(committed, save({ ...profile(person.id), sourcePersonId: person.id }));
    expect(parseState(renamed).story.find(item => item.id === 'talk-assistant')?.participantIds).toEqual([person.id]);
  });

  it('tags an explicit known speaker without inventing identities for unknown dialogue names', () => {
    const state = createInitialState();
    const committed = commitStoryTurn(state, '接着说。', { text: '|林同学|平静|下次见。|\n|未知人物|平静|路过。|', phoneMessages: [] }, { userId: 'table-user', assistantId: 'table-assistant' });
    expect(committed.story.at(-1)?.participantIds).toEqual(['lin']);
    expect(committed.contacts).toEqual(state.contacts);
  });
});
