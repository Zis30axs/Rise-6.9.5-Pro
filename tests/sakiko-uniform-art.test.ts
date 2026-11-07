import { describe, expect, it } from 'vitest';
import { resolveSakikoOutfit, selectSakikoSprite } from '../src/frontend/sakiko-art-policy';
import { resolveSakikoUniformPortrait } from '../src/frontend/sakiko-uniform-art';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';

describe('丰川祥子 Haneoka uniform', () => {
  const portrait = (emotion: string) => resolveSakikoUniformPortrait(emotion);

  it('uses a distinct supplied pose for each of the nine pictures', () => {
    const labeled = ['平静', '开心', '微笑', '生气', '自信', '惊讶', '思考', '兴奋', '难过'] as const;
    for (const emotion of labeled) {
      const art = portrait(emotion);
      expect(art.exact).toBe(true);
      expect(art.outfit).toBe('uniform');
      expect(art.src.startsWith('data:image/webp;base64,')).toBe(true);
      expect(art.width).toBe(768);
      expect(art.height).toBe(1344);
    }
    expect(new Set(labeled.map(emotion => portrait(emotion).src)).size).toBe(9);
    expect(portrait('打招呼').src).toBe(portrait('开心').src);
    expect(portrait('害羞').src).toBe(portrait('微笑').src);
    expect(portrait('严肃').src).toBe(portrait('生气').src);
    expect(portrait('不满').src).toBe(portrait('生气').src);
    expect(portrait('安心').src).toBe(portrait('自信').src);
    expect(portrait('慌张').src).toBe(portrait('惊讶').src);
    expect(portrait('打量').src).toBe(portrait('思考').src);
    expect(portrait('开朗').src).toBe(portrait('兴奋').src);
    expect(portrait('不安').src).toBe(portrait('难过').src);
    expect(portrait('默认').id).toBe('sakiko_uniform_neutral');
  });

  it('replaces the default casual standing art and keeps the mansion outfit', () => {
    expect(resolveSakikoOutfit('auto', 'park')).toBe('casual');
    expect(resolveSakikoOutfit('auto', 'toyokawa-house')).toBe('home');
    expect(selectSakikoSprite({ speaker: '丰川祥子', expression: 'smile', locationId: 'toyokawa-salon' })?.id)
      .toBe('sakiko_home_smile');
    expect(resolveMapCharacterAvatar({ name: '丰川祥子', protagonistId: 'sakiko' }, true)).toEqual({
      kind: 'sprite', src: portrait('平静').src,
    });
  });
});
