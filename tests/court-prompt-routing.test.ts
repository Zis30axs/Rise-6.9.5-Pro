import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/runtime/model';
import { activeProtagonist } from '../src/runtime/protagonist-world';
import { initialCourtroom } from '../src/runtime/courtroom';
import {
  STORY_PROTOCOL, STORY_PROTOCOL_RULES,
  selectCourtPromptScopes, storyProtocolForTurn,
} from '../src/runtime/bridge';
import type { WorldState } from '../src/frontend/types';

const courtRulePrefixes = [
  'lawCareer 是兼容旧存档',
  '【法庭叙事规则】', '【委托生成】', '【特殊委托】',
  '【随机案件受理】', '【主动诉讼咨询】', '【开庭中】',
  '【和解】', '【判决执行】', '【刑事后果】', '【协议履行】',
  '【后续人物关系】', '【律师资格】', '【判决与和解】',
  '【法院大厅旁听·自然语言行动】',
];

describe('contextual courtroom protocol injection', () => {
  it('retains every original instruction verbatim in the complete protocol', () => {
    expect(STORY_PROTOCOL).toBe(STORY_PROTOCOL_RULES.join('\n'));
    expect(courtRulePrefixes).toHaveLength(15);
    for (const prefix of courtRulePrefixes) {
      const matching = STORY_PROTOCOL_RULES.filter(rule => rule.startsWith(prefix));
      expect(matching).toHaveLength(1);
      expect(STORY_PROTOCOL).toContain(matching[0]!);
    }
  });

  it('omits only courtroom sections during ordinary unrelated storytelling', () => {
    const state = createInitialState();
    const prompt = storyProtocolForTurn(state, '在宿舍和素世聊聊今天的早餐');
    expect(selectCourtPromptScopes(state, '聊天').size).toBe(0);
    for (const prefix of courtRulePrefixes) expect(prompt).not.toContain(prefix);
    expect(prompt).toContain('【最高优先级·强制对白标记】');
    expect(prompt).toContain('本轮必须输出关键标签块');
    const nonCourt = STORY_PROTOCOL_RULES.filter(rule =>
      !courtRulePrefixes.some(prefix => rule.startsWith(prefix))).join('\n');
    expect(prompt).toBe(nonCourt);
    expect(prompt.length).toBeLessThan(STORY_PROTOCOL.length - 5000);
  });

  it('loads only observing instructions for an ordinary courthouse visit', () => {
    const state = createInitialState();
    state.locationId = 'courthouse';
    const prompt = storyProtocolForTurn(state, '旁听公开庭审45分钟');
    expect(prompt).toContain('【法院大厅旁听·自然语言行动】');
    expect(prompt).toContain('【法庭叙事规则】');
    expect(prompt).not.toContain('【委托生成】');
    expect(prompt).not.toContain('【判决执行】');
    expect(prompt).not.toContain('【开庭中】');
  });

  it('also supports a direct natural-language trip and observation from elsewhere', () => {
    const state = createInitialState();
    const prompt = storyProtocolForTurn(state, '去法院旁听67分钟');
    expect(prompt).toContain('【法院大厅旁听·自然语言行动】');
    expect(prompt).not.toContain('【委托生成】');
  });

  it('selects office phases without rewriting the original rule text', () => {
    const state = createInitialState();
    state.locationId = 'legal-office';
    for (const [input, included, excluded] of [
      ['查看今日三份委托', '【委托生成】', '【开庭中】'],
      ['接受第一份委托', '【随机案件受理】', '【委托生成】'],
      ['我要起诉房东，请报价', '【主动诉讼咨询】', '【特殊委托】'],
      ['查看重大刑事特殊委托', '【特殊委托】', '【主动诉讼咨询】'],
    ] as const) {
      const prompt = storyProtocolForTurn(state, input);
      expect(prompt).toContain(included);
      expect(prompt).not.toContain(excluded);
      for (const rule of STORY_PROTOCOL_RULES.filter(rule => prompt.includes(rule))) {
        expect(STORY_PROTOCOL).toContain(rule);
      }
    }
  });

  it('keeps trial, settlement and verdict rules during an active civil hearing', () => {
    const state = createInitialState();
    state.courtroom = initialCourtroom();
    state.courtroom.active = {
      owner: activeProtagonist(state), source: 'lawsuit', category: 'civil',
    } as unknown as NonNullable<WorldState['courtroom']>['active'];
    state.locationId = 'court-hearing';
    const prompt = storyProtocolForTurn(state, '继续向对方律师质证');
    expect(prompt).toContain('【开庭中】');
    expect(prompt).toContain('【和解】');
    expect(prompt).toContain('【判决与和解】');
    expect(prompt).toContain('【判决执行】');
    expect(prompt).not.toContain('【委托生成】');
    expect(prompt).not.toContain('【主动诉讼咨询】');
    expect(prompt).not.toContain('【法院大厅旁听·自然语言行动】');
  });

  it('falls back to every original legal rule for ambiguous requests outside legal locations', () => {
    const state = createInitialState();
    const prompt = storyProtocolForTurn(state, '我想了解法律上的诉讼与律师资格');
    expect(prompt).toBe(STORY_PROTOCOL);
  });
});
