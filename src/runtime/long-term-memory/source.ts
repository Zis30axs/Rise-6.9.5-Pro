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
function parseSavedMinute(stamp: string, fallback: number): number {
  const m = /第\s*(\d+)\s*天\s*(\d{1,2}):(\d{2})/.exec(stamp);
  if (!m) return fallback;
  const day = Number(m[1]), hour = Number(m[2]), minute = Number(m[3]);
  if (!Number.isSafeInteger(day) || day < 1 || day > 366000
    || hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  const calculated = (day - 1) * 1440 + hour * 60 + minute;
  return calculated <= fallback ? calculated : fallback;
}
function fingerprint(text: string): string {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0).toString(36);
}


export function collectCommittedSources(scope: string, before: WorldState, after: WorldState): MemorySource[] {
  const output: MemorySource[] = [], at = gameMinute(after);
  const turn = after.protagonists?.narrativeTurn ?? 0;
  const add = (id: string, kind: MemorySource['kind'], owner: ProtagonistId | null,
    text: string, knownBy: string[], participants: string[] = [], moment = at) => {
    const clean = pruneVariableEcho(text).trim();
    if (!clean) return;
    // Never drop a long story tail. Smaller independent provenance chunks also
    // stay below the minimum configured model input budget.
    const parts = Math.ceil(clean.length / 640);
    for (let i = 0; i < parts; i++) {
      const partId = parts === 1 ? id : id + ':part:' + i;
      output.push({ key: memoryKey(scope, partId), scope, id: partId, kind, owner,
        knownBy: [...knownBy], participants: [...participants],
        text: clean.slice(i * 640, (i + 1) * 640), at: moment, turn, processed: false });
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
      if (!journals.has(j.id)) add('journal:' + owner + ':' + j.id, 'journal', owner,
        j.text, [owner], [], parseSavedMinute(j.at, at));
    }
    const oldPhone = new Map((old?.phone ?? []).map(p => [p.id, p]));
    for (const sms of next.phone) {
      if (sms.read && !oldPhone.get(sms.id)?.read) {
        add('read:' + owner + ':' + sms.id, 'message', owner, sms.text, [owner], [sms.npcId]);
      }
    }
  }
  const beforeNpc = new Set(before.protagonists?.npcPhone?.messages.map(m => m.id) ?? []);
  const received = new Map(PROTAGONISTS.map(owner => [
    owner, new Set(personal(after, owner)?.phone.filter(row => row.read).map(row => row.id) ?? []),
  ] as const));
  for (const msg of after.protagonists?.npcPhone?.messages ?? []) {
    if (beforeNpc.has(msg.id)) continue;
    const participants = [msg.owner, msg.speakerId, msg.targetId];
    // The owner has not necessarily opened incoming messages; the speaker
    // knows what they sent. Group membership alone does not prove reading.
    const confirmedReaders = msg.direction === 'outgoing' ? [msg.owner]
      : received.get(msg.owner)?.has(msg.id) || received.get(msg.owner)?.has(msg.id.replace(/:reply:.*/, ':reply'))
      ? [msg.owner] : [];
    const known = [...new Set([msg.speakerId, ...confirmedReaders])];
    add('npc-sms:' + msg.id, 'message', msg.owner, msg.text,
      known, participants, msg.at);
  }
  const oldConversations = new Set(before.protagonists?.conversations?.map(m => m.id) ?? []);
  for (const row of after.protagonists?.conversations ?? []) {
    if (!oldConversations.has(row.id)) {
      add('sms:sent:' + row.id, 'message', row.from, row.text,
        [row.from], [row.from, row.to], row.at);
    }
  }
  // Deterministic MVU changes are authoritative evidence, never instructions.
  const revision = after.protagonists?.revision ?? 0;
  for (const owner of PROTAGONISTS) {
    const old = personal(before, owner), next = personal(after, owner);
    if (!old || !next) continue;
    const prevItems = new Map(old.inventory.map(row => [row.itemId, row.quantity]));
    const nowItems = new Map(next.inventory.map(row => [row.itemId, row.quantity]));
    for (const itemId of new Set([...prevItems.keys(), ...nowItems.keys()])) {
      const count = nowItems.get(itemId) ?? 0, previous = prevItems.get(itemId) ?? 0;
      if (count === previous) continue;
      const diff = count - previous;
      const text = diff > 0
        ? '背包中的物品 ' + itemId + ' 增加了 ' + diff + ' 份。'
        : '背包中的物品 ' + itemId + ' 减少了 ' + (-diff) + ' 份。';
      add('mvu:item:' + owner + ':' + revision + ':' + fingerprint(itemId + ':' + previous + ':' + count + ':' + at),
        'item', owner, text, [owner], [owner, itemId]);
    }
    const oldContacts = new Map(old.contacts.map(c => [c.id, c]));
    for (const contact of next.contacts) {
      const previous = oldContacts.get(contact.id);
      if (!previous || previous.affinity === contact.affinity) continue;
      const descriptor = contact.affinity > previous.affinity ? '关系有所改善' : '关系出现紧张';
      add('mvu:relationship:' + owner + ':' + revision + ':' + fingerprint(contact.id + ':' + previous.affinity + ':' + contact.affinity + ':' + at),
        'relationship', owner, '与' + contact.name + descriptor + '。',
        [owner], [owner, contact.sourcePersonId ?? contact.id]);
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
