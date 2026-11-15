import type { Bridge, WorldState } from './types';
import { createInitialState, parseState } from '../runtime/model';

/** Explicit preview host. Never selected implicitly inside a Tavern iframe. */
export function createDemoHost() {
  const saves = new Map<string, WorldState>();
  const listeners = new Set<() => void>();
  let current = 'demo-a';
  let failNext = false;

  function switchChat(id: string) {
    if (id !== 'demo-a' && id !== 'demo-b') return;
    if (current === id) return;
    current = id;
    for (const listener of [...listeners]) listener();
  }

  function createBridge(): Bridge {
    const bound = current;
    let epoch = 0;
    let disposed = false;
    const subscriptions = new Set<() => void>();
    const assertCurrent = () => {
      if (disposed || bound !== current) throw new Error('聊天已切换，请重新进入。');
    };
    return {
      kind: 'demo', label: '本地演示 · 未连接模型',
      session: () => current,
      load() { assertCurrent(); return parseState(saves.get(bound) ?? createInitialState()); },
      save(state) { assertCurrent(); saves.set(bound, parseState(state)); },
      onSessionChange(callback) {
        const listener = () => { epoch++; callback(); };
        listeners.add(listener); subscriptions.add(listener);
        return () => { listeners.delete(listener); subscriptions.delete(listener); };
      },
      async generate(text, state, options) {
        assertCurrent();
        const request = ++epoch;
        const shouldFail = failNext; failNext = false;
        await new Promise(resolve => window.setTimeout(resolve, 650));
        assertCurrent();
        if (request !== epoch) throw new Error('本次生成已取消。');
        if (shouldFail) throw new Error('演示：模拟连接失败。进度没有丢失，可以重试。');
        const time = `${String(state.clock.hour).padStart(2, '0')}:${String(state.clock.minute).padStart(2, '0')}`;
        if (options?.kind === 'contact_introduction') return {
          text: `【演示简介，未调用模型】${options.contact.name}是你在此处认识的人，目前还有许多事情尚待了解。`, phoneMessages: [],
        };
        if (options?.kind === 'notebook_compose') {
          const hints: Record<string, { title: string; text: string; sticker: string; caption: string; tape: string; stamp: string; flower: string; doodle: string; mark: string; mark2?: string; paper: string; fontStyle: 'handwriting' | 'casual-pen' | 'anthropic-serif'; inkColor: 'forest' | 'navy' | 'charcoal' | 'sepia'; titleMark: 'ink-underline' | 'wave-underline' | 'double-underline' | 'highlight-wash'; dateCircled: boolean; mood: string }> = {
            soyo: {
              title: '排练间隙的下午茶备忘',
              text: `${time}，排练稍微告一段落。把今天顺手记下来的旋律片段与贝斯弦号抄在一角，提醒自己下次带上调音器与温热的红茶。`,
              sticker: 'mygo-o', caption: '认真记下这一段♪', tape: 'tape-sage-grid', stamp: 'stamp-tea', flower: 'pressed-clover', doodle: 'doodle-cloud-bubble', mark: 'mark-circle-red', mark2: 'mark-underline-loop', paper: 'lined', fontStyle: 'handwriting', inkColor: 'forest', titleMark: 'wave-underline', dateCircled: true, mood: '专注',
            },
            sakiko: {
              title: 'Nocturne · 暮色里的琴谱折角',
              text: `${time}，街灯刚亮起来。在五线谱纸边沿记下 Bb 大调临时转调的灵感，夜晚总比白天更适合安静整理思绪与未竟的乐章。`,
              sticker: 'chibi-04', caption: '今晚的旋律草稿', tape: 'tape-night-gold', stamp: 'stamp-music', flower: 'pressed-lavender', doodle: 'doodle-star-note', mark: 'mark-circle-double', mark2: 'mark-underline-double', paper: 'music', fontStyle: 'anthropic-serif', inkColor: 'navy', titleMark: 'double-underline', dateCircled: true, mood: '平静',
            },
            'bang-mutsumi': {
              title: '阳台与薄荷小盆栽',
              text: `${time}，替新长出的两片嫩叶松了土，顺手在角落盖了一枚小印章。今天风很轻，用薄荷笔涂了一笔标记。`,
              sticker: 'chibi-01', caption: '新芽长高了一点', tape: 'tape-sage-grid', stamp: 'stamp-checked', flower: 'pressed-clover', doodle: 'doodle-cloud-bubble', mark: 'mark-circle-dashed', mark2: 'mark-highlight-mint', paper: 'dot', fontStyle: 'handwriting', inkColor: 'forest', titleMark: 'highlight-wash', dateCircled: false, mood: '小确幸',
            },
          };
          const pick = hints[options.personId] ?? {
            title: '日常随笔一页',
            text: `${time}，把刚刚经过的街景与随想顺手记进手账本里。${options.instruction ? `（围绕线索：${options.instruction.slice(0, 60)}）` : '希望明天也是好天气。'}`,
            sticker: 'mygo-m', caption: '留一张小贴纸', tape: 'tape-kraft-post', stamp: 'stamp-star', flower: 'pressed-ginkgo', doodle: 'doodle-star-note', mark: 'mark-underline-wave', mark2: 'mark-arrow-curve', paper: 'dot', fontStyle: 'handwriting', inkColor: 'charcoal', titleMark: 'ink-underline', dateCircled: true, mood: '明快',
          };
          return {
            text: `已代写一页手账：${pick.title}`,
            phoneMessages: [],
            notebookPages: [{
              personId: options.personId,
              title: pick.title,
              text: pick.text,
              side: options.targetSide,
              mood: pick.mood,
              paperStyle: pick.paper,
              fontStyle: pick.fontStyle,
              inkColor: pick.inkColor,
              titleMark: pick.titleMark,
              dateCircled: pick.dateCircled,
              items: [
                { type: 'tape', presetId: pick.tape, side: options.targetSide, x: 50, y: 11, rotate: -3, scale: 0.94 },
                { type: 'mark', presetId: pick.mark, side: options.targetSide, x: 24, y: 12, rotate: -4, scale: 0.85 },
                ...(pick.mark2 ? [{ type: 'mark' as const, presetId: pick.mark2, side: options.targetSide, x: 46, y: 26, rotate: -1, scale: 0.96 }] : []),
                { type: 'sticker', presetId: pick.sticker, side: options.targetSide, x: 76, y: 74, rotate: 6, scale: 0.96, caption: pick.caption },
                { type: 'pressed', presetId: pick.flower, side: options.targetSide, x: 24, y: 78, rotate: -14, scale: 0.88 },
                { type: 'stamp', presetId: pick.stamp, side: options.targetSide, x: 78, y: 26, rotate: 9, scale: 0.9 },
                { type: 'doodle', presetId: pick.doodle, side: options.targetSide, x: 40, y: 66, rotate: -5, scale: 0.92, caption: pick.caption },
              ],
            }],
          };
        }
        if (options?.kind === 'interaction_event') return {
          text: `【演示事件 / 未调用模型】${time}，你发现一张被风吹落的寻物便签，花了三分钟把它放回显眼的位置。心情轻松了一点。连接酒馆后，突发事件将由当前模型生成。`,
          phoneMessages: [],
          worldActions: [{ type: 'activity', label: '整理被风吹落的寻物便签', minutes: 3,
            effects: { energy: 0, morale: 2, stress: -1, health: 0, balance: 0, satiety: 0, foodEnergy: 0 } }],
        };
        return {
          text: `【演示回应 / 未调用模型】${time}，窗外的风把纸页翻过一角。你选择了“${text.slice(0, 160)}”。这段文字仅用于验证交互流程；连接酒馆后将由当前配置的 Chat Completion 模型回应。`,
          phoneMessages: [],
        };
      },
      cancel() { epoch++; },
      dispose() {
        disposed = true; epoch++;
        for (const listener of subscriptions) listeners.delete(listener);
        subscriptions.clear();
      },
    };
  }
  return { createBridge, switchChat, current: () => current, failNext: () => { failNext = true; } };
}
