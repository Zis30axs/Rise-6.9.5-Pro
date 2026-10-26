import { describe, expect, it } from 'vitest';
import { isUnidentifiedNovelSpeaker, novelPortraitFocus } from '../src/frontend/novel-portrait-focus';

const recognized = (speaker: string) => ['甘织玲奈子', '樱羽艾玛', '素世'].includes(speaker);
const beats = [
  { speaker: '甘织玲奈子', emotion: '开心', text: '早上好。' },
  { speaker: '群众', emotion: '生气', text: '那是什么？' },
  { speaker: '观众', emotion: '惊讶', text: '哇！' },
  { speaker: '樱羽艾玛', emotion: '害羞', text: '你好。' },
  { speaker: '未知声音', emotion: '严肃', text: '有人吗？' },
  { speaker: '素世', emotion: '安心', text: '没事。' },
];

describe('crowd dialogue portrait hold', () => {
  it('recognizes anonymous labels without creating visual identities', () => {
    for (const name of ['群众', '路人', '观众们', '陌生人', '人群里的声音', '路人甲', '未知声音']) {
      expect(isUnidentifiedNovelSpeaker(name)).toBe(true);
    }
    expect(isUnidentifiedNovelSpeaker('甘织玲奈子')).toBe(false);
  });
  it('keeps last actual sprite and its emotion, dimmed, while crowd speaks', () => {
    expect(novelPortraitFocus(beats, 1, '素世', recognized)).toEqual({ speaker: '甘织玲奈子', emotion: '开心', dimmed: true });
    expect(novelPortraitFocus(beats, 2, '素世', recognized)).toEqual({ speaker: '甘织玲奈子', emotion: '开心', dimmed: true });
    expect(novelPortraitFocus(beats, 4, '素世', recognized)).toEqual({ speaker: '樱羽艾玛', emotion: '害羞', dimmed: true });
  });
  it('restores normal brightness for recognized speakers and supports rewind', () => {
    expect(novelPortraitFocus(beats, 3, '素世', recognized)).toEqual({ speaker: '樱羽艾玛', emotion: '害羞', dimmed: false });
    expect(novelPortraitFocus(beats, 5, '素世', recognized)).toEqual({ speaker: '素世', emotion: '安心', dimmed: false });
    expect(novelPortraitFocus(beats, 1, '素世', recognized).speaker).toBe('甘织玲奈子');
  });
  it('uses a dimmed protagonist when the first line is unidentified', () => {
    expect(novelPortraitFocus([{ speaker: '群众', emotion: '惊讶', text: '啊？' }], 0, '素世', recognized))
      .toEqual({ speaker: '素世', emotion: '平静', dimmed: true });
  });
  it('does not invent a portrait for unknown named speakers', () => {
    expect(novelPortraitFocus([{ speaker: '素世', emotion: '开心', text: '好。' }, { speaker: '不在目录的人', emotion: '平静', text: '嗯。' }], 1, '素世', recognized))
      .toEqual({ speaker: '素世', emotion: '开心', dimmed: true });
  });
});
