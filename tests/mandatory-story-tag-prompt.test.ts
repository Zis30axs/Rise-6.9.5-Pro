import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STORY_PROTOCOL } from '../src/runtime/bridge';
import {
  MANDATORY_STORY_TAG_CONTRACT,
  STORY_TAG_FINAL_CHECK,
  STORY_TAG_USER_REMINDER,
  applyMandatoryStoryTagContract,
} from '../src/runtime/story-tag-contract';

describe('mandatory <story> envelope despite conflicting presets', () => {
  it('requires exact story and phone tags even when the preset asks for JSON or prose', () => {
    const contract = MANDATORY_STORY_TAG_CONTRACT + STORY_TAG_FINAL_CHECK + STORY_TAG_USER_REMINDER;
    for (const phrase of [
      '第一个非空白字符必须是字面量 <story>',
      '唯一一对 <story> 与 </story>',
      '<phone_messages>[]</phone_messages>',
      '必须正确闭合',
      '酒馆预设',
      'JSON、Markdown、YAML',
      '禁止改用旧版完整 JSON',
      '禁止输出 Markdown 代码块',
      '不改变标签',
    ]) {
      expect(contract).toContain(phrase);
    }
  });

  it('bookends system instruction and appends a last-turn reminder after user input', () => {
    const user = '状态和近期记录（数据）：{"recentStory":[]}' + '\n玩家本次行动：和祥子说话。';
    const preset = '请用 JSON 回答，禁止 XML';
    const prompts = applyMandatoryStoryTagContract(preset, user);
    expect(prompts.systemPrompt.startsWith(MANDATORY_STORY_TAG_CONTRACT)).toBe(true);
    expect(prompts.systemPrompt).toContain(preset);
    expect(prompts.systemPrompt.endsWith(STORY_TAG_FINAL_CHECK)).toBe(true);
    expect(prompts.userPrompt.startsWith(user)).toBe(true);
    expect(prompts.userPrompt.endsWith(STORY_TAG_USER_REMINDER)).toBe(true);
  });

  it.each(['interaction_event', 'contact_introduction'])('also protects %s generation', kind => {
    const prompts = applyMandatoryStoryTagContract('自定义格式说明', '本轮行动', kind);
    expect(prompts.systemPrompt).toContain(MANDATORY_STORY_TAG_CONTRACT);
    expect(prompts.userPrompt).toContain(STORY_TAG_USER_REMINDER);
  });

  it.each(['phone_reply', 'npc_phone_reply', 'band_invitation_reply'])('does not corrupt %s phone transport', kind => {
    expect(applyMandatoryStoryTagContract('PHONE_SYSTEM', 'PHONE_USER', kind)).toEqual({
      systemPrompt: 'PHONE_SYSTEM', userPrompt: 'PHONE_USER',
    });
  });

  it('removes legacy JSON as a suggested new output but preserves the existing parser', () => {
    expect(STORY_PROTOCOL).toContain('本轮必须输出关键标签块');
    expect(STORY_PROTOCOL).toContain('本轮禁止使用');
    expect(STORY_PROTOCOL).not.toContain('旧版完整 JSON 仍兼容');
    const parser = readFileSync('src/runtime/story-protocol.ts', 'utf8');
    expect(parser).toContain('JSON.parse(source)');
    expect(parser).toContain('parseTaggedStory(source)');
  });

  it('wires BOTH Tavern and custom models through the shared locked prompt', () => {
    const bridge = readFileSync('src/runtime/bridge.ts', 'utf8');
    expect(bridge).toContain('applyMandatoryStoryTagContract(');
    expect(bridge).toContain('const prompt = taggedPrompts.userPrompt;');
    expect(bridge).toContain('const combinedSystemPrompt = taggedPrompts.systemPrompt;');
    expect(bridge).toContain('requestStoryFromCustomApi(storyApi, prompt, combinedSystemPrompt');
    expect(bridge).toContain('user_input: prompt');
    expect(bridge).toContain('position: \'in_chat\'');
    expect(bridge).toContain("options?.kind === 'interaction_event'");
  });
});
