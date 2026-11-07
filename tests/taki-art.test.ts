import { describe, expect, it } from 'vitest';
import { isAnonSpeaker } from '../src/frontend/anon-art-policy';
import { downtownArtPack } from '../src/frontend/generated/downtown-art';
import { getAnonArt, getMutsumiArt, getSakikoArt, getTakiArt, type DowntownArtAsset, type DowntownArtId, type DowntownArtPack } from '../src/frontend/downtown-art-runtime';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { isMutsumiSpeaker } from '../src/frontend/mutsumi-art-policy';
import { isSakikoSpeaker } from '../src/frontend/sakiko-art-policy';
import { resolveSceneCharacterArt } from '../src/frontend/scene-character-assets';
import { isTakiSpeaker, selectTakiSprite } from '../src/frontend/taki-art-policy';

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

describe('Taki uniform art', () => {
  it('resolves 椎名立希, 立希, 椿名立希, Taki and Taki Shiina without claiming the others', () => {
    for (const name of ['椎名立希', '立希', '椿名立希', 'Taki', 'Taki Shiina', ' taki ']) {
      expect(isTakiSpeaker(name)).toBe(true);
      expect(isMutsumiSpeaker(name)).toBe(false);
      expect(isAnonSpeaker(name)).toBe(false);
      expect(isSakikoSpeaker(name)).toBe(false);
      expect(selectTakiSprite({ speaker: name, expression: 'neutral' })?.id).toBe('taki_uniform_neutral');
    }
    expect(isTakiSpeaker('若叶睦')).toBe(false);
    expect(isTakiSpeaker('千早爱音')).toBe(false);
    expect(isTakiSpeaker('丰川祥子')).toBe(false);
    expect(selectTakiSprite({ speaker: '爱音', expression: 'smile' })).toBeNull();
  });

  it('maps the six runtime expressions onto the nearest uniform pose', () => {
    const pose = (expression: string) => selectTakiSprite({ speaker: '椎名立希', expression })?.pose;
    expect(pose('neutral')).toBe('neutral');
    expect(pose('平静')).toBe('neutral');
    expect(pose('smile')).toBe('drumsticks');
    expect(pose('开心')).toBe('drumsticks');
    expect(pose('annoyed')).toBe('crossed');
    expect(pose('生气')).toBe('crossed');
    expect(pose('troubled')).toBe('embarrassed');
    expect(pose('害羞')).toBe('embarrassed');
    expect(pose('sad')).toBe('embarrassed');
    expect(pose('难过')).toBe('embarrassed');
    expect(pose('surprised')).toBe('embarrassed');
    expect(pose('惊讶')).toBe('embarrassed');
    expect(pose('没有这张脸')).toBe('neutral');
  });

  it('loads her pose from the pack and leaves the other characters unchanged', () => {
    const pack: DowntownArtPack = {
      ready: true,
      assets: {
        taki_uniform_drumsticks: sprite('taki_uniform_drumsticks', 'cd'.repeat(32)),
        taki_uniform_neutral: sprite('taki_uniform_neutral'),
        taki_uniform_crossed: sprite('taki_uniform_crossed'),
        anon_uniform_cheerful: sprite('anon_uniform_cheerful'),
        mutsumi_uniform_neutral: sprite('mutsumi_uniform_neutral'),
        sakiko_casual_smile: sprite('sakiko_casual_smile'),
      },
    };
    expect(getTakiArt(pack, { speaker: '立希', expression: 'smile' })).toMatchObject({
      id: 'taki_uniform_drumsticks', pose: 'drumsticks', expression: 'smile', outfit: 'uniform',
    });
    expect(getTakiArt(pack, { speaker: '椿名立希', expression: 'annoyed' })?.id).toBe('taki_uniform_crossed');
    expect(getTakiArt(pack, { speaker: '千早爱音', expression: 'smile' })).toBeNull();
    expect(getAnonArt(pack, { speaker: '千早爱音', expression: 'smile' })?.id).toBe('anon_uniform_cheerful');
    expect(getMutsumiArt(pack, { speaker: '若叶睦', expression: 'neutral' })?.id).toBe('mutsumi_uniform_neutral');
    expect(getSakikoArt(pack, { speaker: '丰川祥子', expression: 'smile' })?.id).toBe('sakiko_casual_smile');
    expect(getSakikoArt(pack, { speaker: '椎名立希', expression: 'smile' })).toBeNull();
  });

  it('resolves installed art for those names from the scene, novel pack and map', () => {
    expect(resolveSceneCharacterArt('椎名立希', '开心')).toMatchObject({
      id: 'taki_uniform_drumsticks', pose: 'drumsticks', expression: 'smile', outfit: 'uniform',
      width: 768, height: 1344, anchor: [384, 1280],
    });
    expect(resolveSceneCharacterArt('立希', '生气')?.id).toBe('taki_uniform_crossed');
    expect(resolveSceneCharacterArt('椿名立希', '害羞')?.id).toBe('taki_uniform_embarrassed');
    expect(resolveSceneCharacterArt('Taki Shiina', '惊讶')?.id).toBe('taki_uniform_embarrassed');
    expect(resolveSceneCharacterArt('Taki')?.id).toBe('taki_uniform_neutral');
    expect(resolveSceneCharacterArt('若叶睦', 'neutral')?.id).toBe('mutsumi_uniform_neutral');
    expect(resolveSceneCharacterArt('千早爱音', '开心')?.id).toBe('anon_uniform_cheerful');
    expect(resolveSceneCharacterArt('丰川祥子')).toBeNull();
    const installed = getTakiArt(downtownArtPack, { speaker: '椎名立希', expression: 'neutral' });
    expect(installed).toMatchObject({ id: 'taki_uniform_neutral', outfit: 'uniform', pose: 'neutral', width: 768, height: 1344, anchor: [384, 1280] });
    expect(installed?.src.startsWith('data:image/webp;base64,')).toBe(true);
    expect(resolveMapCharacterAvatar({ name: '椎名立希', personId: 'bang-taki' }, true)).toEqual({ kind: 'sprite', src: installed?.src });
    expect(resolveMapCharacterAvatar({ name: '立希' }, true)).toEqual({ kind: 'sprite', src: installed?.src });
  });
});
