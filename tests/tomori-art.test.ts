import { describe, expect, it } from 'vitest';
import { isAnonSpeaker } from '../src/frontend/anon-art-policy';
import { downtownArtPack } from '../src/frontend/generated/downtown-art';
import { getAnonArt, getMutsumiArt, getRaanaArt, getSakikoArt, getTakiArt, getTomoriArt, type DowntownArtAsset, type DowntownArtId, type DowntownArtPack } from '../src/frontend/downtown-art-runtime';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { isMutsumiSpeaker } from '../src/frontend/mutsumi-art-policy';
import { isRaanaSpeaker } from '../src/frontend/raana-art-policy';
import { isSakikoSpeaker } from '../src/frontend/sakiko-art-policy';
import { resolveSceneCharacterArt } from '../src/frontend/scene-character-assets';
import { isTakiSpeaker } from '../src/frontend/taki-art-policy';
import { isTomoriSpeaker, selectTomoriSprite, tomoriPoses } from '../src/frontend/tomori-art-policy';
import worldbook from '../src/worldbook/bang-dream-canon.json';

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

describe('Tomori uniform art', () => {
  it('resolves 高松灯, 灯, 燈, 高松燈, Tomori and Takamatsu Tomori without claiming the others', () => {
    for (const name of ['高松灯', '灯', '燈', '高松燈', 'Tomori', 'Takamatsu Tomori', ' tomori ']) {
      expect(isTomoriSpeaker(name)).toBe(true);
      expect(isMutsumiSpeaker(name)).toBe(false);
      expect(isAnonSpeaker(name)).toBe(false);
      expect(isRaanaSpeaker(name)).toBe(false);
      expect(isTakiSpeaker(name)).toBe(false);
      expect(isSakikoSpeaker(name)).toBe(false);
      expect(selectTomoriSprite({ speaker: name, expression: 'neutral' })?.id).toBe('tomori_uniform_neutral');
    }
    expect(isTomoriSpeaker('若叶睦')).toBe(false);
    expect(isTomoriSpeaker('千早爱音')).toBe(false);
    expect(isTomoriSpeaker('要乐奈')).toBe(false);
    expect(isTomoriSpeaker('椎名立希')).toBe(false);
    expect(isTomoriSpeaker('丰川祥子')).toBe(false);
    expect(selectTomoriSprite({ speaker: '立希', expression: 'smile' })).toBeNull();
    const entry = worldbook.entries.find(item => item.extensions?.personId === 'bang-tomori');
    expect(entry?.name).toBe('高松灯');
    expect(entry?.extensions?.personId).toBe('bang-tomori');
  });

  it('maps the six runtime expressions onto the nearest uniform pose and keeps the shy pose', () => {
    const pose = (expression: string) => selectTomoriSprite({ speaker: '高松灯', expression })?.pose;
    expect(pose('neutral')).toBe('neutral');
    expect(pose('平静')).toBe('neutral');
    expect(pose('smile')).toBe('smile');
    expect(pose('开心')).toBe('smile');
    expect(pose('surprised')).toBe('surprised');
    expect(pose('惊讶')).toBe('surprised');
    expect(pose('troubled')).toBe('surprised');
    expect(pose('害羞')).toBe('surprised');
    expect(pose('annoyed')).toBe('sad');
    expect(pose('生气')).toBe('sad');
    expect(pose('sad')).toBe('sad');
    expect(pose('难过')).toBe('sad');
    expect(pose('没有这张脸')).toBe('neutral');
    expect(tomoriPoses).toContain('shy');
    expect(pose('surprised')).not.toBe('shy');
    expect(pose('smile')).not.toBe('shy');
  });

  it('loads her pose from the pack and leaves the other characters unchanged', () => {
    const pack: DowntownArtPack = {
      ready: true,
      assets: {
        tomori_uniform_smile: sprite('tomori_uniform_smile', 'cd'.repeat(32)),
        tomori_uniform_neutral: sprite('tomori_uniform_neutral'),
        tomori_uniform_surprised: sprite('tomori_uniform_surprised'),
        tomori_uniform_sad: sprite('tomori_uniform_sad'),
        anon_uniform_cheerful: sprite('anon_uniform_cheerful'),
        mutsumi_uniform_neutral: sprite('mutsumi_uniform_neutral'),
        raana_uniform_smile: sprite('raana_uniform_smile'),
        taki_uniform_neutral: sprite('taki_uniform_neutral'),
        sakiko_casual_smile: sprite('sakiko_casual_smile'),
      },
    };
    expect(getTomoriArt(pack, { speaker: '灯', expression: 'smile' })).toMatchObject({
      id: 'tomori_uniform_smile', pose: 'smile', expression: 'smile', outfit: 'uniform',
    });
    expect(getTomoriArt(pack, { speaker: '高松燈', expression: 'annoyed' })?.id).toBe('tomori_uniform_sad');
    expect(getTomoriArt(pack, { speaker: '燈', expression: 'surprised' })?.id).toBe('tomori_uniform_surprised');
    expect(getTomoriArt(pack, { speaker: '椎名立希', expression: 'smile' })).toBeNull();
    expect(getTakiArt(pack, { speaker: '椎名立希', expression: 'neutral' })?.id).toBe('taki_uniform_neutral');
    expect(getRaanaArt(pack, { speaker: '要乐奈', expression: 'smile' })?.id).toBe('raana_uniform_smile');
    expect(getAnonArt(pack, { speaker: '千早爱音', expression: 'smile' })?.id).toBe('anon_uniform_cheerful');
    expect(getMutsumiArt(pack, { speaker: '若叶睦', expression: 'neutral' })?.id).toBe('mutsumi_uniform_neutral');
    expect(getSakikoArt(pack, { speaker: '丰川祥子', expression: 'smile' })?.id).toBe('sakiko_casual_smile');
    expect(getSakikoArt(pack, { speaker: '高松灯', expression: 'smile' })).toBeNull();
  });

  it('resolves installed art for those names from the scene, novel pack and map', () => {
    expect(resolveSceneCharacterArt('高松灯', '开心')).toMatchObject({
      id: 'tomori_uniform_smile', pose: 'smile', expression: 'smile', outfit: 'uniform',
      width: 768, height: 1344, anchor: [384, 1280],
    });
    expect(resolveSceneCharacterArt('灯', '生气')?.id).toBe('tomori_uniform_sad');
    expect(resolveSceneCharacterArt('燈', '惊讶')?.id).toBe('tomori_uniform_surprised');
    expect(resolveSceneCharacterArt('高松燈', '难过')?.id).toBe('tomori_uniform_sad');
    expect(resolveSceneCharacterArt('Takamatsu Tomori', '害羞')?.id).toBe('tomori_uniform_surprised');
    expect(resolveSceneCharacterArt('Tomori')?.id).toBe('tomori_uniform_neutral');
    expect(resolveSceneCharacterArt('椎名立希', 'neutral')?.id).toBe('taki_uniform_neutral');
    expect(resolveSceneCharacterArt('要乐奈', '开心')?.id).toBe('raana_uniform_smile');
    expect(resolveSceneCharacterArt('若叶睦', 'neutral')?.id).toBe('mutsumi_uniform_neutral');
    expect(resolveSceneCharacterArt('丰川祥子')).toBeNull();
    const installed = getTomoriArt(downtownArtPack, { speaker: '高松灯', expression: 'neutral' });
    expect(installed).toMatchObject({ id: 'tomori_uniform_neutral', outfit: 'uniform', pose: 'neutral', width: 768, height: 1344, anchor: [384, 1280] });
    expect(installed?.src.startsWith('data:image/webp;base64,')).toBe(true);
    expect(resolveMapCharacterAvatar({ name: '高松灯', personId: 'bang-tomori' })).toEqual({ kind: 'sprite', src: installed?.src });
    expect(resolveMapCharacterAvatar({ name: '灯' })).toEqual({ kind: 'sprite', src: installed?.src });
    expect(resolveMapCharacterAvatar({ name: 'Takamatsu Tomori', personId: 'bang-tomori' })?.kind).toBe('sprite');
  });
});
