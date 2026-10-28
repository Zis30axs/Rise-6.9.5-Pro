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
    const clean = pruneVariableEcho(text).slice(0, 6500).trim();
    if (!clean) return;
    output.push({ key: memoryKey(scope, id), scope, id, kind, owner, knownBy, participants,
      text: clean, at, turn, processed: false });
  };
  for (const owner of PROTAGONISTS) {
    const old = personal(before, owner), next = personal(after, owner);
    if (!next) continue;
    const storyIds = new Set(old?.story.map(s => s.id) ?? []);
    for (const s of next.story) {
      if (!storyIds.has(s.id) && s.role === 'assistant') {
        // Novel prose can contain narrator-only facts, including private thoughts.
        // Never blindly promote it into a character's knowledge.
        add('story:' + owner + ':' + s.id, 'story', owner,
          s.text + (s.returnStory ? '\n' + s.returnStory : ''), [], s.participantIds ?? []);
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
  const prev = new Map(before.protagonists?.weeklyMemory?.closed.map(w => [w.week, w.summary]) ?? []);
  for (const week of after.protagonists?.weeklyMemory?.closed ?? []) {
    if (week.summary && prev.get(week.week) !== week.summary)
      add('weekly:' + week.week, 'weekly', null, week.summary, []);
  }
  return output;
}

export function importantCandidate(text: string): boolean {
  return /告白|交往|分手|决裂|和解|结婚|求婚|承诺|答应|秘密|赠送|送给|判决|结案|撤诉|乐队成立|解散|毕业|重大决定/.test(text);
}
