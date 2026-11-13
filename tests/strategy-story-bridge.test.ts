import { describe, it, expect } from 'vitest';
import { createInitialState, parseState, reduceState, commitStoryTurn } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { otherSideOpportunity } from '../src/runtime/other-side';
import { parseGeneratedStory } from '../src/runtime/story-protocol';

function configured() {
  let world = enableProtagonists(createInitialState());
  world = reduceState(world, { type: 'strategy', requestId: 'strategy-test-enable', command:
    { type: 'set_control', owner: 'soyo', controller: 'manual', includeInPrompt: true } });
  return reduceState(world, { type: 'strategy', requestId: 'strategy-test-start', command:
    { type: 'start_focus', owner: 'soyo', focusId: 'soyo_face_past' } });
}
const ids = { userId: 'strategy-turn-u', assistantId: 'strategy-turn-a' };
const wrapped = (payload: string) => `<story>素世整理了旧照片。</story><phone_messages>[]</phone_messages>${payload}`;
const update = (progressDelta: number) => wrapped(
  `<strategy_updates>[{"owner":"soyo","focusId":"soyo_face_past","note":"回忆旧事","progressDelta":${progressDelta},"stats":{"soyo_resolve":2}}]</strategy_updates>`
);

describe('story/strategy transaction', () => {
  it('persists validated effects once and rejects changed or retroactive replay', () => {
    const initial = configured();
    const response = parseGeneratedStory(update(30), initial);
    const committed = parseState(commitStoryTurn(initial, '整理旧相册', response, ids));
    expect(committed.protagonists!.strategy!.people.soyo.active?.progress).toBe(30);
    expect(committed.protagonists!.strategy!.stats.soyo_resolve).toBe(2);
    expect(committed.protagonists!.strategy!.history.some(e => e.kind === 'narrative')).toBe(true);
    const replay = commitStoryTurn(committed, '整理旧相册', response, ids);
    expect(replay.protagonists!.strategy).toEqual(committed.protagonists!.strategy);
    expect(() => commitStoryTurn(committed, '整理旧相册', parseGeneratedStory(update(31), initial), ids))
      .toThrow(/相同剧情 ID/);
    const priorNoEffects = commitStoryTurn(initial, '整理旧相册',
      parseGeneratedStory(wrapped(''), initial), ids);
    expect(() => commitStoryTurn(priorNoEffects, '整理旧相册', response, ids))
      .toThrow(/重复剧情 ID 不得新增/);
  });

  it('requires authorized Otherside for updates concerning another protagonist', () => {
    const world = configured();
    world.protagonists!.strategy!.people.emma.includeInPrompt = true;
    world.protagonists!.strategy!.people.emma.active =
      { id: 'emma_daily_circle', progress: 0, startedAt: world.protagonists!.strategy!.cursor };
    const fake = wrapped('<strategy_updates>[{"owner":"emma","focusId":"emma_daily_circle","note":"没有旁线证据","progressDelta":20}]</strategy_updates>');
    expect(() => parseGeneratedStory(fake, world)).toThrow(/非当前主角的国策更新/);
  });

  it('supplies the completed follow-up plan only for an authorized offscreen milestone', () => {
    const world = enableProtagonists(createInitialState());
    const strategy = world.protagonists!.strategy!;
    const owner = 'sakiko';
    const focusId = 'sakiko_stage_draft';
    strategy.people[owner].completed = ['sakiko_redefine_band', 'sakiko_write_overture', focusId];
    strategy.majorQueue!.push({ id: `major:${owner}:${strategy.cursor}:${focusId}`, owner, focusId, at: strategy.cursor });
    expect(otherSideOpportunity(world).strategyMajor).toBeUndefined();
    strategy.people[owner].includeInPrompt = true;
    expect(otherSideOpportunity(world).strategyMajor).toMatchObject({
      focusId, title: '拟定新章的舞台', description: expect.stringContaining('舞台草案'),
    });
  });

  it('commits one authorized focus milestone through Otherside, without exposing it as personal knowledge', () => {
    const world = enableProtagonists(createInitialState()), strategy=world.protagonists!.strategy!;
    const at = strategy.cursor;
    strategy.people.sakiko.completed.push('sakiko_redefine_band');
    strategy.people.sakiko.includeInPrompt = true;
    const majorId = `major:sakiko:${at}:sakiko_redefine_band`;
    strategy.majorQueue!.push({ id: majorId, owner:'sakiko', focusId:'sakiko_redefine_band', at });
    expect(otherSideOpportunity(world).strategyMajor?.id).toBe(majorId);
    const scene = [{ protagonists:['sakiko'], text:'祥子独自处理了旧日书信。' }];
    const milestone = [{ majorId, owner:'sakiko', note:'祥子决定切断旧日关系',
      flags:{sakiko_final_break:true} }];
    const packet = wrapped(`<otherside>${JSON.stringify(scene)}</otherside><strategy_major>${JSON.stringify(milestone)}</strategy_major>`);
    const event = parseGeneratedStory(packet, world);
    const saved = parseState(commitStoryTurn(world, '看看窗外', event,
      {userId:'strategy-major-u', assistantId:'strategy-major-a'}));
    expect(saved.protagonists!.strategy!.flags.sakiko_final_break).toBe(true);
    expect(saved.protagonists!.strategy!.majorQueue).toEqual([]);
    expect(saved.protagonists!.strategy!.history.some(e=>e.kind==='major_event')).toBe(true);
    expect(saved.story.find(e=>e.id==='strategy-major-a')?.otherSideBeats?.[0]?.text).toBe(scene[0].text);
    expect(() => parseGeneratedStory(wrapped(`<otherside>${JSON.stringify(scene)}</otherside><strategy_major>${JSON.stringify([{...milestone[0],flags:{crychic_reunited:true}}])}</strategy_major>`),world))
      .toThrow(/标志/);
  });
});
