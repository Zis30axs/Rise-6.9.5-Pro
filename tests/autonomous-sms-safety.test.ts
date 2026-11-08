import { describe, expect, it, vi } from 'vitest';
import type { WorldState } from '../src/frontend/types';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { knownProtagonistContact } from '../src/runtime/initial-contacts';
import { applyAutonomousSms, autonomousSmsContext, stageAutonomousSms } from '../src/runtime/autonomous-sms';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { PROTAGONISTS } from '../src/runtime/dual-protagonists';

function initial(kind: 'npc' | 'protagonist' = 'npc') {
  let s = enableProtagonists(createInitialState());
  if (kind === 'npc') s = reduceState(s, { type: 'switch_protagonist', target: 'emma' });
  s.contacts = kind === 'npc' ? s.contacts.filter(c => c.id === 'majo-yuki')
    : [knownProtagonistContact('sakiko', '丰川祥子')];
  // Isolate this scheduler from deterministic background-life mail. Recent
  // background mail now correctly puts the same protagonist thread on cooldown.
  for (const owner of PROTAGONISTS) {
    s.protagonists!.backgroundLife!.people[owner].nextDecisionAt = 30 * 1440;
    s.protagonists!.backgroundLife!.people[owner].pending = null;
  }
  return s;
}
function reserve(s = initial()) {
  return stageAutonomousSms(s, reduceState(s, { type: 'wait', minutes: 120 }), () => 0);
}
function advance(s: WorldState, minutes: number) {
  while (minutes > 0) { const step = Math.min(120, minutes); s = reduceState(s, { type: 'wait', minutes: step }); minutes -= step; }
  return s;
}
function question(s: WorldState, kind: 'npc' | 'protagonist') {
  return reduceState(s, { type: 'phone_app', requestId: 'manual-question', owner: kind === 'npc' ? 'emma' : 'soyo',
    command: kind === 'npc' ? { type: 'send_npc_message', npcId: 'majo-yuki', text: '我的问题还没点回复。' }
      : { type: 'send_message', to: 'sakiko', text: '我的问题还没点回复。' } });
}

