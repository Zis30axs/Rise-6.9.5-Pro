import { describe, expect, it } from 'vitest';
import { majoExpressionFor } from '../src/frontend/majo-art';
import { mapAvatarInitials, resolveMapCharacterAvatar } from '../src/frontend/map-character-avatar';
import { novelNpcAtlases } from '../src/frontend/novel-npc-atlases';

describe('地图头像按保存身份选择', () => {
  it('第三主角与已确认的魔裁居民使用自己的中性立绘', () => {
    expect(resolveMapCharacterAvatar({ name: '樱羽艾玛', protagonistId: 'emma' })).toEqual({
      kind: 'sprite', src: majoExpressionFor('majo-emma', 'neutral'),
    });
    expect(resolveMapCharacterAvatar({ name: '二阶堂希罗', personId: 'majo-hiro', portraitId: 'claude' })).toEqual({
      kind: 'sprite', src: majoExpressionFor('majo-hiro', 'neutral'),
    });
  });

  it('未确认的魔裁人物不拿随机 NPC 立绘冒充身份；素世无头像时可识别', () => {
    expect(resolveMapCharacterAvatar({ name: '月代雪', personId: 'majo-yuki', portraitId: 'deepseek' })).toBeNull();
    expect(resolveMapCharacterAvatar({ name: '长崎素世', protagonistId: 'soyo', portraitId: 'claude' })).toBeNull();
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
