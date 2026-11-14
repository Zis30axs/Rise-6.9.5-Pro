import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTavernBridge } from '../src/runtime/bridge';
import { getStoreItem, MUTSUMI_CUCUMBER_ITEM_ID, storeCatalog } from '../src/runtime/convenience-store';
import { identityStrategyDossier } from '../src/frontend/identity-strategy';
import { getSceneArea, sceneLocationId } from '../src/runtime/scene-context';
import {
  applyStoryActions,
  commitStoryTurn,
  createInitialState,
  parseState,
  reduceState,
} from '../src/runtime/model';
import {
  MUTSUMI_CUCUMBER_MIN_AFFINITY,
  MUTSUMI_CUCUMBER_PROBABILITY,
  MUTSUMI_CUCUMBER_TRAIT_ID,
  MUTSUMI_NPC_ID,
  npcDailyGiftDraw,
  npcGiftOpportunity,
} from '../src/runtime/npc-gift-traits';
import { resolveNpcTraits } from '../src/runtime/npc-traits';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { parseGeneratedStory } from '../src/runtime/story-protocol';
import { worldScenePeople } from '../src/runtime/world-presence';
import type { WorldState } from '../src/frontend/types';

function makeScene(x: number, z: number, seed: string, encounterId: string | null = null) {
  const area = getSceneArea(x, z);
  expect(area).not.toBeNull();
  return {
    locationId: sceneLocationId(area!.id),
    scene: { areaId: area!.id, x, z, yaw: 0, seed, encounterId },
  };
}

function makeSeededState(seed = 'cucumber-test-seed', day = 1): WorldState {
  const raw = createInitialState();
  raw.clock = { day, hour: 15, minute: 0 };
  raw.interior = null;
  const placed = makeScene(0, -6, seed, null);
  raw.locationId = placed.locationId;
  raw.scene = placed.scene;
  return parseState(enableProtagonists(raw));
}

function advanceDays(state: WorldState, targetDay: number): WorldState {
  let current = state;
  while (current.clock.day < targetDay) {
    const minutesLeftToday = 1440 - (current.clock.hour * 60 + current.clock.minute);
    const remainingDays = Math.max(0, targetDay - current.clock.day - 1);
    const step = Math.min(10080, minutesLeftToday + remainingDays * 1440 + 15 * 60);
    current = applyStoryActions(current, [{ type: 'rest', kind: 'wait', minutes: Math.max(1, step) }], `advance-${current.clock.day}`);
  }
  return parseState(current);
}

function moveNextToMutsumi(state: WorldState): WorldState {
  const mutsumi = worldScenePeople(state).find(person => person.id === MUTSUMI_NPC_ID);
  expect(mutsumi).toBeDefined();
  const next = structuredClone(state);
  next.interior = null;
  const placed = makeScene(mutsumi!.x - 1, mutsumi!.z - 1, state.scene?.seed ?? 'cucumber-test-seed', MUTSUMI_NPC_ID);
  next.locationId = placed.locationId;
  next.scene = placed.scene;
  return parseState(next);
}

function moveFarFromMutsumi(state: WorldState): WorldState {
  const mutsumi = worldScenePeople(state).find(person => person.id === MUTSUMI_NPC_ID);
  expect(mutsumi).toBeDefined();
  const next = structuredClone(state);
  next.interior = null;
  const placed = makeScene(-45, -3, state.scene?.seed ?? 'cucumber-test-seed', null);
  expect(Math.hypot(placed.scene.x - mutsumi!.x, placed.scene.z - mutsumi!.z)).toBeGreaterThan(20);
  next.locationId = placed.locationId;
  next.scene = placed.scene;
  return parseState(next);
}

function findDayByOutcome(seed: string, owner: 'soyo' | 'sakiko' | 'emma' | 'renako', shouldPass: boolean, startDay = 1): number {
  const cutoff = Math.round(MUTSUMI_CUCUMBER_PROBABILITY * 100);
  for (let day = startDay; day < startDay + 200; day++) {
    const draw = npcDailyGiftDraw(seed, owner, day);
    if (shouldPass ? draw < cutoff : draw >= cutoff) return day;
  }
  throw new Error(`No day found for ${owner} (${shouldPass})`);
}