describe('autonomous SMS safety boundaries', () => {
  it('persists failed random checks and does not roll again before the next game window', () => {
    const s = initial(), roll = vi.fn(() => 0.9);
    const checked = stageAutonomousSms(s, advance(s, 120), roll);
    expect(checked.autonomousSms?.pending).toBeNull();
    const reloaded = parseState(checked);
    const early = stageAutonomousSms(reloaded, advance(reloaded, 89), roll);
    expect(early.autonomousSms?.nextAt).toBe(checked.autonomousSms?.nextAt);
    expect(roll).toHaveBeenCalledTimes(1);
    const due = stageAutonomousSms(early, advance(early, 1), () => 0);
    expect(due.autonomousSms?.pending).toBeTruthy();
  });
  it('enforces sender cooldown, two deliveries per game day and quiet hours', () => {
    const morning = advance(initial(), 14 * 60);
    let s = reserve(morning), id = s.autonomousSms!.pending!.id;
    s = applyAutonomousSms(s, id, '第一条有实际话题的消息');
    const cooling = stageAutonomousSms(s, advance(s, 90), () => 0);
    expect(cooling.autonomousSms?.pending).toBeNull();
    s = stageAutonomousSms(cooling, advance(cooling, 270), () => 0);
    id = s.autonomousSms!.pending!.id;
    s = applyAutonomousSms(s, id, '第二条不同的话题');
    const capped = stageAutonomousSms(s, advance(s, 360), () => 0);
    expect(capped.autonomousSms?.pending).toBeNull();
    expect(parseState(capped).autonomousSms?.history).toHaveLength(2);
    const night = advance(initial(), 6 * 60);
    expect(reserve(night).autonomousSms?.pending).toBeNull();
  });
  it('leaves the explicit band invitation and roster unchanged by unsolicited tasks', () => {
    let s = initial('protagonist');
    s = reduceState(s, { type: 'switch_protagonist', target: 'sakiko' });
    s = reduceState(s, { type: 'choose_academics', majorId: 'music' });
    s = reduceState(s, { type: 'switch_protagonist', target: 'soyo' });
    const room = getCampusInterior('livehouse')!;
    s.locationId = room.id;
    s.scene = { x: room.entrance.x, z: room.entrance.z, yaw: 0, areaId: room.parentLocationId, seed: 'sms-band-test', encounterId: null };
    s.interior = { roomId: room.id, x: 3.2, z: -1.2, yaw: 0, activityId: null, lastRest: null, lastStudy: null };
    s = reduceState(s, { type: 'interior_interact', interactionId: 'livehouse-create-band', registration: { id: 'sms-band', name: '测试乐队', founderRole: 'bass' } });
    s = reduceState(s, { type: 'phone_app', requestId: 'sms-band-invite', owner: 'soyo', command: { type: 'band_invite', bandId: 'sms-band', contactId: 'protagonist-sakiko', role: 'keyboard' } });
    const registry = JSON.stringify(s.livehouse);
    const next = reserve(s);
    expect(next.autonomousSms?.pending).toBeNull();
    expect(JSON.stringify(next.livehouse)).toBe(registry);
    expect(next.livehouse!.invitations[0]!.status).toBe('pending');
    expect(next.livehouse!.bands.find(b=>b.id==='sms-band')!.members).toHaveLength(1);
  });
  it.each(PROTAGONISTS)('delivers only to %s and preserves the other three private inboxes', owner => {
    let s = initial();
    const contacts = s.contacts;
    s = reduceState(s, { type: 'switch_protagonist', target: owner });
    s.contacts = contacts;
    s = reserve(s);
    const id = s.autonomousSms!.pending!.id;
    const others = PROTAGONISTS.filter(id => id !== owner);
    const inboxes = others.map(id => personState(s, id).phone);
    const notifications = others.map(id => s.protagonists!.devices[id].notifications);
    const next = applyAutonomousSms(s, id, '只给这位收件人的私人短信');
    expect(next.phone.at(-1)?.id).toBe(id);
    expect(next.protagonists!.npcPhone!.messages.at(-1)?.owner).toBe(owner);
    expect(others.map(id => personState(next, id).phone)).toEqual(inboxes);
    expect(others.map(id => next.protagonists!.devices[id].notifications)).toEqual(notifications);
    expect(parseState(next)).toEqual(next);
  });
  for (const kind of ['npc', 'protagonist'] as const) {
    it(`does not turn a pending manual ${kind} question into an automatic reply`, () => {
      const s = reserve(question(initial(kind), kind));
      expect(s.autonomousSms?.pending).toBeNull();
    });
    it(`drops a ${kind} proposal if the player sends a question during generation`, () => {
      const s = reserve(initial(kind)), task = s.autonomousSms!.pending!;
      const latest = question(s, kind);
      const next = applyAutonomousSms(latest, task.id, '这是未经手动请求的回答。');
      expect(next.phone.some(m => m.id === task.id)).toBe(false);
      expect(next.autonomousSms?.pending).toBeNull();
      expect(parseState(next)).toEqual(next);
    });
    it(`deduplicates repeated ${kind} text across different candidate IDs`, () => {
      const first = reserve(initial(kind)), task = first.autonomousSms!.pending!;
      const sent = applyAutonomousSms(first, task.id, '今天排练结束了。');
      const later = stageAutonomousSms(sent, advance(sent, 360), () => 0);
      // The initial evening plus six hours is quiet time; stage a new valid
      // morning window through the game reducer rather than editing its clock.
      const nextDay = later.autonomousSms?.pending ? later
        : stageAutonomousSms(later, advance(later, 720), () => 0);
      const second = nextDay.autonomousSms!.pending!;
      expect(second).toBeTruthy();
      const duplicate = applyAutonomousSms(nextDay, second.id, '  今天 排练结束了。  ');
      expect(duplicate.phone.some(m => m.id === second.id)).toBe(false);
      expect(duplicate.autonomousSms?.history).toHaveLength(1);
    });
  }

  it('does not use new world facts to backdate a pending message after a reload', () => {
    const s = reserve(), id = s.autonomousSms!.pending!.id;
    const later = parseState(reduceState(s, { type: 'wait', minutes: 5 }));
    expect(() => autonomousSmsContext(later, id)).toThrow();
    expect(() => applyAutonomousSms(later, id, '不能把未来发生的事发到过去。')).toThrow('过期');
    const next = stageAutonomousSms(later, later);
    expect(next.phone.some(m => m.id === id)).toBe(false);
    expect(next.autonomousSms?.pending).toBeNull();
  });

  it('does not expose the recipient or unrelated protagonists private data to either sender kind', () => {
    for (const kind of ['npc', 'protagonist'] as const) {
      const s = reserve(initial(kind)), id = s.autonomousSms!.pending!.id;
      s.story.push({ id: 'private-story', role: 'assistant', text: 'RECIPIENT_STORY_SECRET' });
      s.journal.push({ id: 'private-journal', at: '私人时间', text: 'RECIPIENT_DIARY_SECRET' });
      personState(s, 'renako').story.push({ id: 'unrelated-story', role: 'assistant', text: 'RENAKO_PRIVATE_SECRET' });
      const context = JSON.stringify(autonomousSmsContext(s, id));
      expect(context).not.toMatch(/RECIPIENT_STORY_SECRET|RECIPIENT_DIARY_SECRET|RENAKO_PRIVATE_SECRET/);
    }
  });

  it('does not partially prune the inbox when notification capacity prevents delivery', () => {
    const s = reserve(), task = s.autonomousSms!.pending!;
    s.phone = Array.from({ length: 200 }, (_, i) => ({ id: `old-${i}`, npcId: 'majo-yuki', text: '已读旧消息', read: true, at: '旧记录' }));
    s.protagonists!.devices.emma.notifications = Array.from({ length: 200 }, (_, i) => ({ id: `notice-${i}`, at: task.at, text: '未读通知', read: false }));
    const next = applyAutonomousSms(s, task.id, '没有足够空间。');
    expect(next.phone).toEqual(s.phone);
    expect(next.protagonists!.devices.emma.notifications).toEqual(s.protagonists!.devices.emma.notifications);
    expect(next.protagonists!.npcPhone?.messages ?? []).toEqual(s.protagonists!.npcPhone?.messages ?? []);
  });
});
