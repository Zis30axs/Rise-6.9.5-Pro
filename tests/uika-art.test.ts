import { describe, expect, it } from 'vitest';
import { isUikaSpeaker, resolveUikaExpressionPortrait } from '../src/frontend/uika-art';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { resolveSceneCharacterArt } from '../src/frontend/scene-character-assets';

describe('三角初华 casual art', () => {
  const portrait = (emotion: string) => resolveUikaExpressionPortrait('三角初华', emotion);

  it('recognizes her names and leaves other speakers alone', () => {
    expect(isUikaSpeaker('三角初华')).toBe(true);
    expect(isUikaSpeaker('初华')).toBe(true);
    expect(isUikaSpeaker('三角初音')).toBe(true);
    expect(isUikaSpeaker('Uika')).toBe(true);
    expect(isUikaSpeaker('bang-uika')).toBe(true);
    expect(isUikaSpeaker('Doloris')).toBe(true);
    expect(isUikaSpeaker('椎名立希')).toBe(false);
    expect(isUikaSpeaker('丰川祥子')).toBe(false);
  });

  it('maps the five casual poses onto the story emotions', () => {
    for (const emotion of ['平静', '思考', '安心', '害羞', '开心'] as const) {
      const art = portrait(emotion)!;
      expect(art.exact).toBe(true);
      expect(art.personId).toBe('bang-uika');
      expect(art.src.startsWith('data:image/webp;base64,')).toBe(true);
      expect(art.width).toBe(768);
      expect(art.height).toBe(1344);
    }
    const sources = ['平静', '思考', '安心', '害羞', '开心'].map(emotion => portrait(emotion)!.src);
    expect(new Set(sources).size).toBe(5);
    expect(portrait('自信')!.src).toBe(portrait('安心')!.src);
    expect(portrait('温和微笑')!.src).toBe(portrait('思考')!.src);
    expect(portrait('生气')!.exact).toBe(false);
    expect(portrait('生气')!.src).toBe(portrait('平静')!.src);
    expect(portrait('严肃')!.src).toBe(portrait('平静')!.src);
    expect(portrait('难过')!.src).toBe(portrait('害羞')!.src);
    expect(portrait('惊讶')!.src).toBe(portrait('开心')!.src);
  });

  it('shows the casual set in the novel scene and on the map', () => {
    expect(resolveSceneCharacterArt('三角初华', '开心')).toMatchObject({
      id: 'uika_casual_happy', pose: 'happy', outfit: 'casual', anchor: [384, 1280],
    });
    expect(resolveSceneCharacterArt('初华', '害羞')?.id).toBe('uika_casual_shy');
    expect(resolveSceneCharacterArt('bang-uika', '思考')?.id).toBe('uika_casual_reserved');
    expect(resolveSceneCharacterArt('三角初华', '安心')?.id).toBe('uika_casual_confident');
    expect(resolveSceneCharacterArt('丰川祥子')).toBeNull();
    expect(resolveMapCharacterAvatar({ name: '三角初华', personId: 'bang-uika' })).toEqual({
      kind: 'sprite', src: portrait('平静')!.src,
    });
  });
});
