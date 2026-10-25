import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState, commitStoryTurn } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { getSceneArea, getScenePeople, sceneLocationId } from '../src/runtime/scene-context';
import { applyNpcPhoneReply, npcPhoneReplyContext, npcPhoneView, validateContactProposals } from '../src/runtime/npc-phone';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import { parseNpcPhoneReply } from '../src/runtime/phone-reply';
import { residentCast, residentPresence, watanareResidentCast, WATANARE_QUINTET_IDS } from '../src/runtime/npc-cast';
import { createWorldPhoneApi } from '../src/frontend/world-phone';
import type { GeneratedStory, WorldState } from '../src/frontend/types';

const reload = (s: WorldState) => parseState(JSON.parse(JSON.stringify(s)));
import { meeting, proposal, accept, sendNpc, groupMember, contactQuote } from './npc-fixture';

describe('encounter-backed NPC contact applications', () => {
  it('keeps all old data and adds no relationship, cast contact or group during migration', () => {
    const old = createInitialState(), enabled = enableProtagonists(old), parsed = reload(enabled);
    expect(parsed.contacts).toEqual(old.contacts); expect(parsed.phone).toEqual(old.phone);
    expect(parsed.protagonists?.npcPhone).toBeUndefined();
    expect(npcPhoneView(parsed, 'soyo').requests).toEqual([]);
    expect(npcPhoneView(parsed, 'soyo').groups).toEqual([]);
  });

  it('requires actual proximity, conversation and explicit acceptance; keeps stable identity and affinity', () => {
    const met = meeting();
    expect(met.contacts.some(c => c.id === 'majo-emma')).toBe(false);
    expect(met.protagonists!.npcPhone!.meetings).toHaveLength(1);
    const pending = proposal(met).state;
    expect(pending.contacts.some(c => c.id === 'majo-emma')).toBe(false);
    expect(pending.protagonists!.npcPhone!.requests[0]).toMatchObject({ status: 'pending', npcId: 'majo-emma' });
    const saved = accept(pending), contact = saved.contacts.find(c => c.id === 'majo-emma')!;
    expect(contact).toMatchObject({ id: 'majo-emma', sourcePersonId: 'majo-emma', affinity: 0, name: '樱羽艾玛' });
    expect(saved.protagonists!.npcPhone!.relationships).toHaveLength(1);
    expect(saved.clock).toEqual(met.clock);
    expect(saved.player).toEqual(met.player);
    expect(reload(saved)).toEqual(saved);
    expect(accept(pending)).toEqual(saved);
    const edited = reduceState(saved, { type: 'save_contact', id: contact.id, name: '艾玛同学',
      portraitId: contact.portraitId, summary: contact.summary, sourcePersonId: contact.sourcePersonId });
    expect(edited.contacts.find(c => c.id === contact.id)?.affinity).toBe(0);
    expect(npcPhoneView(edited, 'soyo').contacts.find(c => c.id === 'majo-emma')?.name).toBe('艾玛同学');
  });

  it('rejects fabricated relations, names as IDs, missing or mismatched quotes, and another person’s application', () => {
    const met = meeting(), p = proposal(met);
    for (const request of [
      { ...p.result.contactRequests![0], npcId: '樱羽艾玛' },
      { ...p.result.contactRequests![0], npcId: 'majo-hiro' },
      { ...p.result.contactRequests![0], quote: '伪造的联系请求' },
      { ...p.result.contactRequests![0], evidenceId: 'not-a-turn' },
      { ...p.result.contactRequests![0], affinity: 100 },
    ]) expect(() => commitStoryTurn(met, p.input, { ...p.result, contactRequests: [request] }, p.ids)).toThrow();
    const noMeeting = enableProtagonists(createInitialState());
    expect(() => commitStoryTurn(noMeeting, p.input, p.result, p.ids)).toThrow(/相遇|对白/);
    expect(() => commitStoryTurn(met, p.input, { ...p.result, text: '她曾经说过：' + contactQuote }, p.ids)).toThrow(/对白/);
    expect(() => sendNpc(met)).toThrow(/先认识/);
    expect(met.protagonists!.npcPhone!.requests).toEqual([]);
  });

  it('supports ordinary seeded pedestrians without a playable identity', () => {
    const npcId = getScenePeople({ x: 0, z: 18, yaw: 0, areaId: 'promenade', seed: 'npc-contact-tests', encounterId: null })[0]!.id;
    const saved = accept(proposal(meeting(npcId)).state);
    const sent = sendNpc(saved, 'ped-sms', npcId);
    const context = npcPhoneReplyContext(sent, 'npc:ped-sms');
    expect(context.actor.id).toBe(npcId);
    expect(context.actor.worldbook).toBeTruthy();
    expect(reload(applyNpcPhoneReply(sent, 'npc:ped-sms', '你好。'))).toBeTruthy();
  });

  it('does not record acceptance on refusal or publish to another protagonist', () => {
    const pending = proposal().state, q = pending.protagonists!.npcPhone!.requests[0]!;
    const declined = reduceState(pending, { type: 'phone_app', owner: 'soyo', requestId: 'no-thanks',
      command: { type: 'resolve_contact_request', id: q.id, accept: false } });
    expect(declined.contacts.some(c => c.id === q.npcId)).toBe(false);
    expect(declined.protagonists!.npcPhone!.requests[0]!.status).toBe('declined');
    const switched = reduceState(pending, { type: 'switch_protagonist', target: 'sakiko' });
    expect(npcPhoneView(switched, 'sakiko').requests).toEqual([]);
    expect(() => accept(switched)).toThrow();
    expect(() => reduceState(switched, { type: 'phone_app', owner: 'sakiko', requestId: 'stolen',
      command: { type: 'resolve_contact_request', id: q.id, accept: true } })).toThrow();
  });

  it('does not merge unrelated people by name or publish a duplicate phone contact', () => {
    const pending = proposal().state;
    pending.contacts[0]!.name = '樱羽艾玛';
    const before = structuredClone(pending);
    expect(() => accept(pending)).toThrow(/同名联系人/);
    expect(pending).toEqual(before);
    expect(pending.protagonists!.npcPhone!.requests[0]!.status).toBe('pending');
  });

  it('replays exactly, refuses altered requests, and remains idempotent after leaving the scene', () => {
    const p = proposal();
    const replay = commitStoryTurn(p.state, p.input, p.result, p.ids);
    expect(replay.protagonists!.npcPhone!.requests).toEqual(p.state.protagonists!.npcPhone!.requests);
    expect(replay.protagonists!.npcPhone!.evidence).toEqual(p.state.protagonists!.npcPhone!.evidence);
    expect(() => commitStoryTurn(p.state, p.input, { ...p.result, contactRequests: [] }, p.ids)).toThrow(/重复/);
    const left = reload(p.state); left.scene = null;
    expect(commitStoryTurn(left, p.input, p.result, p.ids).protagonists!.npcPhone!.requests).toEqual(p.state.protagonists!.npcPhone!.requests);
  });

  it('parses both tagged and JSON proposals through the same strict protocol', () => {
    const p = proposal();
    const parsed = parseGeneratedStory('<story>' + p.result.text + '</story><phone_messages>[]</phone_messages><contact_requests>' +
      JSON.stringify(p.result.contactRequests) + '</contact_requests>', meeting());
    expect(parsed.contactRequests).toEqual(p.result.contactRequests);
    expect(parseGeneratedStory(JSON.stringify({ story: p.result.text, phone_messages: [], contact_requests: p.result.contactRequests }), meeting())).toEqual(parsed);
    expect(() => validateContactProposals([{ ...p.result.contactRequests![0], accepted: true }])).toThrow();
  });
});

