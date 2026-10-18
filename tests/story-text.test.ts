import { describe, expect, it } from 'vitest';
import { storyDisplayText } from '../src/frontend/story-text';

describe('story display voice metadata', () => {
  it('removes only immediately repeated voice lines after plain or quoted dialogue', () => {
    for (const dialogue of ['你好，你也是刚下课吗？', '“你好，你也是刚下课吗？”', '「你好，你也是刚下课吗？」', '"你好，你也是刚下课吗？"']) {
      const original = `${dialogue}<tts>沈景行|friendly|你好，你也是刚下课吗？</tts>`;
      expect(storyDisplayText(original)).toBe(dialogue);
    }
    expect(storyDisplayText('“你好。” <tts>沈景行|friendly|你好。</tts><tts>沈景行|friendly|你好。</tts>')).toBe('“你好。” ');
  });

  it('keeps dialogue that exists only in voice metadata, including literal separators in the line', () => {
    expect(storyDisplayText('他停下脚步。<tts>沈景行|friendly|你好，要一起去图书馆吗？</tts>')).toBe('他停下脚步。你好，要一起去图书馆吗？');
    expect(storyDisplayText('<tts>店员|neutral|左边是 A|B 书架。</tts>')).toBe('左边是 A|B 书架。');
  });

  it('preserves ordinary text and unknown or malformed tags for Vue to escape', () => {
    for (const original of ['雨停了，路边仍然很安静。', '<aside>一张字条</aside>', '<script>alert(1)</script>', '<tts voice="a">王明|happy|你好</tts>', '<tts>没有语音字段</tts>', '<tts>王明||你好</tts>']) {
      expect(storyDisplayText(original)).toBe(original);
    }
  });

  it('keeps a repeated sentence when narration separates it from an earlier line', () => {
    expect(storyDisplayText('“你好。”他看了一眼站牌。<tts>沈景行|friendly|你好。</tts>')).toBe('“你好。”他看了一眼站牌。你好。');
  });
});
