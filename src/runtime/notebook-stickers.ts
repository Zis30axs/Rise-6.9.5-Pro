// This catalog is shared by the editor and the writing prompt. IDs never depend on
// the model guessing a Romanized name or a World Book entry being activated.
export const NOTEBOOK_STICKERS = [
  { id: 'mutsumi_unhappy', label: '若叶睦 · 鼓脸', file: 'chibi-wave2-20261114/chibi-01.png' },
  { id: 'mutsumi_smile', label: '若叶睦 · 笑', file: 'chibi-wave2-20261114/chibi-03.png' },
  { id: 'chibi-wave2-02', label: '黑帽 · 闭眼笑', file: 'chibi-wave2-20261114/chibi-02.png' },
  { id: 'chibi-wave2-04', label: '蓝发 · 笑', file: 'chibi-wave2-20261114/chibi-04.png' },
  { id: 'chibi-wave2-05', label: '蓝发 · 挥手', file: 'chibi-wave2-20261114/chibi-05.png' },
  { id: 'chibi-wave2-06', label: '金发 · 手放胸前', file: 'chibi-wave2-20261114/chibi-06.png' },
  { id: 'chibi-wave2-07', label: '紫发 · 闭眼笑', file: 'chibi-wave2-20261114/chibi-07.png' },
  { id: 'chibi-wave2-08', label: '深色短发 · 抱臂', file: 'chibi-wave2-20261114/chibi-08.png' },
  { id: 'mygo-m', label: '乐队字母 · M', file: 'mygo/mygo-m.png' },
  { id: 'mygo-y', label: '乐队字母 · Y', file: 'mygo/mygo-y.png' },
  { id: 'mygo-g', label: '乐队字母 · G', file: 'mygo/mygo-g.png' },
  { id: 'mygo-o', label: '乐队字母 · O', file: 'mygo/mygo-o.png' },
  { id: 'mygo-exclamation', label: '乐队字母 · 叹号', file: 'mygo/mygo-exclamation.png' },
] as const;

export type NotebookStickerId = (typeof NOTEBOOK_STICKERS)[number]['id'];
