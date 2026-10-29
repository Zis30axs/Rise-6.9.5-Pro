import { describe, expect, it } from 'vitest';
import { getMutsumiArt, getSakikoArt, type DowntownArtAsset, type DowntownArtId, type DowntownArtPack } from '../src/frontend/downtown-art-runtime';
import { isMutsumiSpeaker, selectMutsumiSprite } from '../src/frontend/mutsumi-art-policy';
import { isSakikoSpeaker, selectSakikoSprite } from '../src/frontend/sakiko-art-policy';
import { resolveSceneCharacterArt } from '../src/frontend/scene-character-assets';

function sprite(id: DowntownArtId): DowntownArtAsset {
  return {
    id,
    src: 'data:image/webp;base64,AAAA',
    width: 768,
    height: 1344,
    sha256: 'ab'.repeat(32),
    anchor: [384, 1280],
  };
}

describe('Mutsumi uniform art', () => {
  it('resolves 若叶睦, 睦 and Mutsumi and does not claim Sakiko', () => {
    for (const name of ['若叶睦', ' 睦 ', 'Mutsumi', 'mutsumi', 'Wakaba Mutsumi']) {
      expect(isMutsumiSpeaker(name)).toBe(true);
      expect(isSakikoSpeaker(name)).toBe(false);
      expect(selectMutsumiSprite({ speaker: name, expression: 'neutral' })?.id).toBe('mutsumi_uniform_neutral');
    }
    expect(isMutsumiSpeaker('丰川祥子')).toBe(false);
    expect(isMutsumiSpeaker('祥子')).toBe(false);
    expect(selectSakikoSprite({ speaker: '若叶睦', expression: 'smile' })).toBeNull();
    expect(selectSakikoSprite({ speaker: '丰川祥子', expression: 'smile' })?.id).toBe('sakiko_casual_smile');
  });

  it('maps the six runtime expressions onto the nearest uniform pose', () => {
    const pose = (expression: string) => selectMutsumiSprite({ speaker: '若叶睦', expression })?.pose;
    expect(pose('neutral')).toBe('neutral');
    expect(pose('平静')).toBe('neutral');
    expect(pose('smile')).toBe('smile');
    expect(pose('开心')).toBe('smile');
    expect(pose('surprised')).toBe('surprised');
    expect(pose('惊讶')).toBe('surprised');
    expect(pose('troubled')).toBe('shy');
    expect(pose('害羞')).toBe('shy');
    expect(pose('annoyed')).toBe('neutral_aside');
    expect(pose('生气')).toBe('neutral_aside');
    expect(pose('sad')).toBe('neutral_aside_2');
    expect(pose('难过')).toBe('neutral_aside_2');
    expect(pose('没有这张脸')).toBe('neutral');
  });

  it('loads her pose from the pack and leaves Sakiko selection unchanged', () => {
    const pack: DowntownArtPack = {
      ready: true,
      assets: {
        mutsumi_uniform_shy: { ...sprite('mutsumi_uniform_shy'), sha256: 'cd'.repeat(32) },
        mutsumi_uniform_neutral: sprite('mutsumi_uniform_neutral'),
        sakiko_casual_smile: sprite('sakiko_casual_smile'),
        sakiko_casual_neutral: sprite('sakiko_casual_neutral'),
      },
    };
    expect(getMutsumiArt(pack, { speaker: '睦', expression: 'troubled' })).toMatchObject({
      id: 'mutsumi_uniform_shy', pose: 'shy', expression: 'troubled', outfit: 'uniform',
    });
    expect(getMutsumiArt(pack, { speaker: '丰川祥子', expression: 'smile' })).toBeNull();
    expect(getSakikoArt(pack, { speaker: '丰川祥子', expression: 'smile' })?.id).toBe('sakiko_casual_smile');
    expect(getSakikoArt(pack, { speaker: '若叶睦', expression: 'smile' })).toBeNull();
  });

  it('resolves installed art for those names from the scene character entry', () => {
    expect(resolveSceneCharacterArt('若叶睦', '难过')).toMatchObject({
      id: 'mutsumi_uniform_neutral_aside_2', pose: 'neutral_aside_2', expression: 'sad', outfit: 'uniform',
      width: 768, height: 1344, anchor: [384, 1280],
    });
    expect(resolveSceneCharacterArt('睦', '惊讶')?.id).toBe('mutsumi_uniform_surprised');
    expect(resolveSceneCharacterArt('Mutsumi', 'smile')?.id).toBe('mutsumi_uniform_smile');
    expect(resolveSceneCharacterArt('丰川祥子')).toBeNull();
    expect(resolveSceneCharacterArt('长崎素世')).toBeNull();
  });
});
