import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive, toRaw } from 'vue';
import InventoryPanel from '../src/frontend/InventoryPanel.vue';
import type { ShellActions, ShellModel, WorldState } from '../src/frontend/types';
import { createTavernBridge } from '../src/runtime/bridge';
import { getPurchaseQuote, getUseItemQuote, INVENTORY_ITEM_LIMIT } from '../src/runtime/convenience-store';
import { createInitialState, commitStoryTurn, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { knownStoryItems } from '../src/runtime/story-items';
import { parseGeneratedStory } from '../src/runtime/story-protocol';

const cookie = {
  type: 'create_item', itemId: 'story-taki-cat-cookie', quantity: 2, reason: '立希把纸袋递到我手上。',
  definition: { name: '立希的黑猫曲奇', description: '纸袋边上画了一只歪着耳朵的猫。', category: 'snack', unit: '块', kcal: 95, useMinutes: 2, effects: { satiety: 6 } },
} as const;
const useCookie = { type: 'use', itemId: cookie.itemId } as const;
const takeAnother = { type: 'create_item', itemId: cookie.itemId, quantity: 1, reason: '从烤盘上又取了一块。' } as const;
const envelope = (actions: unknown[]) =>
  '<story>|椎名立希|平静|这袋给你。|</story><phone_messages>[]</phone_messages><world_actions>' + JSON.stringify(actions) + '</world_actions>';
const ids = (id: string) => ({ userId: 'u-' + id, assistantId: 'a-' + id });
function turn(state: WorldState, actions: unknown[], id: string) {
  return commitStoryTurn(state, '我收下了。', parseGeneratedStory(envelope(actions), state), ids(id));
}
const count = (s: WorldState, itemId = cookie.itemId as string) => s.inventory.find(item => item.itemId === itemId)?.quantity ?? 0;
const restore = (s: WorldState) => parseState(JSON.parse(JSON.stringify(s)));

afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe('模型原创物品', () => {
  it('从真实发出的模型提示到背包、下轮上下文、用掉后再获得与回合重放', async () => {
    const base = enableProtagonists(createInitialState());
    localStorage.setItem('unread-city:long-term-memory:settings:v1', JSON.stringify({ enabled: false }));
    const generate = vi.fn(async (_request: { user_input: string; injects: { content: string }[] }) => envelope([cookie, useCookie]));
    const bridge = createTavernBridge({ parent: { SillyTavern: { getContext: () => ({
      characterId: 0, characters: { 0: { avatar: 'story-item.png' } }, chatId: 'test-items', mainApi: 'openai',
    }) } }, getVariables: () => ({}), replaceVariables: vi.fn(), generate,
      eventOn: vi.fn(), eventRemoveListener: vi.fn(), tavern_events: { CHAT_CHANGED: 'change' }, stopGenerationById: () => true,
    } as unknown as Window)!;
    try {
      const response = await bridge.generate('我接过曲奇，吃掉一块。', base);
      expect(generate.mock.calls[0]![0].injects.map(row => row.content).join('')).toContain('"type":"create_item"');
      const saved = restore(commitStoryTurn(base, '我接过曲奇，吃掉一块。', response, ids('first')));
      expect(count(saved)).toBe(1);
      expect(saved.player.foodEnergy).toBe(base.player.foodEnergy - 4 + 95);
      expect(saved.storyItems).toEqual([{ itemId: cookie.itemId, definition: cookie.definition }]);
      expect(commitStoryTurn(saved, '我接过曲奇，吃掉一块。', response, ids('first'))).toEqual(saved);
      generate.mockResolvedValue(envelope([]));
      await bridge.generate('看看那袋曲奇。', saved);
      const request = generate.mock.calls.at(-1)![0].user_input;
      expect(request).toContain(cookie.itemId);
      expect(request).toContain(cookie.definition.description);
      const empty = reduceState(saved, { type: 'use_item', itemId: cookie.itemId });
      expect(count(empty)).toBe(0);
      expect(knownStoryItems(empty, '')).toContainEqual({ itemId: cookie.itemId, name: cookie.definition.name });
      const refilled = turn(restore(empty), [takeAnother], 'second');
      expect(count(refilled)).toBe(1);
      expect(refilled.storyItems).toHaveLength(1);
    } finally { bridge.dispose(); }
  });

  it('新建后同轮可转赠，纪念品与工具按各自用途处理，切换主角与旧档互不串包', () => {
    const old = enableProtagonists(createInitialState());
    delete old.storyItems;
    for (const person of [old.protagonists!.inactive, old.protagonists!.third, old.protagonists!.fourth]) delete person.storyItems;
    const tool = { ...cookie, itemId: 'story-pocket-tuner', quantity: 1,
      definition: { name: '便携调音器', description: '背面写着一个音名。', category: 'tool', unit: '台', useMinutes: 3 } };
    const letter = { ...cookie, itemId: 'story-blue-letter', quantity: 1,
      definition: { name: '蓝色信封', description: '封口还贴着邮票。', category: 'collectible', unit: '封' } };
    const give = { type: 'gift', itemId: cookie.itemId, quantity: 1, npcId: 'bang-taki', affinityDelta: 1, reason: '分她一块' };
    const saved = turn(restore(old), [cookie, give, letter, tool, { type: 'use', itemId: tool.itemId }], 'objects');
    expect(count(saved)).toBe(1); expect(count(saved, tool.itemId)).toBe(1);
    expect(getUseItemQuote(saved, letter.itemId).blockedReason).toBeTruthy();
    expect(getPurchaseQuote(saved, tool.itemId).blockedReason).toBeTruthy();
    const switched = restore(reduceState(saved, { type: 'switch_protagonist', target: 'sakiko' }));
    expect(switched.storyItems).toEqual([]); expect(count(switched)).toBe(0);
    expect(() => turn(switched, [takeAnother], 'not-mine')).toThrow();
    const back = reduceState(switched, { type: 'switch_protagonist', target: 'soyo' });
    expect(back.storyItems).toEqual(saved.storyItems);
    expect(count(back, tool.itemId)).toBe(1);
  });

  it('校验编号、同名专属礼物、登记冲突和数量，非法组合整轮不写入', () => {
    const base = createInitialState();
    for (const bad of [
      [takeAnother], [useCookie, cookie], [{ ...cookie, quantity: 0 }], [{ ...cookie, itemId: 'mutsumi-cucumber' }],
      [{ ...cookie, definition: { ...cookie.definition, name: '若叶睦种的小黄瓜' } }],
      [{ ...cookie, definition: { ...cookie.definition, kcal: 4000 } }],
      [{ ...cookie, definition: { ...cookie.definition, effects: { balance: 100 } } }],
      [cookie, { ...cookie, definition: { ...cookie.definition, name: '另一种曲奇' } }],
    ]) expect(() => turn(base, bad, 'bad')).toThrow();
    expect(count(base)).toBe(0);
    const saved = turn(base, [cookie], 'good');
    const altered = parseGeneratedStory(envelope([{ ...cookie, quantity: 3 }]), saved);
    expect(() => commitStoryTurn(saved, '我收下了。', altered, ids('good'))).toThrow();
    const full = restore(saved); full.inventory.find(row => row.itemId === cookie.itemId)!.quantity = INVENTORY_ITEM_LIMIT;
    expect(() => turn(full, [takeAnother], 'full')).toThrow();
    expect(count(full)).toBe(INVENTORY_ITEM_LIMIT);
    expect(() => parseState({ ...saved, storyItems: [] })).toThrow();
    expect(() => parseState({ ...saved, storyItems: [...saved.storyItems!, ...saved.storyItems!] })).toThrow();
  });

  it.each([390, 1280])('背包展示原创描述并使用一份（窗口宽 %i）', async width => {
    vi.stubGlobal('innerWidth', width);
    const model = reactive({ state: turn(createInitialState(), [cookie], 'show'), busy: false, notice: '' } as ShellModel);
    const actions = { dispatch(action) { model.state = reduceState(toRaw(model.state), action); } } as ShellActions;
    const root = document.createElement('div');
    const app = createApp(InventoryPanel, { model, actions });
    try {
      app.mount(root);
      const card = root.querySelector('[data-inventory-product="' + cookie.itemId + '"]')!;
      expect(card.textContent).toContain(cookie.definition.description);
      const button = card.querySelector<HTMLButtonElement>('button[aria-label="使用立希的黑猫曲奇"]')!;
      button.click(); await nextTick(); await nextTick();
      expect(count(model.state)).toBe(1);
      expect(root.querySelector('[data-use-receipt]')?.textContent).toContain(cookie.definition.name);
    } finally { app.unmount(); vi.unstubAllGlobals(); }
  });
});
