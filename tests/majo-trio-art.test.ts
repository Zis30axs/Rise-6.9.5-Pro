import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { majoArtStatus, majoExpressionFor, majoExpressionSets, resolveMajoExpressionPortrait, resolveMajoSpeaker } from '../src/frontend/majo-art';
import { majoTrioPoseForExpression, selectMajoTrioSprite } from '../src/frontend/majo-trio-art';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { resolveSceneCharacterArt } from '../src/frontend/scene-character-assets';
import type { NovelNpcEmotion } from '../src/frontend/novel-npc-emotions';

const root = process.cwd();

describe('魔裁 casual trio standing art', () => {
  it('resolves the Chinese names, short names and ids', () => {
    expect(resolveMajoSpeaker('黑部奈叶香')).toBe('majo-nanoka');
    expect(resolveMajoSpeaker('奈叶香')).toBe('majo-nanoka');
    expect(resolveMajoSpeaker('紫藤亚里沙')).toBe('majo-arisa');
    expect(resolveMajoSpeaker('亚里沙')).toBe('majo-arisa');
    expect(resolveMajoSpeaker('佐伯米莉亚')).toBe('majo-milia');
    expect(resolveMajoSpeaker('米莉亚')).toBe('majo-milia');
    expect(selectMajoTrioSprite({ speaker: 'majo-nanoka', expression: 'neutral' })?.personId).toBe('majo-nanoka');
    expect(selectMajoTrioSprite({ speaker: 'Nanoka', expression: 'smile' })?.id).toBe('nanoka_casual_smile');
    expect(selectMajoTrioSprite({ speaker: '丰川祥子', expression: 'smile' })).toBeNull();
  });

  it('maps the six game expressions onto the nearest of the three poses', () => {
    expect(majoTrioPoseForExpression).toEqual({
      neutral: 'neutral',
      smile: 'smile',
      troubled: 'thinking',
      surprised: 'neutral',
      annoyed: 'thinking',
      sad: 'neutral',
    });
    const pose = (expression: string) => selectMajoTrioSprite({ speaker: '紫藤亚里沙', expression })?.pose;
    expect(pose('neutral')).toBe('neutral');
    expect(pose('平静')).toBe('neutral');
    expect(pose('smile')).toBe('smile');
    expect(pose('开心')).toBe('smile');
    expect(pose('troubled')).toBe('thinking');
    expect(pose('思考')).toBe('thinking');
    expect(pose('surprised')).toBe('neutral');
    expect(pose('惊讶')).toBe('neutral');
    expect(pose('annoyed')).toBe('thinking');
    expect(pose('生气')).toBe('thinking');
    expect(pose('sad')).toBe('neutral');
    expect(pose('难过')).toBe('neutral');
    expect(pose('没有这张脸')).toBe('neutral');
  });

  it('shows the authored pose in the novel portrait and reuses it for nearby emotions', () => {
    const nanoka = majoExpressionSets['majo-nanoka']!;
    expect(nanoka).toMatchObject({ width: 396, height: 960, completedExpressions: 3, complete: true });
    expect(resolveMajoExpressionPortrait('黑部奈叶香', 'neutral')).toMatchObject({
      personId: 'majo-nanoka', src: nanoka.expressions.neutral, exact: true, width: 396, height: 960,
    });
    expect(resolveMajoExpressionPortrait('奈叶香', 'happy')).toMatchObject({
      src: nanoka.expressions.happy, exact: true,
    });
    expect(resolveMajoExpressionPortrait('奈叶香', 'thinking')).toMatchObject({
      src: nanoka.expressions.thinking, exact: true,
    });
    const nearby: Readonly<Record<NovelNpcEmotion, string | undefined>> = {
      neutral: nanoka.expressions.neutral,
      happy: nanoka.expressions.happy,
      sad: nanoka.expressions.neutral,
      angry: nanoka.expressions.thinking,
      surprised: nanoka.expressions.neutral,
      shy: nanoka.expressions.thinking,
      thinking: nanoka.expressions.thinking,
      serious: nanoka.expressions.neutral,
      relieved: nanoka.expressions.happy,
    };
    for (const [emotion, src] of Object.entries(nearby) as [NovelNpcEmotion, string][]) {
      expect(majoExpressionFor('majo-nanoka', emotion), emotion).toBe(src);
    }
    expect(resolveMajoExpressionPortrait('奈叶香', 'angry')?.exact).toBe(false);
    expect(resolveMajoExpressionPortrait('奈叶香', 'sad')?.src).toBe(nanoka.expressions.neutral);

    const arisa = majoExpressionSets['majo-arisa']!;
    expect(resolveMajoExpressionPortrait('亚里沙', 'happy')?.src).toBe(arisa.expressions.happy);
    expect(resolveMajoExpressionPortrait('紫藤亚里沙', 'shy')?.src).toBe(arisa.expressions.thinking);
    expect(arisa.width).toBe(377);
    expect(arisa.height).toBe(935);

    const milia = majoExpressionSets['majo-milia']!;
    expect(milia).toMatchObject({ width: 398, height: 976 });
    expect(resolveMajoExpressionPortrait('佐伯米莉亚', 'thinking')).toMatchObject({
      personId: 'majo-milia', src: milia.expressions.thinking, exact: true,
    });
    expect(resolveMajoExpressionPortrait('米莉亚', 'relieved')?.src).toBe(milia.expressions.happy);
    expect(milia.expressions.neutral?.startsWith('data:image/webp;base64,')).toBe(true);
  });

  it('resolves scene art by name and keeps unrelated people on their own paths', () => {
    expect(resolveSceneCharacterArt('黑部奈叶香', 'smile')).toMatchObject({
      id: 'nanoka_casual_smile', pose: 'smile', expression: 'smile', outfit: 'casual', width: 396, height: 960,
    });
    expect(resolveSceneCharacterArt('奈叶香', 'annoyed')?.id).toBe('nanoka_casual_thinking');
    expect(resolveSceneCharacterArt('紫藤亚里沙', 'troubled')?.pose).toBe('thinking');
    expect(resolveSceneCharacterArt('亚里沙', 'surprised')?.id).toBe('arisa_casual_neutral');
    expect(resolveSceneCharacterArt('佐伯米莉亚', 'sad')).toMatchObject({
      id: 'milia_casual_neutral', pose: 'neutral', expression: 'sad', outfit: 'casual',
    });
    expect(resolveSceneCharacterArt('majo-milia', '开心')?.id).toBe('milia_casual_smile');
    expect(resolveSceneCharacterArt('丰川祥子')).toBeNull();
    expect(resolveSceneCharacterArt('长崎素世')).toBeNull();
    expect(resolveSceneCharacterArt('若叶睦', 'neutral')?.id).toBe('mutsumi_uniform_neutral');
  });

  it('uses the neutral casual sprite for map avatars by id or Chinese name', () => {
    const nanoka = majoExpressionSets['majo-nanoka']!.expressions.neutral;
    const arisa = majoExpressionSets['majo-arisa']!.expressions.neutral;
    const milia = majoExpressionSets['majo-milia']!.expressions.neutral;
    expect(resolveMapCharacterAvatar({ name: '黑部奈叶香', personId: 'majo-nanoka' })).toEqual({ kind: 'sprite', src: nanoka });
    expect(resolveMapCharacterAvatar({ name: '紫藤亚里沙' })).toEqual({ kind: 'sprite', src: arisa });
    expect(resolveMapCharacterAvatar({ name: '米莉亚', personId: 'majo-milia' })).toEqual({ kind: 'sprite', src: milia });
  });

  it('keeps Milia\'s earlier anime-seg files and records the new default', () => {
    for (const file of ['neutral.webp', 'happy.webp', 'shy.webp']) {
      const bytes = readFileSync(join(root, 'assets/majo-runtime/characters/majo-milia', file));
      expect(bytes.length).toBeGreaterThan(1000);
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    }
    const casual = readFileSync(join(root, 'assets/majo-runtime/characters/majo-milia/casual/neutral.webp'));
    const previous = readFileSync(join(root, 'assets/majo-runtime/characters/majo-milia/neutral.webp'));
    expect(Buffer.compare(casual, previous)).not.toBe(0);
    expect(majoArtStatus.find(row => row.personId === 'majo-milia')).toMatchObject({
      outfit: '奶白色绞花针织开衫', expressions: 3, complete: true,
    });
    expect(majoArtStatus.find(row => row.personId === 'majo-nanoka')).toMatchObject({ expressions: 3, complete: true });
    expect(majoArtStatus.find(row => row.personId === 'majo-arisa')).toMatchObject({ expressions: 3, complete: true });
  });
});
