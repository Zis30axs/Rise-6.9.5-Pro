import { afterEach, describe, expect, it } from 'vitest';
import { createApp, nextTick, type App } from 'vue';
import SocialSkills from '../src/frontend/SocialSkills.vue';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import type { WorldState } from '../src/frontend/types';

describe('能力面板UI（丰富度与多维度展示）', () => {
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

  it('展示六维核心能力、阶段称号与实战偏离减免效果', async () => {
    const state = world();
    const { host } = mountSkills(state);
    await nextTick();

    // 标题与人格展示
    expect(host.textContent).toContain('能力体系');
    expect(host.textContent).toContain('长崎素世 · ISFJ');
    expect(host.textContent).toContain('今日社交心得积累');

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

  it('点击卡片可展开心性契合度与应用场景解析', async () => {
    const state = world();
    const { host } = mountSkills(state);
    await nextTick();

    const expressionCard = host.querySelector<HTMLElement>('[data-skill="expression"]')!;
    expect(expressionCard.textContent).not.toContain('沉重阻碍');

    // 点击展开
    expressionCard.click();
    await nextTick();

    expect(expressionCard.textContent).toContain('应用场景');
    expect(expressionCard.textContent).toContain('沉重阻碍');
    expect(expressionCard.classList.contains('expanded')).toBe(true);
  });

  it('切换分类选项卡可浏览专业学识与实务专长', async () => {
    const state = world();
    // 选修计算机专业
    state.academics = {
      majorId: 'computer-science',
      subjects: [
        { subjectId: 'cs-programming', points: 60 },
        { subjectId: 'cs-algorithms', points: 40 },
        { subjectId: 'cs-networks', points: 20 },
      ],
      lastGain: null,
    };
    const { host } = mountSkills(state);
    await nextTick();

    const navButtons = host.querySelectorAll<HTMLButtonElement>('.uc-abilities-nav button');
    expect(navButtons.length).toBe(3);

    // 切换到专业学识
    navButtons[1]?.click();
    await nextTick();

    expect(host.textContent).toContain('计算机');
    expect(host.textContent).toContain('程序设计');
    expect(host.textContent).toContain('60 学分点数');

    // 切换到实务与见闻
    navButtons[2]?.click();
    await nextTick();

    expect(host.textContent).toContain('法庭见闻积累');
    expect(host.textContent).toContain('律师事务所实践');
  });

  it('切换主角时，能力面板展示对应角色的专属性格底色与能力数值', async () => {
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
  });
});
