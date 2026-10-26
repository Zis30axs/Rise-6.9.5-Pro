import type { WorldState } from '../frontend/types';
import { npcPhoneView } from './npc-phone';
import { activeProtagonist, gameMinute, personState, protagonistNames } from './protagonist-world';

/**
 * The conversation UI uses the fictional world clock, never the phone's
 * system clock. A reply or an actual opened receipt takes precedence.
 * Otherwise "read" is a deterministic *game-world approximation* after
 * five elapsed game minutes, not a claim that an LLM has run.
 */
export const SMS_READ_DELAY_MINUTES = 5;

export function smsReadReceipt(
  sentAt: number,
  gameNow: number,
  answered = false,
  confirmedRead = false,
): 'delivered' | 'read' {
  if (answered || confirmedRead) return 'read';
  if (!Number.isSafeInteger(sentAt) || !Number.isSafeInteger(gameNow) || gameNow < sentAt) return 'delivered';
  return gameNow - sentAt >= SMS_READ_DELAY_MINUTES ? 'read' : 'delivered';
}

/** Only messages involving the current viewpoint; never dump other characters' private mail. */
export function storySmsContext(state: WorldState) {
  const owner = activeProtagonist(state);
  const now = gameMinute(state);
  const p = state.protagonists;
  if (!p) return [];
  const ownDual = (p.conversations ?? []).filter(m => m.from === owner || m.to === owner);
  const received = new Map(personState(state, owner).phone.map(m => [m.id, m.read] as const));
  const canonical = ownDual.map(m => ({
    id: m.id,
    channel: 'protagonist' as const,
    with: protagonistNames[m.from === owner ? m.to : m.from],
    direction: m.from === owner ? 'outgoing' as const : 'incoming' as const,
    at: m.at,
    text: m.text,
    // An incoming message being delivered is not proof the player opened it.
    receipt: m.from === owner
      ? smsReadReceipt(m.at, now, ownDual.some(reply => reply.replyTo === m.id),
          personState(state, m.to).phone.some(row => row.id === m.id && row.read))
      : received.get(m.id) ? 'read' as const : 'unread' as const,
  }));
  const social = npcPhoneView(state, owner);
  const contacts = new Map(social.contacts.map(c => [c.id, c.name] as const));
  const groups = new Map(social.groups.map(g => [g.id, g.name] as const));
  const npcMessages = social.messages.map(m => ({
    id: m.id,
    channel: m.channel,
    with: m.channel === 'group' ? groups.get(m.targetId) ?? '群聊' : contacts.get(m.targetId) ?? '联系人',
    direction: m.direction,
    at: m.at,
    text: m.text,
    receipt: m.direction === 'outgoing'
      ? smsReadReceipt(m.at, now, m.status === 'answered')
      : received.has(m.id) ? (received.get(m.id) ? 'read' as const : 'unread' as const) : 'received' as const,
  }));
  // Bounded context: full histories remain in the save and in dedicated SMS
  // reply prompts, while ordinary narrative receives only the latest facts.
  return [...canonical, ...npcMessages]
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .slice(-24)
    .map(({ channel, with: peer, direction, at, text, receipt }) => ({
      channel, peer, direction, at, text: text.slice(0, 400), receipt,
    }));
}