function makeMockBridge() {
  const generate = vi.fn(async (_config: { user_input: string; injects: { content: string }[] }) => '<story>|旁白|平静|她点了点头。|</story><phone_messages>[]</phone_messages>');
  const script = {
    parent: {
      SillyTavern: {
        getContext: () => ({ characterId: 0, characters: { 0: { avatar: 'mutsumi-test.png' } }, chatId: 'cucumber-test', mainApi: 'openai' }),
      },
    },
    getVariables: () => ({}),
    replaceVariables: vi.fn(),
    eventOn: vi.fn(),
    eventRemoveListener: vi.fn(),
    tavern_events: { CHAT_CHANGED: 'chat_changed' },
    generate,
    stopGenerationById: vi.fn(() => true),
  } as unknown as Window;
  return { generate, bridge: createTavernBridge(script)! };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('unread-city:long-term-memory:settings:v1', JSON.stringify({ enabled: false }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('若叶睦高好感每日首次见面小黄瓜特质', () => {
  it('为若叶睦配置了第 3 条合规特质并在身份查档卡片中自然展示', () => {
    const traits = resolveNpcTraits({ id: MUTSUMI_NPC_ID });
    expect(traits.length).toBeGreaterThanOrEqual(1);
    expect(traits.length).toBeLessThanOrEqual(3);
    const giftTrait = traits.find(t => t.id === MUTSUMI_CUCUMBER_TRAIT_ID);
    expect(giftTrait).toBeDefined();
    expect(giftTrait!.summary).not.toMatch(/[\u3040-\u30ff]/);

    const dossier = identityStrategyDossier(MUTSUMI_NPC_ID, MUTSUMI_NPC_ID, makeSeededState());
    expect(dossier.npcTraits.some(t => t.id === MUTSUMI_CUCUMBER_TRAIT_ID)).toBe(true);
  });

  it('小黄瓜物品存在且不能从便利店买到，放入背包后可正常食用恢复状态', () => {
    expect(storeCatalog.some(item => item.id === MUTSUMI_CUCUMBER_ITEM_ID)).toBe(false);
    const cucumber = getStoreItem(MUTSUMI_CUCUMBER_ITEM_ID);
    expect(cucumber).toBeDefined();
    expect(cucumber!.name).toBe('若叶睦种的小黄瓜');
    expect(cucumber!.useUnit).toBe('根');

    const atStore = makeSeededState();
    const storePos = makeScene(20, 56, 'buy-check', null);
    atStore.locationId = storePos.locationId;
    atStore.scene = storePos.scene;
    expect(() =>
      parseGeneratedStory(
        JSON.stringify({
          story: '买了小黄瓜。',
          phone_messages: [],
          world_actions: [{ type: 'buy', itemId: MUTSUMI_CUCUMBER_ITEM_ID, quantity: 1 }],
        }),
        atStore,
      ),
    ).toThrow();

    const holding = parseState({
      ...atStore,
      player: { ...atStore.player, energy: 60, satiety: 50, stress: 40, health: 80, morale: 60 },
      inventory: [...atStore.inventory, { itemId: MUTSUMI_CUCUMBER_ITEM_ID, quantity: 1 }],
    });
    const afterEat = reduceState(holding, { type: 'use_item', itemId: MUTSUMI_CUCUMBER_ITEM_ID });
    expect(afterEat.inventory.find(entry => entry.itemId === MUTSUMI_CUCUMBER_ITEM_ID)).toBeUndefined();
    expect(afterEat.player.energy).toBeGreaterThan(60);
    expect(afterEat.player.stress).toBeLessThan(40);
  });

  it('不在交谈距离或好感度不足时绝不注入提示词，也拒绝伪造领取黄瓜', async () => {
    const passDay = findDayByOutcome('cucumber-test-seed', 'soyo', true);
    const base = makeSeededState('cucumber-test-seed', passDay);

    const far = moveFarFromMutsumi(base);
    expect(npcGiftOpportunity(far).allowed).toBe(false);

    const lowAffinity = moveNextToMutsumi(base);
    const mutsumiContact = lowAffinity.contacts.find(c => c.id === MUTSUMI_NPC_ID || c.sourcePersonId === MUTSUMI_NPC_ID)!;
    mutsumiContact.affinity = MUTSUMI_CUCUMBER_MIN_AFFINITY - 1;
    expect(npcGiftOpportunity(lowAffinity).allowed).toBe(false);

    for (const blocked of [far, lowAffinity]) {
      const h = makeMockBridge();
      try {
        await h.bridge.generate('和周围人打声招呼', blocked);
        const config = h.generate.mock.calls[0]![0];
        expect(config.user_input).not.toContain('"npcGiftOpportunity"');
        expect(config.injects[0]!.content).toContain('人物特质每日赠礼未触发');
        expect(config.injects[0]!.content).not.toContain('人物特质每日赠礼已触发');
      } finally {
        h.bridge.dispose();
      }

      expect(() =>
        commitStoryTurn(
          blocked,
          '收下黄瓜',
          {
            text: '|旁白|平静|递来了黄瓜。|',
            phoneMessages: [],
            worldActions: [
              {
                type: 'npc_trait_gift',
                npcId: MUTSUMI_NPC_ID,
                itemId: MUTSUMI_CUCUMBER_ITEM_ID,
                quantity: 1,
                traitId: MUTSUMI_CUCUMBER_TRAIT_ID,
                reason: '试图强行领取',
              },
            ],
          },
          { userId: 'u-forged', assistantId: 'a-forged' },
        ),
      ).toThrow();
    }
  });

  it('高好感且今日首次当面相遇概率命中时注入 LLM 提示词，提交后入包且当日不可重复触发', async () => {
    const passDay = findDayByOutcome('cucumber-test-seed', 'soyo', true);
    const base = moveNextToMutsumi(makeSeededState('cucumber-test-seed', passDay));

    const opportunity = npcGiftOpportunity(base);
    expect(opportunity.allowed).toBe(true);
    expect(opportunity.offers).toHaveLength(1);
    expect(opportunity.offers[0]!.itemId).toBe(MUTSUMI_CUCUMBER_ITEM_ID);

    const h = makeMockBridge();
    try {
      await h.bridge.generate('早安，睦', base);
      const config = h.generate.mock.calls[0]![0];
      expect(config.user_input).toContain('"npcGiftOpportunity"');
      expect(config.user_input).toContain(MUTSUMI_CUCUMBER_ITEM_ID);
      expect(config.injects[0]!.content).toContain('人物特质每日赠礼已触发');
      expect(config.injects[0]!.content).toContain('npc_trait_gift');
    } finally {
      h.bridge.dispose();
    }

    const parsedReply = parseGeneratedStory(
      `<story>|若叶睦|平静|……刚摘的，给你。|</story><phone_messages>[]</phone_messages><world_actions>[{"type":"npc_trait_gift","npcId":"${MUTSUMI_NPC_ID}","itemId":"${MUTSUMI_CUCUMBER_ITEM_ID}","quantity":1,"traitId":"${MUTSUMI_CUCUMBER_TRAIT_ID}","reason":"早晨初次碰面时她默默递来一根小黄瓜"}]</world_actions>`,
      base,
    );
    const afterFirst = commitStoryTurn(base, '早安，睦', parsedReply, { userId: 'u1', assistantId: 'a1' });
    expect(afterFirst.inventory.find(entry => entry.itemId === MUTSUMI_CUCUMBER_ITEM_ID)?.quantity).toBe(1);
    expect(afterFirst.npcGiftDaily?.records[`soyo:${MUTSUMI_NPC_ID}:${MUTSUMI_CUCUMBER_TRAIT_ID}`]?.lastClaimedDay).toBe(passDay);

    // Same-turn replay must remain idempotent instead of duplicating or failing.
    const replayed = commitStoryTurn(afterFirst, '早安，睦', parsedReply, { userId: 'u1', assistantId: 'a1' });
    expect(replayed.inventory.find(entry => entry.itemId === MUTSUMI_CUCUMBER_ITEM_ID)?.quantity).toBe(1);

    // Second turn on the same day must never trigger again.
    expect(npcGiftOpportunity(afterFirst).allowed).toBe(false);
    expect(() =>
      commitStoryTurn(
        afterFirst,
        '再给我一根吧',
        {
          text: '|旁白|平静|她摇了摇头。|',
          phoneMessages: [],
          worldActions: [
            {
              type: 'npc_trait_gift',
              npcId: MUTSUMI_NPC_ID,
              itemId: MUTSUMI_CUCUMBER_ITEM_ID,
              quantity: 1,
              traitId: MUTSUMI_CUCUMBER_TRAIT_ID,
              reason: '同日第二次尝试',
            },
          ],
        },
        { userId: 'u2', assistantId: 'a2' },
      ),
    ).toThrow();
  });

  it('概率未命中或同日先见面未拿后不会重抽；次日与切换主角独立判定且兼容无字段旧档', () => {
    const missDay = findDayByOutcome('cucumber-test-seed', 'soyo', false);
    const missState = moveNextToMutsumi(makeSeededState('cucumber-test-seed', missDay));
    expect(npcGiftOpportunity(missState)).toEqual({ allowed: false, firstMeetingInRange: true, offers: [] });

    const afterMiss = commitStoryTurn(
      missState,
      '早安，睦',
      { text: '|若叶睦|平静|……早。|', phoneMessages: [] },
      { userId: 'u-miss', assistantId: 'a-miss' },
    );
    expect(afterMiss.npcGiftDaily?.records[`soyo:${MUTSUMI_NPC_ID}:${MUTSUMI_CUCUMBER_TRAIT_ID}`]?.lastMetDay).toBe(missDay);
    expect(npcGiftOpportunity(afterMiss)).toEqual({ allowed: false, firstMeetingInRange: false, offers: [] });

    // Switching to Sakiko on a day Sakiko passes keeps each protagonist independent.
    const sakikoPassDay = findDayByOutcome('cucumber-test-seed', 'sakiko', true, missDay);
    const sameDayWithSoyoClaimed = applyStoryActions(
      moveNextToMutsumi(makeSeededState('cucumber-test-seed', sakikoPassDay)),
      [],
      'soyo-met',
    );
    const sakikoView = moveNextToMutsumi(reduceState(sameDayWithSoyoClaimed, { type: 'switch_protagonist', target: 'sakiko' }));
    expect(npcGiftOpportunity(sakikoView).allowed).toBe(true);
    const sakikoClaimed = commitStoryTurn(
      sakikoView,
      '睦，早上好',
      {
        text: '|若叶睦|平静|……祥，拿着。|',
        phoneMessages: [],
        worldActions: [
          {
            type: 'npc_trait_gift',
            npcId: MUTSUMI_NPC_ID,
            itemId: MUTSUMI_CUCUMBER_ITEM_ID,
            quantity: 1,
            traitId: MUTSUMI_CUCUMBER_TRAIT_ID,
            reason: '祥子今日初次见到睦时收下小黄瓜',
          },
        ],
      },
      { userId: 'u-saki', assistantId: 'a-saki' },
    );
    expect(sakikoClaimed.inventory.find(entry => entry.itemId === MUTSUMI_CUCUMBER_ITEM_ID)?.quantity).toBe(1);

    // Next passing day allows Soyo to receive one again, and old saves without npcGiftDaily parse cleanly.
    const nextPassDay = findDayByOutcome('cucumber-test-seed', 'soyo', true, sakikoPassDay + 1);
    const switchedBack = moveNextToMutsumi(reduceState(sakikoClaimed, { type: 'switch_protagonist', target: 'soyo' }));
    const tomorrowSoyo = moveNextToMutsumi(advanceDays(switchedBack, nextPassDay));
    expect(npcGiftOpportunity(tomorrowSoyo).allowed).toBe(true);

    const legacyWithoutField = structuredClone(missState);
    delete legacyWithoutField.npcGiftDaily;
    expect(parseState(legacyWithoutField).npcGiftDaily).toBeUndefined();
    expect(parseState(sakikoClaimed).npcGiftDaily?.records[`sakiko:${MUTSUMI_NPC_ID}:${MUTSUMI_CUCUMBER_TRAIT_ID}`]?.lastClaimedDay).toBe(sakikoPassDay);
  });
});
