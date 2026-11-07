import { describe, expect, it } from 'vitest';
import { isUmiriSpeaker, resolveUmiriExpressionPortrait } from '../src/frontend/umiri-art';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { resolveSceneCharacterArt } from '../src/frontend/scene-character-assets';

describe('八幡海铃 casual art', () => {
  const portrait = (emotion: string) => resolveUmiriExpressionPortrait('八幡海铃', emotion);

  it('recognizes her names and leaves other speakers alone', () => {
    expect(isUmiriSpeaker('八幡海铃')).toBe(true);
    expect(isUmiriSpeaker('海铃')).toBe(true);
    expect(isUmiriSpeaker('Umiri')).toBe(true);
    expect(isUmiriSpeaker('bang-umiri')).toBe(true);
    expect(isUmiriSpeaker('Timoris')).toBe(true);
    expect(isUmiriSpeaker('三角初华')).toBe(false);
    expect(isUmiriSpeaker('椎名立希')).toBe(false);
  });

  it('maps the five casual poses onto the story emotions', () => {
    for (const emotion of ['平静', '开心', '思考', '安心', '严肃'] as const) {
      const art = portrait(emotion)!;
      expect(art.exact).toBe(true);
      expect(art.personId).toBe('bang-umiri');
      expect(art.src.startsWith('data:image/webp;base64,')).toBe(true);
      expect(art.width).toBe(768);
      expect(art.height).toBe(1344);
    }
    const sources = ['平静', '开心', '思考', '安心', '严肃'].map(emotion => portrait(emotion)!.src);
    expect(new Set(sources).size).toBe(5);
    expect(portrait('开朗')!.src).toBe(portrait('开心')!.src);
    expect(portrait('微笑')!.src).toBe(portrait('安心')!.src);
    expect(portrait('冷静')!.src).toBe(portrait('思考')!.src);
    expect(portrait('不满')!.src).toBe(portrait('严肃')!.src);
    expect(portrait('生气')!.exact).toBe(true);
    expect(portrait('生气')!.src).toBe(portrait('严肃')!.src);
    expect(portrait('难过')!.exact).toBe(false);
    expect(portrait('难过')!.src).toBe(portrait('严肃')!.src);
    expect(portrait('害羞')!.src).toBe(portrait('安心')!.src);
    expect(portrait('惊讶')!.exact).toBe(false);
    expect(portrait('惊讶')!.src).toBe(portrait('平静')!.src);
  });

  it('shows the casual set in the novel scene and on the map', () => {
    expect(resolveSceneCharacterArt('八幡海铃', '开心')).toMatchObject({
      id: 'umiri_casual_happy', pose: 'happy', outfit: 'casual', anchor: [384, 1280],
    });
    expect(resolveSceneCharacterArt('海铃', '思考')?.id).toBe('umiri_casual_aside');
    expect(resolveSceneCharacterArt('bang-umiri', '安心')?.id).toBe('umiri_casual_smile');
    expect(resolveSceneCharacterArt('八幡海铃', '严肃')?.id).toBe('umiri_casual_serious');
    expect(resolveSceneCharacterArt('八幡海铃')?.id).toBe('umiri_casual_neutral');
    expect(resolveSceneCharacterArt('三角初华', '开心')?.id).toBe('uika_casual_happy');
    expect(resolveSceneCharacterArt('丰川祥子')).toBeNull();
    const person = { name: '八幡海铃', personId: 'bang-umiri' };
    expect(resolveMapCharacterAvatar(person)?.kind).toBe('headshot');
    expect(resolveMapCharacterAvatar(person, true)).toEqual({
      kind: 'sprite', src: portrait('平静')!.src,
    });
  });
});
