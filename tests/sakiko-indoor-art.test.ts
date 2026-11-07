import { describe, expect, it } from 'vitest';
import { resolveSakikoOutfit } from '../src/frontend/sakiko-art-policy';
import { resolveSakikoIndoorPortrait } from '../src/frontend/sakiko-indoor-art';
import { resolveSakikoUniformPortrait } from '../src/frontend/sakiko-uniform-art';
import { resolveProtagonistPhonePose } from '../src/frontend/protagonist-phone-art';

describe('丰川祥子 indoor clothes', () => {
  const indoor = (emotion: string) => resolveSakikoIndoorPortrait(emotion);
  const uniform = (emotion: string) => resolveSakikoUniformPortrait(emotion);

  it('wears the new private clothes only in the Toyokawa house and salon', () => {
    expect(resolveSakikoOutfit('auto', 'toyokawa-house')).toBe('home');
    expect(resolveSakikoOutfit('auto', 'toyokawa-salon')).toBe('home');
    expect(resolveSakikoOutfit('auto', 'downtown')).toBe('casual');
    expect(resolveSakikoOutfit('auto', 'park')).toBe('casual');
    expect(resolveSakikoOutfit('home', 'park')).toBe('home');
    expect(indoor('平静').src).not.toBe(uniform('平静').src);
    expect(indoor('平静').outfit).toBe('home');
    expect(uniform('平静').outfit).toBe('uniform');
  });

  it('maps the five indoor poses and falls back when a face is missing', () => {
    for (const emotion of ['平静', '开心', '自信', '思考', '害羞'] as const) {
      const art = indoor(emotion);
      expect(art.exact).toBe(true);
      expect(art.src.startsWith('data:image/webp;base64,')).toBe(true);
      expect(art.width).toBe(768);
      expect(art.height).toBe(1344);
    }
    expect(new Set(['平静', '开心', '自信', '思考', '害羞'].map(emotion => indoor(emotion).src)).size).toBe(5);
    expect(indoor('打招呼').src).toBe(indoor('开心').src);
    expect(indoor('微笑').src).toBe(indoor('思考').src);
    expect(indoor('安心').src).toBe(indoor('自信').src);
    expect(indoor('不安').src).toBe(indoor('害羞').src);
    expect(indoor('难过').exact).toBe(false);
    expect(indoor('难过').src).toBe(indoor('害羞').src);
    expect(indoor('生气').exact).toBe(false);
    expect(indoor('严肃').src).toBe(indoor('害羞').src);
    expect(indoor('惊讶').exact).toBe(false);
    expect(indoor('惊讶').src).toBe(indoor('开心').src);
    expect(indoor('默认').id).toBe('sakiko_indoor_neutral');
  });

  it('keeps the phone CG separate from the standing indoor clothes', () => {
    const atHome = resolveProtagonistPhonePose('sakiko', { locationId: 'toyokawa-house' });
    const outside = resolveProtagonistPhonePose('sakiko', { locationId: 'downtown' });
    expect(atHome?.outfit).toBe('home');
    expect(outside?.outfit).toBe('casual');
    expect(atHome?.src).not.toBe(indoor('平静').src);
    expect(atHome?.src).not.toBe(uniform('平静').src);
    expect(outside?.src).not.toBe(indoor('开心').src);
    expect(atHome?.src).not.toBe(outside?.src);
  });
});