describe('real NPC SMS routing with private context', () => {
  it('saves a canonical one-shot response without changing time, location, money, or player control', () => {
    const sent = sendNpc(accept(proposal().state)), before = structuredClone(sent);
    const answered = applyNpcPhoneReply(sent, 'npc:sms-1', '可以呀，晚一点见。');
    expect(answered.protagonists!.npcPhone!.messages).toHaveLength(2);
    expect(answered.phone.at(-1)).toMatchObject({ id: 'npc:sms-1:reply', npcId: 'majo-emma', read: false });
    expect(answered.clock).toEqual(before.clock); expect(answered.player).toEqual(before.player);
    expect(answered.locationId).toBe(before.locationId); expect(activeProtagonist(answered)).toBe('soyo');
    expect(answered.protagonists!.accounts).toEqual(before.protagonists!.accounts);
    expect(reload(answered)).toEqual(answered);
    expect(applyNpcPhoneReply(answered, 'npc:sms-1', '可以呀，晚一点见。')).toEqual(answered);
    expect(() => applyNpcPhoneReply(answered, 'npc:sms-1', '变了')).toThrow(/重复/);
    expect(() => applyNpcPhoneReply(answered, 'npc:sms-1:reply', '递归回复')).toThrow();
  });

  it('includes only this NPC’s actual spoken evidence, profile, own thread and schedule', () => {
    const p = proposal(); let s = accept(p.state);
    s.story.push({ id: 'secret-story', role: 'assistant', text: 'PLAYER_STORY_SECRET' });
    s.journal.push({ id: 'secret-diary', text: 'PLAYER_DIARY_SECRET', at: '第 1 天 17:20' });
    personState(s, 'sakiko').story.push({ id: 'sakiko-secret', role: 'assistant', text: 'SAKIKO_PRIVATE_SECRET' });
    s = sendNpc(s);
    const context = npcPhoneReplyContext(s, 'npc:sms-1'), serialized = JSON.stringify(context);
    expect(context.actor.id).toBe('majo-emma');
    expect(context.actor.worldbook).toContain('怕被讨厌');
    expect(context.knownDialogue).toEqual(expect.arrayContaining([expect.objectContaining({ speaker: 'npc', text: contactQuote })]));
    expect(context.location.activity).toBe('外出与休闲');
    for (const secret of ['PLAYER_STORY_SECRET', 'PLAYER_DIARY_SECRET', 'SAKIKO_PRIVATE_SECRET']) expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('weeklyMemory');
    const other = reduceState(s, { type: 'switch_protagonist', target: 'sakiko' });
    expect(() => npcPhoneReplyContext(other, 'npc:sms-1')).toThrow();
    expect(() => applyNpcPhoneReply(other, 'npc:sms-1', '迟到')).toThrow();
  });

  it('keeps prior story messages from this contact while excluding other inboxes', () => {
    let s = accept(proposal().state);
    s.phone.push({id:'ema-previous',npcId:'majo-emma',text:'我们刚才说好明天联系。',read:false,at:'第 1 天 17:20'});
    s.phone.push({id:'another-person',npcId:'protagonist-sakiko',text:'UNRELATED_DM_SECRET',read:false,at:'第 1 天 17:20'});
    s = sendNpc(s);
    const context = npcPhoneReplyContext(s,'npc:sms-1');
    expect(context.priorReceivedMessages).toContainEqual(expect.objectContaining({text:'我们刚才说好明天联系。'}));
    expect(JSON.stringify(context)).not.toContain('UNRELATED_DM_SECRET');
  });

  it('accepts explicit silence, refuses extra actions and never keeps an agent running', () => {
    expect(parseNpcPhoneReply('<phone_reply>{"messageId":"npc:sms-1","text":null}</phone_reply>', 'npc:sms-1')).toBeNull();
    expect(() => parseNpcPhoneReply('<phone_reply>{"messageId":"npc:sms-1","text":null,"actions":[]}</phone_reply>', 'npc:sms-1')).toThrow();
    const sent = sendNpc(accept(proposal().state)), silent = applyNpcPhoneReply(sent, 'npc:sms-1', null);
    expect(silent.phone).toEqual(sent.phone);
    expect(silent.protagonists!.npcPhone!.messages).toHaveLength(1);
    expect(silent.protagonists!.npcPhone!.messages[0]!.status).toBe('silent');
    expect(applyNpcPhoneReply(silent, 'npc:sms-1', null)).toEqual(silent);
  });

  it('enforces request/revision/session binding and starts generation only after a successful save', async () => {
    let state = accept(proposal().state), callbacks = 0;
    const api = createWorldPhoneApi({ session: 'world-A', current: () => true, busy: () => false, state: () => state,
      commit: action => { state = reduceState(state, action); return state; }, onOutgoingMessage: () => { callbacks++; } });
    const view = api.read();
    expect(callbacks).toBe(0);
    const request = { binding: view.binding, revision: view.revision, requestId: 'api-sms', owner: 'soyo' as const,
      command: { type: 'send_npc_message' as const, npcId: 'majo-emma', text: '你好。' } };
    await api.act(request); expect(callbacks).toBe(1);
    await api.act(request); expect(callbacks).toBe(1);
    expect(state.protagonists!.npcPhone!.messages).toHaveLength(1);
    await expect(api.act({ ...request, requestId: 'stale' })).rejects.toThrow(/更新/);
    await expect(api.act({ ...request, binding: 'wrong' })).rejects.toThrow(/切换/);
    const failed = createWorldPhoneApi({ session: 'fail', current: () => true, busy: () => false, state: () => state,
      commit: () => { throw Error('save failed'); }, onOutgoingMessage: () => { callbacks++; } });
    const current = failed.read(), count = callbacks;
    await expect(failed.act({ ...request, binding: current.binding, revision: current.revision, requestId: 'failed' })).rejects.toThrow('save failed');
    expect(callbacks).toBe(count);
  });
});

