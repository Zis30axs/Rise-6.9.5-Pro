import { describe, expect, it } from 'vitest';
import { isAnonSpeaker } from '../src/frontend/anon-art-policy';
import { getAnonArt, getMutsumiArt, getRaanaArt, getSakikoArt, type DowntownArtAsset, type DowntownArtId, type DowntownArtPack } from '../src/frontend/downtown-art-runtime';
import { isMutsumiSpeaker } from '../src/frontend/mutsumi-art-policy';
import { isRaanaSpeaker, raanaPoses, selectRaanaSprite } from '../src/frontend/raana-art-policy';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
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

describe('Raana uniform art', () => {
  it('resolves 要乐奈, 乐奈, 楽奈, 要楽奈, 樂奈, Raana and Rana without claiming the others', () => {
    for (const name of ['要乐奈', '乐奈', '楽奈', '要楽奈', '樂奈', 'Raana', 'Rana', ' raana ']) {
      expect(isRaanaSpeaker(name)).toBe(true);
      expect(isAnonSpeaker(name)).toBe(false);
      expect(isMutsumiSpeaker(name)).toBe(false);
      expect(isSakikoSpeaker(name)).toBe(false);
      expect(selectRaanaSprite({ speaker: name, expression: 'neutral' })?.id).toBe('raana_uniform_neutral');
    }
    expect(isRaanaSpeaker('千早爱音')).toBe(false);
    expect(isRaanaSpeaker('若叶睦')).toBe(false);
    expect(isRaanaSpeaker('丰川祥子')).toBe(false);
    expect(selectRaanaSprite({ speaker: '爱音', expression: 'smile' })).toBeNull();
  });

  it('maps the six runtime expressions onto the nearest uniform pose and keeps the wave', () => {
    const pose = (expression: string) => selectRaanaSprite({ speaker: '要乐奈', expression })?.pose;
    expect(pose('neutral')).toBe('neutral');
    expect(pose('平静')).toBe('neutral');
    expect(pose('smile')).toBe('smile');
    expect(pose('开心')).toBe('smile');
    expect(pose('surprised')).toBe('neutral');
    expect(pose('惊讶')).toBe('neutral');
    expect(pose('troubled')).toBe('crossed');
    expect(pose('害羞')).toBe('crossed');
    expect(pose('annoyed')).toBe('hips');
    expect(pose('生气')).toBe('hips');
    expect(pose('sad')).toBe('crossed');
    expect(pose('难过')).toBe('crossed');
    expect(pose('没有这张脸')).toBe('neutral');
    expect(raanaPoses).toContain('wave');
    expect(pose('surprised')).not.toBe('wave');
  });

  it('loads her pose from the pack and leaves the other characters unchanged', () => {
    const pack: DowntownArtPack = {
      ready: true,
      assets: {
        raana_uniform_smile: sprite('raana_uniform_smile', 'cd'.repeat(32)),
        raana_uniform_neutral: sprite('raana_uniform_neutral'),
        raana_uniform_hips: sprite('raana_uniform_hips'),
        raana_uniform_crossed: sprite('raana_uniform_crossed'),
        anon_uniform_cheerful: sprite('anon_uniform_cheerful'),
        mutsumi_uniform_neutral: sprite('mutsumi_uniform_neutral'),
        sakiko_casual_smile: sprite('sakiko_casual_smile'),
      },
    };
    expect(getRaanaArt(pack, { speaker: '乐奈', expression: 'smile' })).toMatchObject({
      id: 'raana_uniform_smile', pose: 'smile', expression: 'smile', outfit: 'uniform',
    });
    expect(getRaanaArt(pack, { speaker: '要楽奈', expression: 'annoyed' })?.id).toBe('raana_uniform_hips');
    expect(getRaanaArt(pack, { speaker: '樂奈', expression: 'sad' })?.id).toBe('raana_uniform_crossed');
    expect(getRaanaArt(pack, { speaker: '千早爱音', expression: 'smile' })).toBeNull();
    expect(getAnonArt(pack, { speaker: '千早爱音', expression: 'smile' })?.id).toBe('anon_uniform_cheerful');
    expect(getMutsumiArt(pack, { speaker: '若叶睦', expression: 'neutral' })?.id).toBe('mutsumi_uniform_neutral');
    expect(getSakikoArt(pack, { speaker: '丰川祥子', expression: 'smile' })?.id).toBe('sakiko_casual_smile');
    expect(getSakikoArt(pack, { speaker: '要乐奈', expression: 'smile' })).toBeNull();
  });

  it('resolves installed art for those names from the scene character entry', () => {
    expect(resolveSceneCharacterArt('要乐奈', '开心')).toMatchObject({
      id: 'raana_uniform_smile', pose: 'smile', expression: 'smile', outfit: 'uniform',
      width: 768, height: 1344, anchor: [384, 1280],
    });
    expect(resolveSceneCharacterArt('乐奈', '惊讶')?.id).toBe('raana_uniform_neutral');
    expect(resolveSceneCharacterArt('楽奈', '生气')?.id).toBe('raana_uniform_hips');
    expect(resolveSceneCharacterArt('要楽奈', '难过')?.id).toBe('raana_uniform_crossed');
    expect(resolveSceneCharacterArt('樂奈', '害羞')?.id).toBe('raana_uniform_crossed');
    expect(resolveSceneCharacterArt('Raana')?.id).toBe('raana_uniform_neutral');
    expect(resolveSceneCharacterArt('Rana', 'smile')?.id).toBe('raana_uniform_smile');
    expect(resolveSceneCharacterArt('千早爱音', 'neutral')?.id).toBe('anon_uniform_smile');
    expect(resolveSceneCharacterArt('若叶睦', 'neutral')?.id).toBe('mutsumi_uniform_neutral');
    expect(resolveSceneCharacterArt('丰川祥子')).toBeNull();
    const avatar = resolveMapCharacterAvatar({ name: '要乐奈', personId: 'bang-rana' }, true);
    expect(avatar?.kind).toBe('sprite');
    expect(avatar && 'src' in avatar && avatar.src.startsWith('data:image/webp;base64,')).toBe(true);
    expect(resolveMapCharacterAvatar({ name: 'Rana', personId: 'bang-rana' }, true)?.kind).toBe('sprite');
  });
});
