import { describe, expect, it } from 'vitest';
import { commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import { otherSideOpportunity, sameOtherSidePlace, OTHER_SIDE_CATEGORIES, OTHER_SIDE_RULES } from '../src/runtime/other-side';
import { parseGeneratedStory, validateOtherSideEvents } from '../src/runtime/story-protocol';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { getSceneArea, sceneLocationId, scenePersonAnchors } from '../src/runtime/scene-context';
import { residentCast, residentPresence } from '../src/runtime/npc-cast';
import { worldScenePeople } from '../src/runtime/world-presence';
import { startSocialAgenda } from '../src/runtime/social-agenda';
import type { SocialInvitation } from '../src/runtime/natural-interactions';
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
    const beforeAffinity = personState(state, 'emma').contacts.find(row => row.id === npc.id)?.affinity ?? 0;
    const side = { protagonists: group.protagonists, text: '艾玛与熟识的朋友在同一地点谈起近况。',
      npcs: [{ id: npc.id, status: '约好了稍后一起吃饭', affinityDelta: 1 }] };
    expect(() => validateOtherSideEvents([{ ...side, npcs: [{ id: 'watanare-mai', status: '被错误召唤' }] }], state)).toThrow();
    const committed = commitStoryTurn(state, '看看书。', parseGeneratedStory(format([side]), state), ids);
    expect(committed.protagonists!.otherSideNpc?.[npc.id]?.status).toBe('约好了稍后一起吃饭');
    const emma = personState(committed, 'emma');
    expect(emma.contacts.find(row => row.id === npc.id)?.affinity).toBe(beforeAffinity + 1);
    const switched = reduceState(committed, { type: 'switch_protagonist', target: 'emma' });
    expect(worldScenePeople(switched).some(person => person.id === npc.id)).toBe(true);
  });

  describe('single-turn otherside reservation vs background life scheduler (17:20 -> 17:40)', () => {
    function emmaAt1720WithSoyoOtherSide() {
      return eligible(state => {
        const switched = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
        Object.assign(state, switched);
        state.clock = { day: 1, hour: 17, minute: 20 };
        const bg = state.protagonists!.backgroundLife!;
        bg.cursor = 17 * 60 + 20;
        for (const id of ['soyo', 'sakiko', 'emma', 'renako'] as ProtagonistId[]) {
          bg.people[id].pending = null;
          bg.people[id].nextDecisionAt = 17 * 60 + 30;
        }
      }, candidate => candidate.groups.some(group => group.length === 1 && group[0] === 'soyo'));
    }

    const withTwentyMinActivity = (events?: unknown[]) => {
      const actions = [{
        type: 'activity',
        label: '在原地整理线索与笔记',
        minutes: 20,
        effects: { energy: -2, morale: 1, stress: 0, health: 0, balance: 0, satiety: 0, foodEnergy: 0 },
      }];
      const sideBlock = events ? `<otherside>${JSON.stringify(events)}</otherside><story_continue>艾玛合上笔记本。</story_continue>` : '';
      return `<story>艾玛低头整理了二十分钟笔记。</story><world_actions>${JSON.stringify(actions)}</world_actions><phone_messages>[]</phone_messages>${sideBlock}`;
    };

    it('1 & 5 & 6 & 7: reserves Soyo during 17:20->17:40 without blocking other protagonists, stays idempotent on replay, and restores Soyo scheduling next turn', () => {
      const { state } = emmaAt1720WithSoyoOtherSide();
      const soyoBefore = structuredClone(personState(state, 'soyo').player);
      const side = {
        protagonists: ['soyo'],
        text: '素世在街角停下脚步，望着傍晚的天色轻轻舒了口气。',
        variables: { soyo: { morale: 2 } },
      };
      const reply = parseGeneratedStory(withTwentyMinActivity([side]), state);
      const turnIds = { userId: 'u-1720', assistantId: 'a-1720' };

      // 1. 17:20->17:40 with Soyo otherside succeeds and applies morale +2 without creating a 17:30 pending activity.
      const committed = commitStoryTurn(state, '整理二十分钟笔记。', reply, turnIds);
      expect(committed.clock).toEqual({ day: 1, hour: 17, minute: 40 });
      const soyoAfter = personState(committed, 'soyo').player;
      expect(soyoAfter.morale).toBe(Math.min(100, soyoBefore.morale + 2));
      expect(soyoAfter.foodEnergy).toBeLessThan(soyoBefore.foodEnergy);
      expect(committed.protagonists!.backgroundLife!.people.soyo.pending).toBeNull();
      expect(committed.protagonists!.backgroundLife!.people.soyo.nextDecisionAt).toBe(17 * 60 + 45);

      // 5. Other protagonists not in otherside (sakiko, renako) still run their normal 17:30 background decisions.
      expect(committed.protagonists!.backgroundLife!.people.sakiko.pending).not.toBeNull();
      expect(committed.protagonists!.backgroundLife!.people.sakiko.pending?.start).toBe(17 * 60 + 30);
      expect(committed.protagonists!.backgroundLife!.people.renako.pending).not.toBeNull();
      expect(committed.protagonists!.backgroundLife!.people.renako.pending?.start).toBe(17 * 60 + 30);

      // 6. Replaying the same assistantId is idempotent and does not double-settle.
      const replayed = commitStoryTurn(committed, '整理二十分钟笔记。', reply, turnIds);
      expect(replayed).toEqual(committed);
      expect(personState(replayed, 'soyo').player.morale).toBe(soyoAfter.morale);

      // 7. Next turn (17:40->17:50 without otherside): Soyo's normal background scheduling resumes at 17:45.
      const nextActions = [{
        type: 'activity',
        label: '继续观察街口动静',
        minutes: 10,
        effects: { energy: 0, morale: 0, stress: 0, health: 0, balance: 0, satiety: 0, foodEnergy: 0 },
      }];
      const nextReply = parseGeneratedStory(
        `<story>艾玛又观察了十分钟。</story><world_actions>${JSON.stringify(nextActions)}</world_actions><phone_messages>[]</phone_messages>`,
        committed,
      );
      const afterNextTurn = commitStoryTurn(committed, '继续观察十分钟。', nextReply, { userId: 'u-1740', assistantId: 'a-1740' });
      expect(afterNextTurn.clock).toEqual({ day: 1, hour: 17, minute: 50 });
      expect(afterNextTurn.protagonists!.backgroundLife!.people.soyo.pending).not.toBeNull();
      expect(afterNextTurn.protagonists!.backgroundLife!.people.soyo.pending?.start).toBe(17 * 60 + 45);
    });

    it('2: starts normal 17:30 background pending for Soyo when advancing 17:20->17:40 without otherside', () => {
      const { state } = emmaAt1720WithSoyoOtherSide();
      const reply = parseGeneratedStory(withTwentyMinActivity(), state);
      const committed = commitStoryTurn(state, '整理二十分钟笔记。', reply, { userId: 'u-no-side', assistantId: 'a-no-side' });
      expect(committed.clock).toEqual({ day: 1, hour: 17, minute: 40 });
      expect(committed.protagonists!.backgroundLife!.people.soyo.pending).not.toBeNull();
      expect(committed.protagonists!.backgroundLife!.people.soyo.pending?.start).toBe(17 * 60 + 30);
    });

    it('3: continues to reject otherside when Soyo already had a pending background activity before generation', () => {
      const { state } = emmaAt1720WithSoyoOtherSide();
      const side = { protagonists: ['soyo'], text: '素世停下脚步。', variables: { soyo: { morale: 2 } } };
      const reply = parseGeneratedStory(withTwentyMinActivity([side]), state);

      const withPreExistingPending = structuredClone(state);
      const soyoPose = JSON.stringify([
        personState(withPreExistingPending, 'soyo').locationId,
        personState(withPreExistingPending, 'soyo').scene,
        personState(withPreExistingPending, 'soyo').interior,
      ]);
      // Even if the pre-existing pending finishes at 17:35 (before 17:40), it was active before generation and must be rejected.
      withPreExistingPending.protagonists!.backgroundLife!.people.soyo.pending = {
        id: 'bg:soyo:1025:routine',
        kind: 'routine',
        start: 17 * 60 + 5,
        due: 17 * 60 + 35,
        target: '',
        label: '独自读了会儿随身文字，整理自己的日常安排',
        origin: soyoPose,
        calendarKey: '',
        arrival: null,
        routeContext: null,
      };
      expect(() => validateOtherSideEvents([side], withPreExistingPending)).toThrow();
      expect(() => commitStoryTurn(withPreExistingPending, '整理二十分钟笔记。', reply, { userId: 'u-pre-pending', assistantId: 'a-pre-pending' })).toThrow();
    });

    it('4: does not silently skip confirmed social invitations or deterministic appointment trips when otherside conflicts', () => {
      const { state } = emmaAt1720WithSoyoOtherSide();
      const side = { protagonists: ['soyo'], text: '素世仍留在原地沉思。', variables: { soyo: { morale: 2 } } };
      const reply = parseGeneratedStory(withTwentyMinActivity([side]), state);

      const withConfirmedInvite = structuredClone(state);
      const invitation: SocialInvitation = {
        id: 'inv-soyo-1730',
        owner: 'sakiko',
        targetId: 'protagonist-soyo',
        targetName: '长崎素世',
        source: 'sms',
        locationId: 'cafe',
        day: 1,
        time: '17:40',
        message: '17:40 在咖啡馆商量排练安排可以吗？',
        status: 'accepted',
        createdAt: 17 * 60,
        messageId: 'npc:inv-soyo-1730',
        response: '好的，我会过去。',
      };
      withConfirmedInvite.protagonists!.socialInvitations = [invitation];
      startSocialAgenda(withConfirmedInvite, invitation, {
        rationale: '按时从当前地点出发赴约。',
        steps: [
          { kind: 'prepare', day: 1, time: '17:22', detail: '整理随身物品' },
          { kind: 'depart', day: 1, time: '17:25', detail: '从当前地点出发前往咖啡馆' },
          { kind: 'arrive', day: 1, time: '17:40', detail: '到达咖啡馆' },
          { kind: 'leave', day: 1, time: '18:40', detail: '结束会面离开' },
        ],
      });
      expect(() => commitStoryTurn(
        withConfirmedInvite,
        '整理二十分钟笔记。',
        reply,
        { userId: 'u-invite-conflict', assistantId: 'a-invite-conflict' },
      )).toThrow(/旁线与后台已结算的位置变化冲突|旁线人物正在执行后台安排/);
    });
  });
});
