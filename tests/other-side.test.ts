import { describe, expect, it } from 'vitest';
import { commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { otherSideOpportunity, sameOtherSidePlace, OTHER_SIDE_CATEGORIES, OTHER_SIDE_RULES } from '../src/runtime/other-side';
import { parseGeneratedStory, validateOtherSideEvents } from '../src/runtime/story-protocol';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { getSceneArea, sceneLocationId, scenePersonAnchors } from '../src/runtime/scene-context';
import { residentCast, residentPresence } from '../src/runtime/npc-cast';
import { worldScenePeople } from '../src/runtime/world-presence';
import type { WorldState } from '../src/frontend/types';
import type { ProtagonistId } from '../src/runtime/dual-protagonists';

function eligible(setup?: (state: WorldState) => void,
  matches: (opportunity: ReturnType<typeof otherSideOpportunity>) => boolean = () => true) {
  const state = enableProtagonists(createInitialState());
  setup?.(state);
  for (let turn = 0; turn < 12000; turn++) {
    state.protagonists!.narrativeTurn = turn;
    const opportunity = otherSideOpportunity(state);
    if (opportunity.allowed && matches(opportunity)) return { state, opportunity };
  }
  throw new Error('未找到预期的确定性旁线候选');
}

const format = (events: unknown[], returnText = '素世继续向前走去。') =>
  `<story>素世看了看手表。</story><phone_messages>[]</phone_messages><otherside>${JSON.stringify(events)}</otherside><story_continue>${returnText}</story_continue>`;

const ids = { userId: 'other-side-test-user', assistantId: 'other-side-test-assistant' };

describe('otherside sampled cross-view narrative', () => {
  it('uses a stable 22% gate and four category families without mutating a read-only snapshot', () => {
    const state = enableProtagonists(createInitialState());
    const snapshot = JSON.stringify(state);
    expect(otherSideOpportunity(state)).toEqual(otherSideOpportunity(state));
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(OTHER_SIDE_RULES.chance).toBe(.22);
    expect(OTHER_SIDE_RULES.counts).toEqual([.84, .13, .03]);
    expect(OTHER_SIDE_CATEGORIES.soyo).toContain('mygo');
    expect(OTHER_SIDE_CATEGORIES.sakiko).toContain('ave-mujica');
    expect(OTHER_SIDE_CATEGORIES.emma).toContain('majo');
    expect(OTHER_SIDE_CATEGORIES.renako).toContain('watanare');
  });

  it('commits one side story, relative variables, optional main continuation, and switches into that saved scene', () => {
    const { state, opportunity } = eligible();
    const group = opportunity.groups[0]!;
    const member = group[0]!;
    const before = personState(state, member).player.morale;
    const side = { protagonists: group, text: '另一处的下午，众人沉默片刻，决定继续等待。', variables: { [member]: { morale: -2 } } };
    const reply = parseGeneratedStory(format([side]), state);
    const committed = commitStoryTurn(state, '看看手表。', reply, ids);
    const reparsed = parseState(JSON.parse(JSON.stringify(committed)));
    const record = reparsed.story.find(row => row.id === ids.assistantId)!;
    expect(record.text).toContain('素世看了看手表');
    expect(record.otherSideBeats).toEqual([{ protagonists: group, text: side.text }]);
    expect(record.returnStory).toBe('素世继续向前走去。');
    expect(reparsed.protagonists!.narrativeTurn).toBe((state.protagonists!.narrativeTurn ?? 0) + 1);
    expect(reparsed.protagonists!.otherSideHistory?.at(-1)?.id).toBe(ids.assistantId);
    expect(personState(reparsed, member).player.morale).toBe(Math.max(0, before - 2));
    const switched = reduceState(reparsed, { type: 'switch_protagonist', target: member });
    expect(switched.story.some(row => row.text === side.text)).toBe(true);
    expect(switched.story.at(-1)?.text).toBe(side.text);
    expect(switched.clock).toEqual(reparsed.clock);
  });

  it('rejects NPC as a viewpoint and unauthorized or split groups', () => {
    const { state, opportunity } = eligible();
    expect(() => validateOtherSideEvents([{ protagonists: ['majo-yuki'], text: '不合法。' }], state)).toThrow(/主角/);
    const group = opportunity.groups[0]!;
    expect(() => validateOtherSideEvents([{ protagonists: group, text: '一次。' }, { protagonists: group, text: '重复。' }], state)).toThrow();
    expect(() => validateOtherSideEvents([{ protagonists: group, text: '不合法。', variables: { [group[0]!]: { balance: 9999 } } }], state)).toThrow();
  });

  it('groups two truly co-located protagonists, never two separate otherside tags', () => {
    const { state, opportunity } = eligible(state => {
      const room = getCampusInterior('toyokawa-house')!;
      for (const id of ['sakiko', 'emma'] as ProtagonistId[]) {
        const personal = personState(state, id);
        const area = getSceneArea(room.entrance.x, room.entrance.z)!;
        personal.locationId = room.id;
        personal.interior = { roomId: room.id, ...room.spawn, activityId: null, lastRest: null, lastStudy: null };
        personal.scene = { x: room.entrance.x, z: room.entrance.z, yaw: 0, areaId: area.id,
          seed: 'other-side-pair', encounterId: null };
      }
    }, candidate => candidate.groups.some(group => group.includes('sakiko') && group.includes('emma')));
    expect(sameOtherSidePlace(state, 'sakiko', 'emma')).toBe(true);
    const group = opportunity.groups.find(group => group.includes('sakiko') && group.includes('emma'))!;
    expect(group).toEqual(['sakiko', 'emma']);
    expect(() => validateOtherSideEvents([
      { protagonists: ['sakiko'], text: '祥子的剧情。' },
      { protagonists: ['emma'], text: '艾玛的剧情。' },
    ], state)).toThrow();
    expect(validateOtherSideEvents([{ protagonists: group, text: '两人正在同一间房里交谈。' }], state)).toHaveLength(1);
  });

  it('persists off-screen SMS on both phones without leaking another person\'s narration', () => {
    const { state, opportunity } = eligible(undefined,
      candidate => candidate.groups.some(group => group.length === 1 && group[0] === 'sakiko'));
    const side = { protagonists: ['sakiko'], text: '祥子拿出手机发了一条短信。',
      messages: [{ from: 'sakiko', to: 'emma', text: '今晚八点再联系吧。' }] };
    expect(opportunity.groups).toContainEqual(['sakiko']);
    const committed = commitStoryTurn(state, '查看周围。', parseGeneratedStory(format([side]), state), ids);
    const emma = personState(committed, 'emma'), sakiko = personState(committed, 'sakiko');
    expect(emma.phone.some(message => message.npcId === 'protagonist-sakiko' &&
      message.text === '今晚八点再联系吧。' && !message.read)).toBe(true);
    expect(sakiko.journal.some(row => row.text.includes('今晚八点再联系吧'))).toBe(true);
    expect(committed.protagonists!.conversations?.some(row => row.from === 'sakiko' && row.to === 'emma')).toBe(true);
    expect(committed.story.at(-1)?.text).not.toContain('今晚八点再联系吧');
    expect(() => parseState(committed)).not.toThrow();
  });

  it('does not reroll or resend SMS when the same committed turn is replayed', () => {
    const { state, opportunity } = eligible(undefined, candidate =>
      candidate.groups.some(group => group.length === 1 && group[0] === 'sakiko'));
    const group = opportunity.groups.find(group => group.length === 1 && group[0] === 'sakiko')!;
    const side = { protagonists: group, text: '祥子靠在窗边写了一封短信。',
      variables: { sakiko: { morale: 1 } },
      messages: [{ from: 'sakiko', to: 'emma', text: '晚些再见。' }] };
    const reply = parseGeneratedStory(format([side]), state);
    const committed = commitStoryTurn(state, '看向窗外。', reply, ids);
    const repeated = commitStoryTurn(committed, '看向窗外。', reply, ids);
    expect(repeated).toEqual(committed);
    const tampered = structuredClone(reply);
    tampered.otherSide![0]!.variables!.sakiko!.morale = 5;
    expect(() => commitStoryTurn(committed, '看向窗外。', tampered, ids)).toThrow(/旁线内容不同/);
    expect(committed.protagonists!.otherSideHistory?.at(-1)?.payloadHash).toBeTruthy();
  });

  it('blocks a second cutaway until BOTH game time and story-turn cooldowns have passed', () => {
    const { state, opportunity } = eligible();
    const group = opportunity.groups[0]!;
    const side = { protagonists: group, text: '一次普通的城中小事。' };
    const committed = commitStoryTurn(state, '走两步。',
      parseGeneratedStory(format([side]), state), ids);
    expect(otherSideOpportunity(committed).allowed).toBe(false);
    const onlyNarratives = structuredClone(committed);
    onlyNarratives.protagonists!.narrativeTurn! += OTHER_SIDE_RULES.cooldownStoryTurns;
    expect(otherSideOpportunity(onlyNarratives).allowed).toBe(false);
    const onlyTime = structuredClone(committed);
    onlyTime.clock.hour = (onlyTime.clock.hour + 2) % 24;
    onlyTime.clock.day += committed.clock.hour + 2 >= 24 ? 1 : 0;
    expect(otherSideOpportunity(onlyTime).allowed).toBe(false);
  });

  it('only invites genuinely co-located NPCs and remembers temporary contact changes', () => {
    const { state, opportunity } = eligible(state => {
      const main = state.scene ?? { x: 0, z: 29 };
      const located = residentCast.filter(resident => resident.id !== 'majo-emma').flatMap(resident => {
        const presence = residentPresence(resident.id, state.clock);
        const anchor = scenePersonAnchors.find(item => item.id === presence?.anchorId);
        const area = anchor && getSceneArea(anchor.x, anchor.z);
        if (!anchor || !area || Math.hypot(anchor.x - main.x, anchor.z - main.z) <= 25) return [];
        return [{ anchor, area }];
      })[0]!;
      if (!located) throw new Error('missing Majo anchor fixture');
      const emma = personState(state, 'emma');
      emma.locationId = sceneLocationId(located.area.id);
      emma.scene = { x: located.anchor.x, z: located.anchor.z, yaw: 0, seed: 'npc-side-test', areaId: located.area.id, encounterId: null };
      emma.interior = null;
    }, candidate => candidate.npcGroups.some(group => group.protagonists.includes('emma') && group.npcs.length > 0));
    const group = opportunity.npcGroups.find(g => g.protagonists.includes('emma') && g.npcs.length > 0)!;
    const npc = group.npcs[0]!;
    const side = { protagonists: group.protagonists, text: '艾玛与熟识的朋友在同一地点谈起近况。',
      npcs: [{ id: npc.id, status: '约好了稍后一起吃饭', affinityDelta: 1 }] };
    expect(() => validateOtherSideEvents([{ ...side, npcs: [{ id: 'watanare-mai', status: '被错误召唤' }] }], state)).toThrow();
    const committed = commitStoryTurn(state, '看看书。', parseGeneratedStory(format([side]), state), ids);
    expect(committed.protagonists!.otherSideNpc?.[npc.id]?.status).toBe('约好了稍后一起吃饭');
    const emma = personState(committed, 'emma');
    expect(emma.contacts.find(row => row.id === npc.id)?.affinity).toBe(1);
    const switched = reduceState(committed, { type: 'switch_protagonist', target: 'emma' });
    expect(worldScenePeople(switched).some(person => person.id === npc.id)).toBe(true);
  });
});
