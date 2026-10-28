import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveFengjinSpeaker, resolveFengjinExpressionPortrait, fengjinExpressions } from '../src/frontend/fengjin-art';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';
import { locationServiceCatalog, getLocationServiceQuote } from '../src/runtime/location-services';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { getGameWeek, hasUsedWeeklyCounseling } from '../src/runtime/fengjin-clinic';

function setTestClock(state: any, day: number, hour: number, minute: number) {
  state.clock = { day, hour, minute };
  if (state.protagonists?.backgroundLife) {
    const cursor = (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
    state.protagonists.backgroundLife.cursor = cursor;
    for (const person of Object.values(state.protagonists.backgroundLife.people as Record<string, any>)) {
      person.nextDecisionAt = Math.max(person.nextDecisionAt, cursor);
    }
  }
}

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

  it('世界书包含风堇母亲般温柔与每周谈心设定', () => {
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
    expect(doctorEntry.content).toContain('妈妈般的温柔与包容');
    expect(doctorEntry.content).toContain('本人已经习惯甚至乐意');
    expect(doctorEntry.content).toContain('每周谈心');
    expect(doctorEntry.content).toContain('清空压力值');
    expect(doctorEntry.content).toContain('恢复充沛精力');

    const clinicEntry = content.entries.find((e: { name: string }) => e.name === '街区全科诊所');
    expect(clinicEntry).toBeDefined();
    expect(clinicEntry.extensions.locationId).toBe('clinic');
    expect(clinicEntry.content).toContain('心理谈心角');
  });

  it('地点服务目录中包含诊所问诊与风堇每周谈心服务', () => {
    const clinicService = locationServiceCatalog.find(s => s.id === 'clinic-treatment');
    expect(clinicService).toBeDefined();
    expect(clinicService?.locationIds).toContain('clinic');
    expect(clinicService?.description).toContain('风堇医生');

    const counselingService = locationServiceCatalog.find(s => s.id === 'clinic-counseling');
    expect(counselingService).toBeDefined();
    expect(counselingService?.price).toBe(0);
    expect(counselingService?.locationIds).toContain('clinic');
    expect(counselingService?.description).toContain('母亲般');
    expect(counselingService?.description).toContain('每周');
  });

  it('每周可找风堇谈心一次：清空压力并完全恢复精力，多主角与周跨度独立结算', () => {
    let state = enableProtagonists(createInitialState());
    state.locationId = 'pocket-park'; state.scene = null;
    setTestClock(state, 2, 11, 0);
    state.player.stress = 80;
    state.player.energy = 25;
    state.player.morale = 40;

    expect(getGameWeek(state.clock)).toBe(1);
    expect(hasUsedWeeklyCounseling(state)).toBe(false);

    // 第一周首次谈心可用
    const quote1 = getLocationServiceQuote(state, 'clinic-counseling');
    expect(quote1.blockedReason).toBeNull();
    expect(quote1.price).toBe(0);

    // 执行谈心调理
    state = reduceState(state, { type: 'location_service', serviceId: 'clinic-counseling' });

    // 验证核心效果：压力清空为 0，精力完全恢复为 100
    expect(state.player.stress).toBe(0);
    expect(state.player.energy).toBe(100);
    expect(state.player.morale).toBeGreaterThanOrEqual(65);
    expect(hasUsedWeeklyCounseling(state)).toBe(true);
    expect(state.fengjinClinic?.counselingReceipts).toHaveLength(1);
    expect(state.fengjinClinic?.counselingReceipts[0]).toMatchObject({ owner: 'soyo', week: 1 });

    // 第一周再次申请谈心被拦截
    const quoteBlocked = getLocationServiceQuote(state, 'clinic-counseling');
    expect(quoteBlocked.blockedReason).toContain('本周已经找风堇医生谈过心了');
    expect(() => reduceState(state, { type: 'location_service', serviceId: 'clinic-counseling' })).toThrow(/本周已经找风堇医生谈过心了/);

    // 切换到艾玛视角：艾玛第一周尚未谈心，状态独立
    state = reduceState(state, { type: 'switch_protagonist', target: 'emma' });
    expect(hasUsedWeeklyCounseling(state)).toBe(false);
    state.locationId = 'pocket-park'; state.scene = null;
    state.player.stress = 60;
    state.player.energy = 30;
    const emmaQuote = getLocationServiceQuote(state, 'clinic-counseling');
    expect(emmaQuote.blockedReason).toBeNull();

    // 艾玛完成谈心
    state = reduceState(state, { type: 'location_service', serviceId: 'clinic-counseling' });
    expect(state.player.stress).toBe(0);
    expect(state.player.energy).toBe(100);
    expect(hasUsedWeeklyCounseling(state)).toBe(true);

    // 切回素世
    state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
    expect(hasUsedWeeklyCounseling(state)).toBe(true);

    // 推进时间到第二周（第 8 天）
    setTestClock(state, 8, 10, 0);
    expect(getGameWeek(state.clock)).toBe(2);
    expect(hasUsedWeeklyCounseling(state)).toBe(false);

    // 第二周素世可以再次进行每周谈心
    state.player.stress = 50;
    state.player.energy = 40;
    state.locationId = 'pocket-park'; state.scene = null;
    const week2Quote = getLocationServiceQuote(state, 'clinic-counseling');
    expect(week2Quote.blockedReason).toBeNull();
    state = reduceState(state, { type: 'location_service', serviceId: 'clinic-counseling' });
    expect(state.player.stress).toBe(0);
    expect(state.player.energy).toBe(100);

    // 存档序列化与校验保留
    const parsed = parseState(state);
    expect(parsed.fengjinClinic?.counselingReceipts.length).toBe(3);
  });
});
