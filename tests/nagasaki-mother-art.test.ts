import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAnonSpeaker } from '../src/frontend/anon-art-policy';
import { downtownArtPack } from '../src/frontend/generated/downtown-art';
import { getAnonArt, getMutsumiArt, getNagasakiMotherArt, getRaanaArt, getSakikoArt, getTakiArt, getTomoriArt, type DowntownArtAsset, type DowntownArtId, type DowntownArtPack } from '../src/frontend/downtown-art-runtime';
import { isSoyoSpeaker } from '../src/frontend/live2d-soyo-assets';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { isMutsumiSpeaker } from '../src/frontend/mutsumi-art-policy';
import { isNagasakiMotherSpeaker, nagasakiMotherPoses, selectNagasakiMotherSprite } from '../src/frontend/nagasaki-mother-art-policy';
import { isRaanaSpeaker } from '../src/frontend/raana-art-policy';
import { isSakikoSpeaker } from '../src/frontend/sakiko-art-policy';
import { resolveSceneCharacterArt } from '../src/frontend/scene-character-assets';
import { isTakiSpeaker } from '../src/frontend/taki-art-policy';
import { isTomoriSpeaker } from '../src/frontend/tomori-art-policy';
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

describe('Nagasaki mother suit art', () => {
  it('resolves 长崎夫人 and her family aliases without claiming 素世 or other people', () => {
    for (const name of ['长崎夫人', '素世的母亲', '素世妈妈', '长崎妈妈', '长崎母', '素世的妈妈', '素世母亲', 'nagasaki-mother', 'Nagasaki Mother', ' 长崎夫人 ']) {
      expect(isNagasakiMotherSpeaker(name), name).toBe(true);
      expect(isSoyoSpeaker(name.trim()), name).toBe(false);
      expect(isTomoriSpeaker(name)).toBe(false);
      expect(isMutsumiSpeaker(name)).toBe(false);
      expect(isAnonSpeaker(name)).toBe(false);
      expect(isRaanaSpeaker(name)).toBe(false);
      expect(isTakiSpeaker(name)).toBe(false);
      expect(isSakikoSpeaker(name)).toBe(false);
      expect(selectNagasakiMotherSprite({ speaker: name, expression: 'neutral' })?.id).toBe('nagasaki_mother_suit_neutral');
    }
    for (const name of ['素世', '长崎素世', '長崎素世', 'soyo', 'Soyo', '长崎', '妈妈', '丰川祥子', '高松灯', '椎名立希', '要乐奈', '千早爱音', '若叶睦', '甘织美代子', '甘织妈妈', '玲奈子妈妈', '琴之母', '纱月妈妈', '纱月的母亲', '风堇']) {
      expect(isNagasakiMotherSpeaker(name), name).toBe(false);
      expect(selectNagasakiMotherSprite({ speaker: name, expression: 'smile' })).toBeNull();
    }
    expect(isSoyoSpeaker('长崎素世')).toBe(true);
    expect(isSoyoSpeaker('素世')).toBe(true);
    const entry = worldbook.entries.find(item => item.extensions?.personId === 'nagasaki-mother');
    expect(entry?.name).toBe('长崎夫人');
    expect(entry?.extensions?.personId).toBe('nagasaki-mother');
    for (const key of entry?.keys ?? []) expect(isNagasakiMotherSpeaker(key), key).toBe(true);
    expect(entry?.keys).toEqual(expect.arrayContaining(['长崎夫人', '素世的母亲', '素世妈妈', '长崎妈妈', '长崎母', '素世的妈妈', '素世母亲']));
  });

  it('maps the six runtime expressions onto the nearest suit pose and keeps the cheerful pose', () => {
    const pose = (expression: string) => selectNagasakiMotherSprite({ speaker: '长崎夫人', expression })?.pose;
    expect(pose('neutral')).toBe('neutral');
    expect(pose('平静')).toBe('neutral');
    expect(pose('严肃')).toBe('neutral');
    expect(pose('smile')).toBe('smile');
    expect(pose('微笑')).toBe('smile');
    expect(pose('开心')).toBe('smile');
    expect(pose('surprised')).toBe('surprised');
    expect(pose('惊讶')).toBe('surprised');
    expect(pose('troubled')).toBe('surprised');
    expect(pose('害羞')).toBe('surprised');
    expect(pose('annoyed')).toBe('neutral');
    expect(pose('生气')).toBe('neutral');
    expect(pose('sad')).toBe('surprised');
    expect(pose('难过')).toBe('surprised');
    expect(pose('没有这张脸')).toBe('neutral');
    expect(nagasakiMotherPoses).toContain('cheerful');
    expect(pose('smile')).not.toBe('cheerful');
    expect(pose('开心')).not.toBe('cheerful');
  });

  it('loads her pose from the pack and leaves the other characters unchanged', () => {
    const pack: DowntownArtPack = {
      ready: true,
      assets: {
        nagasaki_mother_suit_neutral: sprite('nagasaki_mother_suit_neutral'),
        nagasaki_mother_suit_smile: sprite('nagasaki_mother_suit_smile', 'cd'.repeat(32)),
        nagasaki_mother_suit_surprised: sprite('nagasaki_mother_suit_surprised'),
        nagasaki_mother_suit_cheerful: sprite('nagasaki_mother_suit_cheerful'),
        tomori_uniform_neutral: sprite('tomori_uniform_neutral'),
        anon_uniform_cheerful: sprite('anon_uniform_cheerful'),
        mutsumi_uniform_neutral: sprite('mutsumi_uniform_neutral'),
        raana_uniform_smile: sprite('raana_uniform_smile'),
        taki_uniform_neutral: sprite('taki_uniform_neutral'),
        sakiko_casual_smile: sprite('sakiko_casual_smile'),
      },
    };
    expect(getNagasakiMotherArt(pack, { speaker: '素世妈妈', expression: 'smile' })).toMatchObject({
      id: 'nagasaki_mother_suit_smile', pose: 'smile', expression: 'smile', outfit: 'suit',
    });
    expect(getNagasakiMotherArt(pack, { speaker: '长崎妈妈', expression: 'annoyed' })?.id).toBe('nagasaki_mother_suit_neutral');
    expect(getNagasakiMotherArt(pack, { speaker: '素世母亲', expression: 'surprised' })?.id).toBe('nagasaki_mother_suit_surprised');
    expect(getNagasakiMotherArt(pack, { speaker: '素世的妈妈', expression: 'sad' })?.id).toBe('nagasaki_mother_suit_surprised');
    expect(getNagasakiMotherArt(pack, { speaker: '长崎素世', expression: 'smile' })).toBeNull();
    expect(getNagasakiMotherArt(pack, { speaker: '素世', expression: 'neutral' })).toBeNull();
    expect(getTomoriArt(pack, { speaker: '高松灯', expression: 'neutral' })?.id).toBe('tomori_uniform_neutral');
    expect(getTakiArt(pack, { speaker: '椎名立希', expression: 'neutral' })?.id).toBe('taki_uniform_neutral');
    expect(getRaanaArt(pack, { speaker: '要乐奈', expression: 'smile' })?.id).toBe('raana_uniform_smile');
    expect(getAnonArt(pack, { speaker: '千早爱音', expression: 'smile' })?.id).toBe('anon_uniform_cheerful');
    expect(getMutsumiArt(pack, { speaker: '若叶睦', expression: 'neutral' })?.id).toBe('mutsumi_uniform_neutral');
    expect(getSakikoArt(pack, { speaker: '丰川祥子', expression: 'smile' })?.id).toBe('sakiko_casual_smile');
    expect(getSakikoArt(pack, { speaker: '长崎夫人', expression: 'smile' })).toBeNull();
  });

  it('resolves installed art for those names from the scene, novel pack and map', () => {
    expect(resolveSceneCharacterArt('长崎夫人', '开心')).toMatchObject({
      id: 'nagasaki_mother_suit_smile', pose: 'smile', expression: 'smile', outfit: 'suit',
      width: 768, height: 1344, anchor: [384, 1280],
    });
    expect(resolveSceneCharacterArt('素世妈妈', '生气')?.id).toBe('nagasaki_mother_suit_neutral');
    expect(resolveSceneCharacterArt('素世的母亲', '惊讶')?.id).toBe('nagasaki_mother_suit_surprised');
    expect(resolveSceneCharacterArt('长崎妈妈', '难过')?.id).toBe('nagasaki_mother_suit_surprised');
    expect(resolveSceneCharacterArt('素世的妈妈', '害羞')?.id).toBe('nagasaki_mother_suit_surprised');
    expect(resolveSceneCharacterArt('nagasaki-mother')?.id).toBe('nagasaki_mother_suit_neutral');
    expect(resolveSceneCharacterArt('长崎素世')).toBeNull();
    expect(resolveSceneCharacterArt('素世')).toBeNull();
    expect(resolveSceneCharacterArt('高松灯', 'neutral')?.id).toBe('tomori_uniform_neutral');
    expect(resolveSceneCharacterArt('丰川祥子')).toBeNull();
    const installed = getNagasakiMotherArt(downtownArtPack, { speaker: '长崎夫人', expression: 'neutral' });
    expect(installed).toMatchObject({ id: 'nagasaki_mother_suit_neutral', outfit: 'suit', pose: 'neutral', width: 768, height: 1344, anchor: [384, 1280] });
    expect(installed?.src.startsWith('data:image/webp;base64,')).toBe(true);
    expect(resolveMapCharacterAvatar({ name: '长崎夫人', personId: 'nagasaki-mother' })).toEqual({ kind: 'sprite', src: installed?.src });
    expect(resolveMapCharacterAvatar({ name: '素世妈妈' })).toEqual({ kind: 'sprite', src: installed?.src });
    expect(resolveMapCharacterAvatar({ name: 'Nagasaki Mother', personId: 'nagasaki-mother' })?.kind).toBe('sprite');
    const soyo = resolveMapCharacterAvatar({ name: '长崎素世', personId: 'soyo' });
    expect(soyo?.kind).toBe('headshot');
    expect(soyo?.src).not.toBe(installed?.src);
    const portrait = readFileSync(resolve('src/frontend/NovelNpcPortrait.vue'), 'utf8');
    const app = readFileSync(resolve('src/frontend/App.vue'), 'utf8');
    expect(portrait).toContain('getNagasakiMotherArt');
    expect(portrait).toContain('data-npc-portrait="nagasaki-mother"');
    expect(app).toContain('isNagasakiMotherSpeaker(speaker)');
  });
});
