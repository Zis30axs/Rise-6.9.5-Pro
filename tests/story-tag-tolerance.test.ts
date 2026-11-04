import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/runtime/model';
import { parseGeneratedStory } from '../src/runtime/story-protocol';

describe('forgiving story tag extraction', () => {
  it('ignores analysis tags, planning examples and duplicate story labels', () => {
    const response = [
      '[assistant]',
      '[reasoning]',
      'Drafting the scene.',
      '[content]',
      '<konatan_planning~>',
      '最初的标签是 <story>，随后是 </story><phone_messages>[]</phone_messages>。',
      '</konatan_planning~>',
      '<tucao>不应该保存这段规划。</tucao>',
      '<story>玲奈子走进玄关，注意到信箱里的一张卡片。</story>',
      '<phone_messages>[]</phone_messages>',
      '<world_actions>[{"type":"activity","label":"调查信箱","minutes":15,"effects":{"energy":-5,"morale":-3,"stress":6,"health":0,"balance":0,"satiety":-2,"foodEnergy":-30}}]</world_actions>',
    ].join('\n');
    const reply = parseGeneratedStory(response, createInitialState());
    expect(reply.text).toBe('玲奈子走进玄关，注意到信箱里的一张卡片。');
    expect(reply.phoneMessages).toEqual([]);
    expect(reply.worldActions).toEqual([{
      type: 'activity', label: '调查信箱', minutes: 15,
      effects: { energy: -5, morale: -3, stress: 6, health: 0, balance: 0, satiety: -2, foodEnergy: -30 },
    }]);
  });

  it('uses the last well-formed optional payload instead of blocking the scene', () => {
    const reply = parseGeneratedStory([
      '<story>剧情正常继续。</story>',
      '<phone_messages>bad json</phone_messages>',
      '<phone_messages>[]</phone_messages>',
      '<world_actions>{invalid}</world_actions>',
      '<story_continue>错误的多余旁线后文。</story_continue>',
    ].join(''), createInitialState());
    expect(reply.text).toBe('剧情正常继续。');
    expect(reply.phoneMessages).toEqual([]);
    expect(reply.worldActions).toBeUndefined();
    expect(reply.returnStory).toBeUndefined();
  });

  it('accepts missing phone tags and recovers a missing story closer', () => {
    expect(parseGeneratedStory('<story>没有手机消息。</story>', createInitialState()).phoneMessages).toEqual([]);
    const reply = parseGeneratedStory('<story>故事尚未闭合。<phone_messages>[]</phone_messages>', createInitialState());
    expect(reply.text).toBe('故事尚未闭合。');
    expect(reply.phoneMessages).toEqual([]);
  });

  it('accepts ordinary prose when the model omits story tags', () => {
    const reply = parseGeneratedStory('<think>不要写入这段。</think>普通的中文剧情。', createInitialState());
    expect(reply.text).toBe('普通的中文剧情。');
    expect(reply.phoneMessages).toEqual([]);
  });

  it('does not relax world action validation', () => {
    const input = '<story>无效的属性变更。</story><world_actions>[{"type":"activity","label":"调查","minutes":15,"effects":{"health":999}}]</world_actions>';
    expect(() => parseGeneratedStory(input, createInitialState())).toThrow('剧情行动无效');
  });
});
