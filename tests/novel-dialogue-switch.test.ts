import { afterEach, describe, expect, it } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive, type App } from 'vue';
import NovelDialogue from '../src/frontend/NovelDialogue.vue';
import { clearNovelReadingProgressCache } from '../src/frontend/novel-reading-progress';
import type { WorldState } from '../src/frontend/types';

describe('小说模式逐句阅读（切换角色与切换聊天重进）', () => {
  let app: App | undefined;
  let host: HTMLElement | undefined;

  afterEach(() => {
    app?.unmount();
    app = undefined;
    host?.remove();
    host = undefined;
    clearNovelReadingProgressCache();
    try {
      globalThis.localStorage?.clear();
    } catch {
      // ignore
    }
  });

  const makeStory = (): WorldState['story'] => [
    {
      id: 'entry-1',
      role: 'assistant',
      text: '|素世|平静|“第一句对话。”|\n|素世|微笑|“第二句对话。”|',
    },
    {
      id: 'entry-2',
      role: 'assistant',
      text: '|素世|开心|“第三句对话。”|\n|素世|认真|“第四句对话。”|',
    },
  ];

  function mountNovel(initialProps: Record<string, any>) {
    host = document.createElement('div');
    document.body.append(host);
    const state = reactive({ ...initialProps });
    const Wrapper = defineComponent({
      setup() {
        return () => h(NovelDialogue as any, state);
      },
    });
    app = createApp(Wrapper);
    app.mount(host);
    return { state, host };
  }

  it('载入现有的对话时，默认停留在本段最后一句，不重新从头读', async () => {
    const { host } = mountNovel({
      entries: makeStory(),
      busy: false,
      active: true,
      protagonist: '长崎素世',
      protagonistId: 'soyo',
      memoryScope: 'chat-session-1',
      recognizesSpeaker: () => true,
    });
    await nextTick();

    const textEl = host.querySelector<HTMLElement>('.novel-speech');
    const nextBtn = host.querySelector<HTMLButtonElement>('.novel-dialogue-controls button:last-child');

    expect(textEl?.textContent).toContain('第四句对话');
    expect(nextBtn?.textContent).toBe('本段已读完');
  });

  it('切换主角再切回时，精准恢复此前阅读位置，绝不重新开始读', async () => {
    const soyoStory = makeStory();
    const sakikoStory: WorldState['story'] = [
      {
        id: 'entry-sakiko-1',
        role: 'assistant',
        text: '|祥子|严肃|“祥子的第一句。”|\n|祥子|平静|“祥子的第二句。”|',
      },
    ];

    const { state, host } = mountNovel({
      entries: soyoStory,
      busy: false,
      active: true,
      protagonist: '长崎素世',
      protagonistId: 'soyo',
      memoryScope: 'chat-session-1',
      recognizesSpeaker: () => true,
    });
    await nextTick();

    // 素世初次进入停在最后一句（第四句）
    expect(host.querySelector('.novel-speech')?.textContent).toContain('第四句对话');

    // 切换到祥子
    state.protagonist = '丰川祥子';
    state.protagonistId = 'sakiko';
    state.entries = sakikoStory;
    await nextTick();

    // 祥子现有对话停在祥子最后一句
    expect(host.querySelector('.novel-speech')?.textContent).toContain('祥子的第二句');

    // 切回素世
    state.protagonist = '长崎素世';
    state.protagonistId = 'soyo';
    state.entries = soyoStory;
    await nextTick();

    // 素世恢复此前已读完的位置，绝不重新跳回第一句
    expect(host.querySelector('.novel-speech')?.textContent).toContain('第四句对话');
    expect(host.querySelector('.novel-dialogue-controls button:last-child')?.textContent).toBe('本段已读完');
  });

  it('切换聊天重进时，恢复此前停留在的具体句子', async () => {
    const story = makeStory();
    const { host } = mountNovel({
      entries: story,
      busy: false,
      active: true,
      protagonist: '长崎素世',
      protagonistId: 'soyo',
      memoryScope: 'chat-session-2',
      recognizesSpeaker: () => true,
    });
    await nextTick();

    // 用户主动点击“上一句”回到第三句
    const prevBtn = host.querySelector<HTMLButtonElement>('.novel-dialogue-controls button:first-child');
    prevBtn?.click();
    await nextTick();
    expect(host.querySelector('.novel-speech')?.textContent).toContain('第三句对话');

    // 模拟切换聊天离开（组件卸载）
    app?.unmount();
    host.remove();

    // 模拟重新切回此聊天（新组件挂载）
    const remount = mountNovel({
      entries: story,
      busy: false,
      active: true,
      protagonist: '长崎素世',
      protagonistId: 'soyo',
      memoryScope: 'chat-session-2',
      recognizesSpeaker: () => true,
    });
    await nextTick();

    // 重进后精准恢复到离开时的第三句，没有重新从第一句开始读
    expect(remount.host.querySelector('.novel-speech')?.textContent).toContain('第三句对话');
  });

  it('交互产生新的一轮故事生成时，从新故事的第一句开始引导阅读', async () => {
    const story = makeStory();
    const { state, host } = mountNovel({
      entries: story,
      busy: false,
      active: true,
      protagonist: '长崎素世',
      protagonistId: 'soyo',
      memoryScope: 'chat-session-3',
      recognizesSpeaker: () => true,
    });
    await nextTick();

    expect(host.querySelector('.novel-speech')?.textContent).toContain('第四句对话');

    // 模拟 LLM 生成新的一轮故事（追加 entry-3）
    state.entries = [
      ...story,
      {
        id: 'entry-3',
        role: 'assistant',
        text: '|素世|惊讶|“这是刚生成的第五句。”|\n|素世|微笑|“这是刚生成的第六句。”|',
      },
    ];
    await nextTick();

    // 新回合自动从新故事的第一句（第五句）开始读
    expect(host.querySelector('.novel-speech')?.textContent).toContain('刚生成的第五句');
    expect(host.querySelector('.novel-dialogue-controls button:last-child')?.textContent).toBe('点击继续 ▸');
  });
});
