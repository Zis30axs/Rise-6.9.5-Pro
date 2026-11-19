import { describe, expect, it, vi } from 'vitest';
import { affinityPersonaPrompt } from '../src/runtime/affinity-personas';
import { AFFINITY_TIERS } from '../src/runtime/affinity-tiers';
import { createTavernBridge } from '../src/runtime/bridge';
import { PROTAGONISTS } from '../src/runtime/dual-protagonists';
import { createInitialState, reduceState } from '../src/runtime/model';
import { allResidentCast, residentPresence } from '../src/runtime/npc-cast';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { getSceneArea, sceneLocationId, scenePersonAnchors } from '../src/runtime/scene-context';
import { protagonistSceneId, worldSceneContext } from '../src/runtime/world-presence';
import backgroundCharacters from '../src/worldbook/background-characters.json';
import fengjinClinic from '../src/worldbook/fengjin-clinic.json';
import type templateBook from '../src/worldbook/affinity-personas.json';

type BookModule = { default: typeof templateBook };

vi.mock('../src/worldbook/affinity-personas.json', async importOriginal => {
  const { default: book } = await importOriginal<BookModule>();
  const entries = book.entries.filter(entry => !('viewpoint' in entry.extensions.affinityPersona)).map(entry => {
    const { characterId, tier } = entry.extensions.affinityPersona;
    const hasFixture = characterId === 'bang-anon' && ['casual_friend', 'friend', 'bond'].includes(tier)
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
  it('covers each registered character with one filled default entry per tier and disables native lore scanning', async () => {
    const { default: book } = await vi.importActual<BookModule>('../src/worldbook/affinity-personas.json');
    const characterIds = new Set([
      ...PROTAGONISTS.map(protagonistSceneId),
      ...allResidentCast.map(resident => resident.id),
      ...backgroundCharacters.entries.map(entry => entry.extensions.personId),
      ...fengjinClinic.entries.map(entry => entry.extensions.personId),
    ].filter((id): id is string => typeof id === 'string'));
    const tierIds = AFFINITY_TIERS.map(tier => tier.id);
    const defaultEntries: string[] = [];
    for (const entry of book.entries) {
      const { characterId, tier } = entry.extensions.affinityPersona;
      expect(characterIds.has(characterId), entry.name).toBe(true);
      expect(tierIds, entry.name).toContain(tier);
      expect(entry.content.trim(), entry.name).not.toBe('');
      expect(entry.content, entry.name).not.toContain('【待补】');
      expect([entry.enabled, entry.constant, entry.keys], entry.name).toEqual([false, false, []]);
      if (!('viewpoint' in entry.extensions.affinityPersona)) defaultEntries.push(`${characterId}:${tier}`);
    }
    expect(defaultEntries.sort()).toEqual([...characterIds].flatMap(id => tierIds.map(tier => `${id}:${tier}`)).sort());
  });

  it('switches in both directions at the existing boundary and sends only the current entry', () => {
    const state = createInitialState();
    const anon = state.contacts.find(contact => contact.id === 'bang-anon')!;
    anon.affinity = 59;
    const prompt = () => affinityPersonaPrompt(state, null, '给爱音打电话。');
    expect(prompt()).toContain('sample-bang-anon-casual_friend');

    anon.affinity = 60;
    const higher = prompt();
    expect(higher).toContain('sample-anon-soyo-friend');
    expect(higher).not.toMatch(/sample-bang-anon-(?:casual_friend|friend|bond)/);

    anon.affinity = 59;
    expect(prompt()).toContain('sample-bang-anon-casual_friend');
    anon.affinity = 70;
    expect(prompt()).toBe('');
  });

  it('uses the active protagonist’s own saved affinity and only a matching viewpoint override', () => {
    const state = enableProtagonists(createInitialState());
    const anon = state.contacts.find(contact => contact.id === 'bang-anon')!;
    const emma = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(affinityPersonaPrompt(emma, null, '找爱音聊天。')).not.toMatch(/bang-anon|本轮好感分阶段人设/);

    emma.contacts.push({ ...anon, id: 'saved-anon', affinity: 60 });
    expect(affinityPersonaPrompt(emma, null, '找 Ａｎｏｎ 聊天。')).toContain('sample-bang-anon-friend');
    expect(affinityPersonaPrompt(emma, null, '找 Ａｎｏｎ 聊天。')).not.toContain('sample-anon-soyo-friend');
    expect(affinityPersonaPrompt(emma, null, '找 Anonymous 聊天。')).not.toContain('本轮好感分阶段人设');

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

    state.contacts.find(row => row.id === 'bang-anon')!.affinity = 69;
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
      expect(content).toContain('千早爱音（bang-anon） 朋友 → 知心');
      expect(content.split('sample-anon-soyo-friend')).toHaveLength(2);
      expect(content).toContain('只在世界书或存档已有相应前提、本轮场景与双方意愿也允许时采用');
      expect(content).not.toContain('【待补】');
    } finally {
      bridge.dispose();
    }
  });
});
