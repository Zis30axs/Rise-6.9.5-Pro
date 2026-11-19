import type { CharacterContact, GeneratedStory, StoryAction } from '../frontend/types';
import { parseNovelDialogue } from '../frontend/novel-dialogue';
import { PROTAGONIST_PERSON_IDS, type ProtagonistId } from './dual-protagonists';
import { residentById } from './npc-cast';

const family: Partial<Record<ProtagonistId, readonly string[]>> = {
  soyo: ['nagasaki-mother'],
  sakiko: ['toyokawa-kiyoaki', 'toyokawa-sadaharu', 'toyokawa-mizuho'],
  renako: ['watanare-haruna', 'watanare-miyoko'],
};

/** A confession and the player's answer are separate facts in the active contact ledger. */
export function applyConfession(
  contact: CharacterContact, owner: ProtagonistId,
  action: Extract<StoryAction, { type: 'confession' }>,
  evidence?: { input: string; reply: GeneratedStory },
): void {
  if (!evidence) throw new Error('缺少本轮告白或答复的原话。');
  const personId = contact.sourcePersonId ?? contact.id;
  if (personId === (PROTAGONIST_PERSON_IDS[owner] ?? `protagonist-${owner}`) || contact.id === `protagonist-${owner}`)
    throw new Error('告白双方需要是不同的人。');
  if (family[owner]?.includes(personId) || ['watanare-hiroki', 'watanare-kippei'].includes(personId))
    throw new Error('这段关系按家人或晚辈相处。');
  if (contact.confession === 'dating' || /^恋人(?:[（(]|$)/u.test(contact.relationNote ?? ''))
    throw new Error('双方已有交往约定。');

  if (action.outcome === 'pending') {
    if (contact.affinity < 70 || contact.confession === 'pending') throw new Error('当前关系尚不适合新的告白。');
    const resident = residentById(personId);
    const names = new Set([contact.name, contact.id, resident?.name, ...(resident?.aliases ?? [])]);
    const spoken = parseNovelDialogue(evidence.reply.text).some(line => names.has(line.speaker) && line.text.trim() === action.quote);
    const received = evidence.reply.phoneMessages.some(message => message.npcId === contact.id && message.text.trim() === action.quote);
    if (!spoken && !received) throw new Error('告白需要本人在本轮说出或发来的原话。');
  } else if (contact.confession !== 'pending' || evidence.input.trim() !== action.quote) {
    throw new Error('答复告白需要待回应的心意与玩家本轮的答复原文。');
  }
  contact.confession = action.outcome;
}
