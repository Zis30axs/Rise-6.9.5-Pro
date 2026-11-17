import { describe, expect, it, vi } from 'vitest';
import { affinityPersonaPrompt } from '../src/runtime/affinity-personas';
import { AFFINITY_TIERS } from '../src/runtime/affinity-tiers';
import { createTavernBridge } from '../src/runtime/bridge';
import { createInitialState, reduceState } from '../src/runtime/model';
import { residentPresence } from '../src/runtime/npc-cast';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { getSceneArea, sceneLocationId, scenePersonAnchors } from '../src/runtime/scene-context';
import { worldSceneContext } from '../src/runtime/world-presence';
import type templateBook from '../src/worldbook/affinity-personas.json';

type BookModule = { default: typeof templateBook };

vi.mock('../src/worldbook/affinity-personas.json', async importOriginal => {
  const { default: book } = await importOriginal<BookModule>();
  const entries = book.entries.filter(entry => !('viewpoint' in entry.extensions.affinityPersona)).map(entry => {
    const { characterId, tier } = entry.extensions.affinityPersona;
    const hasFixture = characterId === 'bang-anon' && ['familiar', 'friend', 'bond'].includes(tier)
      || characterId === 'watanare-ajisai' && tier === 'close';
    return { ...entry, content: hasFixture ? `sample-${characterId}-${tier}` : '【待补】' };
  });
  const general = entries.find(entry => entry.name === '千早爱音 · 朋友')!;
  return { default: { ...book, entries: [...entries, {
    ...general, content: 'sample-anon-soyo-friend',
    extensions: { affinityPersona: { ...general.extensions.affinityPersona, viewpoint: 'soyo' } },
  }] } };
});

describe('affinity persona worldbook', () => {
  it('keeps stage entries out of native lore scanning and uses valid tier IDs', async () => {
    const { default: book } = await vi.importActual<BookModule>('../src/worldbook/affinity-personas.json');
    const tiers = new Set(AFFINITY_TIERS.map(tier => tier.id));
    expect(book.entries.length).toBeGreaterThan(0);
    expect(book.entries.every(entry => tiers.has(entry.extensions.affinityPersona.tier))).toBe(true);
    expect(book.entries.every(entry => !entry.enabled && !entry.constant && !entry.keys.length)).toBe(true);
  });

  it('switches in both directions at the existing boundary and sends only the current entry', () => {
    const state = createInitialState();
    const anon = state.contacts.find(contact => contact.id === 'bang-anon')!;
    anon.affinity = 49;
    const prompt = () => affinityPersonaPrompt(state, null, '给爱音打电话。');
    expect(prompt()).toContain('sample-bang-anon-familiar');

    anon.affinity = 50;
    const higher = prompt();
    expect(higher).toContain('sample-anon-soyo-friend');
    expect(higher).not.toMatch(/sample-bang-anon-(?:familiar|friend|bond)/);

    anon.affinity = 49;
    expect(prompt()).toContain('sample-bang-anon-familiar');
    anon.affinity = 70;
    expect(prompt()).toBe('');
  });

  it('uses the active protagonist’s own saved affinity and only a matching viewpoint override', () => {
    const state = enableProtagonists(createInitialState());
    const anon = state.contacts.find(contact => contact.id === 'bang-anon')!;
    const emma = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(affinityPersonaPrompt(emma, null, '找爱音聊天。')).toBe('');

    emma.contacts.push({ ...anon, id: 'saved-anon', affinity: 50 });
    expect(affinityPersonaPrompt(emma, null, '找 Ａｎｏｎ 聊天。')).toContain('sample-bang-anon-friend');
    expect(affinityPersonaPrompt(emma, null, '找 Ａｎｏｎ 聊天。')).not.toContain('sample-anon-soyo-friend');
    expect(affinityPersonaPrompt(emma, null, '找 Anonymous 聊天。')).toBe('');

    const renako = reduceState(emma, { type: 'switch_protagonist', target: 'renako' });
    expect(affinityPersonaPrompt(renako, null, '和紫阳花聊。')).toContain('sample-watanare-ajisai-close');
  });

  it('injects one entry for a present contact through the normal story request', async () => {
    const state = createInitialState();
    const presence = residentPresence('bang-anon', state.clock);
    const anchor = scenePersonAnchors.find(item => item.id === presence?.anchorId);
    const area = anchor ? getSceneArea(anchor.x, anchor.z) : null;
    if (!anchor || !area) throw new Error('爱音的锚点缺失');
    state.locationId = sceneLocationId(area.id);
    state.scene = { x: anchor.x, z: anchor.z, yaw: 0, areaId: area.id, seed: 'affinity-persona', encounterId: 'bang-anon' };
    const scene = worldSceneContext(state);
    expect(affinityPersonaPrompt(state, scene, '继续。', 'interaction_event')).toContain('sample-anon-soyo-friend');
    expect(affinityPersonaPrompt(state, scene, '继续。', 'phone_reply')).toBe('');
    expect(affinityPersonaPrompt(state, null, '继续。')).toBe('');

    const generate = vi.fn(async (_config: { injects: { content: string }[] }) => '<story>窗外很安静。</story>');
    const bridge = createTavernBridge({
      parent: { SillyTavern: { getContext: () => ({
        characterId: 0, characters: { 0: { avatar: 'unread-city.png' } }, chatId: 'affinity-story', mainApi: 'openai',
      }) } },
      getVariables: () => ({}), replaceVariables: vi.fn(), eventOn: vi.fn(), eventRemoveListener: vi.fn(),
      tavern_events: { CHAT_CHANGED: 'chat_changed' }, generate, stopGenerationById: vi.fn(),
    } as unknown as Window)!;
    try {
      await bridge.generate('和爱音打招呼。', state);
      const content = generate.mock.calls[0]![0].injects[0]!.content;
      expect(content.split('sample-anon-soyo-friend')).toHaveLength(2);
      expect(content).not.toContain('【待补】');
    } finally {
      bridge.dispose();
    }
  });
});
