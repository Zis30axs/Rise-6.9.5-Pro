import type { WorldState } from '../../frontend/types';
import { PROTAGONISTS, type ProtagonistId } from '../dual-protagonists';
import { pruneVariableEcho } from '../prompt-pruning';
import { memoryKey } from './types';
import type { MemorySource } from './types';

function personal(state: WorldState, owner: ProtagonistId) {
  const p = state.protagonists;
  if (!p) return owner === 'soyo' ? state : null;
  if (p.accounts.active === owner) return state;
  const others = PROTAGONISTS.filter(id => id !== p.accounts.active);
  return owner === others[0] ? p.inactive : owner === others[1] ? p.third : p.fourth;
}
const gameMinute = (state: WorldState) => (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;

export function collectCommittedSources(scope: string, before: WorldState, after: WorldState): MemorySource[] {
  const output: MemorySource[] = [], at = gameMinute(after);
  const turn = after.protagonists?.narrativeTurn ?? 0;
  const add = (id: string, kind: MemorySource['kind'], owner: ProtagonistId | null,
    text: string, knownBy: ProtagonistId[], participants: string[] = []) => {
    const clean = pruneVariableEcho(text).trim();
    if (!clean) return;
    // Never drop a long story tail. Smaller independent provenance chunks also
    // stay below the minimum configured model input budget.
    const parts = Math.ceil(clean.length / 1400);
    for (let i = 0; i < parts; i++) {
      const partId = parts === 1 ? id : id + ':part:' + i;
      output.push({ key: memoryKey(scope, partId), scope, id: partId, kind, owner,
        knownBy: [...knownBy], participants: [...participants],
        text: clean.slice(i * 1400, (i + 1) * 1400), at, turn, processed: false });
    }
  };
  for (const owner of PROTAGONISTS) {
    const old = personal(before, owner), next = personal(after, owner);
    if (!next) continue;
    const storyIds = new Set(old?.story.map(s => s.id) ?? []);
    for (const s of next.story) {
      if (storyIds.has(s.id)) continue;
      if (s.role === 'assistant') {
        // Novel prose can contain narrator-only facts, including private thoughts.
        // Never blindly promote it into a character's knowledge.
        add('story:' + owner + ':' + s.id, 'story', owner,
          s.text + (s.returnStory ? '\n' + s.returnStory : ''), [], s.participantIds ?? []);
      } else {
        // The player request is evidence of the player's stated intention, not
        // proof that the requested action was carried out.
        add('input:' + owner + ':' + s.id, 'story', owner, s.text, [owner], s.participantIds ?? []);
      }
    }
    const journals = new Set(old?.journal.map(j => j.id) ?? []);
    for (const j of next.journal) {
      if (!journals.has(j.id)) add('journal:' + owner + ':' + j.id, 'journal', owner, j.text, [owner]);
    }
    const oldPhone = new Map((old?.phone ?? []).map(p => [p.id, p]));
    for (const sms of next.phone) {
      if (sms.read && !oldPhone.get(sms.id)?.read) {
        add('read:' + owner + ':' + sms.id, 'message', owner, sms.text, [owner], [sms.npcId]);
      }
    }
  }
  const oldConversations = new Set(before.protagonists?.conversations?.map(m => m.id) ?? []);
  for (const row of after.protagonists?.conversations ?? []) {
    if (!oldConversations.has(row.id)) {
      add('sms:sent:' + row.id, 'message', row.from, row.text, [row.from], [row.from, row.to]);
    }
  }
  const prev = new Map(before.protagonists?.weeklyMemory?.closed.map(w => [w.week, w.summary]) ?? []);
  for (const week of after.protagonists?.weeklyMemory?.closed ?? []) {
    if (week.summary && prev.get(week.week) !== week.summary)
      add('weekly:' + week.week, 'weekly', null, week.summary, []);
  }
  return output;
}

/** Only backfill source material still present in the authoritative save. */
export function collectExistingSources(scope: string, state: WorldState): MemorySource[] {
  const empty = structuredClone(state);
  for (const owner of PROTAGONISTS) {
    const person = personal(empty, owner);
    if (!person) continue;
    person.story = [];
    person.journal = [];
    person.phone = [];
  }
  if (empty.protagonists) {
    empty.protagonists.conversations = [];
    if (empty.protagonists.weeklyMemory) empty.protagonists.weeklyMemory.closed = [];
  }
  return collectCommittedSources(scope, empty, state);
}

export function importantCandidate(text: string): boolean {
  return /告白|交往|分手|决裂|和解|结婚|求婚|承诺|答应|秘密|赠送|送给|判决|结案|撤诉|乐队成立|解散|毕业|重大决定/.test(text);
}
