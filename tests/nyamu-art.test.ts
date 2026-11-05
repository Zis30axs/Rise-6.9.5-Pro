import { describe, expect, it } from 'vitest';
import { isNyamuSpeaker, resolveNyamuExpressionPortrait } from '../src/frontend/nyamu-art';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { resolveSceneCharacterArt } from '../src/frontend/scene-character-assets';

describe('祐天寺若麦 casual art', () => {
  const portrait = (emotion: string) => resolveNyamuExpressionPortrait('祐天寺若麦', emotion);

  it('recognizes her names and leaves other speakers alone', () => {
    expect(isNyamuSpeaker('祐天寺若麦')).toBe(true);
    expect(isNyamuSpeaker('若麦')).toBe(true);
    expect(isNyamuSpeaker('喵梦')).toBe(true);
    expect(isNyamuSpeaker('Nyamu')).toBe(true);
    expect(isNyamuSpeaker('bang-nyamu')).toBe(true);
    expect(isNyamuSpeaker('Amoris')).toBe(true);
    expect(isNyamuSpeaker('八幡海铃')).toBe(false);
    expect(isNyamuSpeaker('三角初华')).toBe(false);
  });

  it('maps the five casual poses onto the story emotions', () => {
    for (const emotion of ['平静', '开心', '思考', '安心'] as const) {
      const art = portrait(emotion)!;
      expect(art.exact).toBe(true);
      expect(art.personId).toBe('bang-nyamu');
      expect(art.src.startsWith('data:image/webp;base64,')).toBe(true);
      expect(art.width).toBe(768);
      expect(art.height).toBe(1344);
    }
    const sources = ['平静', '开心', '思考', '安心', '惊讶'].map(emotion => portrait(emotion)!.src);
    expect(new Set(sources).size).toBe(5);
    expect(portrait('俏皮')!.src).toBe(portrait('开心')!.src);
    expect(portrait('坏笑')!.src).toBe(portrait('安心')!.src);
    expect(portrait('自信')!.src).toBe(portrait('安心')!.src);
    expect(portrait('打招呼')!.src).toBe(portrait('惊讶')!.src);
    expect(portrait('兴奋')!.src).toBe(portrait('惊讶')!.src);
    expect(portrait('打量')!.src).toBe(portrait('思考')!.src);
    expect(portrait('严肃')!.exact).toBe(false);
    expect(portrait('严肃')!.src).toBe(portrait('安心')!.src);
    expect(portrait('生气')!.src).toBe(portrait('安心')!.src);
    expect(portrait('害羞')!.exact).toBe(false);
    expect(portrait('害羞')!.src).toBe(portrait('平静')!.src);
    expect(portrait('难过')!.src).toBe(portrait('平静')!.src);
    expect(portrait('惊讶')!.exact).toBe(false);
  });

  it('shows the casual set in the novel scene and on the map', () => {
    expect(resolveSceneCharacterArt('祐天寺若麦', '开心')).toMatchObject({
      id: 'nyamu_casual_happy', pose: 'happy', outfit: 'casual', anchor: [384, 1280],
    });
    expect(resolveSceneCharacterArt('喵梦', '思考')?.id).toBe('nyamu_casual_thinking');
    expect(resolveSceneCharacterArt('若麦', '安心')?.id).toBe('nyamu_casual_smirk');
    expect(resolveSceneCharacterArt('bang-nyamu', '惊讶')?.id).toBe('nyamu_casual_wave');
    expect(resolveSceneCharacterArt('祐天寺若麦')?.id).toBe('nyamu_casual_neutral');
    expect(resolveSceneCharacterArt('八幡海铃', '开心')?.id).toBe('umiri_casual_happy');
    expect(resolveSceneCharacterArt('丰川祥子')).toBeNull();
    expect(resolveMapCharacterAvatar({ name: '祐天寺若麦', personId: 'bang-nyamu' })).toEqual({
      kind: 'sprite', src: portrait('平静')!.src,
    });
  });
});
