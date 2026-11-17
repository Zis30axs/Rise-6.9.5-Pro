import { describe, expect, it } from 'vitest';
import { affinityPersonaPrompt } from '../src/runtime/affinity-personas';
import { AFFINITY_TIERS } from '../src/runtime/affinity-tiers';
import { PROTAGONISTS } from '../src/runtime/dual-protagonists';
import { createInitialState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists } from '../src/runtime/protagonist-world';
import { protagonistSceneId } from '../src/runtime/world-presence';
import book from '../src/worldbook/affinity-personas.json';

describe('filled affinity personas', () => {
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
            expect(prompt.match(/（[^（）]+）\n【称呼】/g), entry.name).toHaveLength(1);
          }
        }
      }
    }
  });

  it('uses real text when affinity rises and falls and leaves other people out', () => {
    const state = createInitialState();
    const anon = state.contacts.find(contact => contact.id === 'bang-anon')!;
    for (const affinity of [49, 50, 69, 70, 89, 90, 89, 69, 49]) {
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
    expect(affinityPersonaPrompt(state, null, '继续。')).toBe('');
    expect(affinityPersonaPrompt(state, null, '给爱音打电话。', 'phone_reply')).toBe('');
  });
});
