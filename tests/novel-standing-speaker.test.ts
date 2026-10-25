import { describe, expect, it } from 'vitest';
import { standingSpeaker } from '../src/frontend/novel-npc-portraits';
import { isSoyoSpeaker } from '../src/frontend/live2d-soyo-assets';
import { isSakikoSpeaker } from '../src/frontend/sakiko-art-policy';
import { resolveMajoSpeaker } from '../src/frontend/majo-art';
import { resolveWatanareSpeaker } from '../src/frontend/watanare-art';
import { protagonistNames } from '../src/runtime/protagonist-world';

describe('standingSpeaker', () => {
  it('resolves narration and pre-dialogue rows to the current protagonist', () => {
    expect(standingSpeaker('', protagonistNames.sakiko)).toBe('丰川祥子');
    expect(standingSpeaker('  ', protagonistNames.emma)).toBe('樱羽艾玛');
    expect(standingSpeaker('旁白', protagonistNames.emma)).toBe('樱羽艾玛');
    expect(standingSpeaker('', protagonistNames.renako)).toBe('甘织玲奈子');
    expect(standingSpeaker('', protagonistNames.soyo)).toBe('长崎素世');
  });

  it('keeps real speakers untouched', () => {
    expect(standingSpeaker('林同学', protagonistNames.sakiko)).toBe('林同学');
    expect(standingSpeaker('长崎素世', protagonistNames.sakiko)).toBe('长崎素世');
  });

  it('normalized protagonist names hit the matching portrait resolvers', () => {
    expect(isSoyoSpeaker(standingSpeaker('', protagonistNames.soyo))).toBe(true);
    expect(isSoyoSpeaker(standingSpeaker('', protagonistNames.sakiko))).toBe(false);
    expect(isSakikoSpeaker(standingSpeaker('旁白', protagonistNames.sakiko))).toBe(true);
    expect(resolveMajoSpeaker(standingSpeaker('', protagonistNames.emma))).toBe('majo-emma');
    expect(resolveWatanareSpeaker(standingSpeaker('', protagonistNames.renako))).toBe('watanare-renako');
  });
});
