import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTER_SPEECH_FINAL_CHECK, MANDATORY_CHARACTER_SPEECH_RULE, STORY_PROTOCOL } from '../src/runtime/bridge';

describe('mandatory visual novel speaker and emotion tags', () => {
  it('makes complete |speaker|emotion|text| rows mandatory, not just for face-to-face dialogue', () => {
    expect(STORY_PROTOCOL).toContain(MANDATORY_CHARACTER_SPEECH_RULE);
    for (const requirement of [
      '|说话人姓名或现有称呼|情绪|台词|',
      '开头与结尾的竖线',
      '不允许出现未带标签的直接对白',
      '所有主角（包括甘织玲奈子）',
      'NPC、陌生人、路人',
      '插话、打断',
      '多人连续交流',
      '电话语音',
      '回忆/梦境/想象',
      '事件、行动、转场',
      '每一位说话人更换时另起完整标签行',
    ]) expect(MANDATORY_CHARACTER_SPEECH_RULE).toContain(requirement);
  });

  it('bans natural-language quoted speech without a row and selects a valid emotion', () => {
    for (const requirement of [
      '角色名：台词',
      '单独引号',
      '情绪必须从平静、开心、难过、生气、惊讶、害羞、思考、严肃、安心中选择',
      '无法判断时用平静',
      '动作和语气描述写为独立旁白',
      '逐句检查 <story>',
      '若存在一条无标签的对白，就先补全再提交',
    ]) expect(MANDATORY_CHARACTER_SPEECH_RULE + CHARACTER_SPEECH_FINAL_CHECK).toContain(requirement);
  });

  it('preserves narration, context and independent phone-message transport', () => {
    expect(MANDATORY_CHARACTER_SPEECH_RULE).toContain('间接转述和非逐字内心活动仍写旁白');
    expect(MANDATORY_CHARACTER_SPEECH_RULE).toContain('不表示该人物现在到场或得知新事实');
    expect(MANDATORY_CHARACTER_SPEECH_RULE).toContain('phone_messages');
    expect(MANDATORY_CHARACTER_SPEECH_RULE).toContain('不能给消息 JSON 字段添加竖线标签');
    expect(MANDATORY_CHARACTER_SPEECH_RULE).toContain('不得替玩家编造未表达的新话');
  });

  it('injects final self-check after all story and event requirements, but not in phone-only tasks', () => {
    const bridge = readFileSync(new URL('../src/runtime/bridge.ts', import.meta.url), 'utf8');
    expect(bridge).toContain('const combinedSystemPrompt =');
    expect(bridge).toContain('const systemPrompt = options?.kind');
    expect(bridge).toContain('STORY_PROTOCOL');
    expect(bridge).toContain('CHARACTER_SPEECH_FINAL_CHECK');
    expect(bridge).toContain('in_chat');
    expect(bridge).toContain('requestStoryFromCustomApi(storyApi, prompt, combinedSystemPrompt');
    expect(bridge).toContain("options?.kind === 'phone_reply' ? PHONE_REPLY_PROTOCOL");
    expect(bridge).toContain("options?.kind === 'npc_phone_reply' ? NPC_PHONE_REPLY_PROTOCOL");
    expect(bridge).toContain("options?.kind === 'interaction_event' ?");
  });
});
