import type { ContactProfileDraft, WorldState } from '../frontend/types';
import { getScenePeople } from './scene-context';

export const CHARACTER_CONTEXT_LIMITS = { turns: 6, totalCharacters: 2400, perTurn: 600 } as const;

/** A compact, character-specific evidence window; never sends unrelated full history. */
export function buildCharacterIntroductionContext(state: WorldState, draft: ContactProfileDraft) {
  const saved = state.contacts.find(contact => contact.id === draft.id || (!!draft.sourcePersonId && (contact.id === draft.sourcePersonId || contact.sourcePersonId === draft.sourcePersonId)));
  const people = state.scene ? getScenePeople(state.scene, state.contacts, state.clock) : [];
  const person = people.find(person => person.id === draft.sourcePersonId || person.id === draft.id);
  // The seed's original name remains useful for pre-confirmation dialogue.
  const originalPerson = state.scene ? getScenePeople(state.scene).find(person => person.id === draft.sourcePersonId || person.id === draft.id) : undefined;
  const ids = new Set([draft.id, draft.sourcePersonId, saved?.id, saved?.sourcePersonId, person?.id].filter((value): value is string => !!value));
  const names = [...new Set([draft.name, saved?.name, person?.name, originalPerson?.name].filter((value): value is string => !!value))];
  const matching = state.story.map((entry, index) => ({ entry, index })).filter(({ entry }) =>
    entry.participantIds?.some(id => ids.has(id)) || names.some(name => entry.text.includes(name)) || [...ids].some(id => entry.text.includes(id)));
  const selected = new Set<number>();
  for (const { index } of matching.slice(-4)) {
    if (state.story[index]?.role === 'assistant' && index > 0 && state.story[index - 1].role === 'user') selected.add(index - 1);
    selected.add(index);
    if (state.story[index]?.role === 'user' && state.story[index + 1]?.role === 'assistant') selected.add(index + 1);
  }
  let remaining = CHARACTER_CONTEXT_LIMITS.totalCharacters;
  const relatedTurns = [...selected].sort((a, b) => b - a).slice(0, CHARACTER_CONTEXT_LIMITS.turns).flatMap(index => {
    if (!remaining) return [];
    const entry = state.story[index];
    const length = Math.min(CHARACTER_CONTEXT_LIMITS.perTurn, remaining);
    const positions = [...names, ...ids].map(value => entry.text.indexOf(value)).filter(position => position >= 0);
    const start = positions.length ? Math.max(0, Math.min(...positions) - 100) : 0;
    const text = entry.text.slice(start, start + length);
    remaining -= text.length;
    return [{ order: index, role: entry.role, text }];
  }).reverse().map(({ role, text }) => ({ role, text }));
  return {
    character: { id: draft.id ?? draft.sourcePersonId ?? null, name: draft.name, portraitId: draft.portraitId,
      summary: draft.summary, priorName: saved?.name ?? originalPerson?.name ?? null,
      priorSummary: saved?.summary && saved.summary !== draft.summary ? saved.summary.slice(0, 500) : null, identity: person?.identity ?? saved?.tag ?? null },
    appearanceEvidence: 'portraitId identifies an already chosen local portrait; do not infer extra visual facts from its internal ID.',
    relatedTurns,
    evidence: relatedTurns.length ? '仅使用这些既有出场记录与玩家填写内容，缺失事实保持未定。' : '没有找到此人此前的出场记录；不要虚构已经发生的关系、对话或经历。',
  };
}

