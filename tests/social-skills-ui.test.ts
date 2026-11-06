import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import SocialSkills from '../src/frontend/SocialSkills.vue';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import type { WorldState } from '../src/frontend/types';

describe('能力面板UI（星盘雷达图、交互推演台与专业实务隔离）', () => {
  let app: App | undefined;
  let host: HTMLElement | undefined;

  afterEach(() => {
    app?.unmount();
    app = undefined;
    host?.remove();
    host = undefined;
  });

  function mountSkills(state: WorldState) {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(SocialSkills, { state });
    app.mount(host);
    return { host };
  }

  const world = () => parseState(enableProtagonists(createInitialState()));

  it('展示六维SVG星盘雷达图、主角叠影对比、阶段称号与实战偏离减免效果', async () => {
    const state = world();
    const { host } = mountSkills(state);
    await nextTick();

    // 标题与人格展示
    expect(host.textContent).toContain('能力体系');
    expect(host.textContent).toContain('长崎素世 · ISFJ');
    expect(host.textContent).toContain('今日社交心得积累');

    // 六维星盘雷达图与六个顶点
    const radarSvg = host.querySelector<SVGElement>('[data-radar-chart]');
    expect(radarSvg).toBeTruthy();
    expect(host.querySelectorAll('[data-radar-node]').length).toBe(6);
    expect(host.querySelector('[data-radar-active-polygon]')).toBeTruthy();
    expect(host.querySelector('[data-radar-compare-polygon]')).toBeNull();

    // 点击对比祥子，叠加对比多边形
    const compareSakiko = host.querySelector<HTMLButtonElement>('[data-compare-target="sakiko"]')!;
    compareSakiko.click();
    await nextTick();
    expect(host.querySelector('[data-radar-compare-polygon]')).toBeTruthy();

    // 六大能力卡片
    const cards = host.querySelectorAll<HTMLElement>('.uc-skill-card');
    expect(cards.length).toBe(6);

    // 素世察言观色初始为 Lv.3
    const perceptionCard = host.querySelector<HTMLElement>('[data-skill="perception"]');
    expect(perceptionCard?.textContent).toContain('察言观色');
    expect(perceptionCard?.textContent).toContain('Lv.3');
    expect(perceptionCard?.textContent).toContain('游刃有余');
    expect(perceptionCard?.textContent).toContain('偏离负担减免：精力 −1，压力 −1');
  });

  it('交互式心性推演台支持4档偏离度实时测算与一键带入行动预设', async () => {
    const state = world();
    const composer = document.createElement('textarea');
    composer.id = 'uc-action-input';
    document.body.append(composer);

    try {
      const { host } = mountSkills(state);
      await nextTick();

      // 点击坦诚表达卡片（素世 Lv.2，减免为 0）
      const expressionCard = host.querySelector<HTMLElement>('[data-skill="expression"]')!;
      expressionCard.click();
      await nextTick();

      expect(expressionCard.textContent).toContain('应用场景');
      expect(expressionCard.textContent).toContain('沉重阻碍');
      expect(expressionCard.classList.contains('expanded')).toBe(true);

      // 切换偏离度 0 -> 精力负担 -0，好感转化 100%
      host.querySelector<HTMLButtonElement>('[data-deviation-btn="0"]')!.click();
      await nextTick();
      expect(host.querySelector('[data-quote-energy]')?.textContent).toBe('−0');
      expect(host.querySelector('[data-quote-affinity]')?.textContent).toBe('100%');

      // 切换偏离度 3 -> 精力负担 -5，压力负荷 +7，单次经验 +6 XP，好感转化 60%
      host.querySelector<HTMLButtonElement>('[data-deviation-btn="3"]')!.click();
      await nextTick();
      expect(host.querySelector('[data-quote-energy]')?.textContent).toBe('−5');
      expect(host.querySelector('[data-quote-stress]')?.textContent).toBe('+7');
      expect(host.querySelector('[data-quote-xp]')?.textContent).toBe('+6 XP');
      expect(host.querySelector('[data-quote-affinity]')?.textContent).toBe('60%');

      // 点击行动预设芯片，自动填入 #uc-action-input
      const chip = host.querySelector<HTMLButtonElement>('[data-practice-chip="0"]')!;
      chip.click();
      await nextTick();
      expect(composer.value).toContain('鼓起勇气放下顾虑');
      expect(host.querySelector('[data-practice-feedback]')?.textContent).toContain('已带入行动输入框');
    } finally {
      composer.remove();
    }
  });

  it('非法学专业不展示法庭与律所卡片，仅展示本专业实务与器乐料理图谱；法学专业正常展示法学实务', async () => {
    const csState = world();
    csState.academics = {
      majorId: 'computer-science',
      subjects: [
        { subjectId: 'cs-programming', points: 60 },
        { subjectId: 'cs-algorithms', points: 40 },
        { subjectId: 'cs-networks', points: 20 },
      ],
      lastGain: null,
    };
    const { host } = mountSkills(csState);
    await nextTick();

    const navButtons = host.querySelectorAll<HTMLButtonElement>('.uc-abilities-nav button');
    expect(navButtons.length).toBe(3);

    // 切换到专业学识
    navButtons[1]?.click();
    await nextTick();
    expect(host.textContent).toContain('计算机');
    expect(host.textContent).toContain('程序设计');
    expect(host.textContent).toContain('60 学分点数');

    // 切换到实务与见闻（计算机专业不应出现法学相关卡片）
    navButtons[2]?.click();
    await nextTick();
    expect(host.textContent).toContain('程序设计工作台');
    expect(host.textContent).toContain('算法与网络实验');
    expect(host.textContent).toContain('乐器造诣与舞台表现');
    expect(host.textContent).toContain('家常料理与厨艺手记');
    expect(host.textContent).not.toContain('法庭见闻积累');
    expect(host.textContent).not.toContain('律师事务所实践');

    // 卸载并挂载法学专业状态
    app?.unmount();
    host.remove();

    const lawState = world();
    lawState.academics = {
      majorId: 'law',
      subjects: [
        { subjectId: 'law-foundations', points: 80 },
        { subjectId: 'law-evidence', points: 50 },
        { subjectId: 'law-advocacy', points: 30 },
      ],
      lastGain: null,
    };
    const mountedLaw = mountSkills(lawState);
    await nextTick();
    mountedLaw.host.querySelectorAll<HTMLButtonElement>('.uc-abilities-nav button')[2]?.click();
    await nextTick();
    expect(mountedLaw.host.textContent).toContain('法庭见闻积累');
    expect(mountedLaw.host.textContent).toContain('律师事务所实践');
  });

  it('切换主角时，能力面板展示对应角色的专属性格底色、能力数值与器乐特长', async () => {
    const state = world();
    const sakikoState = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
    const { host } = mountSkills(sakikoState);
    await nextTick();

    expect(host.textContent).toContain('丰川祥子 · ENTJ');
    expect(host.textContent).toContain('意志决绝 · 统率全局');

    // 祥子活动组织为 Lv.4
    const organizingCard = host.querySelector<HTMLElement>('[data-skill="organizing"]');
    expect(organizingCard?.textContent).toContain('Lv.4');
    expect(organizingCard?.textContent).toContain('熟稔洞察');

    // 实务标签页中祥子擅长键盘（96）
    host.querySelectorAll<HTMLButtonElement>('.uc-abilities-nav button')[2]?.click();
    await nextTick();
    expect(host.textContent).toContain('擅长声部：键盘（96）');
    expect(host.textContent).not.toContain('法庭见闻积累');
  });
});