describe('the resident fourteen-person group', () => {
  it('has fourteen stable worldbook identities and no third playable-state refactor', () => {
    expect(residentCast).toHaveLength(14); expect(new Set(residentCast.map(p => p.id)).size).toBe(14);
    expect(residentCast.some(p => p.id === 'majo-yuki')).toBe(true);
    expect(residentCast.some(p => p.id === 'majo-emma')).toBe(true);
    expect(residentPresence('majo-koko', { hour: 21, minute: 0 })?.available).toBe(false);
  });

  it('requires an actual friend’s invitation and acceptance, without auto-adding all members as friends', () => {
    const met = meeting();
    expect(() => proposal(met, 'group')).toThrow(/联系人/);
    const joined = groupMember();
    expect(joined.contacts.filter(c => c.id.startsWith('majo-'))).toHaveLength(1);
    expect(npcPhoneView(joined, 'soyo').groups[0]).toMatchObject({ id: 'majo-circle', memberCount: 15 });
    const request = { type: 'phone_app' as const, owner: 'soyo' as const, requestId: 'group-sms',
      command: { type: 'send_group_message' as const, groupId: 'majo-circle', text: '大家周末有空吗？' } };
    const sent = reduceState(joined, request), selected = sent.protagonists!.npcPhone!.messages[0]!.responderId!;
    expect(residentCast.map(p => p.id)).toContain(selected);
    expect(reduceState(sent, request).protagonists!.npcPhone!.messages).toEqual(sent.protagonists!.npcPhone!.messages);
    expect(npcPhoneReplyContext(sent, 'npc:group-sms').actor.id).toBe(selected);
    let answered = sent;
    const plan=sent.protagonists!.npcPhone!.messages[0]!.responsePlan!;
    for(const actor of plan) answered=applyNpcPhoneReply(answered,'npc:group-sms','我晚点看看安排。',actor.id);
    expect(answered.protagonists!.npcPhone!.messages.filter(m => m.replyTo === 'npc:group-sms')).toHaveLength(plan.length);
    expect(answered.phone).toEqual(sent.phone);
    expect(reload(answered)).toEqual(answered);
  });

  it('does not wake sleeping members or reveal unjoined groups to the other protagonist', () => {
    let s = groupMember();
    // Margo remains at work until 02:00; the entire group rests only after closing.
    for (const minutes of [120, 120, 120, 120, 40]) s = reduceState(s, { type: 'wait', minutes });
    const sent = reduceState(s, { type: 'phone_app', owner: 'soyo', requestId: 'night-sms',
      command: { type: 'send_group_message', groupId: 'majo-circle', text: '睡了吗？' } });
    expect(sent.protagonists!.npcPhone!.messages[0]).toMatchObject({ status: 'silent', responderId: null });
    const switched = reduceState(sent, { type: 'switch_protagonist', target: 'sakiko' });
    expect(npcPhoneView(switched, 'sakiko').messages).toEqual([]);
    expect(npcPhoneView(switched, 'sakiko').groups).toEqual([]);
  });

  it('allows the cafe owner to answer late group messages while open and stops at closing', () => {
    let s = groupMember();
    for (let index = 0; index < 3; index++) s = reduceState(s, { type: 'wait', minutes: 120 });
    expect(s.clock).toMatchObject({ hour: 23, minute: 20 });
    const night = reduceState(s, { type: 'phone_app', owner: 'soyo', requestId: 'cafe-night',
      command: { type: 'send_group_message', groupId: 'majo-circle', text: '还有人在忙吗？' } });
    expect(night.protagonists!.npcPhone!.messages[0]).toMatchObject({ status: 'pending', responderId: 'majo-margo',
      responsePlan: [{ id: 'majo-margo', status: 'pending' }] });
    for (const minutes of [120, 40]) s = reduceState(s, { type: 'wait', minutes });
    expect(s.clock).toMatchObject({ hour: 2, minute: 0 });
    const closed = reduceState(s, { type: 'phone_app', owner: 'soyo', requestId: 'cafe-closed',
      command: { type: 'send_group_message', groupId: 'majo-circle', text: '明天再聊吧。' } });
    expect(closed.protagonists!.npcPhone!.messages[0]).toMatchObject({ status: 'silent', responderId: null });
  });

  it('shares later group posts between joined protagonists, without revealing earlier posts from the same minute', () => {
    let s = groupMember();
    s = reduceState(s,{type:'phone_app',owner:'soyo',requestId:'before-join',
      command:{type:'send_group_message',groupId:'majo-circle',text:'EARLIER_GROUP_POST'}});
    for(const actor of s.protagonists!.npcPhone!.messages[0]!.responsePlan!) s = applyNpcPhoneReply(s,'npc:before-join','旧群消息。',actor.id);
    s = reduceState(s,{type:'switch_protagonist',target:'sakiko'});
    s = groupMember(accept(proposal(meeting('majo-emma',s),'contact','sakiko-meet').state,'sakiko-accept'),'sakiko-invite','sakiko-join');
    const view = npcPhoneView(s,'sakiko');
    expect(view.groups[0]!.memberCount).toBe(16);
    expect(view.messages).toEqual([]);
    s = reduceState(s,{type:'switch_protagonist',target:'soyo'});
    s = reduceState(s,{type:'phone_app',owner:'soyo',requestId:'after-join',
      command:{type:'send_group_message',groupId:'majo-circle',text:'LATER_GROUP_POST'}});
    const plan=s.protagonists!.npcPhone!.messages.find(m=>m.id==='npc:after-join')!.responsePlan!;
    for(const actor of plan) s = applyNpcPhoneReply(s,'npc:after-join','新的群消息。',actor.id);
    expect(npcPhoneView(s,'sakiko').messages).toHaveLength(1+plan.length);
    expect(npcPhoneView(s,'sakiko').messages[0]).toMatchObject({speakerName:'长崎素世',direction:'incoming'});
    expect(JSON.stringify(npcPhoneView(s,'sakiko'))).not.toContain('EARLIER_GROUP_POST');
    expect(reload(s)).toEqual(s);
  });

  it('draws one to three distinct available members and persists the entire turn', () => {
    const counts=new Set<number>(), joined=groupMember();
    for(let draw=0;draw<30;draw++) {
      const sent=reduceState(joined,{type:'phone_app',owner:'soyo',requestId:'draw-'+draw,
        command:{type:'send_group_message',groupId:'majo-circle',text:'聊聊？'}});
      const plan=sent.protagonists!.npcPhone!.messages[0]!.responsePlan!;
      counts.add(plan.length);
      expect(new Set(plan.map(p=>p.id)).size).toBe(plan.length);
      expect(plan.every(p=>residentPresence(p.id,sent.clock)?.available)).toBe(true);
      expect(reload(sent)).toEqual(sent);
    }
    expect([...counts].sort()).toEqual([1,2,3]);
  });

  it('saves each member decision, resumes partial turns and exposes prior group replies to the next member only', () => {
    let s=groupMember(),draw=0;
    do {
      s=reduceState(groupMember(),{type:'phone_app',owner:'soyo',requestId:'multi-'+draw++,
        command:{type:'send_group_message',groupId:'majo-circle',text:'大家有什么想法？'}});
    } while(s.protagonists!.npcPhone!.messages[0]!.responsePlan!.length!==3);
    const source=s.protagonists!.npcPhone!.messages[0]!, [first,second,third]=source.responsePlan!;
    expect(()=>applyNpcPhoneReply(s,source.id,'抢先。',second!.id)).toThrow(/顺序/);
    expect(()=>applyNpcPhoneReply(s,source.id,'冒名。','majo-unknown')).toThrow(/计划/);
    s=reload(applyNpcPhoneReply(s,source.id,'FIRST_GROUP_REPLY',first!.id));
    expect(applyNpcPhoneReply(s,source.id,'FIRST_GROUP_REPLY',first!.id)).toEqual(s);
    expect(()=>applyNpcPhoneReply(s,source.id,'变了。',first!.id)).toThrow(/重复/);
    const next=npcPhoneReplyContext(s,source.id);
    expect(next.actor.id).toBe(second!.id);
    expect(next.messages.some(m=>m.text==='FIRST_GROUP_REPLY')).toBe(true);
    expect(s.protagonists!.npcPhone!.messages[0]!.status).toBe('pending');
    s=reload(applyNpcPhoneReply(s,source.id,null,second!.id));
    expect(applyNpcPhoneReply(s,source.id,null,second!.id)).toEqual(s);
    s=reload(applyNpcPhoneReply(s,source.id,'THIRD_GROUP_REPLY',third!.id));
    expect(s.protagonists!.npcPhone!.messages[0]).toMatchObject({status:'answered',responderId:null});
    expect(s.protagonists!.npcPhone!.messages.filter(m=>m.replyTo===source.id)).toHaveLength(2);
    expect(()=>npcPhoneReplyContext(s,source.id)).toThrow(/已经/);
    expect(s.phone).toEqual(groupMember().phone);
  });

  it('gives renako built-in access to watanare-quintet and allows Quintet members to invite other protagonists', () => {
    const base = enableProtagonists(createInitialState());
    const renakoView = npcPhoneView(base, 'renako');
    expect(renakoView.groups).toContainEqual(expect.objectContaining({
      id: 'watanare-quintet',
      name: '芦谷五人组',
      memberCount: 5,
    }));
    const switchedToRenako = reduceState(base, { type: 'switch_protagonist', target: 'renako' });
    const sent = reduceState(switchedToRenako, {
      type: 'phone_app',
      owner: 'renako',
      requestId: 'quintet-hello',
      command: { type: 'send_group_message', groupId: 'watanare-quintet', text: '大家今天放学后有空吗？' },
    });
    const plan = sent.protagonists!.npcPhone!.messages[0]!.responsePlan!;
    expect(plan.length).toBeGreaterThanOrEqual(1);
    expect(plan.every(p => WATANARE_QUINTET_IDS.includes(p.id as (typeof WATANARE_QUINTET_IDS)[number]) && p.id !== 'watanare-renako')).toBe(true);
    expect(watanareResidentCast).toHaveLength(20);

    const metMai = meeting('watanare-mai', base);
    const friendMai = accept(proposal(metMai, 'contact', 'mai-contact').state, 'mai-accept');
    const invited = proposal(friendMai, 'group', 'mai-group').state;
    expect(invited.protagonists!.npcPhone!.requests.at(-1)).toMatchObject({
      kind: 'group',
      npcId: 'watanare-mai',
      status: 'pending',
    });
    expect(npcPhoneView(invited, 'soyo').requests.at(-1)).toMatchObject({
      kind: 'group',
      npcId: 'watanare-mai',
      name: '王冢真唯',
    });
    const joined = accept(invited, 'mai-join-group');
    expect(npcPhoneView(joined, 'soyo').groups).toContainEqual(expect.objectContaining({
      id: 'watanare-quintet',
      name: '芦谷五人组',
      memberCount: 6,
    }));
  });
});
