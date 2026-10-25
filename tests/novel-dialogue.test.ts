import { describe, expect, it } from 'vitest';
import { parseNovelDialogue, readableNovelText } from '../src/frontend/novel-dialogue';

describe('novel dialogue rows', () => {
  it('preserves mixed narration and adjacent dialogue, ignoring the requested header', () => {
    expect(parseNovelDialogue('风穿过街道。\n|charac|emot|says| |素世|开心|今天天气真好|\n|林同学|平静|一起走吧。|')).toEqual([
      { speaker: '', emotion: '平静', text: '风穿过街道。' },
      { speaker: '素世', emotion: '开心', text: '今天天气真好' },
      { speaker: '林同学', emotion: '平静', text: '一起走吧。' },
    ]);
  });
  it('parses the reported Renako line without leaking metadata into the text', () => {
    const raw = '游戏声透过耳机。\n甘織玲奈子|生气|“因为这个战争雷霆真的太让人火大了，不管怎么玩都是这种莫名其妙的结局。”\n|素世|开心|别生气。\n素世|安心|一起再试一次吧。|';
    expect(parseNovelDialogue(raw)).toEqual([
      { speaker: '', emotion: '平静', text: '游戏声透过耳机。' },
      { speaker: '甘織玲奈子', emotion: '生气', text: '“因为这个战争雷霆真的太让人火大了，不管怎么玩都是这种莫名其妙的结局。”' },
      { speaker: '素世', emotion: '开心', text: '别生气。' },
      { speaker: '素世', emotion: '安心', text: '一起再试一次吧。' },
    ]);
    expect(readableNovelText(raw)).not.toContain('|生气|');
  });
  it('preserves incidental pipe-separated narration instead of guessing a portrait', () => {
    expect(parseNovelDialogue('这只是选项A|并非情绪|不能当成对白。')).toEqual([
      { speaker: '', emotion: '平静', text: '这只是选项A|并非情绪|不能当成对白。' },
    ]);
  });
  it('keeps old plain stories and malformed rows without dropping dialogue', () => {
    expect(parseNovelDialogue('旧正文。\n\n|素世|不完整')).toEqual([
      { speaker: '', emotion: '平静', text: '旧正文。' },
      { speaker: '', emotion: '平静', text: '|素世|不完整' },
    ]);
  });
  it('treats markup and unknown emotion as inert text instead of executable instructions', () => {
    const text = '|素世|javascript:alert(1)|<img src=x onerror=alert(1)>|';
    expect(parseNovelDialogue(text)[0].text).toBe('<img src=x onerror=alert(1)>');
    expect(readableNovelText(text)).toBe('素世：<img src=x onerror=alert(1)>');
  });
});
