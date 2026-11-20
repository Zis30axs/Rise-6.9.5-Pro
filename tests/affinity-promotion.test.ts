import { describe, expect, it } from 'vitest';
import { createApp, nextTick } from 'vue';
import WorldPanels from '../src/frontend/WorldPanels.vue';
import type { ConfessionStatus, ShellActions, ShellModel, StoryAction, WorldState } from '../src/frontend/types';
import { affinityPersonaPrompt } from '../src/runtime/affinity-personas';
import { AFFINITY_TIERS, contactRelationNote } from '../src/runtime/affinity-tiers';
import { storeCatalog } from '../src/runtime/convenience-store';
import { applyStoryActions, commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { parseGeneratedStory } from '../src/runtime/story-protocol';

const npcId = 'bang-anon';
const promote: StoryAction = { type: 'promote_relationship', npcId, reason: '她说出了真正担心的事。' };
const change = (delta: number): StoryAction => ({ type: 'relationship', npcId, delta, reason: '本轮交流' });
const contact = (s: WorldState) => s.contacts.find(row => row.id === npcId)!;
function at(affinity: number) {
  const state = createInitialState();
  contact(state).affinity = affinity;
  return state;
}
const offers = (state: WorldState) => affinityPersonaPrompt(state, null, '继续。');
const confession = (outcome: ConfessionStatus, quote: string): Extract<StoryAction, { type: 'confession' }> => ({ type: 'confession', npcId, outcome, quote });
const proposal = '我喜欢你。可以跟我交往吗？';
function turn(state: WorldState, id: string, input: string, actions: StoryAction[], messages: { npcId: string; text: string }[] = []) {
  const raw = `<story>窗外响起雨声。</story><phone_messages>${JSON.stringify(messages)}</phone_messages><world_actions>${JSON.stringify(actions)}</world_actions>`;
  return commitStoryTurn(state, input, parseGeneratedStory(raw, state), { userId: id + '-u', assistantId: id + '-a' });
}

describe('affinity progression through saved story actions', () => {
  it.each(AFFINITY_TIERS.slice(0, -1))('holds and offers $label in successive turns until the model promotes it', tier => {
    const capped = turn(at(tier.max - 1), 'reach', '和爱音聊了很久。', [change(20)]);
    expect(contact(capped).affinity).toBe(tier.max);
    expect(offers(capped)).toContain('千早爱音（bang-anon）');
    expect(offers(capped)).not.toContain('本轮好感分阶段人设');
    const waiting = parseState(JSON.parse(JSON.stringify(turn(capped, 'defer', '继续。', []))));
    expect(offers(waiting)).toContain('千早爱音（bang-anon）');
    const done = turn(waiting, 'advance', '听她把话说完。', [promote, change(20)]);
    expect(contact(done).affinity).toBe(tier.max + 1);
    expect(contact(done).confession).toBeUndefined();
    expect(offers(done)).not.toContain('千早爱音（bang-anon）');
    expect(turn(done, 'advance', '听她把话说完。', [promote, change(20)])).toEqual(done);
  });

  it('applies losses immediately and rejects premature, stale, repeated and terminal promotions atomically', () => {
    const before = at(70);
    const lost = applyStoryActions(before, [change(-20), change(-20)]);
    expect(contact(lost).affinity).toBe(30);
    expect(affinityPersonaPrompt(lost, null, '爱音')).toContain('千早爱音 · 熟人');
    for (const [start, actions] of [[68, [change(20), promote]], [69, [promote, promote]], [69, [change(-1), promote]], [100, [promote]]] as const) {
      const original = at(start);
      expect(() => applyStoryActions(original, actions)).toThrow(/晋升/);
      expect(contact(original).affinity).toBe(start);
    }
    expect(contact(applyStoryActions(at(-99), [change(-20)])).affinity).toBe(-100);
    expect(offers(at(100))).not.toContain('千早爱音（bang-anon）');
  });

  it('applies the cap to gifts while charging the inventory and reporting the actual change', () => {
    const state = at(68);
    const itemId = storeCatalog[0]!.id;
    state.inventory = [{ itemId, quantity: 2 }];
    const gift = { type: 'gift', npcId, itemId, quantity: 1, affinityDelta: 12, reason: '收到心意。' } as const;
    const capped = applyStoryActions(state, [gift]);
    expect(contact(capped).affinity).toBe(69);
    expect(capped.inventory.find(row => row.itemId === itemId)?.quantity).toBe(1);
    const again = applyStoryActions(capped, [gift]);
    expect(again.inventory.some(row => row.itemId === itemId)).toBe(false);
    expect(contact(again).affinity).toBe(69);
    expect(again.journal.at(-1)?.text).toContain('关系 +0');
  });

  it('keeps capped contacts and their promotions in the active viewpoint after reload', () => {
    const soyo = enableProtagonists(at(69));
    const sakiko = reduceState(soyo, { type: 'switch_protagonist', target: 'sakiko' });
    expect(offers(sakiko)).not.toContain(npcId);
    const back = reduceState(parseState(JSON.parse(JSON.stringify(sakiko))), { type: 'switch_protagonist', target: 'soyo' });
    expect(offers(back)).toContain(npcId);
    expect(contact(applyStoryActions(back, [promote])).affinity).toBe(70);
  });
});

describe('a confession is independent of the saved score', () => {
  it.each([['dating', '我也喜欢你，我愿意。'], ['declined', '谢谢，不过我只想做朋友。']] as const)('records %s only after a real proposal and player response', (outcome, answer) => {
    const ask = confession('pending', proposal);
    const asked = turn(at(69), 'ask', '看看来信。', [ask, promote], [{ npcId, text: proposal }]);
    expect(contact(asked)).toMatchObject({ affinity: 70, confession: 'pending' });
    const quiet = turn(asked, 'wait', '给我一点时间想想。', []);
    expect(contact(quiet).confession).toBe('pending');
    expect(() => turn(quiet, 'forged', '我不愿意。', [confession('dating', '愿意')])).toThrow(/玩家/);
    const saved = turn(quiet, 'answer', answer, [confession(outcome, answer)]);
    const recalled = parseState(JSON.parse(JSON.stringify(saved)));
    expect(contact(recalled)).toMatchObject({ affinity: 70, confession: outcome, relationNote: contact(asked).relationNote });
    expect(contactRelationNote(contact(recalled))).toContain(outcome === 'dating' ? '双方已经确认交往' : '已婉拒');
    expect(turn(recalled, 'answer', answer, [confession(outcome, answer)])).toEqual(recalled);
    expect(contact(applyStoryActions(recalled, [change(-20)])).confession).toBe(outcome);
  });

  it('accepts the speaker’s own tagged line and preserves the active contact’s note in the contact panel', async () => {
    const state = at(80);
    const saved = commitStoryTurn(state, '听爱音说完。', {
      text: `|千早爱音|害羞|${proposal}|`, phoneMessages: [], worldActions: [confession('pending', proposal)],
    }, { userId: 'spoken-u', assistantId: 'spoken-a' });
    const root = document.createElement('div');
    const app = createApp(WorldPanels, { panel: 'phone', model: { state: saved } as ShellModel, actions: {} as ShellActions });
    app.mount(root);
    try {
      const button = [...root.querySelectorAll<HTMLButtonElement>('.wp-contact')].find(row => row.textContent?.includes('千早爱音'))!;
      button.click();
      await nextTick();
      const header = root.querySelector('.wp-conversation-heading')?.textContent;
      expect(header).toContain('好感 80 · 挚友');
      expect(header).toContain('对方已告白，等待答复');
      expect(header).toContain(contact(state).relationNote);
      expect(root.textContent).not.toMatch(/promote_relationship|world_actions|可突破的关系/);
    } finally {
      app.unmount();
    }
    expect(() => commitStoryTurn(state, '听她说完。', {
      text: `|高松灯|害羞|${proposal}|`, phoneMessages: [], worldActions: [confession('pending', proposal)],
    }, { userId: 'wrong-u', assistantId: 'wrong-a' })).toThrow(/原话/);
  });

  it('rejects an invented proposal, an answer without a proposal, or a romantic rewrite of family and existing partners', () => {
    expect(() => turn(at(80), 'ghost', '继续。', [confession('pending', proposal)])).toThrow(/原话/);
    expect(() => turn(at(80), 'invent', '好。', [confession('dating', '好。')])).toThrow(/待回应/);
    const state = at(80);
    for (const id of ['nagasaki-mother', 'watanare-hiroki', 'watanare-kippei']) {
      state.contacts = [{ ...contact(at(80)), id, sourcePersonId: id }];
      expect(() => turn(state, 'kin', '听消息。', [{ ...confession('pending', proposal), npcId: id }], [{ npcId: id, text: proposal }])).toThrow(/家人或晚辈/);
    }
    const renako = reduceState(enableProtagonists(at(69)), { type: 'switch_protagonist', target: 'renako' });
    const id = 'watanare-ajisai';
    expect(() => turn(renako, 'again', '看看手机。', [{ ...confession('pending', proposal), npcId: id }], [{ npcId: id, text: proposal }])).toThrow(/已有交往约定/);
  });
});
