import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STORY_PROTOCOL } from '../src/runtime/bridge';
import {
  MANDATORY_STORY_TAG_CONTRACT,
  MANDATORY_STORY_CHINESE_RULE,
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

  it('forces simplified Chinese for narration, dialogue, speaker names and remembered text', () => {
    const rule = MANDATORY_STORY_CHINESE_RULE;
    for (const phrase of [
      '【最高优先级·强制简体中文标签】',
      '<story>...</story> 内全部自然语言必须使用简体中文',
      '小说旁白',
      '人物直接对白',
      '内心独白',
      '说话人标签',
      '英语、日语、韩语、罗马音、拼音',
      '酒馆预设、世界书、玩家输入或上一轮原文',
      '唯一外语例外',
      '名称不算专有名词例外',
      '人物姓名、角色名',
      '地名、店名、学校名',
      '乐队及团体名、作品标题',
      '长崎素世、丰川祥子、樱羽艾玛、甘织玲奈子',
      '原名只有外文且无已知中文译名时',
      '翻译括注或中外双语对照',
      '机器 ID、枚举值',
    ]) expect(rule).toContain(phrase);
  });

  it('includes Chinese language guard in BOTH system bookends and final user reminder', () => {
    const prompts = applyMandatoryStoryTagContract('请用日语写角色台词', '玩家本次行动：观察夜景', 'interaction_event');
    expect(prompts.systemPrompt.startsWith(MANDATORY_STORY_TAG_CONTRACT)).toBe(true);
    expect(MANDATORY_STORY_TAG_CONTRACT).toContain(MANDATORY_STORY_CHINESE_RULE);
    expect(prompts.systemPrompt).toContain('请用日语写角色台词');
    expect(prompts.systemPrompt.endsWith(STORY_TAG_FINAL_CHECK)).toBe(true);
    expect(STORY_TAG_FINAL_CHECK).toContain('最后逐句检查 <story> 内所有旁白、对白、姓名和称呼均为简体中文');
    expect(prompts.userPrompt.endsWith(STORY_TAG_USER_REMINDER)).toBe(true);
    expect(STORY_TAG_USER_REMINDER).toContain('姓名、地名、作品名等名称不能保留外文');
  });

  it('keeps program tags, structured IDs and phone-only reply formats unchanged', () => {
    expect(MANDATORY_STORY_CHINESE_RULE).toContain('不能翻译');
    expect(MANDATORY_STORY_CHINESE_RULE).toContain('不更改 phone_messages、world_actions');
    expect(MANDATORY_STORY_CHINESE_RULE).toContain('不要新增 <language>');
    for (const kind of ['phone_reply', 'npc_phone_reply', 'band_invitation_reply']) {
      expect(applyMandatoryStoryTagContract('SYSTEM', 'USER', kind))
        .toEqual({ systemPrompt: 'SYSTEM', userPrompt: 'USER' });
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
