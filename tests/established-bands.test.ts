import { describe, expect, it } from 'vitest';
import { commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, gameMinute } from '../src/runtime/protagonist-world';
import { applyBandReply, bandReplyContext, livehousePhoneView, performanceMemberIds, syncPerformanceCalendars, validateLivehouseLinks } from '../src/runtime/livehouse';
import { identityStrategyDossier } from '../src/frontend/identity-strategy';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import type { WorldState } from '../src/frontend/types';

function desk(state: WorldState, booking = false) {
  const room = getCampusInterior('livehouse')!;
  state.locationId = room.id;
  state.scene = { x: room.entrance.x, z: room.entrance.z, yaw: 0, areaId: room.parentLocationId, seed: 'established-bands', encounterId: null };
  state.interior = { roomId: room.id, x: booking ? -3.2 : 3.2, z: -1.2, yaw: 0, activityId: null, lastRest: null, lastStudy: null };
  return parseState(state);
}

function legacyMygo() {
  const state = reduceState(desk(enableProtagonists(createInitialState())), { type: 'interior_interact', interactionId: 'livehouse-create-band',
    registration: { id: 'legacy-mygo', name: '旧名册', founderRole: 'bass' } });
  const band = state.livehouse!.bands.find(b => b.id === 'legacy-mygo')!;
  state.livehouse!.bands = [band];
  band.name = 'MyGO!!!!!';
  delete state.livehouse!.establishedBandsVersion;
  return state;
}

function readyToFinish(focusId = 'soyo_rebuild_crychic') {
  const state = enableProtagonists(createInitialState());
  const strategy = state.protagonists!.strategy!;
  strategy.people.soyo.completed.push('soyo_face_past');
  strategy.people.soyo.active = { id: focusId, startedAt: strategy.cursor, progress: 4319 };
  return parseState(state);
}

