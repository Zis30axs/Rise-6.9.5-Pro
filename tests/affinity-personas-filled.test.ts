import { describe, expect, it } from 'vitest';
import { affinityPersonaPrompt } from '../src/runtime/affinity-personas';
import { AFFINITY_TIERS } from '../src/runtime/affinity-tiers';
import { PROTAGONISTS } from '../src/runtime/dual-protagonists';
import { createInitialState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists } from '../src/runtime/protagonist-world';
import { protagonistSceneId } from '../src/runtime/world-presence';
import book from '../src/worldbook/affinity-personas.json';

describe('filled affinity personas', () => {
  it('ships all 714 detailed profiles, each with four authored sections', () => {
    expect(book.entries).toHaveLength(714);
    for (const entry of book.entries) {
      expect(entry.content.match(/【[^】]+】/g), entry.name).toEqual(['【态度】', '【口癖】', '【互动】', '【边界】']);
    }
  });

  it('selects the authored entry at every tier boundary for all four viewpoints', () => {
    for (const viewpoint of PROTAGONISTS) {
      const initial = enableProtagonists(createInitialState());
      const state = activeProtagonist(initial) === viewpoint
        ? initial : reduceState(initial, { type: 'switch_protagonist', target: viewpoint });
      const contactTemplate = state.contacts[0]!;
      for (const entry of book.entries) {
        const { characterId, tier: tierId } = entry.extensions.affinityPersona;
        const tier = AFFINITY_TIERS.find(candidate => candidate.id === tierId)!;
        for (const affinity of [tier.min, tier.max]) {
          state.contacts = [{
            ...contactTemplate, id: 'imported-contact', sourcePersonId: characterId,
            name: entry.name.split(' · ')[0]!, affinity,
          }];
          const prompt = affinityPersonaPrompt(state, null, `找${state.contacts[0]!.name}聊聊。`);
          if (characterId === protagonistSceneId(viewpoint)) {
            expect(prompt, entry.name).toBe('');
          } else {
            expect(prompt, entry.name).toContain(`${entry.name}（${characterId}）\n${entry.content}`);
            expect(prompt.match(/（[^（）]+）\n【态度】/g), entry.name).toHaveLength(1);
          }
        }
      }
    }
  });

  it('uses real text when affinity rises and falls and leaves other people out', () => {
    const state = createInitialState();
    const anon = state.contacts.find(contact => contact.id === 'bang-anon')!;
    for (const affinity of [49, 50, 59, 60, 69, 70, 79, 80, 89, 90, 95, 96, 100, 59, 49]) {
      anon.affinity = affinity;
      const tier = AFFINITY_TIERS.find(candidate => affinity >= candidate.min && affinity <= candidate.max)!;
      const selected = book.entries.find(entry => entry.extensions.affinityPersona.characterId === 'bang-anon'
        && entry.extensions.affinityPersona.tier === tier.id)!;
      const prompt = affinityPersonaPrompt(state, null, '给爱音打电话。');
      expect(prompt).toContain(selected.content);
      for (const other of book.entries.filter(entry => entry !== selected)) {
        expect(prompt, other.name).not.toContain(other.content);
      }
    }
    const onlyOffer = affinityPersonaPrompt(state, null, '继续。');
    expect(onlyOffer).toContain('千早爱音（bang-anon） 合拍 → 普通朋友');
    expect(onlyOffer).not.toContain('本轮好感分阶段人设');
    expect(affinityPersonaPrompt(state, null, '给爱音打电话。', 'phone_reply')).toBe('');
  });
});
