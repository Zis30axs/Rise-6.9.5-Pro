import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveFengjinSpeaker, resolveFengjinExpressionPortrait, fengjinExpressions } from '../src/frontend/fengjin-art';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';
import { locationServiceCatalog } from '../src/runtime/location-services';

describe('风堇与街区全科诊所', () => {
  it('正确识别风堇及其别名说话人', () => {
    expect(resolveFengjinSpeaker('风堇')).toBe('fengjin');
    expect(resolveFengjinSpeaker('风堇医生')).toBe('fengjin');
    expect(resolveFengjinSpeaker('风堇医师')).toBe('fengjin');
    expect(resolveFengjinSpeaker('雅辛忒丝')).toBe('fengjin');
    expect(resolveFengjinSpeaker('摇光的医师')).toBe('fengjin');
    expect(resolveFengjinSpeaker('摇光')).toBe('fengjin');
    expect(resolveFengjinSpeaker('fengjin')).toBe('fengjin');
    expect(resolveFengjinSpeaker('Fengjin')).toBe('fengjin');
    expect(resolveFengjinSpeaker('Hyacinthia')).toBe('fengjin');

    expect(resolveFengjinSpeaker('樱羽艾玛')).toBeNull();
    expect(resolveFengjinSpeaker('未知路人')).toBeNull();
  });

  it('正确解析风堇表情立绘及退避机制', () => {
    const neutral = resolveFengjinExpressionPortrait('风堇', 'neutral');
    expect(neutral).not.toBeNull();
    expect(neutral?.personId).toBe('fengjin');
    expect(neutral?.exact).toBe(true);
    expect(neutral?.width).toBe(1024);
    expect(neutral?.height).toBe(1536);
    expect(neutral?.src).toMatch(/^data:image\/webp;base64,/);

    const happy = resolveFengjinExpressionPortrait('风堇医生', 'happy');
    expect(happy?.exact).toBe(true);
    expect(happy?.src).toBe(fengjinExpressions.happy);

    const serious = resolveFengjinExpressionPortrait('雅辛忒丝', 'serious');
    expect(serious?.exact).toBe(true);
    expect(serious?.src).toBe(fengjinExpressions.serious);

    // 未直接绘制的衍生情绪退避
    const relieved = resolveFengjinExpressionPortrait('风堇', 'relieved');
    expect(relieved?.exact).toBe(false);
    expect(relieved?.src).toBe(fengjinExpressions.happy);

    const thinking = resolveFengjinExpressionPortrait('风堇', 'thinking');
    expect(thinking?.exact).toBe(false);
    expect(thinking?.src).toBe(fengjinExpressions.serious);

    expect(resolveFengjinExpressionPortrait('其他角色', 'neutral')).toBeNull();
  });

  it('诊所日夜背景随时间段正确切换', () => {
    const dayBg = getNovelBackground('clinic', 10);
    expect(dayBg.id).toBe('clinic-day');
    expect(dayBg.phase).toBe('day');
    expect(dayBg.imagePhase).toBe('day');
    expect(dayBg.source).toBe('user-art');
    expect(dayBg.src).toMatch(/^data:image\/webp;base64,/);

    const duskBg = getNovelBackground('clinic', 17);
    expect(duskBg.id).toBe('clinic-day');
    expect(duskBg.phase).toBe('dusk');
    expect(duskBg.imagePhase).toBe('day');

    const nightBg = getNovelBackground('clinic', 21);
    expect(nightBg.id).toBe('clinic-night');
    expect(nightBg.phase).toBe('night');
    expect(nightBg.imagePhase).toBe('night');
    expect(nightBg.source).toBe('user-art');
    expect(nightBg.src).toMatch(/^data:image\/webp;base64,/);

    // clinic-room 也同样支持日夜背景
    expect(getNovelBackground('clinic-room', 2).id).toBe('clinic-night');
    expect(getNovelBackground('clinic-room', 12).id).toBe('clinic-day');
  });

  it('世界书包含风堇与全科诊所的完整设定', () => {
    const worldbookPath = resolve(process.cwd(), 'src/worldbook/fengjin-clinic.json');
    const content = JSON.parse(readFileSync(worldbookPath, 'utf8'));

    expect(content.name).toBe('未读之城：风堇与街区全科诊所');
    expect(Array.isArray(content.entries)).toBe(true);
    expect(content.entries.length).toBe(2);

    const doctorEntry = content.entries.find((e: { name: string }) => e.name === '风堇');
    expect(doctorEntry).toBeDefined();
    expect(doctorEntry.extensions.personId).toBe('fengjin');
    expect(doctorEntry.keys).toContain('风堇');
    expect(doctorEntry.keys).toContain('雅辛忒丝');
    expect(doctorEntry.keys).toContain('摇光的医师');

    const clinicEntry = content.entries.find((e: { name: string }) => e.name === '街区全科诊所');
    expect(clinicEntry).toBeDefined();
    expect(clinicEntry.extensions.locationId).toBe('clinic');
  });

  it('地点服务目录中诊所问诊关联风堇医生', () => {
    const clinicService = locationServiceCatalog.find(s => s.id === 'clinic-treatment');
    expect(clinicService).toBeDefined();
    expect(clinicService?.locationIds).toContain('clinic');
    expect(clinicService?.description).toContain('风堇医生');
  });
});
