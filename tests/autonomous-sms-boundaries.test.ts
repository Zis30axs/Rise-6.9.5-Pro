import { describe, expect, it, vi } from 'vitest';
import { applyStoryActions, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, gameMinute, personState, applyPhoneReply } from '../src/runtime/protagonist-world';
import { applyNpcPhoneReply } from '../src/runtime/npc-phone';
import { PROTAGONISTS, type ProtagonistId } from '../src/runtime/dual-protagonists';
import { applyAutonomousSms, autonomousSmsContext, stageAutonomousSms } from '../src/runtime/autonomous-sms';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import type { WorldState } from '../src/frontend/types';

function initial(owner: ProtagonistId = 'emma') {
  return reduceState(enableProtagonists(createInitialState()), { type: 'switch_protagonist', target: owner });
}
function reserve(s: WorldState, kind: 'npc' | 'protagonist' = 'npc', peerId = 'majo-yuki') {
  const owner = s.protagonists!.accounts.active, at = gameMinute(s);
  s.autonomousSms = { version: 1, nextAt: at + 90, history: [],
    pending: { id: `auto:${owner}:${at}`, owner, at, kind, peerId } };
  return parseState(s);
}
function check(s: WorldState, minutes = 90, random = () => 0) {
  return stageAutonomousSms(s, advance(s, minutes), random);
}
const advance = (s: WorldState, minutes: number) => applyStoryActions(s, [{ type: 'rest', kind: 'wait', minutes }]);
function deliver(s: WorldState, text: string) {
  return applyAutonomousSms(s, s.autonomousSms!.pending!.id, text);
}

