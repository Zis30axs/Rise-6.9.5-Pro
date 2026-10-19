import { describe, expect, it } from 'vitest';
import { novelNpcEmotions, resolveNovelNpcEmotion } from '../src/frontend/novel-npc-emotions';

const expectedEmotions = [
  ['平静', 'neutral'],
  ['开心', 'happy'],
  ['难过', 'sad'],
  ['生气', 'angry'],
  ['惊讶', 'surprised'],
  ['害羞', 'shy'],
  ['思考', 'thinking'],
  ['严肃', 'serious'],
  ['安心', 'relieved'],
] as const;

describe('novel NPC emotion whitelist', () => {
  it.each(expectedEmotions)('maps the complete emotion %s to %s', (input, expected) => {
    expect(resolveNovelNpcEmotion(input)).toBe(expected);
    expect(resolveNovelNpcEmotion(` \t${input}\n `)).toBe(expected);
  });

  it('falls back for aliases, partial labels, prototype keys and resource addresses', () => {
    for (const input of [
      '', '  ', '高兴', 'happy', 'Happy', '开心地', '很难过', '开 心', '开心/难过',
      '__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty',
      'https://example.com/happy.png', '//example.com/happy.png',
      'data:image/svg+xml,<svg/>', '../happy.png', '<img src=x>',
    ]) {
      expect(resolveNovelNpcEmotion(input), input).toBe('neutral');
    }
  });

  it('does not retain an earlier expression when the following value is unknown', () => {
    const inputs = ['开心', 'unknown', '难过', '', '安心', 'constructor', '生气', '平静'];
    const expected = ['happy', 'neutral', 'sad', 'neutral', 'relieved', 'neutral', 'angry', 'neutral'];
    expect(inputs.map(resolveNovelNpcEmotion)).toEqual(expected);
    expect([...inputs].reverse().map(resolveNovelNpcEmotion)).toEqual([...expected].reverse());
    expect(inputs.map(resolveNovelNpcEmotion)).toEqual(expected);
  });

  it('keeps the exported whitelist immutable and unchanged by resolution', () => {
    const before = JSON.stringify(novelNpcEmotions);
    expect(Object.isFrozen(novelNpcEmotions)).toBe(true);
    expect(Reflect.set(novelNpcEmotions, '开心', 'https://example.com/other.png')).toBe(false);
    expect(Reflect.set(novelNpcEmotions, '未知', 'happy')).toBe(false);
    expect(Reflect.deleteProperty(novelNpcEmotions, '平静')).toBe(false);
    for (const [input] of expectedEmotions) resolveNovelNpcEmotion(input);
    expect(JSON.stringify(novelNpcEmotions)).toBe(before);
    expect(resolveNovelNpcEmotion('开心')).toBe('happy');
    expect(resolveNovelNpcEmotion('未知')).toBe('neutral');
  });
});
