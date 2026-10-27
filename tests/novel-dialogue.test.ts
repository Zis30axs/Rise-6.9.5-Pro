import { describe, expect, it } from 'vitest';
import { parseNovelDialogue, readableNovelText } from '../src/frontend/novel-dialogue';
import { storyDisplayText } from '../src/frontend/story-text';
import { resolveWatanareExpressionPortrait, resolveWatanareSpeaker } from '../src/frontend/watanare-art';

describe('novel click-through dialogue metadata', () => {
  it('parses traditional Renako |emotion|speech without leaking metadata to dialogue', () => {
    const raw = [
      '游戏的声音从耳机里传出来。',
      '甘織玲奈子|生气|“因为这个战争雷霆真的太让人火大了，不管怎么玩都是这种莫名其妙的结局。”',
      '|素世|开心|下次再试试吧。',
      '甘织玲奈子|安心|好吧，再来一次。|',
    ].join('\n');
    expect(parseNovelDialogue(raw)).toEqual([
      { speaker: '', emotion: '平静', text: '游戏的声音从耳机里传出来。' },
      { speaker: '甘織玲奈子', emotion: '生气', text: '“因为这个战争雷霆真的太让人火大了，不管怎么玩都是这种莫名其妙的结局。”' },
      { speaker: '素世', emotion: '开心', text: '下次再试试吧。' },
      { speaker: '甘织玲奈子', emotion: '安心', text: '好吧，再来一次。' },
    ]);
    expect(readableNovelText(raw)).not.toContain('|生气|');
  });
  it('maps simplified and traditional Renako to the same real angry sprite', () => {
    for (const name of ['甘织玲奈子', '甘織玲奈子', '玲奈子']) {
      expect(resolveWatanareSpeaker(name)).toBe('watanare-renako');
      const result = resolveWatanareExpressionPortrait(name, 'angry');
      expect(result).toMatchObject({ personId: 'watanare-renako', exact: true, width: 1024, height: 1536 });
      expect(result?.src).toBeTruthy();
    }
  });
  it('preserves full wrapped rows and drops protocol header', () => {
    expect(parseNovelDialogue('风吹过。\n|charac|emot|says| |素世|开心|好天气。|\n|玲奈子|生气|真让人火大。|')).toEqual([
      { speaker: '', emotion: '平静', text: '风吹过。' },
      { speaker: '素世', emotion: '开心', text: '好天气。' },
      { speaker: '玲奈子', emotion: '生气', text: '真让人火大。' },
    ]);
  });
  it('never interprets arbitrary pipe-delimited prose as a character instruction', () => {
    expect(parseNovelDialogue('这是一段|没有情绪|不构成台词')).toEqual([
      { speaker: '', emotion: '平静', text: '这是一段|没有情绪|不构成台词' },
    ]);
  });
  it('keeps malformed rows as visible prose rather than deleting content', () => {
    expect(parseNovelDialogue('旧正文。\n|素世|不完整')).toEqual([
      { speaker: '', emotion: '平静', text: '旧正文。' },
      { speaker: '', emotion: '平静', text: '|素世|不完整' },
    ]);
  });
  it('does not turn the previous character speech into narration when old tts metadata follows it', () => {
    const raw = '|素世|开心|“早上好。”|<tts>素世|开心|早上好。</tts>';
    expect(storyDisplayText(raw)).toBe('|素世|开心|“早上好。”|');
    expect(parseNovelDialogue(storyDisplayText(raw))).toEqual([
      { speaker: '素世', emotion: '开心', text: '“早上好。”' },
    ]);
  });

  it('hides only exact narrator echoes of an immediately preceding line', () => {
    const raw = [
      '|素世|开心|“好久不见！”|',
      '|旁白|平静|好久不见！|',
      '旁白：『好久不见！』',
      '她轻轻招了招手。',
      '|祥子|平静|好久不见！|',
      '“好久不见！”她说完便看向一旁。',
    ].join('\n');
    expect(parseNovelDialogue(raw)).toEqual([
      { speaker: '素世', emotion: '开心', text: '“好久不见！”' },
      { speaker: '', emotion: '平静', text: '她轻轻招了招手。' },
      { speaker: '祥子', emotion: '平静', text: '好久不见！' },
      { speaker: '', emotion: '平静', text: '“好久不见！”她说完便看向一旁。' },
    ]);
  });

  it('keeps adjacent story prose when it is not an exact echo', () => {
    expect(parseNovelDialogue('|素世|平静|早上好。|\n她微笑着说：“早上好。”')).toEqual([
      { speaker: '素世', emotion: '平静', text: '早上好。' },
      { speaker: '', emotion: '平静', text: '她微笑着说：“早上好。”' },
    ]);
  });

  it('treats expression text and HTML payloads as inert data', () => {
    const raw = '|素世|javascript:alert(1)|<img src=x onerror=alert(1)>|';
    expect(parseNovelDialogue(raw)[0]).toEqual({ speaker: '素世', emotion: 'javascript:alert(1)', text: '<img src=x onerror=alert(1)>' });
  });
});