describe('autonomous SMS scheduling and state boundaries', () => {
  it('persists failed rolls and silence across reload without repeated checks', () => {
    const roll = vi.fn(() => 0.9), before = initial();
    const missed = check(before, 90, roll);
    expect(missed.autonomousSms!.pending).toBeNull();
    const reloaded = parseState(JSON.parse(JSON.stringify(missed)));
    expect(check(reloaded, 5, roll).autonomousSms!.pending).toBeNull();
    expect(roll).toHaveBeenCalledTimes(1);
    const picked = check(reloaded);
    const silent = applyAutonomousSms(picked, picked.autonomousSms!.pending!.id, null);
    expect(stageAutonomousSms(silent, parseState(silent), roll)).toEqual(silent);
    expect(silent.phone).toEqual(picked.phone);
  });

  it('does not call the random generator while the clock is frozen or overnight', () => {
    const before = initial(), roll = vi.fn(() => 0);
    expect(stageAutonomousSms(before, parseState(before), roll)).toEqual(before);
    const night = check(before, 330, roll);
    expect(night.clock.hour).toBeGreaterThanOrEqual(22);
    expect(night.autonomousSms!.pending).toBeNull();
    expect(roll).not.toHaveBeenCalled();
  });

  it('limits daily mail to two and a single sender to six game hours across reloads', () => {
    let s = initial();
    const first = check(s); expect(first.autonomousSms!.pending).toBeTruthy();
    const firstPeer = first.autonomousSms!.pending!.peerId;
    s = deliver(first, '第一条日常短信');
    const second = check(parseState(s));
    expect(second.autonomousSms!.pending!.peerId).not.toBe(firstPeer);
    s = deliver(second, '第二条日常短信');
    const roll = vi.fn(() => 0), capped = check(parseState(s), 90, roll);
    expect(capped.autonomousSms!.pending).toBeNull(); expect(roll).not.toHaveBeenCalled();
    const tomorrow = check(capped, 1440);
    expect(tomorrow.autonomousSms!.pending).toBeTruthy();
    expect(tomorrow.autonomousSms!.history).toHaveLength(2);
  });

  it('checks one current window after a large time jump, without backfilling missed mail', () => {
    const before = initial(), after = parseState(before), roll = vi.fn(() => 0);
    after.clock.day += 7;
    const state = stageAutonomousSms(before, after, roll);
    expect(roll).toHaveBeenCalledTimes(2); // chance and one sender choice
    expect(state.autonomousSms!.history).toHaveLength(0);
    expect(state.autonomousSms!.pending!.at).toBe(gameMinute(state));
  });

  it.each(PROTAGONISTS)('isolates %s as sender from all other private histories and unread mail', sender => {
    const owner: ProtagonistId = sender === 'soyo' ? 'sakiko' : 'soyo';
    let s = initial(owner);
    if (!s.contacts.some(c => c.id === `protagonist-${sender}`)) s.contacts.push({
      id: `protagonist-${sender}`, name: sender, tag: '旧识', affinity: 0, status: 'RECIPIENT_SECRET_STATUS',
      summary: 'RECIPIENT_PRIVATE_OPINION', portraitId: 'deepseek', sourcePersonId: null, isMain: true,
    });
    const contact = s.contacts.find(c => c.id === `protagonist-${sender}`)!;
    contact.summary = 'RECIPIENT_PRIVATE_OPINION'; contact.status = 'RECIPIENT_SECRET_STATUS';
    for (const id of PROTAGONISTS) {
      const person = personState(s, id);
      person.story.push({ id: `${id}-omniscient`, role: 'assistant', text: `PRIVATE_STORY_${id}` });
      person.journal.push({ id: `${id}-diary`, at: '第 1 天 17:20', text: `PRIVATE_DIARY_${id}` });
    }
    s.protagonists!.conversations!.push({ id: 'unread-secret', from: owner, to: sender,
      at: gameMinute(s) - 400, text: 'UNREAD_PRIVATE_TEXT', replyTo: null, expectsReply: false });
    s = reserve(s, 'protagonist', sender);
    const context = JSON.stringify(autonomousSmsContext(s, s.autonomousSms!.pending!.id));
    for (const secret of ['PRIVATE_STORY_', 'PRIVATE_DIARY_', 'UNREAD_PRIVATE_TEXT', 'RECIPIENT_PRIVATE_OPINION', 'RECIPIENT_SECRET_STATUS'])
      expect(context).not.toContain(secret);
    expect(context).toContain('personality');
    const next = deliver(s, '由本人生活产生的日常话题');
    expect(next.phone.at(-1)!.read).toBe(false);
    expect(next.protagonists!.conversations!.at(-1)).toMatchObject({ from: sender, to: owner, replyTo: null, expectsReply: false });
    expect(parseState(next)).toEqual(next);
  });

  it('maps a saved resident identity of a protagonist to their authoritative personal state', () => {
    const s = initial('soyo');
    s.contacts = [{ id: 'emma-alias', name: '樱羽艾玛', sourcePersonId: 'majo-emma', tag: '旧识',
      summary: '旧识', affinity: 0, status: '已互加好友', portraitId: 'deepseek', isMain: true }];
    const picked = check(s);
    expect(picked.autonomousSms!.pending).toMatchObject({ kind: 'protagonist', peerId: 'emma' });
    const next = deliver(picked, '别忘了休息。');
    expect(next.phone.at(-1)!.npcId).toBe('emma-alias');
    expect(next.protagonists!.npcPhone?.messages ?? []).toHaveLength(0);
    expect(parseState(next)).toEqual(next);
  });

  it('does not auto-answer pending NPC messages at scheduling or commit', () => {
    let s = initial(); s.contacts = s.contacts.filter(c => c.id === 'majo-yuki');
    s = reduceState(s, { type: 'phone_app', requestId: 'manual-only', owner: 'emma',
      command: { type: 'send_npc_message', npcId: 'majo-yuki', text: '等我手动请求回复。' } });
    expect(check(s, 400).autonomousSms!.pending).toBeNull();
    const proposed = reserve(s), saved = JSON.stringify(proposed.protagonists!.npcPhone);
    expect(() => autonomousSmsContext(proposed, proposed.autonomousSms!.pending!.id)).toThrow('已有新互动');
    expect(stageAutonomousSms(proposed, proposed).autonomousSms!.pending).toBeNull();
    const skipped = deliver(proposed, '不能自动回应');
    expect(JSON.stringify(skipped.protagonists!.npcPhone)).toBe(saved);
    expect(skipped.phone).toEqual(proposed.phone);
  });

  it('drops an in-flight proposal after a manual reply in the same game minute', () => {
    let s = reserve(initial('soyo'), 'protagonist', 'sakiko');
    s = reduceState(s, { type: 'phone_app', requestId: 'manual-late', owner: 'soyo',
      command: { type: 'send_message', to: 'sakiko', text: '想问你一件事。' } });
    s = applyPhoneReply(s, 'dual:manual-late', '请说。');
    const next = deliver(s, '多余的一条');
    expect(next.protagonists!.conversations).toEqual(s.protagonists!.conversations);
    expect(next.phone).toEqual(s.phone);
  });

  it('deduplicates normalized text even outside the sender cooldown', () => {
    let s = initial();
    s = reduceState(s, { type: 'phone_app', requestId: 'old-reply', owner: 'emma',
      command: { type: 'send_npc_message', npcId: 'majo-yuki', text: '问候' } });
    s = applyNpcPhoneReply(s, 'npc:old-reply', '今天 一起吃饭吧。');
    s = reserve(advance(s, 400));
    const next = deliver(s, '今天一起吃饭吧。');
    expect(next.phone).toEqual(s.phone);
    expect(next.protagonists!.npcPhone).toEqual(s.protagonists!.npcPhone);
    expect(next.autonomousSms!.pending).toBeNull();
  });

  it('also rate-limits and deduplicates ordinary story-generated phone messages', () => {
    let s = initial(); s.contacts = s.contacts.filter(row => row.id === 'majo-yuki');
    s.phone.push({ id: 'story-sms', npcId: 'majo-yuki', text: '今天一起吃饭吧。', read: false, at: '第 1 天 17:20' });
    expect(check(s).autonomousSms!.pending).toBeNull();
    s = reserve(advance(s, 400));
    const skipped = deliver(s, '今天 一起吃饭吧。');
    expect(skipped.phone).toEqual(s.phone);
    expect(skipped.protagonists!.npcPhone).toEqual(s.protagonists!.npcPhone);
  });

  it('does not trim part of an inbox when the notification queue is full', () => {
    const s = reserve(initial());
    s.phone = Array.from({ length: 200 }, (_, i) => ({ id: `read-${i}`, npcId: 'majo-yuki', text: '已读消息', read: true, at: '第 1 天 17:20' }));
    s.protagonists!.devices.emma.notifications = Array.from({ length: 200 }, (_, i) => ({ id: `full-${i}`, at: gameMinute(s), text: '未读通知', read: false }));
    const next = deliver(parseState(s), '不会部分写入');
    expect(next.phone).toEqual(s.phone);
    expect(next.protagonists!.devices).toEqual(s.protagonists!.devices);
    expect(next.protagonists!.npcPhone).toEqual(s.protagonists!.npcPhone);
  });

  it('leaves a formal band invitation pending even if proposed text claims acceptance', () => {
    let s = reduceState(initial('sakiko'), { type: 'choose_academics', majorId: 'music' });
    s = reduceState(s, { type: 'switch_protagonist', target: 'soyo' });
    const room = getCampusInterior('livehouse')!;
    s.locationId = room.id;
    s.scene = { x: room.entrance.x, z: room.entrance.z, yaw: 0, areaId: room.parentLocationId, seed: 'sms-band', encounterId: null };
    s.interior = { roomId: room.id, x: 3.2, z: -1.2, yaw: 0, activityId: null, lastRest: null, lastStudy: null };
    s = reduceState(parseState(s), { type: 'interior_interact', interactionId: 'livehouse-create-band', registration: { id: 'sms-band', name: '短信测试乐队', founderRole: 'bass' } });
    s = reduceState(s, { type: 'phone_app', owner: 'soyo', requestId: 'sms-invite', command: { type: 'band_invite', bandId: 'sms-band', contactId: 'protagonist-sakiko', role: 'keyboard' } });
    s = reserve(s, 'protagonist', 'sakiko');
    const next = deliver(s, '我同意加入。');
    expect(next.livehouse).toEqual(s.livehouse);
    expect(next.livehouse!.invitations[0]!.status).toBe('pending');
    expect(next.livehouse!.bands[0]!.members).toHaveLength(1);
    expect(next.phone).toEqual(s.phone);
    expect(parseState(next)).toEqual(next);
  });
});
