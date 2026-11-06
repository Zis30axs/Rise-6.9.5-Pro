import type { CharacterContact, WorldState } from './types';
import type { SocialInvitation } from '../runtime/natural-interactions';
import { activeProtagonist, protagonistNames } from '../runtime/protagonist-world';
import { agendaTargetProtagonist, agreedMinute, socialMinute } from '../runtime/social-agenda';
import { formatGameDate, gameCalendar, gameDayFromISO } from '../runtime/game-calendar';
import { PROTAGONISTS, PROTAGONIST_PERSON_IDS } from '../runtime/dual-protagonists';

export type InvitationShelf = 'upcoming' | 'pending' | 'history';
export interface InvitationCard {
  id: string;
  name: string;
  personId: string;
  portraitId: CharacterContact['portraitId'] | null;
  protagonistId: typeof PROTAGONISTS[number] | null;
  incoming: boolean;
  source: SocialInvitation['source'];
  status: SocialInvitation['status'];
  shelf: InvitationShelf;
  statusLabel: string;
  relativeTime: string;
  date: string;
  day: number;
  time: string;
  locationId: string;
  message: string;
  response: string | null;
}

export function invitationContactIdentity(contact: CharacterContact) {
  const personId = contact.sourcePersonId ?? contact.id;
  const protagonistId = PROTAGONISTS.find(id => personId === id || personId === 'protagonist-' + id || personId === PROTAGONIST_PERSON_IDS[id]) ?? null;
  return { name: contact.name, personId, portraitId: contact.portraitId, protagonistId };
}

/** A view of shared promises only. Never project the target's private agenda. */
export function invitationCards(state: WorldState): InvitationCard[] {
  const owner = activeProtagonist(state), now = socialMinute(state);
  return (state.protagonists?.socialInvitations ?? []).flatMap(invite => {
    const target = agendaTargetProtagonist(state, invite);
    if (invite.owner !== owner && target !== owner) return [];
    const incoming = invite.owner !== owner;
    const contact = state.contacts.find(item => item.id === invite.targetId || item.sourcePersonId === invite.targetId);
    const identity = incoming
      ? { name: protagonistNames[invite.owner], personId: PROTAGONIST_PERSON_IDS[invite.owner] ?? invite.owner, portraitId: null, protagonistId: invite.owner }
      : contact ? invitationContactIdentity(contact)
      : { name: invite.targetName, personId: invite.targetId, portraitId: null, protagonistId: target };
    const difference = agreedMinute(invite) - now;
    // The same three-hour window used by the existing travel shortcut. History
    // means the date has passed, never that a meeting happened or was cancelled.
    const past = difference < -180;
    const shelf: InvitationShelf = past || invite.status === 'declined' ? 'history' : invite.status === 'pending' ? 'pending' : 'upcoming';
    const relativeTime = difference < 0 ? `已过约定时间 ${duration(-difference)}`
      : difference === 0 ? '约定时间到了' : `还有 ${duration(difference)}`;
    const statusLabel = invite.status === 'declined' ? '已婉拒'
      : invite.status === 'pending' ? '待回应' : past ? '已过约定时间'
      : difference <= 0 ? '约定时间已到' : '已约定';
    return [{ id: invite.id, ...identity, incoming, source: invite.source, status: invite.status,
      shelf, statusLabel, relativeTime, date: formatGameDate(invite.day), day: invite.day,
      time: invite.time, locationId: invite.locationId, message: invite.message, response: invite.response }];
  }).sort((a, b) => {
    const at = (row: InvitationCard) => agreedMinute(row);
    return a.shelf === 'history' && b.shelf === 'history' ? at(b) - at(a) : at(a) - at(b);
  });
}

function duration(minutes: number): string {
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), rest = minutes % 60;
  return [days ? `${days} 天` : '', hours ? `${hours} 小时` : '', rest ? `${rest} 分钟` : ''].filter(Boolean).join(' ') || '0 分钟';
}

export interface InvitationDraft {
  name: string;
  source: 'sms' | 'meeting';
  date: string;
  time: string;
  location: string;
  activity: string;
}

export function invitationDraftError(draft: InvitationDraft, state: WorldState): string {
  if (!draft.name) return '先选一位想见的人。';
  let day: number;
  try { day = gameDayFromISO(draft.date); } catch { return '请选择有效的见面日期。'; }
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return '请填写见面时间。';
  if (agreedMinute({ day, time: draft.time }) <= socialMinute(state)) return '见面时间需要晚于现在。';
  if (!draft.location) return '请选择见面地点。';
  if (!draft.activity.trim()) return '写下想一起做的事。';
  if (draft.activity.trim().length > 300) return '邀请内容请控制在 300 字以内。';
  return '';
}

export function invitationDraftText(draft: InvitationDraft): string {
  const date = formatGameDate(gameDayFromISO(draft.date));
  return `${draft.source === 'sms' ? '给' + draft.name + '发短信' : '当面向' + draft.name + '提出邀请'}，约在${date} ${draft.time}，在${draft.location}见面。想一起做的事：${draft.activity.trim()}`;
}

export function defaultInvitationTime(state: WorldState) {
  const minute = socialMinute(state) + 60;
  return { date: gameCalendar(Math.floor(minute / 1440) + 1).iso,
    time: `${String(Math.floor(minute % 1440 / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}` };
}
