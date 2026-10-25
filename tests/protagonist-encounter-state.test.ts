import { describe, expect, it } from 'vitest';
import type { GeneratedStory, WorldState } from '../src/frontend/types';
import type { ProtagonistId } from '../src/runtime/dual-protagonists';
import { commitStoryTurn, createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { activeProtagonist, enableProtagonists, gameMinute, personState } from '../src/runtime/protagonist-world';
import { narrativeContext } from '../src/runtime/protagonist-narrative';
import { getScenePeople } from '../src/runtime/scene-context';
import { contactProposalContext } from '../src/runtime/npc-phone';

const personIds: Record<ProtagonistId, string> = {
  soyo: 'protagonist-soyo', sakiko: 'protagonist-sakiko', emma: 'majo-emma', renako: 'watanare-renako',
};

/** Use the same saved travel/switch actions as the location panel. */
function meetAt(locationId = 'sports', first: ProtagonistId = 'soyo', second: ProtagonistId = 'sakiko') {
  let state = enableProtagonists(createInitialState());
  state = reduceState(state, { type: 'switch_protagonist', target: first });
  state = reduceState(state, { type: 'novel_travel', locationId });
  state = reduceState(state, { type: 'switch_protagonist', target: second });
  state = reduceState(state, { type: 'novel_travel', locationId });
  expect(state.locationId).toBe(locationId);
  expect(personState(state, first).locationId).toBe(locationId);
  return state;
}

const spokenReply: GeneratedStory = {
  text: '|长崎素世|neutral|一起走一会儿吧。|\n|丰川祥子|happy|好，就沿跑道走吧。|',
  phoneMessages: [],
};
const turnIds = { userId: 'presence-user', assistantId: 'presence-reply' };

describe('saved protagonist encounters', () => {
  it.each<ProtagonistId>(['soyo', 'sakiko', 'emma'])('can meet %s at the sports ground and reload the encounter', target => {
    const observer: ProtagonistId = target === 'sakiko' ? 'soyo' : 'sakiko';
    const before = meetAt('sports', target, observer);
    const original = structuredClone(before);
    const state = reduceState(before, { type: 'encounter', personId: personIds[target] });

    expect(state.scene?.encounterId).toBe(personIds[target]);
    expect(parseState(JSON.parse(JSON.stringify(state)))).toEqual(state);
    expect(state.protagonists?.npcPhone?.meetings.some(row => row.npcId === personIds[target]) ?? false).toBe(false);
    expect(before).toEqual(original);
  });

  it('persists both participants and their spoken shared memory without duplicating a retried turn', () => {
    const before = reduceState(meetAt(), { type: 'encounter', personId: personIds.soyo });
    const state = commitStoryTurn(before, '我向素世打招呼。', spokenReply, turnIds);
    const reply = state.story.find(row => row.id === turnIds.assistantId)!;

    expect(reply.participantIds).toContain(personIds.soyo);
    expect(state.scene?.encounterId).toBe(personIds.soyo);
    expect(personState(state, 'soyo').journal.some(row => row.id === 'shared:presence-reply')).toBe(true);
    expect(state.journal.some(row => row.id === 'shared:presence-reply')).toBe(true);
    expect(narrativeContext(state).counterpartsInScene.some(row => row.id === 'soyo')).toBe(true);
    expect(parseState(state)).toEqual(state);
    expect(commitStoryTurn(state, '我向素世打招呼。', spokenReply, turnIds)).toEqual(state);
  });

  it('keeps an encounter through quoting a trip and committing an ordinary wait', () => {
    const before = reduceState(meetAt(), { type: 'encounter', personId: personIds.soyo });
    const snapshot = structuredClone(before);
    expect(getNovelTravelQuote(before, 'library').blockedReason).toBeNull();
    expect(before).toEqual(snapshot);
    const state = reduceState(before, { type: 'wait', minutes: 15 });
    expect(state.scene?.encounterId).toBe(personIds.soyo);
    expect(parseState(state)).toEqual(state);
  });

  it('can commit a model action and retain the co-located encounter', () => {
    const before = reduceState(meetAt(), { type: 'encounter', personId: personIds.soyo });
    const reply: GeneratedStory = { ...spokenReply, worldActions: [{ type: 'rest', kind: 'wait', minutes: 15 }] };
    const state = commitStoryTurn(before, '我和素世等了十五分钟。', reply, turnIds);
    expect(state.scene?.encounterId).toBe(personIds.soyo);
    expect(state.story.find(row => row.id === turnIds.assistantId)?.participantIds).toContain(personIds.soyo);
    expect(parseState(state)).toEqual(state);
  });

  it('supports the same encounter inside an ordinary room', () => {
    const state = reduceState(meetAt('study-room'), { type: 'encounter', personId: personIds.soyo });
    expect(state.interior?.roomId).toBe('study-room');
    expect(state.scene?.encounterId).toBe(personIds.soyo);
    expect(parseState(state)).toEqual(state);
    const waited = reduceState(state, { type: 'wait', minutes: 15 });
    expect(waited.scene?.encounterId).toBe(personIds.soyo);
  });

  it.each(['library', 'sports'])('can quote and complete leaving an indoor encounter for %s', destination => {
    const before = reduceState(meetAt('study-room'), { type: 'encounter', personId: personIds.soyo });
    const original = structuredClone(before);
    expect(getNovelTravelQuote(before, destination).blockedReason).toBeNull();
    expect(before).toEqual(original);
    const state = reduceState(before, { type: 'novel_travel', locationId: destination });
    expect(state.locationId).toBe(destination);
    expect(state.interior).toBeNull();
    expect(state.scene?.encounterId).toBeNull();
    expect(personState(state, 'soyo').locationId).toBe('study-room');
    expect(parseState(state)).toEqual(state);
  });

  it('can complete a scheduled model action while talking to a protagonist', () => {
    const before = reduceState(meetAt(), { type: 'encounter', personId: personIds.soyo });
    before.schedule.push({ id: 'meet-at-sports', title: '运动场见面', locationId: 'sports', time: '00:00', done: false });
    const state = commitStoryTurn(before, '我完成了见面的约定。', {
      ...spokenReply, worldActions: [{ type: 'complete_schedule', id: 'meet-at-sports' }],
    }, turnIds);
    expect(state.schedule.find(row => row.id === 'meet-at-sports')?.done).toBe(true);
    expect(state.scene?.encounterId).toBe(personIds.soyo);
    expect(parseState(state)).toEqual(state);
  });

  it('retains another viewpoint encounter on switching and clears it when the target leaves', () => {
    let state = reduceState(meetAt(), { type: 'encounter', personId: personIds.soyo });
    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    expect(personState(state, 'sakiko').scene?.encounterId).toBe(personIds.soyo);
    state = reduceState(state, { type: 'encounter', personId: personIds.sakiko });
    expect(parseState(state)).toEqual(state);
    state = reduceState(state, { type: 'novel_travel', locationId: 'library' });
    expect(state.scene?.encounterId).toBeNull();
    expect(personState(state, 'sakiko').scene?.encounterId).toBeNull();
    expect(parseState(state)).toEqual(state);
  });

  it('rejects a remote protagonist instead of manufacturing presence', () => {
    const state = enableProtagonists(createInitialState());
    expect(() => reduceState(state, { type: 'encounter', personId: personIds.sakiko })).toThrow();
  });

  it('checks physical distance within the same location and clears a departed walking encounter', () => {
    const before = reduceState(meetAt(), { type: 'encounter', personId: personIds.soyo });
    const position = before.scene!;
    const walked = reduceState(before, { type: 'walk', x: position.x, z: position.z + 8, yaw: position.yaw, seed: position.seed });
    expect(walked.locationId).toBe('sports');
    expect(walked.scene?.encounterId).toBeNull();
    expect(() => reduceState(walked, { type: 'encounter', personId: personIds.soyo })).toThrow();
    const forged = structuredClone(walked);
    forged.scene!.encounterId = personIds.soyo;
    expect(() => parseState(forged)).toThrow(/encounter|相遇|附近/);
  });

  it.each<ProtagonistId>(['soyo', 'sakiko', 'emma'])('validates forged %s encounter references even in an inactive personal state', observer => {
    const state = meetAt();
    const personal = personState(state, observer);
    const remoteTarget: ProtagonistId = observer === 'emma' ? 'soyo' : 'emma';
    personal.scene!.encounterId = personIds[remoteTarget];
    expect(() => parseState(state)).toThrow(/encounter|相遇|附近/);
  });

  it('rejects self-encounters and an unregistered protagonist identity', () => {
    const state = meetAt();
    expect(() => reduceState(state, { type: 'encounter', personId: personIds[activeProtagonist(state)] })).toThrow();
    const forged = structuredClone(state);
    forged.scene!.encounterId = 'protagonist-unknown';
    expect(() => parseState(forged)).toThrow();
  });

  it.each<ProtagonistId>(['sakiko', 'emma'])('does not record a remote %s speaking name as an in-person participant', remote => {
    const before = enableProtagonists(createInitialState());
    const speaker = remote === 'sakiko' ? '丰川祥子' : '樱羽艾玛';
    const state = commitStoryTurn(before, '我独自留在校园南门。', {
      text: `|${speaker}|neutral|这里是引用的一句话。|`, phoneMessages: [],
    }, turnIds);
    const participants = state.story.find(row => row.id === turnIds.assistantId)?.participantIds ?? [];
    expect(participants).not.toContain(personIds[remote]);
    expect(participants).not.toContain(`protagonist-${remote}`);
  });

  it('rejects Emma encountering herself even on a valid historical NPC anchor', () => {
    let state = reduceState(enableProtagonists(createInitialState()), { type: 'switch_protagonist', target: 'emma' });
    const oldScene = { x: 0, z: 18, yaw: 0, areaId: 'promenade', seed: 'emma-self', encounterId: null };
    const emma = getScenePeople(oldScene, [], state.clock).find(person => person.id === personIds.emma)!;
    state = reduceState(state, { type: 'walk', x: emma.x, z: emma.z, yaw: 0, seed: oldScene.seed });
    state.scene!.encounterId = personIds.emma;
    expect(() => parseState(state)).toThrow(/encounter|相遇|自己|主角/);
  });

  it('keeps a selected seven-metre conversation in the foreground after switching to its other participant', () => {
    const meeting = meetAt();
    personState(meeting, 'soyo').scene!.x = meeting.scene!.x - 7;
    const talking = reduceState(meeting, { type: 'encounter', personId: personIds.soyo });
    const switched = reduceState(talking, { type: 'switch_protagonist', target: 'soyo' });
    expect(personState(switched, 'sakiko').scene?.encounterId).toBe(personIds.soyo);
    const priorEvents = structuredClone(switched.protagonists!.backgroundLife!.people.sakiko.events);
    const state = reduceState(switched, { type: 'wait', minutes: 60 });
    expect(state.protagonists!.backgroundLife!.people.sakiko.events).toEqual(priorEvents);
    expect(state.protagonists!.backgroundLife!.people.sakiko.pending).toBeNull();
  });

  it('does not turn protagonist dialogue into an NPC contact request', () => {
    const state = reduceState(meetAt(), { type: 'encounter', personId: personIds.soyo });
    const original = structuredClone(state);
    const reply: GeneratedStory = {
      text: '|长崎素世|neutral|我们加个好友吧。|', phoneMessages: [],
      contactRequests: [{ kind: 'contact', npcId: personIds.soyo, evidenceId: 'current', quote: '我们加个好友吧。' }],
    };
    expect(() => commitStoryTurn(state, '我跟素世聊天。', reply, turnIds)).toThrow();
    expect(state).toEqual(original);
  });

  it('still records a real pedestrian encounter and its quoted contact proposal', () => {
    const arrived = meetAt();
    const point = arrived.scene!;
    const npc = getScenePeople(point, arrived.contacts, arrived.clock).find(person =>
      person.id.startsWith('ped-') && Math.hypot(person.x - point.x, person.z - point.z) <= 7)!;
    expect(npc).toBeDefined();
    const met = reduceState(arrived, { type: 'encounter', personId: npc.id });
    const quote = '我们加个好友吧。';
    const reply: GeneratedStory = {
      text: `|${npc.name}|happy|${quote}|`, phoneMessages: [],
      contactRequests: [{ kind: 'contact', npcId: npc.id, evidenceId: 'current', quote }],
    };
    const state = commitStoryTurn(met, '我向这位同学打招呼。', reply, turnIds);
    expect(state.protagonists?.npcPhone?.meetings.some(row => row.npcId === npc.id)).toBe(true);
    expect(state.protagonists?.npcPhone?.requests.some(row => row.npcId === npc.id && row.status === 'pending')).toBe(true);
    expect(parseState(state)).toEqual(state);
  });

  it('reads historical Emma encounters without reviving an NPC contact proposal at her old anchor', () => {
    const legacy = createInitialState();
    const oldScene = { x: 0, z: 18, yaw: 0, areaId: 'promenade', seed: 'historical-emma', encounterId: null };
    const emma = getScenePeople(oldScene, legacy.contacts, legacy.clock).find(person => person.id === personIds.emma)!;
    expect(emma).toBeDefined();
    const old = enableProtagonists(reduceState(legacy, { type: 'walk', x: emma.x, z: emma.z, yaw: 0, seed: oldScene.seed }));
    old.scene!.encounterId = emma.id;
    old.protagonists!.npcPhone = {
      version: 1, meetings: [{ id: 'met:soyo:majo-emma', owner: 'soyo', npcId: emma.id, name: emma.name,
        portraitId: emma.portraitId, summary: '以前在街边认识的艾玛。', at: gameMinute(old), locationId: old.locationId }],
      evidence: [], requests: [], turns: [], relationships: [], groups: [], messages: [],
    };
    const state = parseState(old);
    expect(state.scene?.encounterId).toBe(emma.id);
    expect(state.protagonists?.npcPhone?.meetings).toHaveLength(1);
    expect(personState(state, 'emma').locationId).not.toBe(state.locationId);
    expect(contactProposalContext(state)).toBeNull();
    const quote = '我们加个好友吧。';
    expect(() => commitStoryTurn(state, '我回想起以前和艾玛说过的话。', {
      text: `|樱羽艾玛|happy|${quote}|`, phoneMessages: [],
      contactRequests: [{ kind: 'contact', npcId: emma.id, evidenceId: 'current', quote }],
    }, turnIds)).toThrow();
    const recalled = commitStoryTurn(state, '我回想起以前认识的艾玛。', {
      text: '脑海中浮现以前见面时的片段。', phoneMessages: [],
    }, turnIds);
    expect(recalled.protagonists?.npcPhone?.requests).toHaveLength(0);
    expect(recalled.protagonists?.npcPhone?.evidence).toHaveLength(0);
  });

  it('rejects reserved protagonist encounters in a legacy save with no counterpart authority', () => {
    const state: WorldState = reduceState(createInitialState(), { type: 'novel_travel', locationId: 'sports' });
    state.scene!.encounterId = personIds.sakiko;
    expect(() => parseState(state)).toThrow();
  });
});
