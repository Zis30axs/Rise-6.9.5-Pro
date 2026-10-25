import { describe, expect, it } from 'vitest';
import { majoExpressionFor } from '../src/frontend/majo-art';
import { watanareExpressionFor } from '../src/frontend/watanare-art';
import { mapAvatarInitials, resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { novelNpcAtlases } from '../src/frontend/novel-npc-atlases';

describe('地图头像按保存身份选择', () => {
  it('第三、第四主角与已确认立绘的居民使用自己的中性立绘', () => {
    expect(resolveMapCharacterAvatar({ name: '樱羽艾玛', protagonistId: 'emma' })).toEqual({
      kind: 'sprite', src: majoExpressionFor('majo-emma', 'neutral'),
    });
    expect(resolveMapCharacterAvatar({ name: '甘织玲奈子', protagonistId: 'renako' })).toEqual({
      kind: 'sprite', src: watanareExpressionFor('watanare-renako', 'neutral'),
    });
    expect(resolveMapCharacterAvatar({ name: '二阶堂希罗', personId: 'majo-hiro', portraitId: 'claude' })).toEqual({
      kind: 'sprite', src: majoExpressionFor('majo-hiro', 'neutral'),
    });
    for (const [name, personId] of [
      ['王冢真唯', 'watanare-mai'],
      ['濑名紫阳花', 'watanare-ajisai'],
      ['琴纱月', 'watanare-satsuki'],
      ['小柳香穗', 'watanare-kaho'],
      ['甘织遥奈', 'watanare-haruna'],
    ] as const) {
      expect(resolveMapCharacterAvatar({ name, personId, portraitId: 'claude' })).toEqual({
        kind: 'sprite', src: watanareExpressionFor(personId, 'neutral'),
      });
    }
  });

  it('未接入专属立绘的居民不拿随机 NPC 立绘冒充身份；素世使用打包头图', () => {
    expect(resolveMapCharacterAvatar({ name: '黑部奈叶香', personId: 'majo-nanoka', portraitId: 'deepseek' })).toBeNull();
    expect(resolveMapCharacterAvatar({ name: '甘织美代子', personId: 'watanare-miyoko', portraitId: 'claude' })).toBeNull();
    expect(resolveMapCharacterAvatar({ name: '长崎素世', protagonistId: 'soyo', portraitId: 'claude' })).toMatchObject({ kind: 'sprite' });
    expect(mapAvatarInitials('长崎素世')).toBe('素世');
    expect(mapAvatarInitials(' ')).toBe('?');
  });

  it('程序化路人的稳定通用立绘只裁自己的中性画格', () => {
    const avatar = resolveMapCharacterAvatar({ name: '顾知遥', personId: 'ped-seed-1', portraitId: 'xiaoyang' });
    const atlas = novelNpcAtlases.xiaoyang;
    expect(avatar).toEqual({ kind: 'atlas', src: atlas.source,
      ...atlas.frames.neutral, atlasWidth: atlas.width, atlasHeight: atlas.height });
    expect(resolveMapCharacterAvatar({ name: '陌生角色' })).toBeNull();
  });
});
