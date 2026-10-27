import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Evaluate the real renderer in isolation: its virtual phone imports
// are resolved only by the embedded-phone builder.
const source = readFileSync('integration/dual-protagonists/phone-apps.js', 'utf8');
const start = source.indexOf('const twiitchImage =');
const end = source.indexOf('function worldApp(ctx,id)', start);
if (start < 0 || end < 0) throw Error('Twiitch renderer markers not found');
const { twiitchView, cleanTwiitchStageChrome } = runInNewContext(
  source.slice(start, end) + '\n({ twiitchView, cleanTwiitchStageChrome })',
  {
    phoneArt: new Proxy({}, { get(_target, name) {
      return typeof name === 'string' && name.startsWith('twiitch/') ? '<svg/>' : undefined;
    }}),
    esc: value => String(value),
    encodeURIComponent,
  },
);

const forbidden = [
  '本地静态频道展示', '只读取游戏时钟', '不会开播',
  '调用模型', '真实模型互动就绪', '胸锁呼吸',
  '动作细化', '视角已激活', '模型：Mizuirono',
  '模型出处', '资产与门禁说明',
];

describe('Twiitch player-visible channel text', () => {
  for (const channel of ['kaguya', 'coco']) {
    for (const hour of [0, 18, 20, 21, 23]) {
      for (const show3d of [false, true]) {
        it(channel + ' at ' + hour + 'h / ' + (show3d ? '3D' : '2D'), () => {
          const html = twiitchView({ clock: { hour } }, channel, show3d);
          for (const phrase of forbidden) expect(html).not.toContain(phrase);
          expect(html).toContain('最近的频道动态');
          expect(html).toContain('data-action="switch-twiitch"');
          expect(html).toContain('data-channel="kaguya"');
          expect(html).toContain('data-channel="coco"');
          expect(html).toContain(channel === 'kaguya' ? '辉夜姬' : '泽渡可可');
          expect(html).toContain('<img');
          const live = channel === 'kaguya' ? hour >= 18 && hour < 21 : hour >= 20 && hour < 23;
          expect(html).toContain('>' + (live ? '直播中' : '离线') + '</span>');
          expect(html.includes('data-action="toggle-twiitch-3d"')).toBe(channel === 'kaguya');
          expect(html.includes('tp-3d-iframe')).toBe(channel === 'kaguya' && show3d);
          if (channel === 'kaguya' && show3d) {
            expect(html).toContain('src="outputs/kaguya-live-3d-demo.html"');
            expect(html).toContain('全屏 ↗');
            expect(html).toContain('收起 3D');
          }
        });
      }
    }
  }

  it('removes demo/build notes from the embedded 3D view only', () => {
    const caption = { textContent: '模型出处：Mizuirono' };
    const credits = { hidden: false };
    const header = { hidden: false };
    const doc = { querySelector: key => ({
      '#offlineNotice small': caption,
      '.credits-box': { closest: () => credits },
      'header.page-header': header,
    })[key] || null };
    cleanTwiitchStageChrome(doc);
    expect(caption.textContent).toBe('「今天在彩叶的房间写新曲～记得准时入场哦✨」');
    expect(credits.hidden).toBe(true);
    expect(header.hidden).toBe(true);
    expect(() => cleanTwiitchStageChrome(null)).not.toThrow();
  });

  it('preserves the existing actions and removes the remaining SMS model-call toast', () => {
    expect(source).toContain("case 'switch-twiitch'");
    expect(source).toContain("case 'toggle-twiitch-3d'");
    expect(source).toContain('cleanTwiitchStageChrome(stage.contentDocument)');
    expect(source).not.toContain('不会自动调用 LLM');
  });

  it('replaces the embedded demo control-panel acceptance copy without removing actions', () => {
    const nodes = {
      '#poseEditorCard .pose-editor-intro': { textContent: '编辑原始 VRM 全部实际骨骼' },
      '#poseEditorCard .editor-note': { textContent: '本地 XYZ 欧拉角' },
      '#boneZoneStats': { textContent: '129 个实际骨骼' },
      '#status span': { textContent: '正在装载模型与骨骼' },
    };
    const guides = [
      { textContent: '打破传统 VRM 呆滞八字型 (A-Pose)' },
      { textContent: '生理级胸锁呼吸，彻底移除伪呼吸' },
    ];
    const headings = [
      { textContent: '常驻立姿切换' },
      { textContent: '时间轴仿真控制' },
      { textContent: '3D 动作互动' },
    ];
    const doc = {
      querySelector: selector => nodes[selector] || null,
      querySelectorAll: selector => selector === '.control-dock .guide-box' ? guides : headings,
    };
    cleanTwiitchStageChrome(doc);
    for (const node of [...Object.values(nodes), ...guides, ...headings]) {
      for (const phrase of ['VRM', '仿真控制', '胸锁呼吸', '欧拉角', '实际骨骼']) {
        expect(node.textContent).not.toContain(phrase);
      }
    }
    expect(headings.map(node => node.textContent)).toEqual(['👘 日常站姿', '⏱️ 观看时段', '🎭 舞台互动']);
  });

});
