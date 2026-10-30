import { describe, expect, it } from 'vitest';
import { isAnonSpeaker, selectAnonSprite } from '../src/frontend/anon-art-policy';
import { getAnonArt, getMutsumiArt, getSakikoArt, type DowntownArtAsset, type DowntownArtId, type DowntownArtPack } from '../src/frontend/downtown-art-runtime';
import { isMutsumiSpeaker } from '../src/frontend/mutsumi-art-policy';
import { isSakikoSpeaker } from '../src/frontend/sakiko-art-policy';
import { resolveSceneCharacterArt } from '../src/frontend/scene-character-assets';

function sprite(id: DowntownArtId, sha = 'ab'.repeat(32)): DowntownArtAsset {
  return {
    id,
    src: 'data:image/webp;base64,AAAA',
    width: 768,
    height: 1344,
    sha256: sha,
    anchor: [384, 1280],
  };
}

describe('Anon uniform art', () => {
  it('resolves 千早爱音, 爱音, 愛音 and Anon without claiming Sakiko or Mutsumi', () => {
    for (const name of ['千早爱音', '爱音', '愛音', 'Anon', ' anon ']) {
      expect(isAnonSpeaker(name)).toBe(true);
      expect(isMutsumiSpeaker(name)).toBe(false);
      expect(isSakikoSpeaker(name)).toBe(false);
      expect(selectAnonSprite({ speaker: name, expression: 'neutral' })?.id).toBe('anon_uniform_smile');
    }
    expect(isAnonSpeaker('若叶睦')).toBe(false);
    expect(isAnonSpeaker('丰川祥子')).toBe(false);
    expect(selectAnonSprite({ speaker: '睦', expression: 'smile' })).toBeNull();
  });

  it('maps the six runtime expressions onto the nearest uniform pose', () => {
    const pose = (expression: string) => selectAnonSprite({ speaker: '千早爱音', expression })?.pose;
    expect(pose('neutral')).toBe('smile');
    expect(pose('平静')).toBe('smile');
    expect(pose('smile')).toBe('cheerful');
    expect(pose('开心')).toBe('cheerful');
    expect(pose('surprised')).toBe('surprised');
    expect(pose('惊讶')).toBe('surprised');
    expect(pose('troubled')).toBe('shy');
    expect(pose('害羞')).toBe('shy');
    expect(pose('annoyed')).toBe('confident');
    expect(pose('生气')).toBe('confident');
    expect(pose('sad')).toBe('shy');
    expect(pose('难过')).toBe('shy');
    expect(pose('没有这张脸')).toBe('smile');
  });

  it('loads her pose from the pack and leaves the other characters unchanged', () => {
    const pack: DowntownArtPack = {
      ready: true,
      assets: {
        anon_uniform_cheerful: sprite('anon_uniform_cheerful', 'cd'.repeat(32)),
        anon_uniform_smile: sprite('anon_uniform_smile'),
        anon_uniform_confident: sprite('anon_uniform_confident'),
        mutsumi_uniform_neutral: sprite('mutsumi_uniform_neutral'),
        sakiko_casual_smile: sprite('sakiko_casual_smile'),
      },
    };
    expect(getAnonArt(pack, { speaker: '爱音', expression: 'smile' })).toMatchObject({
      id: 'anon_uniform_cheerful', pose: 'cheerful', expression: 'smile', outfit: 'uniform',
    });
    expect(getAnonArt(pack, { speaker: '愛音', expression: 'annoyed' })?.id).toBe('anon_uniform_confident');
    expect(getAnonArt(pack, { speaker: '若叶睦', expression: 'smile' })).toBeNull();
    expect(getMutsumiArt(pack, { speaker: '若叶睦', expression: 'neutral' })?.id).toBe('mutsumi_uniform_neutral');
    expect(getSakikoArt(pack, { speaker: '丰川祥子', expression: 'smile' })?.id).toBe('sakiko_casual_smile');
    expect(getSakikoArt(pack, { speaker: '千早爱音', expression: 'smile' })).toBeNull();
  });

  it('resolves installed art for those names from the scene character entry', () => {
    expect(resolveSceneCharacterArt('千早爱音', '开心')).toMatchObject({
      id: 'anon_uniform_cheerful', pose: 'cheerful', expression: 'smile', outfit: 'uniform',
      width: 768, height: 1344, anchor: [384, 1280],
    });
    expect(resolveSceneCharacterArt('爱音', '惊讶')?.id).toBe('anon_uniform_surprised');
    expect(resolveSceneCharacterArt('愛音', '生气')?.id).toBe('anon_uniform_confident');
    expect(resolveSceneCharacterArt('Anon')?.id).toBe('anon_uniform_smile');
    expect(resolveSceneCharacterArt('若叶睦', 'neutral')?.id).toBe('mutsumi_uniform_neutral');
    expect(resolveSceneCharacterArt('丰川祥子')).toBeNull();
  });
});
