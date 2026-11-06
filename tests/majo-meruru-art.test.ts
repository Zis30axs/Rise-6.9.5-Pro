import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { majoArtStatus, majoExpressionFor, majoExpressionSets, resolveMajoExpressionPortrait, resolveMajoSpeaker } from '../src/frontend/majo-art';
import { majoMeruruPoseForExpression, selectMajoMeruruSprite } from '../src/frontend/majo-trio-art';
import { resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { resolveSceneCharacterArt } from '../src/frontend/scene-character-assets';
import type { NovelNpcEmotion } from '../src/frontend/novel-npc-emotions';
import { residentById } from '../src/runtime/npc-cast';

const root = process.cwd();
const originalName = '\u6c37\u4e0a\u30e1\u30eb\u30eb';
const shortOriginal = '\u30e1\u30eb\u30eb';

describe('冰上梅露露 standing art', () => {
  it('keeps the existing resident and resolves her names', () => {
    expect(residentById('majo-meruru')?.name).toBe('冰上梅露露');
    expect(residentById('majo-meruru')?.aliases).toEqual([
      '冰上梅露露', '梅露露', originalName, shortOriginal, 'Meruru',
    ]);
    expect(resolveMajoSpeaker('冰上梅露露')).toBe('majo-meruru');
    expect(resolveMajoSpeaker('梅露露')).toBe('majo-meruru');
    expect(resolveMajoSpeaker(originalName)).toBe('majo-meruru');
    expect(resolveMajoSpeaker(shortOriginal)).toBe('majo-meruru');
    expect(resolveMajoSpeaker('Meruru')).toBe('majo-meruru');
    expect(resolveMajoSpeaker('meruru')).toBe('majo-meruru');
    expect(resolveMajoSpeaker('majo-meruru')).toBe('majo-meruru');
    expect(selectMajoMeruruSprite({ speaker: 'Meruru', expression: 'smile' })?.id).toBe('meruru_nun_smile');
    expect(selectMajoMeruruSprite({ speaker: '丰川祥子', expression: 'smile' })).toBeNull();
  });

  it('maps the six scene expressions onto the five drawings', () => {
    expect(majoMeruruPoseForExpression).toEqual({
      neutral: 'neutral',
      smile: 'smile',
      troubled: 'troubled',
      surprised: 'surprised',
      annoyed: 'annoyed',
      sad: 'sad',
    });
    const pose = (expression: string) => selectMajoMeruruSprite({ speaker: '冰上梅露露', expression })?.pose;
    expect(pose('neutral')).toBe('neutral');
    expect(pose('平静')).toBe('neutral');
    expect(pose('smile')).toBe('smile');
    expect(pose('开心')).toBe('smile');
    expect(pose('troubled')).toBe('troubled');
    expect(pose('害羞')).toBe('troubled');
    expect(pose('思考')).toBe('troubled');
    expect(pose('surprised')).toBe('surprised');
    expect(pose('惊讶')).toBe('surprised');
    expect(pose('annoyed')).toBe('annoyed');
    expect(pose('生气')).toBe('annoyed');
    expect(pose('sad')).toBe('sad');
    expect(pose('难过')).toBe('sad');
    expect(pose('没有这张脸')).toBe('neutral');
  });

  it('shows her own face in the novel portrait and does not borrow a calm face she does not have', () => {
    const meruru = majoExpressionSets['majo-meruru']!;
    expect(meruru).toMatchObject({ width: 813, height: 2089, completedExpressions: 5, complete: true, targetExpressions: 3 });
    expect(meruru.expressions.neutral).toBe(meruru.expressions.happy);
    expect(new Set(Object.values(meruru.expressions)).size).toBe(5);
    expect(resolveMajoExpressionPortrait('冰上梅露露', 'happy')).toMatchObject({
      personId: 'majo-meruru', src: meruru.expressions.happy, exact: true, width: 813, height: 2089,
    });
    expect(resolveMajoExpressionPortrait('梅露露', 'neutral')).toMatchObject({
      src: meruru.expressions.neutral, exact: false,
    });
    expect(resolveMajoExpressionPortrait('梅露露', 'shy')).toMatchObject({
      src: meruru.expressions.shy, exact: true,
    });
    expect(resolveMajoExpressionPortrait('梅露露', 'surprised')).toMatchObject({
      src: meruru.expressions.surprised, exact: true,
    });
    expect(resolveMajoExpressionPortrait('梅露露', 'sad')).toMatchObject({
      src: meruru.expressions.sad, exact: true,
    });
    expect(resolveMajoExpressionPortrait('梅露露', 'angry')).toMatchObject({
      src: meruru.expressions.angry, exact: true,
    });
    const nearby: Readonly<Record<NovelNpcEmotion, { src: string | undefined; exact: boolean }>> = {
      neutral: { src: meruru.expressions.neutral, exact: false },
      happy: { src: meruru.expressions.happy, exact: true },
      sad: { src: meruru.expressions.sad, exact: true },
      angry: { src: meruru.expressions.angry, exact: true },
      surprised: { src: meruru.expressions.surprised, exact: true },
      shy: { src: meruru.expressions.shy, exact: true },
      thinking: { src: meruru.expressions.shy, exact: false },
      serious: { src: meruru.expressions.neutral, exact: false },
      relieved: { src: meruru.expressions.happy, exact: false },
    };
    for (const [emotion, expected] of Object.entries(nearby) as [NovelNpcEmotion, { src: string; exact: boolean }][]) {
      expect(majoExpressionFor('majo-meruru', emotion), emotion).toBe(expected.src);
      expect(resolveMajoExpressionPortrait('冰上梅露露', emotion)?.exact, emotion).toBe(expected.exact);
    }
    expect(meruru.expressions.neutral?.startsWith('data:image/webp;base64,')).toBe(true);
    expect(resolveMajoExpressionPortrait('月代雪', 'neutral')?.personId).toBe('majo-yuki');
  });

  it('resolves scene sprites and the neutral map avatar', () => {
    expect(resolveSceneCharacterArt('冰上梅露露', 'smile')).toMatchObject({
      id: 'meruru_nun_smile', pose: 'smile', expression: 'smile', outfit: 'nun', width: 813, height: 2089,
    });
    expect(resolveSceneCharacterArt('梅露露', 'annoyed')?.id).toBe('meruru_nun_annoyed');
    expect(resolveSceneCharacterArt('梅露露', 'troubled')?.pose).toBe('troubled');
    expect(resolveSceneCharacterArt('梅露露', 'surprised')?.id).toBe('meruru_nun_surprised');
    expect(resolveSceneCharacterArt(originalName, 'sad')).toMatchObject({
      id: 'meruru_nun_sad', pose: 'sad', expression: 'sad', outfit: 'nun',
    });
    expect(resolveSceneCharacterArt('majo-meruru', '开心')?.id).toBe('meruru_nun_smile');
    expect(resolveSceneCharacterArt('丰川祥子')).toBeNull();
    const neutral = majoExpressionSets['majo-meruru']!.expressions.neutral;
    const headshot = resolveMapCharacterAvatar({ name: '冰上梅露露', personId: 'majo-meruru' });
    expect(headshot?.kind).toBe('headshot');
    expect(String(headshot?.src)).toMatch(/majo-meruru\.svg|data:image\/svg\+xml/);
    expect(resolveMapCharacterAvatar({ name: '梅露露' })?.kind).toBe('headshot');
    expect(resolveMapCharacterAvatar({ name: '冰上梅露露', personId: 'majo-meruru' }, true)).toEqual({ kind: 'sprite', src: neutral });
    expect(resolveMapCharacterAvatar({ name: '梅露露' }, true)).toEqual({ kind: 'sprite', src: neutral });
    expect(majoArtStatus.find(row => row.personId === 'majo-meruru')).toMatchObject({
      outfit: '白头纱十字饰与粉缎带修女裙', expressions: 5, complete: true, targetExpressions: 3,
    });
    expect(majoArtStatus.find(row => row.personId === 'majo-honoka')).toMatchObject({ expressions: 0, complete: false });
  });

  it('registers six opaque-interior webp files and keeps the smile as the neutral default', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'assets/majo-runtime/manifest.json'), 'utf8')) as {
      assets: Array<{ personId?: string; emotion?: string; file: string; bytes: number; sha256: string; width: number; height: number; alpha: boolean }>;
    };
    const rows = manifest.assets.filter(row => row.personId === 'majo-meruru');
    expect(rows.map(row => row.emotion)).toEqual(['neutral', 'happy', 'shy', 'surprised', 'angry', 'sad']);
    const neutral = readFileSync(join(root, 'assets/majo-runtime/characters/majo-meruru/neutral.webp'));
    const happy = readFileSync(join(root, 'assets/majo-runtime/characters/majo-meruru/happy.webp'));
    expect(Buffer.compare(neutral, happy)).toBe(0);
    for (const row of rows) {
      const bytes = readFileSync(join(root, 'assets/majo-runtime', row.file));
      expect(bytes.length).toBe(row.bytes);
      expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(row).toMatchObject({ width: 813, height: 2089, alpha: true });
    }
  });
});
