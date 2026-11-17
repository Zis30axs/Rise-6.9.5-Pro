import book from '../worldbook/affinity-personas.json' with { type: 'json' };
import type { StoryGenerationOptions, WorldState } from '../frontend/types';
import { affinityTier } from './affinity-tiers';
import { PROTAGONISTS } from './dual-protagonists';
import { residentById } from './npc-cast';
import { activeProtagonist, protagonistNames } from './protagonist-world';
import { protagonistSceneId, type worldSceneContext } from './world-presence';

interface PersonaEntry {
  name: string;
  content: string;
  extensions: { affinityPersona: { characterId: string; tier: string; viewpoint?: string } };
}

const personaEntries: readonly PersonaEntry[] = book.entries;
const entriesByCharacter = new Map<string, PersonaEntry[]>();
for (const entry of personaEntries) {
  const content = entry.content.trim();
  if (!content || content === '【待补】') continue;
  const { characterId } = entry.extensions.affinityPersona;
  const entries = entriesByCharacter.get(characterId) ?? [];
  entries.push(entry);
  entriesByCharacter.set(characterId, entries);
}

function explicitlyNamed(input: string, name: string): boolean {
  const normalized = name.normalize('NFKC').trim().toLowerCase();
  if (normalized.length < 2) return false;
  if (/[^\x00-\x7f]/.test(normalized)) return input.includes(normalized);
  const literal = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9_-])${literal}(?:$|[^a-z0-9_-])`).test(input);
}

export function affinityPersonaPrompt(
  state: WorldState,
  scene: ReturnType<typeof worldSceneContext>,
  input: string,
  kind?: StoryGenerationOptions['kind'],
): string {
  if (entriesByCharacter.size === 0 || (kind && kind !== 'interaction_event')) return '';

  const viewpoint = activeProtagonist(state);
  const presentContacts = new Set(scene?.nearbyPeople.filter(person => person.canTalk).map(person => person.contactId));
  const action = input.normalize('NFKC').toLowerCase();
  const selected = new Map<string, string>();
  for (const contact of state.contacts) {
    const personId = contact.sourcePersonId ?? contact.id;
    const protagonist = PROTAGONISTS.find(id => personId === protagonistSceneId(id) || contact.id === `protagonist-${id}`);
    if (protagonist === viewpoint) continue;
    const characterId = protagonist ? protagonistSceneId(protagonist) : personId;
    const entries = entriesByCharacter.get(characterId);
    if (!entries) continue;

    const inScene = presentContacts.has(contact.id);
    if (!inScene) {
      const canonicalName = protagonist ? protagonistNames[protagonist] : '';
      const aliases = residentById(characterId)?.aliases ?? [];
      const names = [contact.name, ...aliases, canonicalName, canonicalName.slice(2), protagonist ?? ''];
      if (selected.has(characterId) || !names.some(name => explicitlyNamed(action, name))) continue;
    }

    const tier = affinityTier(contact.affinity).id;
    const matching = entries.filter(entry => entry.extensions.affinityPersona.tier === tier);
    const entry = matching.find(row => row.extensions.affinityPersona.viewpoint === viewpoint)
      ?? matching.find(row => row.extensions.affinityPersona.viewpoint === undefined);
    if (entry) selected.set(characterId, `${entry.name}（${characterId}）\n${entry.content.trim()}`);
  }
  if (!selected.size) return '';

  return [
    '\n【本轮好感分阶段人设】',
    `以下条目只用于角色面对当前主角（${protagonistNames[viewpoint]}）时的表现。称呼、语气与相处分寸优先参考本条目，人物的基础设定、已存关系备注、实际经历及知情范围仍以世界书和存档为准。条目出现不代表角色在场，也不会自动确认新关系或触发事件。正文中自然体现，省略分数、档位和条目标题。`,
    ...selected.values(),
  ].join('\n\n');
}
