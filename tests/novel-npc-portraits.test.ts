import { describe, expect, it } from 'vitest';
import { resolveNovelNpcPortrait, type NovelNpcPortraitContext } from '../src/frontend/novel-npc-portraits';
import { characterForPerson } from '../src/frontend/scene-character-assets';
import { createInitialState, reduceState } from '../src/runtime/model';
import { getScenePeople } from '../src/runtime/scene-context';

describe('novel NPC portraits preserve saved identities', () => {
  it('maps each existing contact name or exact ID through the same appearance assignment as 3D', () => {
    const state = createInitialState(), before = JSON.stringify(state);
    const context = { contacts: state.contacts, scenePeople: [] };
    for (const person of state.contacts) {
      expect(resolveNovelNpcPortrait(person.name, context)).toBe(characterForPerson(person.id));
      expect(resolveNovelNpcPortrait(person.id, context)).toBe(characterForPerson(person.id));
    }
    expect(resolveNovelNpcPortrait('林同学', context)).toBe('claude');
    expect(resolveNovelNpcPortrait('zhou', context)).toBe('xiaoyang');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('retains the real seeded population assignment across rebuilds, ordering and reading earlier dialogue', () => {
    const state = reduceState(createInitialState(), { type: 'walk', x: 0, z: 18, yaw: 0, seed: 'portrait-stability' });
    const people = getScenePeople(state.scene!), rebuilt = getScenePeople(JSON.parse(JSON.stringify(state.scene)));
    const expectedModels = new Set<string>();
    for (const person of people) {
      const expected = characterForPerson(person.id); expectedModels.add(expected);
      expect(resolveNovelNpcPortrait(person.name, { contacts: state.contacts, scenePeople: people })).toBe(expected);
      expect(resolveNovelNpcPortrait(person.name, { contacts: state.contacts, scenePeople: [...rebuilt].reverse() })).toBe(expected);
      expect(resolveNovelNpcPortrait(person.id, { contacts: [], scenePeople: people })).toBe(expected);
    }
    expect(expectedModels).toEqual(new Set(['deepseek', 'xiaoyang', 'claude']));
  });

  it('hides unknown, partial, decorated, narration and player speakers without inventing an identity', () => {
    const context = { contacts: createInitialState().contacts, scenePeople: [] };
    for (const speaker of ['陌生人', '林', '林同学（开心）', 'LIN', 'deepseek', 'xiaoyang', 'claude', '__proto__', '<img src=x>', 'https://example.com/a.png', '', '  ', '旁白', '叙述', 'narrator', '我', '你', '玩家', '主角', '你的行动', '素世', '长崎素世', '長崎そよ', 'Soyo']) {
      expect(resolveNovelNpcPortrait(speaker, context), speaker).toBeNull();
    }
    expect(resolveNovelNpcPortrait('  林同学 \n', context)).toBe(characterForPerson('lin'));
    expect(resolveNovelNpcPortrait('素世', { contacts: [{ id: 'not-soyo', name: '素世' }], scenePeople: [] })).toBeNull();
  });

  it('rejects ambiguous contact names regardless of array order or a contact pretending to be the encounter', () => {
    const contacts = [{ id: 'first', name: '同名同学' }, { id: 'second', name: '同名同学' }];
    for (const ordered of [contacts, [...contacts].reverse()]) {
      expect(resolveNovelNpcPortrait('同名同学', { contacts: ordered, scenePeople: [] })).toBeNull();
      expect(resolveNovelNpcPortrait('同名同学', { contacts: ordered, scenePeople: [], encounterId: 'first' })).toBeNull();
    }
  });

  it('uses a matching current encounter to disambiguate a contact and a scene person with the same name', () => {
    const context: NovelNpcPortraitContext = {
      contacts: [{ id: 'lin', name: '林同学' }],
      scenePeople: [{ id: 'ped-saved-library', name: '林同学' }, { id: 'ped-other', name: '另一同学' }],
      encounterId: 'ped-saved-library',
    };
    expect(resolveNovelNpcPortrait('林同学', context)).toBe(characterForPerson('ped-saved-library'));
    expect(resolveNovelNpcPortrait('林同学', { ...context, encounterId: null })).toBeNull();
    expect(resolveNovelNpcPortrait('林同学', { ...context, encounterId: 'ped-other' })).toBeNull();
    expect(resolveNovelNpcPortrait('林同学', { ...context, encounterId: 'missing-person' })).toBeNull();
    expect(resolveNovelNpcPortrait('lin', context)).toBe(characterForPerson('lin'));
  });

  it('rejects duplicate scene names unless the exact scene encounter selects one', () => {
    const scenePeople = [{ id: 'ped-a', name: '同名路人' }, { id: 'ped-b', name: '同名路人' }];
    expect(resolveNovelNpcPortrait('同名路人', { contacts: [], scenePeople })).toBeNull();
    expect(resolveNovelNpcPortrait('同名路人', { contacts: [], scenePeople, encounterId: 'ped-b' })).toBe(characterForPerson('ped-b'));
    expect(resolveNovelNpcPortrait('同名路人', { contacts: [], scenePeople: [...scenePeople].reverse(), encounterId: 'ped-b' })).toBe(characterForPerson('ped-b'));
  });

  it('prefers an exact identity ID and merges the same saved contact and scene identity', () => {
    const context = { contacts: [{ id: 'lin', name: '林同学' }], scenePeople: [{ id: 'ped-test', name: 'lin' }] };
    expect(resolveNovelNpcPortrait('lin', context)).toBe(characterForPerson('lin'));
    expect(resolveNovelNpcPortrait('lin', { ...context, scenePeople: [{ id: 'lin', name: '另一个人' }], encounterId: 'lin' })).toBe(characterForPerson('lin'));
    expect(resolveNovelNpcPortrait('同名', { contacts: [], scenePeople: [{ id: 'ped-a', name: '同名' }, { id: 'ped-a', name: '同名' }], encounterId: 'ped-a' })).toBeNull();
  });

  it('retains confirmed appearance through source identity, renaming, older dialogue and refresh', () => {
    const context: NovelNpcPortraitContext = {
      contacts: [{ id: 'contact-saved', sourcePersonId: 'ped-stable', name: '许知夏', portraitId: 'deepseek' }],
      scenePeople: [{ id: 'ped-stable', name: '许知夏', candidateName: '周嘉宁', portraitId: 'deepseek', contactId: 'contact-saved' }],
      encounterId: 'ped-stable',
    };
    for (const speaker of ['ped-stable', 'contact-saved', '许知夏', '周嘉宁']) {
      expect(resolveNovelNpcPortrait(speaker, context)).toBe('deepseek');
      expect(resolveNovelNpcPortrait(speaker, JSON.parse(JSON.stringify(context)))).toBe('deepseek');
    }
  });

  it('does not mutate frozen identity inputs or reuse the previous portrait for an unmatched speaker', () => {
    const contacts = Object.freeze([Object.freeze({ id: 'lin', name: '林同学' })]);
    const context = Object.freeze({ contacts, scenePeople: Object.freeze([]) });
    expect(resolveNovelNpcPortrait('林同学', context)).toBe('claude');
    expect(resolveNovelNpcPortrait('未收录的角色', context)).toBeNull();
    expect(resolveNovelNpcPortrait('林同学', context)).toBe('claude');
    expect(contacts).toEqual([{ id: 'lin', name: '林同学' }]);
  });
});