describe('established bands and Soyo\'s route', () => {
  it('starts Soyo and Sakiko in their existing bands with the correct leaders and full rosters', () => {
    const state = createInitialState();
    const soyo = livehousePhoneView(state, 'soyo');
    const sakiko = livehousePhoneView(state, 'sakiko');
    expect(soyo.bands.map(b => b.name)).toEqual(['MyGO!!!!!']);
    expect(soyo.bands[0]).toMatchObject({ founder: 'bang-anon', leaderName: '千早爱音' });
    expect(soyo.bands[0].members.map(m => m.personId).sort()).toEqual(
      ['protagonist-soyo', 'bang-anon', 'bang-tomori', 'bang-taki', 'bang-rana'].sort());
    expect(sakiko.bands[0]).toMatchObject({ name: 'Ave Mujica', founder: 'sakiko', leaderName: '丰川祥子' });
    expect(sakiko.bands[0].members).toHaveLength(5);
    expect(state.livehouse!.invitations).toEqual([]);
    expect(() => validateLivehouseLinks(state)).not.toThrow();
    expect(parseState(state).livehouse).toEqual(state.livehouse);
  });

  it('repairs old missing registries once without charging time, money or energy', () => {
    const old = enableProtagonists(createInitialState());
    delete old.livehouse;
    const migrated = parseState(old);
    expect(migrated.livehouse!.bands).toHaveLength(2);
    expect(migrated.clock).toEqual(old.clock);
    expect(migrated.player).toEqual(old.player);
    expect(migrated.protagonists!.conversations).toEqual(old.protagonists!.conversations);
    expect(parseState(JSON.parse(JSON.stringify(migrated))).livehouse).toEqual(migrated.livehouse);
  });

  it('leaves MyGO on completing the CRYCHIC route and stays out after reload and viewpoint switches', () => {
    const before = readyToFinish();
    const next = reduceState(before, { type: 'wait', minutes: 1 });
    expect(livehousePhoneView(next, 'soyo').bands).toEqual([]);
    const mygo = next.livehouse!.bands.find(b => b.name === 'MyGO!!!!!')!;
    expect(mygo.members.map(m => m.personId)).not.toContain('protagonist-soyo');
    expect(mygo.founder).toBe('bang-anon');
    expect(mygo.members).toHaveLength(4);
    expect(next.livehouse!.bands.some(b => b.name === 'CRYCHIC')).toBe(false);
    expect(livehousePhoneView(next, 'sakiko').bands[0].members).toHaveLength(5);
    const switched = reduceState(next, { type: 'switch_protagonist', target: 'sakiko' });
    expect(livehousePhoneView(parseState(switched), 'soyo').bands).toEqual([]);
    expect(livehousePhoneView(before, 'soyo').bands).toHaveLength(1);
  });

  it('keeps MyGO membership when cancelling the unfinished route or completing the MyGO route', () => {
    const cancelled = reduceState(readyToFinish(), { type: 'strategy', requestId: 'cancel-route', command: { type: 'cancel_focus', owner: 'soyo' } });
    expect(livehousePhoneView(cancelled, 'soyo').bands[0].name).toBe('MyGO!!!!!');
    const kept = reduceState(readyToFinish('soyo_mygo_future'), { type: 'wait', minutes: 1 });
    expect(livehousePhoneView(kept, 'soyo').bands[0].name).toBe('MyGO!!!!!');
  });

  it('adopts an existing registration without changing its ID, costs, founder evidence or saved skills', () => {
    const old = legacyMygo();
    old.livehouse!.profiles.find(p => p.personId === 'protagonist-soyo')!.skills.bass = 91;
    const snapshot = JSON.stringify(old);
    const migrated = parseState(old);
    const mygo = migrated.livehouse!.bands.find(b => b.established === 'mygo')!;
    expect(mygo).toMatchObject({ id: 'legacy-mygo', founder: 'bang-anon', registeredBy: 'soyo' });
    expect(mygo.members).toHaveLength(5);
    expect(migrated.livehouse!.bands).toHaveLength(2);
    expect(migrated.livehouse!.profiles.find(p => p.personId === 'protagonist-soyo')!.skills.bass).toBe(91);
    expect(migrated.player).toEqual(old.player);
    expect(migrated.clock).toEqual(old.clock);
    expect(JSON.stringify(old)).toBe(snapshot);
    expect(parseState(migrated).livehouse).toEqual(migrated.livehouse);
  });

  it('repairs an older already-completed route and does not mistake a bypass for completion', () => {
    const completed = reduceState(readyToFinish(), { type: 'wait', minutes: 1 });
    const leftAt = completed.livehouse!.bands.find(b => b.established === 'mygo')!.formerMembers![0].leftAt;
    delete completed.livehouse;
    const migrated = parseState(completed);
    expect(livehousePhoneView(migrated, 'soyo').bands).toEqual([]);
    expect(livehousePhoneView(migrated, 'soyo').formerBands[0].leftAt).toBe(leftAt);
    const bypass = readyToFinish();
    bypass.protagonists!.strategy!.flags.crychic_reunited = true;
    const next = reduceState(bypass, { type: 'wait', minutes: 1 });
    expect(next.protagonists!.strategy!.people.soyo.completed).toContain('soyo_rebuild_crychic');
    expect(livehousePhoneView(next, 'soyo').bands[0].name).toBe('MyGO!!!!!');
  });

  it('keeps real past records and withdraws future commitments and pending invitations when Soyo leaves', () => {
    let state = parseState(legacyMygo());
    for (const id of ['guest-accepted', 'guest-pending']) state.contacts.push({ id, name: id, tag: '朋友', summary: '已经相识', affinity: 20, status: '手机联系', sourcePersonId: null, portraitId: 'deepseek', isMain: true });
    const invite = (id: string) => ({ type: 'phone_app' as const, requestId: id, owner: 'soyo' as const,
      command: { type: 'band_invite' as const, bandId: 'legacy-mygo', contactId: id, role: 'guitar' as const } });
    state = reduceState(state, invite('guest-accepted'));
    state = applyBandReply(state, 'npc:guest-accepted', '好，一起练习。', 'accept');
    state = reduceState(state, invite('guest-pending'));
    const pastStart = gameMinute(state) + 90, futureStart = pastStart + 1440;
    const book = (id: string, start: number) => ({ type: 'interior_interact' as const, interactionId: 'livehouse-booking',
      booking: { id, bandId: 'legacy-mygo', title: id, start, duration: 30 } });
    state = reduceState(desk(state, true), book('past-show', pastStart));
    state = reduceState(state, book('future-show', futureStart));
    state = reduceState(state, { type: 'wait', minutes: 120 });
    const strategy = state.protagonists!.strategy!;
    strategy.people.soyo.completed.push('soyo_face_past');
    strategy.people.soyo.active = { id: 'soyo_rebuild_crychic', startedAt: strategy.cursor, progress: 4319 };
    const originalBookings = structuredClone(state.livehouse!.bookings);
    const messages = structuredClone(state.protagonists!.npcPhone!.messages);
    const next = reduceState(parseState(state), { type: 'wait', minutes: 1 });
    expect(next.livehouse!.bookings).toEqual(originalBookings);
    expect(performanceMemberIds(next.livehouse, originalBookings[0])).toContain('protagonist-soyo');
    expect(performanceMemberIds(next.livehouse, originalBookings[1])).not.toContain('protagonist-soyo');
    expect(next.protagonists!.devices.soyo.calendar.map(e => e.id)).toContain('live:past-show');
    expect(next.protagonists!.devices.soyo.calendar.map(e => e.id)).not.toContain('live:future-show');
    expect(next.protagonists!.npcPhone!.messages).toEqual(messages);
    expect(next.livehouse!.invitations.map(i => i.status)).toEqual(['accepted', 'cancelled']);
    expect(() => bandReplyContext(next, 'npc:guest-pending')).toThrow();
    expect(() => applyBandReply(next, 'npc:guest-pending', '好。', 'accept')).toThrow();
    expect(() => reduceState(desk(next, true), book('future-show', futureStart))).toThrow(/退出/);
    syncPerformanceCalendars(next, 'future-show');
    expect(next.protagonists!.devices.soyo.calendar.map(e => e.id)).not.toContain('live:future-show');
    const free = reduceState(next, { type: 'phone_app', requestId: 'free-evening', owner: 'soyo', command: {
      type: 'calendar_save', id: 'personal-evening', title: '自己的安排', locationId: 'home', start: futureStart, duration: 30,
    } });
    expect(free.protagonists!.devices.soyo.calendar.some(e => e.id === 'personal-evening')).toBe(true);
    expect(parseState(JSON.parse(JSON.stringify(next))).livehouse).toEqual(next.livehouse);
  });

  it('keeps leader authority and character dossiers consistent with the roster', () => {
    const state = enableProtagonists(createInitialState());
    const mygo = state.livehouse!.bands.find(b => b.established === 'mygo')!;
    const mujica = state.livehouse!.bands.find(b => b.established === 'ave-mujica')!;
    expect(() => reduceState(state, { type: 'society', requestId: 'not-leader', command: {
      type: 'appoint_advisor', bandId: mygo.id, seat: 'music', personId: 'protagonist-soyo',
    } })).toThrow(/自己乐队/);
    const sakiko = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    const managed = reduceState(sakiko, { type: 'society', requestId: 'leader-appoints', command: {
      type: 'appoint_advisor', bandId: mujica.id, seat: 'music', personId: 'bang-mutsumi',
    } });
    expect(managed.protagonists!.society!.advisors[0].personId).toBe('bang-mutsumi');
    expect(identityStrategyDossier('soyo', 'protagonist-soyo', state).organizations[0].detail).toBe('贝斯 · Leader：千早爱音');
    expect(identityStrategyDossier('bang-anon', 'bang-anon', state).organizations[0].detail).toBe('吉他 · Leader');
  });

  it('does not grant the established-roster exemption to unrelated members', () => {
    const bad = createInitialState();
    const band = bad.livehouse!.bands.find(b => b.established === 'mygo')!;
    bad.livehouse!.profiles.push({ personId: 'outsider', source: 'random', skills: { vocal: 50, guitar: 50, bass: 50, drums: 50, keyboard: 50 } });
    band.members.push({ personId: 'outsider', name: '路人', role: 'guitar', joinedAt: band.createdAt });
    expect(() => parseState(bad)).toThrow(/邀请/);
  });

  it('retains a full old registry while adding the two established bands', () => {
    const old = legacyMygo();
    const template = old.livehouse!.bands[0];
    old.livehouse!.bands = Array.from({ length: 50 }, (_, n) => ({ ...structuredClone(template), id: `custom-${n}`, name: `自建乐队 ${n}` }));
    old.livehouse!.profiles = [old.livehouse!.profiles.find(p => p.personId === 'protagonist-soyo')!,
      ...Array.from({ length: 299 }, (_, n) => ({ personId: `guest-${n}`, source: 'random' as const, skills: { vocal: 50, guitar: 50, bass: 50, drums: 50, keyboard: 50 } }))];
    const migrated = parseState(old);
    expect(migrated.livehouse!.bands).toHaveLength(52);
    expect(migrated.livehouse!.profiles).toHaveLength(309);
    expect(migrated.livehouse!.bands.slice(0, 50)).toEqual(old.livehouse!.bands);
    expect(parseState(migrated).livehouse).toEqual(migrated.livehouse);
  });

  it('applies the same departure when authorized narrative progress completes the route', () => {
    const before = readyToFinish();
    before.protagonists!.strategy!.people.soyo.includeInPrompt = true;
    const raw = '<story>素世作出了自己的决定。</story><phone_messages>[]</phone_messages>'
      + '<strategy_updates>[{"owner":"soyo","focusId":"soyo_rebuild_crychic","note":"素世决定离开 MyGO，尝试延续 CRYCHIC","progressDelta":1}]</strategy_updates>';
    const response = parseGeneratedStory(raw, before);
    const ids = { userId: 'route-completion-u', assistantId: 'route-completion-a' };
    const after = commitStoryTurn(before, '决定延续 CRYCHIC', response, ids);
    expect(livehousePhoneView(after, 'soyo').bands).toEqual([]);
    expect(livehousePhoneView(after, 'soyo').formerBands).toHaveLength(1);
    expect(commitStoryTurn(after, '决定延续 CRYCHIC', response, ids).livehouse).toEqual(after.livehouse);
  });
});
