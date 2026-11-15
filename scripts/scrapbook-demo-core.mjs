/**
 * Core data definitions, 3D spatial pose math, and state helpers for the
 * standalone 3D Scrapbook Workbench frontend demo.
 * Kept dependency-free so both browser runtime and Vitest share one source of truth.
 */

export const BOOK_SPEC = Object.freeze({
  width: 356,
  height: 492,
  closedDepth: 30,
  coverDepth: 4,
  leftBlockDepth: 11,
  rightBlockDepth: 11,
  hingeZ: 3.5,
  cornerRadius: 14,
});

export const BOOK_THEMES = {
  sage: {
    id: 'sage',
    themeLabel: '苔绿亚麻',
    bookTitle: '森苔手作手账本',
    coverTag: 'BOTANICAL ARCHIVE',
    coverSub: '日常剪贴 · 植物压纹封面',
    backMark: '苔绿亚麻精装系列',
    coverColor: '#cfd8c1',
    coverAccent: '#889a7c',
    spineColor: '#627558',
    metalColor: '#d2b47c',
    inkColor: '#314438',
    ribbonColor: '#76917c',
    linerColor: '#ece9dc',
    cornerFinish: 'brass',
    defaultCharmId: 'charm-bass',
    defaultClipId: 'clip-brass-bar',
    defaultCoverStyle: 'botanical',
  },
  indigo: {
    id: 'indigo',
    themeLabel: '夜空群青',
    bookTitle: '星夜五线笔记本',
    coverTag: 'NOCTURNE FOLIO',
    coverSub: '旋律灵感 · 丝带精装款',
    backMark: '深海群青烫银版',
    coverColor: '#192942',
    coverAccent: '#2b4263',
    spineColor: '#101b2d',
    metalColor: '#aebed4',
    inkColor: '#dce7f7',
    ribbonColor: '#6380ad',
    linerColor: '#dde3ee',
    cornerFinish: 'silver',
    defaultCharmId: 'charm-moon',
    defaultClipId: 'clip-silver-quill',
    defaultCoverStyle: 'classic',
  },
  dusk: {
    id: 'dusk',
    themeLabel: '黑樱柔绒',
    bookTitle: '暮樱丝绒手账本',
    coverTag: 'VELVET JOURNAL',
    coverSub: '咖啡随笔 · 格纹布艺腰封',
    backMark: '丝绒玫瑰金精装款',
    coverColor: '#26212c',
    coverAccent: '#483b50',
    spineColor: '#18141d',
    metalColor: '#dfa7b8',
    inkColor: '#f6cddc',
    ribbonColor: '#e49db6',
    cornerFinish: 'rosegold',
    defaultCharmId: 'charm-sakura',
    defaultClipId: 'clip-rose-heart',
    defaultCoverStyle: 'plaid',
  },
  blossom: {
    id: 'blossom',
    themeLabel: '蜜桃淡紫',
    bookTitle: '晴空莓果拼贴本',
    coverTag: 'PASTEL COLLAGE',
    coverSub: '相片贴纸 · 邮票窗框款',
    backMark: '云霞拼色活页精装',
    coverColor: '#f3d4e3',
    coverAccent: '#d6a9ce',
    spineColor: '#b58ebf',
    metalColor: '#cbb6e2',
    inkColor: '#5c3858',
    ribbonColor: '#c38ec8',
    cornerFinish: 'silver',
    defaultCharmId: 'acrylic-chibi-07',
    defaultClipId: 'clip-peach-cat',
    defaultCoverStyle: 'postage',
  },
};

export const PAPER_STYLES = [
  { id: 'lined', label: '米白横线' },
  { id: 'dot', label: '复古点阵' },
  { id: 'grid', label: '茶格方格' },
  { id: 'kraft', label: '牛皮拼贴' },
  { id: 'music', label: '五线谱页' },
];

export const FONT_STYLES = [
  {
    id: 'handwriting',
    label: '手写楷韵',
    displayStack: "'Segoe Script', 'Bradley Hand', 'LXGW WenKai', 'Kaiti SC', 'STKaiti', 'KaiTi', 'BiauKai', cursive, serif",
    italicStack: "'Segoe Script', 'Apple Chancery', 'Bradley Hand', 'STKaiti', 'KaiTi', cursive, serif",
    bodyStack: "'Segoe Print', 'LXGW WenKai', 'Kaiti SC', 'STKaiti', 'KaiTi', 'BiauKai', 'FangSong', cursive, serif",
  },
  {
    id: 'casual-pen',
    label: '钢笔行草',
    displayStack: "'Segoe Print', 'Apple Chancery', 'Xingkai SC', 'STXingkai', 'HanziPen SC', 'FangSong', 'STFangsong', cursive, serif",
    italicStack: "'Segoe Print', 'Apple Chancery', 'Xingkai SC', 'STXingkai', 'FangSong', cursive, serif",
    bodyStack: "'Segoe Print', 'Bradley Hand', 'HanziPen SC', 'FangSong', 'STFangsong', 'KaiTi', cursive, serif",
  },
  {
    id: 'anthropic-serif',
    label: 'Anthropic 衬线',
    displayStack: "'Anthropic Serif Display', 'Anthropic Serif Text', 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', Georgia, serif",
    italicStack: "'Anthropic Serif Display', 'Anthropic Serif Text', 'Noto Serif SC', 'FangSong', 'STFangsong', Georgia, serif",
    bodyStack: "'Anthropic Serif Text', 'Anthropic Serif Display', 'Noto Serif SC', 'Songti SC', 'STSong', 'FangSong', Georgia, serif",
  },
  {
    id: 'editorial-type',
    label: '古典诗笺',
    displayStack: "'Anthropic Serif Text', 'FangSong', 'STFangsong', 'Noto Serif SC', 'SimSun', serif",
    italicStack: "'Anthropic Serif Display', 'FangSong', 'STFangsong', serif",
    bodyStack: "'Anthropic Serif Text', 'FangSong', 'STFangsong', 'Noto Serif SC', serif",
  },
  {
    id: 'clean-print',
    label: '清秀便签',
    displayStack: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    italicStack: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    bodyStack: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
];

export const INK_COLORS = [
  { id: 'charcoal', label: '深炭墨', hex: '#2e2924' },
  { id: 'sepia', label: '暖焦茶', hex: '#5b3f29' },
  { id: 'navy', label: '群青蓝', hex: '#284166' },
  { id: 'forest', label: '鼠尾苔', hex: '#30503c' },
  { id: 'crimson', label: '朱砂茜', hex: '#9b3830' },
  { id: 'violet', label: '暮堇紫', hex: '#593e6d' },
];

export const TITLE_MARKS = [
  { id: 'none', label: '无划线' },
  { id: 'ink-underline', label: '钢笔底线' },
  { id: 'wave-underline', label: '手绘波浪' },
  { id: 'double-underline', label: '双笔强调' },
  { id: 'highlight-wash', label: '荧光涂抹' },
  { id: 'circle-wrap', label: '手绘椭圆圈' },
];

export const PEN_MARK_PRESETS = [
  { id: 'mark-circle-red', label: '朱红手绘圆圈', kind: 'circle-single', color: '#c94a3c', editable: false, defaultText: '' },
  { id: 'mark-circle-double', label: '蓝墨双圈重点', kind: 'circle-double', color: '#345f9e', editable: false, defaultText: '' },
  { id: 'mark-circle-dashed', label: '星芒虚线圆框', kind: 'circle-dashed', color: '#b8762c', editable: false, defaultText: '' },
  { id: 'mark-underline-wave', label: '手绘波浪下划线', kind: 'underline-wave', color: '#c94a3c', editable: false, defaultText: '' },
  { id: 'mark-underline-double', label: '工整双下划线', kind: 'underline-double', color: '#345f9e', editable: false, defaultText: '' },
  { id: 'mark-underline-loop', label: '回环花边底线', kind: 'underline-loop', color: '#b55678', editable: false, defaultText: '' },
  { id: 'mark-highlight-sun', label: '暖阳荧光横刷', kind: 'highlight-sun', color: '#f4cf53', editable: false, defaultText: '' },
  { id: 'mark-highlight-mint', label: '薄荷高光笔刷', kind: 'highlight-mint', color: '#78cfa0', editable: false, defaultText: '' },
  { id: 'mark-bracket-brace', label: '花括号旁批注', kind: 'bracket-brace', color: '#4a644f', editable: true, defaultText: '重点记这里' },
  { id: 'mark-arrow-curve', label: '手绘拐弯箭头', kind: 'arrow-curve', color: '#c94a3c', editable: true, defaultText: '看这里!' },
  { id: 'mark-star-doodle', label: '五角星着重记号', kind: 'star-doodle', color: '#d48f2a', editable: true, defaultText: '☆ 推荐' },
  { id: 'mark-heart-loop', label: '钢笔小爱心圈', kind: 'heart-loop', color: '#d6607a', editable: false, defaultText: '' },
];

export const WEATHER_OPTIONS = ['晴朗', '微风', '阴天', '小雨', '晚霞', '夜色'];
export const MOOD_OPTIONS = ['平静', '期待', '小确幸', '专注', '微倦', '明快'];

export const STICKER_DEFS = [
  { id: 'mygo-m', group: 'band', label: '乐奈-对指 M', fileKey: 'mygo-m' },
  { id: 'mygo-y', group: 'band', label: '灯-流汗 Y', fileKey: 'mygo-y' },
  { id: 'mygo-g', group: 'band', label: '立希-眨眼 G', fileKey: 'mygo-g' },
  { id: 'mygo-o', group: 'band', label: '素世-认真 O', fileKey: 'mygo-o' },
  { id: 'mygo-exclamation', group: 'band', label: '爱音-闪亮 !', fileKey: 'mygo-exclamation' },
  { id: 'chibi-01', group: 'chibi', label: '睦-鼓脸', fileKey: 'chibi-01' },
  { id: 'chibi-02', group: 'chibi', label: '初华-戴帽眯笑', fileKey: 'chibi-02' },
  { id: 'chibi-03', group: 'chibi', label: '睦-发卡惊喜', fileKey: 'chibi-03' },
  { id: 'chibi-04', group: 'chibi', label: '祥子-仰望笑', fileKey: 'chibi-04' },
  { id: 'chibi-05', group: 'chibi', label: '祥子-招手', fileKey: 'chibi-05' },
  { id: 'chibi-06', group: 'chibi', label: '初华-比叉', fileKey: 'chibi-06' },
  { id: 'chibi-07', group: 'chibi', label: '喵梦-扯脸笑', fileKey: 'chibi-07' },
  { id: 'chibi-08', group: 'chibi', label: '海铃-冷漠抱胸', fileKey: 'chibi-08' },
];

export const PRESSED_PRESETS = [
  { id: 'pressed-ginkgo', label: '金秋银杏叶', kind: 'ginkgo', accent: '#c9933b', tint: 'rgba(232, 191, 96, 0.22)' },
  { id: 'pressed-sakura', label: '粉樱干花瓣', kind: 'sakura', accent: '#d97e9a', tint: 'rgba(244, 188, 206, 0.26)' },
  { id: 'pressed-lavender', label: '熏衣草花束', kind: 'lavender', accent: '#7c64a8', tint: 'rgba(179, 160, 214, 0.24)' },
  { id: 'pressed-clover', label: '四叶幸运草', kind: 'clover', accent: '#4d7c58', tint: 'rgba(136, 182, 146, 0.22)' },
];

export const DOODLE_PRESETS = [
  { id: 'doodle-cloud-bubble', label: '软云朵气泡', kind: 'bubble', editable: true, defaultText: '今天也在发光♪', accent: '#4b6856' },
  { id: 'doodle-star-note', label: '星芒手写条', kind: 'banner', editable: true, defaultText: '秘密角落★', accent: '#3d567a' },
  { id: 'doodle-coffee-ring', label: '咖啡杯渍印记', kind: 'coffee', editable: false, defaultText: 'CAFÉ TIME', accent: '#754e34' },
  { id: 'doodle-paw-trail', label: '猫猫小脚印', kind: 'paws', editable: false, defaultText: 'MEOW', accent: '#6d5948' },
];

export const DESK_MOODS = [
  { id: 'day', label: '日光书桌', short: '日光' },
  { id: 'lamp', label: '暖黄台灯', short: '暖灯' },
  { id: 'night', label: '星夜台灯', short: '夜读' },
];

export const WASHI_TAPES = [
  { id: 'tape-sage-grid', label: '鼠尾草格纹胶带', bg: '#cfd9c3', stripe: '#9cb08c', ink: '#42523d' },
  { id: 'tape-night-gold', label: '星空烫金胶带', bg: '#1e2f4f', stripe: '#e6c87a', ink: '#f7eac5' },
  { id: 'tape-sakura-dot', label: '蜜桃波点胶带', bg: '#f6cad9', stripe: '#ffffff', ink: '#85455d' },
  { id: 'tape-kraft-post', label: '复古牛皮邮边带', bg: '#d4b48c', stripe: '#9f764b', ink: '#4d351e' },
  { id: 'tape-music-bar', label: '五线乐谱胶带', bg: '#f5efe2', stripe: '#575049', ink: '#3e3832' },
  { id: 'tape-sky-check', label: '晴空淡蓝细格带', bg: '#cce0f3', stripe: '#83acd3', ink: '#2c4f73' },
];

export const STAMP_PRESETS = [
  { id: 'stamp-checked', label: '今日已完成', sub: 'DAILY MARK', color: '#9c4c42' },
  { id: 'stamp-music', label: '夜间试音', sub: 'STUDIO TIME', color: '#39557a' },
  { id: 'stamp-tea', label: '热茶小憩', sub: 'TEA BREAK', color: '#547357' },
  { id: 'stamp-star', label: '特别备忘', sub: 'KEEP SAFE', color: '#a57636' },
];

export const CLIPPING_PRESETS = [
  {
    id: 'clip-ring-ticket',
    label: 'Live 演出入场票根',
    kind: 'ticket',
    title: 'LIVE HOUSE PASS',
    subtitle: '地下一层音乐现场 · B 厅',
    meta: '2025.08.29 / 19:00',
    price: '入场存根',
    accent: '#274060',
  },
  {
    id: 'clip-cafe-receipt',
    label: '街角咖啡店小票',
    kind: 'receipt',
    title: '林荫街角烘培咖啡',
    subtitle: '冰拿铁 × 1  黄油司康 × 1',
    meta: '柜台凭条',
    price: '760 日元',
    accent: '#6f523b',
  },
  {
    id: 'clip-tram-pass',
    label: '城市路面电车一日券',
    kind: 'transit',
    title: '路面电车观光一日券',
    subtitle: '老街车站 — 公园西口',
    meta: '有效期内自由乘降',
    price: '400 日元',
    accent: '#4b7359',
  },
  {
    id: 'clip-polaroid',
    label: '拍立得相片卡',
    kind: 'polaroid',
    title: '河畔傍晚散步',
    subtitle: '风把树梢吹得很响',
    meta: '2025.08.30',
    price: '相片记录',
    accent: '#4a5568',
  },
  {
    id: 'clip-store-slip',
    label: '便利店夜宵凭条',
    kind: 'receipt',
    title: '街区便利店 24H',
    subtitle: '热抹茶牛奶 + 鲑鱼饭团',
    meta: '深夜 21:40',
    price: '420 日元',
    accent: '#3e6b65',
  },
  {
    id: 'clip-planetarium',
    label: '天文馆夜场入场券',
    kind: 'ticket',
    title: 'STARLIGHT DOME PASS',
    subtitle: '天象投影 · 秋季星座夜航',
    meta: '20:30 场 · C排 09座',
    price: '夜场票根',
    accent: '#273a5e',
  },
  {
    id: 'clip-matcha-card',
    label: '抹茶芭菲甜品卡',
    kind: 'transit',
    title: '茶寮 · 宇治甜品集点卡',
    subtitle: '季节限定 浓茶白玉圣代',
    meta: '盖章 +1 颗',
    price: '980 日元',
    accent: '#4d7751',
  },
];

export const STICKY_NOTE_PRESETS = [
  { id: 'note-butter', label: '奶油黄折角便签', bg: '#fbf0b8', line: '#e4d383', ink: '#4a3d18', pin: '#d48d53' },
  { id: 'note-sage', label: '鼠尾草方格便签', bg: '#dce7d4', line: '#b2c7a4', ink: '#2d4131', pin: '#65886d' },
  { id: 'note-sakura', label: '淡樱待办便签条', bg: '#fadce6', line: '#e7b4c6', ink: '#5f2f43', pin: '#c96f8f' },
  { id: 'note-sky', label: '晴空云朵便利贴', bg: '#d9ebfa', line: '#a7cce8', ink: '#274662', pin: '#5d8ec0' },
];

export const WAX_SEAL_PRESETS = [
  { id: 'wax-rose', label: '绯红月季火漆章', outer: '#a83c3c', inner: '#7f2424', glyph: '❀', text: 'ROSE' },
  { id: 'wax-navy', label: '月夜星芒火漆印', outer: '#2d456b', inner: '#1c2d4a', glyph: '✦', text: 'NOCTURNE' },
  { id: 'wax-gold', label: '鎏金麦穗封蜡章', outer: '#b88b41', inner: '#8b6527', glyph: '❖', text: 'MEMORY' },
  { id: 'wax-olive', label: '森苔花叶火漆章', outer: '#587556', inner: '#3d543c', glyph: '✿', text: 'GARDEN' },
];

export const CHARM_PRESETS = [
  { id: 'none', label: '不佩戴挂坠', kind: 'none', chain: 'brass', metal: '#d2b47c', accent: '#d2b47c' },
  { id: 'charm-bass', label: '拨片与音符挂坠', kind: 'svg', chain: 'brass', metal: '#d2b47c', accent: '#6f8e77' },
  { id: 'charm-moon', label: '月夜怀表星坠', kind: 'svg', chain: 'silver', metal: '#b9c8dc', accent: '#273f63' },
  { id: 'charm-sakura', label: '樱瓣微光小铃', kind: 'svg', chain: 'rosegold', metal: '#e2aebf', accent: '#f3bfd0' },
  { id: 'charm-star', label: '糖果流星结坠', kind: 'svg', chain: 'silver', metal: '#cbb6e2', accent: '#f5b8d4' },
  { id: 'charm-cat', label: '咖啡杯黑猫坠', kind: 'svg', chain: 'brass', metal: '#caa974', accent: '#363237' },
  { id: 'charm-clover', label: '四叶草黄铜牌', kind: 'svg', chain: 'brass', metal: '#d2b47c', accent: '#5b8761' },
];

export const CHARM_MOUNTS = [
  { id: 'spine-bottom', label: '书脊底部环' },
  { id: 'ribbon-tip', label: '丝带尾端扣' },
  { id: 'corner-right', label: '右下书角孔' },
];

export const BOOK_CLIPS = [
  { id: 'none', label: '无顶部书夹', color: 'transparent', wire: 'transparent' },
  { id: 'clip-brass-bar', label: '复古黄铜长尾夹', color: '#cca668', wire: '#e4c991' },
  { id: 'clip-silver-quill', label: '冷银燕尾金属夹', color: '#8f9fb5', wire: '#c9d5e6' },
  { id: 'clip-rose-heart', label: '玫瑰金镂空夹', color: '#d79bb0', wire: '#eec6d5' },
  { id: 'clip-peach-cat', label: '桃粉猫耳手账夹', color: '#ebb6cb', wire: '#b697ce' },
];

export const COVER_STYLES = [
  { id: 'classic', label: '鎏金菱框丝带结' },
  { id: 'botanical', label: '花叶金箔蕾丝框' },
  { id: 'plaid', label: '织布格纹书腰带' },
  { id: 'postage', label: '邮票压纹相片窗' },
];

export function resolveCharmAnchor(mountId) {
  if (mountId === 'ribbon-tip') return { x: 66, y: 274, z: -2 };
  if (mountId === 'corner-right') return { x: 342, y: 245, z: 2 };
  return { x: 0, y: 245, z: 2 };
}

export function stepCharmPendulum(physics, deltaSec, tiltBias = 0) {
  const dt = clamp(deltaSec, 0.004, 0.04);
  const stiffness = 42;
  const damping = 5.4;
  const accel = -stiffness * (physics.angle - tiltBias) - damping * physics.vel;
  const vel = physics.vel + accel * dt;
  const angle = clamp(physics.angle + vel * dt, -38, 38);
  const tilt = physics.tilt * Math.exp(-6 * dt);
  const settled = Math.abs(angle - tiltBias) < 0.06 && Math.abs(vel) < 0.08 && Math.abs(tilt) < 0.06;
  return {
    angle: settled ? tiltBias : angle,
    vel: settled ? 0 : vel,
    tilt: settled ? 0 : tilt,
    settled,
  };
}

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const angled3DPose = () => ({ yaw: -22, pitch: 15, zoom: 1, isOpen: true });
export const flatEditPose = () => ({ yaw: 0, pitch: 0, zoom: 1.04, isOpen: true });
export const closedFrontPose = () => ({ yaw: -14, pitch: 12, zoom: 0.98, isOpen: false });
export const backCoverPose = () => ({ yaw: 168, pitch: -8, zoom: 0.98, isOpen: false });

export function rotateBookPose(pose, dx, dy) {
  const nextYaw = ((pose.yaw + dx * 0.62 + 180) % 360 + 360) % 360 - 180;
  const nextPitch = clamp(pose.pitch - dy * 0.48, -72, 72);
  return { ...pose, yaw: nextYaw, pitch: nextPitch };
}

export function zoomBookPose(pose, ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) return pose;
  return { ...pose, zoom: clamp(pose.zoom * ratio, 0.52, 1.65) };
}

/**
 * Computes responsive scale so the rotated 3D book solid (either closed single slab
 * or open double-page spread) stays cleanly inside the stage viewport without clipping.
 */
export function fitBookScale(pose, availableWidth, availableHeight) {
  const w = pose.isOpen ? BOOK_SPEC.width * 2 + 28 : BOOK_SPEC.width + 48;
  const h = BOOK_SPEC.height + 168;
  const d = BOOK_SPEC.closedDepth + 12;
  const safeW = Math.max(220, availableWidth - 28);
  const safeH = Math.max(260, availableHeight - 28);
  const base = Math.min(safeW / w, safeH / h) * 0.9;
  const requested = base * pose.zoom;

  const yawRad = (pose.yaw * Math.PI) / 180;
  const pitchRad = (pose.pitch * Math.PI) / 180;
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = (sx * w) / 2;
        const y = (sy * h) / 2;
        const z = (sz * d) / 2;
        const turnedZ = -x * Math.sin(yawRad) + z * Math.cos(yawRad);
        corners.push({
          x: x * Math.cos(yawRad) + z * Math.sin(yawRad),
          y: y * Math.cos(pitchRad) - turnedZ * Math.sin(pitchRad),
          z: y * Math.sin(pitchRad) + turnedZ * Math.cos(pitchRad),
        });
      }
    }
  }

  const fits = (scale) =>
    corners.every((pt) => {
      const denom = 1800 - scale * pt.z;
      if (denom <= 200) return false;
      const p = 1800 / denom;
      return Math.abs(pt.x * scale * p) <= safeW / 2 && Math.abs(pt.y * scale * p) <= safeH / 2;
    });

  if (fits(requested)) return requested;
  let low = 0.1;
  let high = requested;
  for (let i = 0; i < 16; i += 1) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return low;
}

export function isBackFacing(yaw) {
  return Math.cos((yaw * Math.PI) / 180) < 0;
}

export function isFlatEnough(pose) {
  return Math.abs(pose.yaw) < 0.05 && Math.abs(pose.pitch) < 0.05;
}

function normalizeSide(side) {
  if (side === 'left' || side === 'right' || side === 'cover') return side;
  return 'right';
}

function makeDemoItem(overrides) {
  const allowedTypes = new Set([
    'sticker',
    'tape',
    'stamp',
    'clipping',
    'note',
    'wax',
    'pressed',
    'doodle',
    'mark',
    'receipt',
    'chat-snippet',
  ]);
  const safeType = allowedTypes.has(overrides.type) ? overrides.type : 'sticker';
  const item = {
    id: overrides.id,
    type: safeType,
    presetId: overrides.presetId,
    side: normalizeSide(overrides.side),
    x: clamp(overrides.x ?? 50, 8, 92),
    y: clamp(overrides.y ?? 50, 8, 92),
    rotate: clamp(overrides.rotate ?? 0, -65, 65),
    scale: clamp(overrides.scale ?? 1, 0.55, 1.7),
    opacity: clamp(overrides.opacity ?? 1, 0.35, 1),
    zIndex: overrides.zIndex ?? 1,
    caption: overrides.caption ?? '',
    flipX: Boolean(overrides.flipX ?? false),
  };
  if (typeof overrides.tint === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(overrides.tint.trim())) {
    item.tint = overrides.tint.trim();
  }
  if (overrides.sourceRef && typeof overrides.sourceRef === 'object') {
    item.sourceRef = {
      kind: String(overrides.sourceRef.kind || 'world'),
      id: String(overrides.sourceRef.id || ''),
      day: Number.isSafeInteger(overrides.sourceRef.day) ? overrides.sourceRef.day : 1,
    };
  }
  if (overrides.dataPayload && typeof overrides.dataPayload === 'object') {
    item.dataPayload = structuredClone(overrides.dataPayload);
  }
  return item;
}

export function buildDefaultCoverItemsByTheme() {
  return {
    sage: [
      makeDemoItem({
        id: 'cov-sg-1',
        type: 'clipping',
        presetId: 'clip-polaroid',
        side: 'cover',
        x: 27,
        y: 26,
        rotate: -7,
        scale: 0.72,
        zIndex: 2,
        caption: '雨后林荫树影',
      }),
      makeDemoItem({
        id: 'cov-sg-2',
        type: 'tape',
        presetId: 'tape-sage-grid',
        side: 'cover',
        x: 24,
        y: 15,
        rotate: -14,
        scale: 0.84,
        opacity: 0.92,
        zIndex: 4,
      }),
      makeDemoItem({
        id: 'cov-sg-3',
        type: 'stamp',
        presetId: 'stamp-tea',
        side: 'cover',
        x: 76,
        y: 19,
        rotate: 9,
        scale: 0.82,
        opacity: 0.88,
        zIndex: 3,
      }),
      makeDemoItem({
        id: 'cov-sg-4',
        type: 'sticker',
        presetId: 'chibi-01',
        side: 'cover',
        x: 24,
        y: 80,
        rotate: -6,
        scale: 0.86,
        zIndex: 4,
      }),
      makeDemoItem({
        id: 'cov-sg-5',
        type: 'wax',
        presetId: 'wax-gold',
        side: 'cover',
        x: 77,
        y: 80,
        rotate: -9,
        scale: 0.92,
        zIndex: 5,
      }),
    ],
    indigo: [
      makeDemoItem({
        id: 'cov-in-1',
        type: 'tape',
        presetId: 'tape-night-gold',
        side: 'cover',
        x: 24,
        y: 17,
        rotate: -28,
        scale: 0.9,
        opacity: 0.92,
        zIndex: 3,
      }),
      makeDemoItem({
        id: 'cov-in-2',
        type: 'clipping',
        presetId: 'clip-ring-ticket',
        side: 'cover',
        x: 74,
        y: 22,
        rotate: 6,
        scale: 0.76,
        zIndex: 2,
      }),
      makeDemoItem({
        id: 'cov-in-3',
        type: 'sticker',
        presetId: 'chibi-02',
        side: 'cover',
        x: 79,
        y: 32,
        rotate: 8,
        scale: 0.82,
        zIndex: 4,
      }),
      makeDemoItem({
        id: 'cov-in-4',
        type: 'wax',
        presetId: 'wax-navy',
        side: 'cover',
        x: 25,
        y: 80,
        rotate: 6,
        scale: 0.94,
        zIndex: 5,
      }),
      makeDemoItem({
        id: 'cov-in-5',
        type: 'tape',
        presetId: 'tape-music-bar',
        side: 'cover',
        x: 74,
        y: 82,
        rotate: -10,
        scale: 0.88,
        opacity: 0.9,
        zIndex: 3,
      }),
    ],
    dusk: [
      makeDemoItem({
        id: 'cov-dk-1',
        type: 'clipping',
        presetId: 'clip-cafe-receipt',
        side: 'cover',
        x: 28,
        y: 21,
        rotate: -5,
        scale: 0.76,
        zIndex: 2,
      }),
      makeDemoItem({
        id: 'cov-dk-2',
        type: 'tape',
        presetId: 'tape-sakura-dot',
        side: 'cover',
        x: 27,
        y: 11,
        rotate: 7,
        scale: 0.84,
        opacity: 0.92,
        zIndex: 4,
      }),
      makeDemoItem({
        id: 'cov-dk-3',
        type: 'stamp',
        presetId: 'stamp-checked',
        side: 'cover',
        x: 76,
        y: 19,
        rotate: -8,
        scale: 0.84,
        opacity: 0.88,
        zIndex: 3,
      }),
      makeDemoItem({
        id: 'cov-dk-4',
        type: 'sticker',
        presetId: 'chibi-04',
        side: 'cover',
        x: 23,
        y: 80,
        rotate: 7,
        scale: 0.86,
        zIndex: 4,
      }),
      makeDemoItem({
        id: 'cov-dk-5',
        type: 'wax',
        presetId: 'wax-rose',
        side: 'cover',
        x: 78,
        y: 79,
        rotate: -10,
        scale: 0.94,
        zIndex: 5,
      }),
    ],
    blossom: [
      makeDemoItem({
        id: 'cov-bl-1',
        type: 'tape',
        presetId: 'tape-sky-check',
        side: 'cover',
        x: 24,
        y: 15,
        rotate: -24,
        scale: 0.88,
        opacity: 0.9,
        zIndex: 3,
      }),
      makeDemoItem({
        id: 'cov-bl-2',
        type: 'note',
        presetId: 'note-sakura',
        side: 'cover',
        x: 28,
        y: 27,
        rotate: -4,
        scale: 0.8,
        opacity: 0.96,
        zIndex: 4,
        caption: '今天也要开心 ✨',
      }),
      makeDemoItem({
        id: 'cov-bl-3',
        type: 'sticker',
        presetId: 'mygo-exclamation',
        side: 'cover',
        x: 78,
        y: 20,
        rotate: 11,
        scale: 0.74,
        zIndex: 4,
      }),
      makeDemoItem({
        id: 'cov-bl-4',
        type: 'wax',
        presetId: 'wax-olive',
        side: 'cover',
        x: 25,
        y: 80,
        rotate: 8,
        scale: 0.92,
        zIndex: 4,
      }),
      makeDemoItem({
        id: 'cov-bl-5',
        type: 'sticker',
        presetId: 'chibi-07',
        side: 'cover',
        x: 77,
        y: 79,
        rotate: -7,
        scale: 0.88,
        zIndex: 5,
      }),
    ],
  };
}

export function buildDefaultSpreadsByTheme() {
  return {
    sage: [
      {
        id: 'sage-p1',
        label: '第 1 跨页 · 散步与热茶',
        paperStyle: 'lined',
        left: {
          date: '2025年8月28日',
          title: '傍晚街角烘焙坊',
          weather: '晚霞',
          mood: '平静',
          body: '走出街口时天边刚好泛起橘粉色。顺路在老面包店带了一整条全麦吐司和乌龙茶包。\n\n明天把买回来的新车票与票根贴在下面留白处。',
        },
        right: {
          date: '2025年8月29日',
          title: '桌面文具整理单',
          weather: '晴朗',
          mood: '小确幸',
          body: '清晨把铜扣挂坠擦亮，又补齐了新拆的纸胶带。\n• 整理和纸贴纸盒\n• 挑选下周约会或出游的明信片\n• 睡前写三件今天最喜欢的小事',
        },
        items: [
          makeDemoItem({ id: 'sg-1', type: 'clipping', presetId: 'clip-tram-pass', side: 'left', x: 50, y: 74, rotate: -4, scale: 0.96, zIndex: 2 }),
          makeDemoItem({ id: 'sg-2', type: 'tape', presetId: 'tape-sage-grid', side: 'left', x: 50, y: 60, rotate: -7, scale: 1.05, opacity: 0.88, zIndex: 3 }),
          makeDemoItem({ id: 'sg-3', type: 'sticker', presetId: 'chibi-01', side: 'right', x: 77, y: 74, rotate: 6, scale: 1.05, zIndex: 4 }),
          makeDemoItem({ id: 'sg-4', type: 'stamp', presetId: 'stamp-tea', side: 'right', x: 26, y: 80, rotate: -9, scale: 0.92, opacity: 0.86, zIndex: 2 }),
          makeDemoItem({ id: 'sg-5', type: 'sticker', presetId: 'mygo-m', side: 'left', x: 83, y: 80, rotate: -8, scale: 0.78, zIndex: 5 }),
        ],
      },
      {
        id: 'sage-p2',
        label: '第 2 跨页 · 林荫午后随想',
        paperStyle: 'dot',
        left: {
          date: '2025年8月30日',
          title: '河畔木长椅旁的光斑',
          weather: '微风',
          mood: '明快',
          body: '傍晚沿着林荫步道走了半小时，银杏叶子还是浅绿色。带回家几张干净的咖啡杯垫夹在末页。',
        },
        right: {
          date: '周末备忘',
          title: '下周手账灵感',
          weather: '晴朗',
          mood: '专注',
          body: '留好一格拍立得相片框，把晴天的天空和路边花朵都存进来。',
        },
        items: [
          makeDemoItem({ id: 'sg-21', type: 'clipping', presetId: 'clip-polaroid', side: 'left', x: 48, y: 75, rotate: 3, scale: 0.96, zIndex: 2 }),
          makeDemoItem({ id: 'sg-22', type: 'tape', presetId: 'tape-kraft-post', side: 'left', x: 29, y: 63, rotate: -26, scale: 0.9, opacity: 0.9, zIndex: 3 }),
          makeDemoItem({ id: 'sg-24', type: 'pressed', presetId: 'pressed-ginkgo', side: 'right', x: 30, y: 72, rotate: -14, scale: 0.98, zIndex: 2 }),
          makeDemoItem({ id: 'sg-25', type: 'doodle', presetId: 'doodle-cloud-bubble', side: 'right', x: 64, y: 55, rotate: -4, scale: 0.96, zIndex: 4, caption: '今天的风很温柔♪' }),
          makeDemoItem({ id: 'sg-23', type: 'sticker', presetId: 'chibi-03', side: 'right', x: 75, y: 76, rotate: -5, scale: 1.0, zIndex: 3 }),
        ],
      },
    ],
    indigo: [
      {
        id: 'indigo-p1',
        label: '第 1 跨页 · 夜间旋律与票据',
        paperStyle: 'music',
        left: {
          date: '2025年8月28日',
          title: '副歌前奏小节记号',
          weather: '夜色',
          mood: '专注',
          body: '转调过渡改成在第八小节放慢半拍，留出一点干净的呼吸空间。\n\n试音之后喝了一杯热可可，夜晚的风很安静。',
        },
        right: {
          date: '2025年8月29日',
          title: '夜间杂物收支核对',
          weather: '阴天',
          mood: '平静',
          body: '养成随手记下交通与文具开销的好习惯：\n• 往返电车车票存根\n• 活页乐谱纸补充包\n• 睡前记得关灯听完整张专辑',
        },
        items: [
          makeDemoItem({ id: 'in-1', type: 'tape', presetId: 'tape-night-gold', side: 'left', x: 72, y: 14, rotate: 12, scale: 1.0, opacity: 0.92, zIndex: 3 }),
          makeDemoItem({ id: 'in-2', type: 'stamp', presetId: 'stamp-music', side: 'left', x: 26, y: 79, rotate: -6, scale: 0.98, opacity: 0.88, zIndex: 2 }),
          makeDemoItem({ id: 'in-5', type: 'wax', presetId: 'wax-navy', side: 'left', x: 78, y: 77, rotate: -10, scale: 0.95, opacity: 0.96, zIndex: 4 }),
          makeDemoItem({ id: 'in-3', type: 'clipping', presetId: 'clip-store-slip', side: 'right', x: 46, y: 74, rotate: 2, scale: 0.96, zIndex: 2 }),
          makeDemoItem({ id: 'in-6', type: 'note', presetId: 'note-sky', side: 'right', x: 78, y: 46, rotate: 4, scale: 0.95, opacity: 0.98, zIndex: 3, caption: '明早核对旋律小样' }),
          makeDemoItem({ id: 'in-4', type: 'sticker', presetId: 'chibi-02', side: 'right', x: 80, y: 20, rotate: 7, scale: 0.92, zIndex: 4 }),
        ],
      },
      {
        id: 'indigo-p2',
        label: '第 2 跨页 · 唱片店试听录',
        paperStyle: 'grid',
        left: {
          date: '2025年8月31日',
          title: '线材与随身器材清点',
          weather: '微风',
          mood: '期待',
          body: '便携耳机与转接头收进绒布收纳袋，出门不会再找不到了。',
        },
        right: {
          date: '月初清单',
          title: '想循环播放的三首歌',
          weather: '晴朗',
          mood: '专注',
          body: '把最喜欢的副歌歌词手抄在方格页右侧，配上星芒火漆刚好合衬。',
        },
        items: [
          makeDemoItem({ id: 'in-21', type: 'tape', presetId: 'tape-music-bar', side: 'left', x: 50, y: 66, rotate: -3, scale: 1.05, opacity: 0.9, zIndex: 2 }),
          makeDemoItem({ id: 'in-22', type: 'sticker', presetId: 'chibi-05', side: 'right', x: 74, y: 75, rotate: -6, scale: 1.02, zIndex: 3 }),
        ],
      },
    ],
    dusk: [
      {
        id: 'dusk-p1',
        label: '第 1 跨页 · 咖啡馆与写生簿',
        paperStyle: 'dot',
        left: {
          date: '2025年8月28日',
          title: '阳台下午茶小记',
          weather: '晴朗',
          mood: '明快',
          body: '阳光照在淡蓝水彩纸上干得特别快！下午沿街散步拍了几条光线温柔的小巷，贴张相框在旁边。',
        },
        right: {
          date: '2025年8月29日',
          title: '好味道甜点收藏',
          weather: '微风',
          mood: '小确幸',
          body: '今天挑到的黄油司康刚出炉还带香气，下次约上好朋友一起来打包两盒当周末点心！',
        },
        items: [
          makeDemoItem({ id: 'dk-1', type: 'clipping', presetId: 'clip-polaroid', side: 'left', x: 50, y: 72, rotate: -5, scale: 0.98, zIndex: 2, caption: '阳光落在画架边缘' }),
          makeDemoItem({ id: 'dk-2', type: 'tape', presetId: 'tape-sakura-dot', side: 'left', x: 50, y: 51, rotate: -4, scale: 0.94, opacity: 0.9, zIndex: 4 }),
          makeDemoItem({ id: 'dk-3', type: 'clipping', presetId: 'clip-cafe-receipt', side: 'right', x: 46, y: 74, rotate: 4, scale: 0.95, zIndex: 2 }),
          makeDemoItem({ id: 'dk-4', type: 'sticker', presetId: 'chibi-04', side: 'right', x: 78, y: 74, rotate: 8, scale: 1.05, zIndex: 5 }),
        ],
      },
      {
        id: 'dusk-p2',
        label: '第 2 跨页 · 暮色写生笔记',
        paperStyle: 'kraft',
        left: {
          date: '2025年8月31日',
          title: '暖色水彩试色页',
          weather: '晚霞',
          mood: '专注',
          body: '今天调出了很温柔的干枯玫瑰色与深可可棕，刚好和黑樱色手账封面搭成一组。',
        },
        right: {
          date: '周末散步',
          title: '旧书店收据存根',
          weather: '微风',
          mood: '平静',
          body: '淘到一本纸页微黄的旧画集，还附带一张复古花纹书签。',
        },
        items: [
          makeDemoItem({ id: 'dk-21', type: 'wax', presetId: 'wax-rose', side: 'left', x: 76, y: 78, rotate: -8, scale: 0.95, zIndex: 3 }),
          makeDemoItem({ id: 'dk-22', type: 'sticker', presetId: 'chibi-06', side: 'right', x: 74, y: 74, rotate: 5, scale: 0.98, zIndex: 4 }),
        ],
      },
    ],
    blossom: [
      {
        id: 'blossom-p1',
        label: '第 1 跨页 · 每日小确幸拼贴',
        paperStyle: 'grid',
        left: {
          date: '2025年8月28日',
          title: '今日元气满分宣言',
          weather: '晴朗',
          mood: '期待',
          body: '把每天顺手攒下的可爱糖纸、书店小票和心情印章都整齐贴在本子里，翻开就会开心起来！',
        },
        right: {
          date: '2025年8月29日',
          title: '出门随身好心情小贴士',
          weather: '微风',
          mood: '明快',
          body: '• 背带调好最舒服的高度再出门\n• 包里常备薄荷糖和小镜子\n• 睡前写三件今日值得庆祝的小事',
        },
        items: [
          makeDemoItem({ id: 'bl-1', type: 'sticker', presetId: 'mygo-exclamation', side: 'left', x: 80, y: 78, rotate: 12, scale: 0.85, zIndex: 4 }),
          makeDemoItem({ id: 'bl-2', type: 'stamp', presetId: 'stamp-checked', side: 'left', x: 30, y: 78, rotate: -10, scale: 1.0, opacity: 0.88, zIndex: 3 }),
          makeDemoItem({ id: 'bl-3', type: 'sticker', presetId: 'chibi-07', side: 'right', x: 75, y: 73, rotate: -6, scale: 1.06, zIndex: 4 }),
          makeDemoItem({ id: 'bl-4', type: 'tape', presetId: 'tape-sky-check', side: 'right', x: 44, y: 80, rotate: 5, scale: 1.0, opacity: 0.88, zIndex: 2 }),
        ],
      },
      {
        id: 'blossom-p2',
        label: '第 2 跨页 · 甜品与晴空照片墙',
        paperStyle: 'dot',
        left: {
          date: '2025年9月1日',
          title: '九月第一天的小目标',
          weather: '晴朗',
          mood: '明快',
          body: '每天挑一张最顺眼的心情贴纸盖上完成印章，攒满这一整本！',
        },
        right: {
          date: '好物拼贴',
          title: '今日便利店发现',
          weather: '微风',
          mood: '小确幸',
          body: '限定款草莓气泡水瓶身好好看，决定留一张记录纸夹在右侧袋子里。',
        },
        items: [
          makeDemoItem({ id: 'bl-21', type: 'clipping', presetId: 'clip-store-slip', side: 'left', x: 50, y: 75, rotate: -3, scale: 0.94, zIndex: 2 }),
          makeDemoItem({ id: 'bl-22', type: 'sticker', presetId: 'chibi-08', side: 'right', x: 76, y: 74, rotate: 6, scale: 1.02, zIndex: 3 }),
        ],
      },
    ],
  };
}

export function createBlankSpread(index) {
  return {
    id: `custom-${Date.now()}-${index}`,
    label: `第 ${index} 跨页 · 自由拼贴`,
    paperStyle: 'dot',
    left: {
      date: '2025年9月1日',
      title: '新建左页手记',
      weather: '晴朗',
      mood: '平静',
      body: '点击这里直接写下今天发生的趣事，或者从右侧贴纸盒拖选图案妆点版面。',
    },
    right: {
      date: '当日随想',
      title: '右侧拼贴留白',
      weather: '微风',
      mood: '期待',
      body: '贴一张车票存根、咖啡馆小票或和纸胶带，把零碎日常留在本子里。',
    },
    items: [],
  };
}

export function createItemFromPreset(type, presetId, side = 'right', existingItems = [], extra = {}) {
  const safeSide = normalizeSide(side);
  const maxZ = existingItems.reduce((acc, item) => Math.max(acc, item.zIndex || 1), 1);
  const spreadOffset = (existingItems.length % 5) * 6 - 10;
  const defaultY = safeSide === 'cover' ? 25 + (existingItems.length % 2) * 52 : 64 + ((existingItems.length % 3) - 1) * 7;
  const doodlePreset = type === 'doodle'
    ? DOODLE_PRESETS.find((d) => d.id === presetId)
    : type === 'mark'
      ? PEN_MARK_PRESETS.find((m) => m.id === presetId)
      : null;
  const fallbackCaption = type === 'note'
    ? '记得按时喝温水\n顺路去买花茶包'
    : (doodlePreset?.editable ? doodlePreset.defaultText : '');
  const defaultCaption = extra.caption !== undefined ? String(extra.caption) : fallbackCaption;
  return makeDemoItem({
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    presetId,
    side: safeSide,
    x: clamp(extra.x ?? (50 + spreadOffset), 18, 82),
    y: clamp(extra.y ?? defaultY, 16, 84),
    rotate: extra.rotate ?? (type === 'tape' ? -8 + (existingItems.length % 4) * 5 : type === 'mark' ? ((existingItems.length % 3) - 1) * 3 : ((existingItems.length % 3) - 1) * 6),
    scale: extra.scale ?? (type === 'sticker' ? (safeSide === 'cover' ? 0.88 : 0.96) : safeSide === 'cover' ? 0.88 : 1),
    opacity: type === 'tape' ? 0.9 : 1,
    zIndex: maxZ + 1,
    caption: defaultCaption,
    flipX: false,
    ...(typeof extra.tint === 'string' ? { tint: extra.tint } : {}),
    sourceRef: extra.sourceRef,
    dataPayload: extra.dataPayload,
  });
}

export function updatePlacedItem(items, id, patch) {
  return items.map((item) => {
    if (item.id !== id) return item;
    const nextTint = typeof patch.tint === 'string'
      ? (/^#[0-9a-fA-F]{3,8}$/.test(patch.tint.trim()) ? patch.tint.trim() : item.tint)
      : item.tint;
    return {
      ...item,
      ...patch,
      ...(nextTint ? { tint: nextTint } : {}),
      side: patch.side === 'left' || patch.side === 'right' || patch.side === 'cover' ? patch.side : item.side,
      x: patch.x !== undefined ? clamp(Number(patch.x), 6, 94) : item.x,
      y: patch.y !== undefined ? clamp(Number(patch.y), 6, 94) : item.y,
      rotate: patch.rotate !== undefined ? clamp(Number(patch.rotate), -65, 65) : item.rotate,
      scale: patch.scale !== undefined ? clamp(Number(patch.scale), 0.55, 1.7) : item.scale,
      opacity: patch.opacity !== undefined ? clamp(Number(patch.opacity), 0.35, 1) : item.opacity,
      flipX: patch.flipX !== undefined ? Boolean(patch.flipX) : Boolean(item.flipX),
      sourceRef: item.sourceRef,
      dataPayload: patch.dataPayload !== undefined ? patch.dataPayload : item.dataPayload,
    };
  });
}

export function moveItemLayer(items, id, direction) {
  const target = items.find((i) => i.id === id);
  if (!target) return items;
  if (direction === 'front') {
    const maxZ = items.reduce((m, i) => Math.max(m, i.zIndex), 1);
    return items.map((i) => (i.id === id ? { ...i, zIndex: maxZ + 1 } : i));
  }
  return items.map((i) => (i.id === id ? { ...i, zIndex: Math.max(1, i.zIndex - 1) } : i));
}

export const WORLD_WEATHER_META = Object.freeze({
  sunny: { id: 'sunny', label: '晴', icon: '☀️', spreadWeather: '晴朗' },
  cloudy: { id: 'cloudy', label: '多云', icon: '☁️', spreadWeather: '多云' },
  rain: { id: 'rain', label: '雨', icon: '🌧️', spreadWeather: '小雨' },
  storm: { id: 'storm', label: '暴雨', icon: '⛈️', spreadWeather: '雷雨' },
  snow: { id: 'snow', label: '雪', icon: '❄️', spreadWeather: '初雪' },
  hot: { id: 'hot', label: '炎热', icon: '🥵', spreadWeather: '晴朗' },
});

const WORLD_CALENDAR_START_UTC = Date.UTC(2025, 7, 28);
const WORLD_WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const OWNER_THEME_MAP = { soyo: 'sage', sakiko: 'indigo', emma: 'dusk', renako: 'blossom' };
const OWNER_SHORT_NAMES = { soyo: '素世', sakiko: '祥子', emma: '艾玛', renako: '玲奈子' };

const WORLD_LOCATION_LABELS = {
  gate: '校园南门',
  'south-gate': '校园南门',
  library: '图书馆',
  cafe: '街角咖啡店',
  'street-cafe': '街边咖啡馆',
  'margo-cafe': '玛格咖啡馆',
  dorm: '学生公寓',
  teaching: '教学楼',
  sports: '运动场',
  junction: '南门十字路口',
  bookshop: '街角书店',
  convenience: '便利店',
  'pocket-park': '口袋公园',
  'grand-commercial': '大型商业区',
  livehouse: 'CiRCLE 排练室',
  clinic: '全科诊所',
  'law-office': '枫庭事务所',
};

export function formatWorldCalendarDay(day) {
  const safeDay = Number.isSafeInteger(day) && day >= 1 ? day : 1;
  const dt = new Date(WORLD_CALENDAR_START_UTC + (safeDay - 1) * 86_400_000);
  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth() + 1;
  const date = dt.getUTCDate();
  const weekday = (dt.getUTCDay() + 6) % 7;
  const iso = dt.toISOString().slice(0, 10);
  const padM = String(month).padStart(2, '0');
  const padD = String(date).padStart(2, '0');
  const weekdayLabel = WORLD_WEEKDAYS[weekday] || '周一';
  return {
    day: safeDay,
    iso,
    year,
    month,
    date,
    weekdayLabel,
    display: `${year}年${month}月${date}日 ${weekdayLabel}`,
    shortDate: `${year}年${month}月${date}日`,
    dotDate: `${year}.${padM}.${padD}`,
  };
}

export const WORLD_SNAPSHOT_PRESETS = Object.freeze([
  {
    snapshotId: 'snap-sage',
    ownerId: 'soyo',
    themeId: 'sage',
    label: '南门晴日 · 午后茶座',
    clock: { day: 1, hour: 16, minute: 20 },
    weatherId: 'sunny',
    locationId: 'south-gate',
    locationName: '校园南门',
    player: { energy: 86, morale: 78, stress: 18, health: 96, balance: 14200 },
    transactions: [
      { id: 'tx-sg-1', shop: '玛格咖啡馆', itemLabel: '热拿铁 ×1', amountYen: 440, timeText: '14:15', meta: '南门街区', accent: '#6c5138' },
      { id: 'tx-sg-2', shop: '南门交通站', itemLabel: '都营电车单程票', amountYen: 220, timeText: '15:08', meta: '乘车凭条', accent: '#3d5e52' },
    ],
    messages: [
      { id: 'msg-sg-1', sender: '立希', stickerId: 'mygo-g', timeText: '15:40', location: 'CiRCLE', text: '晚上六点排练别忘了带贝斯谱子！', accent: '#53456b' },
      { id: 'msg-sg-2', sender: '爱音', stickerId: 'mygo-exclamation', timeText: '16:12', location: '街角', text: '刚拍到一只超级听话的三花猫，等下拿给你看♪', accent: '#b85c79' },
    ],
    journalEntries: [
      { id: 'jr-sg-1', title: '午后林荫道走一走', text: '沿着南门银杏道散步回来，口袋里还留着半包海盐薄荷糖。', atLabel: '16:05 · 校园南门' },
    ],
  },
  {
    snapshotId: 'snap-indigo',
    ownerId: 'sakiko',
    themeId: 'indigo',
    label: '商业区暮色 · 排练收尾',
    clock: { day: 2, hour: 18, minute: 40 },
    weatherId: 'cloudy',
    locationId: 'grand-commercial',
    locationName: '大型商业区',
    player: { energy: 64, morale: 62, stress: 42, health: 90, balance: 23600 },
    transactions: [
      { id: 'tx-in-1', shop: '乐器器材铺', itemLabel: '镀膜琴弦套装 ×1', amountYen: 1380, timeText: '16:30', meta: '耗材添置', accent: '#2f4566' },
      { id: 'tx-in-2', shop: '便利店', itemLabel: '黑糖茶饮 & 蛋沙拉三明治', amountYen: 360, timeText: '17:55', meta: '夜晚补给', accent: '#446353' },
    ],
    messages: [
      { id: 'msg-in-1', sender: '初华', stickerId: 'chibi-02', timeText: '18:05', location: '排练室 B', text: '灯光已经调暖了，晚点我们再对一遍副歌转调。', accent: '#486086' },
      { id: 'msg-in-2', sender: '睦', stickerId: 'chibi-03', timeText: '18:22', location: '天台花箱', text: '小黄瓜苗今天长出第二对叶片了。', accent: '#4e6b58' },
    ],
    journalEntries: [
      { id: 'jr-in-1', title: '副歌节拍备忘', text: '桥段降半音后的钢琴尾音再松一点，明晚加练十五分钟。', atLabel: '18:35 · 大型商业区' },
    ],
  },
  {
    snapshotId: 'snap-dusk',
    ownerId: 'emma',
    themeId: 'dusk',
    label: '口袋公园 · 雨夜暖饮',
    clock: { day: 4, hour: 21, minute: 15 },
    weatherId: 'rain',
    locationId: 'pocket-park',
    locationName: '口袋公园',
    player: { energy: 52, morale: 68, stress: 36, health: 88, balance: 11850 },
    transactions: [
      { id: 'tx-dk-1', shop: '玛格咖啡馆', itemLabel: '粉樱热可可 ×1', amountYen: 380, timeText: '19:20', meta: '雨夜限定', accent: '#9b4a62' },
      { id: 'tx-dk-2', shop: '枫庭事务所', itemLabel: '卷宗装订耗材', amountYen: 200, timeText: '17:10', meta: '工作杂项', accent: '#5f4b44' },
    ],
    messages: [
      { id: 'msg-dk-1', sender: '风堇', stickerId: 'chibi-05', timeText: '20:30', location: '全科诊所', text: '外头雨势见凉，记得趁热喝完早点盖被休息哦。', accent: '#b36b82' },
      { id: 'msg-dk-2', sender: '雪莉', stickerId: 'chibi-04', timeText: '20:48', location: '事务所', text: '明早要核对的两份公开证言已经夹在桌角文件夹啦！', accent: '#614a70' },
    ],
    journalEntries: [
      { id: 'jr-dk-1', title: '听雨记事一页', text: '雨点叩在窗棂上很令人安心，今天整理的案卷也顺利收工。', atLabel: '21:10 · 口袋公园' },
    ],
  },
  {
    snapshotId: 'snap-blossom',
    ownerId: 'renako',
    themeId: 'blossom',
    label: '九月报到日 · 微风上午',
    clock: { day: 5, hour: 10, minute: 30 },
    weatherId: 'sunny',
    locationId: 'bookshop',
    locationName: '街角书店',
    player: { energy: 92, morale: 85, stress: 15, health: 98, balance: 9500 },
    transactions: [
      { id: 'tx-bl-1', shop: '街角书店', itemLabel: '方格活页本 & 墨水笔', amountYen: 680, timeText: '09:50', meta: '文具采购', accent: '#6d578c' },
      { id: 'tx-bl-2', shop: '便利店', itemLabel: '草莓气泡水 ×1', amountYen: 190, timeText: '10:15', meta: '散步随手买', accent: '#c56b84' },
    ],
    messages: [
      { id: 'msg-bl-1', sender: '真唯', stickerId: 'chibi-07', timeText: '09:40', location: '教学楼广场', text: '办完报到一起喝杯东西吧，可不准偷偷溜回房间。', accent: '#9d72b3' },
      { id: 'msg-bl-2', sender: '紫阳花', stickerId: 'chibi-06', timeText: '10:05', location: '书店窗边', text: '新学期一起去逛逛街角新开的甜品摊吧♪', accent: '#5a7d6c' },
    ],
    journalEntries: [
      { id: 'jr-bl-1', title: '九月第一天的期待', text: '背好随身包站在晴朗路口，把刚买的新贴纸放进内袋！', atLabel: '10:25 · 街角书店' },
    ],
  },
]);

export function normalizeWorldSnapshot(raw) {
  const base = WORLD_SNAPSHOT_PRESETS[0];
  if (!raw || typeof raw !== 'object') return structuredClone(base);
  const ownerId = OWNER_THEME_MAP[raw.ownerId] ? raw.ownerId : base.ownerId;
  const themeId = BOOK_THEMES[raw.themeId] ? raw.themeId : OWNER_THEME_MAP[ownerId] || 'sage';
  const day = Number.isSafeInteger(raw.clock?.day) && raw.clock.day >= 1 ? raw.clock.day : 1;
  const hour = Number.isSafeInteger(raw.clock?.hour) ? clamp(raw.clock.hour, 0, 23) : 12;
  const minute = Number.isSafeInteger(raw.clock?.minute) ? clamp(raw.clock.minute, 0, 59) : 0;
  const weatherId = WORLD_WEATHER_META[raw.weatherId] ? raw.weatherId : 'sunny';
  const locationId = typeof raw.locationId === 'string' && raw.locationId ? raw.locationId : 'south-gate';
  const locationName = typeof raw.locationName === 'string' && raw.locationName.trim()
    ? raw.locationName.trim().slice(0, 24)
    : (WORLD_LOCATION_LABELS[locationId] || '南门街区');
  return {
    snapshotId: typeof raw.snapshotId === 'string' && raw.snapshotId ? raw.snapshotId : `snap-${ownerId}-${day}`,
    ownerId,
    themeId,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim().slice(0, 40) : `${locationName} · 第 ${day} 天`,
    clock: { day, hour, minute },
    weatherId,
    locationId,
    locationName,
    player: {
      energy: clamp(Number(raw.player?.energy ?? 80), 0, 100),
      morale: clamp(Number(raw.player?.morale ?? 72), 0, 100),
      stress: clamp(Number(raw.player?.stress ?? 24), 0, 100),
      health: clamp(Number(raw.player?.health ?? 92), 0, 100),
      balance: Math.max(0, Math.round(Number(raw.player?.balance ?? 10000))),
    },
    transactions: Array.isArray(raw.transactions) ? raw.transactions.slice(0, 6) : [],
    messages: Array.isArray(raw.messages) ? raw.messages.slice(0, 6) : [],
    journalEntries: Array.isArray(raw.journalEntries) ? raw.journalEntries.slice(0, 4) : [],
  };
}

export function adaptWorldStateToSnapshot(hostState, options = {}) {
  if (!hostState || typeof hostState !== 'object') return normalizeWorldSnapshot(null);
  const ownerId = OWNER_THEME_MAP[hostState.protagonists?.accounts?.active]
    ? hostState.protagonists.accounts.active
    : 'soyo';
  const themeId = OWNER_THEME_MAP[ownerId] || 'sage';
  const day = Number.isSafeInteger(hostState.clock?.day) && hostState.clock.day >= 1 ? hostState.clock.day : 1;
  const hour = Number.isSafeInteger(hostState.clock?.hour) ? clamp(hostState.clock.hour, 0, 23) : 12;
  const minute = Number.isSafeInteger(hostState.clock?.minute) ? clamp(hostState.clock.minute, 0, 59) : 0;
  const weatherId = WORLD_WEATHER_META[hostState.weather?.id] ? hostState.weather.id : 'sunny';
  const rawLocId = hostState.interior?.roomId || hostState.locationId || 'south-gate';
  const locationNames = { ...WORLD_LOCATION_LABELS, ...(options.locationNames || {}) };
  const locationName = locationNames[rawLocId] || '南门街区';

  const pad2 = (n) => String(n).padStart(2, '0');
  const timeStamp = `${pad2(hour)}:${pad2(minute)}`;
  const ledger = Array.isArray(hostState.protagonists?.accounts?.ledger)
    ? hostState.protagonists.accounts.ledger
    : [];
  const transactions = ledger
    .filter((row) => row && row.actor === ownerId && Number(row.deltaCents) < 0)
    .slice(-4)
    .reverse()
    .map((row, idx) => ({
      id: `ledger-${row.id || idx}`,
      shop: row.card ? `${String(row.card).toUpperCase()} 卡消费` : '街区商店',
      itemLabel: String(row.note || '日常购买').slice(0, 28),
      amountYen: Math.max(0, Math.round(Math.abs(Number(row.deltaCents)) / 100)),
      timeText: timeStamp,
      meta: locationName,
      accent: BOOK_THEMES[themeId]?.coverColor || '#4b6856',
    }));

  const contactById = new Map(
    (Array.isArray(hostState.contacts) ? hostState.contacts : []).map((c) => [c.id, c.name]),
  );
  const phoneRows = Array.isArray(hostState.phone) ? hostState.phone : [];
  const messages = phoneRows
    .slice(-4)
    .reverse()
    .map((msg, idx) => ({
      id: `phone-${msg.id || idx}`,
      sender: contactById.get(msg.npcId) || OWNER_SHORT_NAMES[msg.npcId] || '好友',
      timeText: typeof msg.at === 'string' ? msg.at.slice(-5) : timeStamp,
      location: '随身短讯',
      text: String(msg.text || '').slice(0, 68),
      accent: BOOK_THEMES[themeId]?.coverColor || '#4b6856',
    }));

  const journalRows = Array.isArray(hostState.journal) ? hostState.journal : [];
  const journalEntries = journalRows
    .slice(-3)
    .reverse()
    .map((entry, idx) => ({
      id: `journal-${entry.id || idx}`,
      title: '今日手记摘录',
      text: String(entry.text || '').slice(0, 100),
      atLabel: `${String(entry.at || timeStamp).slice(0, 16)} · ${locationName}`,
    }));

  return normalizeWorldSnapshot({
    snapshotId: `live-${ownerId}-d${day}`,
    ownerId,
    themeId,
    label: `${locationName} · ${formatWorldCalendarDay(day).shortDate}`,
    clock: { day, hour, minute },
    weatherId,
    locationId: rawLocId,
    locationName,
    player: hostState.player || { energy: 80, morale: 72, stress: 24, health: 92, balance: 10000 },
    transactions,
    messages,
    journalEntries,
  });
}

export function derivePageHeaderFromSnapshot(rawSnapshot) {
  const snap = normalizeWorldSnapshot(rawSnapshot);
  const cal = formatWorldCalendarDay(snap.clock.day);
  const weatherMeta = WORLD_WEATHER_META[snap.weatherId] || WORLD_WEATHER_META.sunny;
  const { morale, stress, energy } = snap.player;
  let moodText = '平静';
  if (stress >= 68) moodText = '紧绷';
  else if (energy <= 30) moodText = '微倦';
  else if (morale >= 76 && stress <= 30) moodText = '明快';
  else if (morale >= 64) moodText = '专注';

  let suggestedDeskMood = 'day';
  if (snap.clock.hour >= 21 || snap.clock.hour < 6) suggestedDeskMood = 'night';
  else if (snap.clock.hour >= 17) suggestedDeskMood = 'lamp';

  return {
    dateText: cal.shortDate,
    weatherText: weatherMeta.spreadWeather,
    moodText,
    suggestedTitle: `${snap.locationName}日常片刻`,
    suggestedDeskMood,
    statusSummary: `${cal.display} · ${weatherMeta.icon} ${weatherMeta.label} · ${snap.locationName}`,
  };
}

export function extractWorldMemories(rawSnapshot) {
  const snap = normalizeWorldSnapshot(rawSnapshot);
  const cal = formatWorldCalendarDay(snap.clock.day);
  const weather = WORLD_WEATHER_META[snap.weatherId] || WORLD_WEATHER_META.sunny;
  const accent = BOOK_THEMES[snap.themeId]?.coverColor || '#4b6856';

  const receipts = snap.transactions.map((tx) => ({
    itemType: 'receipt',
    presetId: tx.id,
    label: `${tx.shop} · ${tx.itemLabel}`,
    badge: `¥${tx.amountYen}`,
    sourceRef: { kind: 'ledger', id: tx.id, day: snap.clock.day },
    caption: tx.meta || `${cal.dotDate}`,
    dataPayload: {
      shop: tx.shop,
      itemLabel: tx.itemLabel,
      amountYen: Number(tx.amountYen) || 0,
      timeText: `${cal.dotDate} ${tx.timeText || ''}`.trim(),
      meta: tx.meta || snap.locationName,
      accent: tx.accent || accent,
    },
  }));

  const messages = snap.messages.map((msg) => ({
    itemType: 'chat-snippet',
    presetId: msg.id,
    label: `${msg.sender}：${msg.text.slice(0, 16)}${msg.text.length > 16 ? '…' : ''}`,
    badge: msg.timeText || '短讯',
    sourceRef: { kind: 'message', id: msg.id, day: snap.clock.day },
    caption: msg.text,
    dataPayload: {
      sender: msg.sender,
      stickerId: msg.stickerId || '',
      timeText: msg.timeText || '刚刚',
      location: msg.location || snap.locationName,
      accent: msg.accent || accent,
    },
  }));

  const stamps = [
    {
      itemType: 'stamp',
      presetId: `stamp-loc-${snap.locationId}`,
      label: `足迹印章 · ${snap.locationName}`,
      badge: cal.dotDate,
      sourceRef: { kind: 'location', id: `loc-${snap.clock.day}-${snap.locationId}`, day: snap.clock.day },
      caption: '',
      dataPayload: {
        customTitle: snap.locationName,
        customSub: `${cal.dotDate} · 足迹`,
        customColor: accent,
      },
    },
    {
      itemType: 'stamp',
      presetId: `stamp-wx-${snap.weatherId}`,
      label: `天气日期章 · ${weather.icon} ${weather.label}`,
      badge: cal.weekdayLabel,
      sourceRef: { kind: 'weather', id: `wx-${snap.clock.day}-${snap.weatherId}`, day: snap.clock.day },
      caption: '',
      dataPayload: {
        customTitle: `${weather.icon} ${weather.label}`,
        customSub: `${cal.dotDate} ${cal.weekdayLabel}`,
        customColor: '#4c5f6e',
      },
    },
  ];

  const notes = snap.journalEntries.map((jr) => ({
    itemType: 'note',
    presetId: 'note-butter',
    label: `手记便签 · ${jr.title}`,
    badge: '记事',
    sourceRef: { kind: 'journal', id: jr.id, day: snap.clock.day },
    caption: `${jr.title}\n${jr.text}`,
    dataPayload: {
      atLabel: jr.atLabel || cal.shortDate,
    },
  }));

  return { receipts, messages, stamps, notes };
}

export function exportNotebookPagesCompat(spreadsByTheme, activeThemeId, rawSnapshot) {
  const snap = normalizeWorldSnapshot(rawSnapshot);
  const baseAt = (snap.clock.day - 1) * 1440 + snap.clock.hour * 60 + snap.clock.minute;
  const spreads = Array.isArray(spreadsByTheme?.[activeThemeId]) ? spreadsByTheme[activeThemeId] : [];
  const personId = snap.ownerId || 'soyo';
  const pages = [];

  spreads.forEach((spread, idx) => {
    ['left', 'right'].forEach((side, sideOffset) => {
      const sideData = spread[side];
      if (!sideData) return;
      const title = String(sideData.title || `手账第 ${idx + 1} 页`).trim().slice(0, 60);
      const itemCount = Array.isArray(spread.items)
        ? spread.items.filter((i) => i.side === side).length
        : 0;
      const rawBody = String(sideData.body || '').trim() || '这一页留下了空白的剪贴。';
      const suffix = itemCount > 0 ? `\n\n[附贴装饰 ${itemCount} 枚 · ${sideData.date || ''} · ${sideData.weather || ''}]` : '';
      const text = `${rawBody}${suffix}`.slice(0, 1950);
      pages.push({
        id: `scrap:${activeThemeId}:${spread.id}:${side}`,
        personId,
        title: title || '手账一页',
        text,
        kind: 'character',
        at: Math.max(0, baseAt + idx * 2 + sideOffset),
        turn: 0,
        sourceId: `scrapbook:${activeThemeId}:${spread.id}:${side}`,
      });
    });
  });

  return pages;
}

export function exportScrapbookBackup(bundleInput) {
  const themeId = BOOK_THEMES[bundleInput?.themeId] ? bundleInput.themeId : 'sage';
  const snap = normalizeWorldSnapshot(bundleInput?.snapshot);
  const spreadsByTheme = bundleInput?.spreadsByTheme || buildDefaultSpreadsByTheme();
  const coverItemsByTheme = bundleInput?.coverItemsByTheme || buildDefaultCoverItemsByTheme();
  return {
    version: 1,
    format: 'unread-city-scrapbook',
    activeThemeId: themeId,
    snapshotId: snap.snapshotId,
    coverItemsByTheme,
    spreadsByTheme,
    spreadIndexByTheme: bundleInput?.spreadIndexByTheme || { sage: 0, indigo: 0, dusk: 0, blossom: 0 },
    charmOverrides: bundleInput?.charmOverrides || {},
    charmMountOverrides: bundleInput?.charmMountOverrides || {},
    clipOverrides: bundleInput?.clipOverrides || {},
    coverStyleOverrides: bundleInput?.coverStyleOverrides || {},
    ribbonOverrides: bundleInput?.ribbonOverrides || {},
    deskMood: DESK_MOODS.some((m) => m.id === bundleInput?.deskMood) ? bundleInput.deskMood : 'day',
    pages: exportNotebookPagesCompat(spreadsByTheme, themeId, snap),
  };
}

function sanitizeSpreadSide(rawSide, fallback) {
  const fontStyle = FONT_STYLES.some((f) => f.id === rawSide?.fontStyle) ? rawSide.fontStyle : fallback?.fontStyle;
  const inkColor = INK_COLORS.some((c) => c.id === rawSide?.inkColor) ? rawSide.inkColor : fallback?.inkColor;
  const titleMark = TITLE_MARKS.some((t) => t.id === rawSide?.titleMark) ? rawSide.titleMark : fallback?.titleMark;
  return {
    date: typeof rawSide?.date === 'string' && rawSide.date.trim() ? rawSide.date.trim().slice(0, 40) : fallback.date,
    title: typeof rawSide?.title === 'string' ? rawSide.title.slice(0, 60) : fallback.title,
    weather: typeof rawSide?.weather === 'string' && rawSide.weather.trim() ? rawSide.weather.trim().slice(0, 16) : fallback.weather,
    mood: typeof rawSide?.mood === 'string' && rawSide.mood.trim() ? rawSide.mood.trim().slice(0, 16) : fallback.mood,
    body: typeof rawSide?.body === 'string' ? rawSide.body.slice(0, 2000) : fallback.body,
    ...(fontStyle ? { fontStyle } : {}),
    ...(inkColor ? { inkColor } : {}),
    ...(titleMark ? { titleMark } : {}),
    ...(typeof rawSide?.dateCircled === 'boolean' ? { dateCircled: rawSide.dateCircled } : {}),
  };
}

export function importScrapbookBackup(rawInput, activeThemeId = 'sage') {
  const parsed = typeof rawInput === 'string' ? JSON.parse(rawInput) : rawInput;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('手账备份内容无效');
  }
  if (parsed.version !== 1) {
    throw new Error('手账备份版本不匹配');
  }

  // Case 1: Native full scrapbook bundle
  if (parsed.format === 'unread-city-scrapbook' && parsed.spreadsByTheme && typeof parsed.spreadsByTheme === 'object') {
    const baseSpreads = buildDefaultSpreadsByTheme();
    const baseCovers = buildDefaultCoverItemsByTheme();
    const nextSpreadsByTheme = {};
    const nextCoverItemsByTheme = {};
    for (const tid of Object.keys(BOOK_THEMES)) {
      const rawList = parsed.spreadsByTheme[tid];
      if (Array.isArray(rawList) && rawList.length > 0) {
        nextSpreadsByTheme[tid] = rawList.slice(0, 40).map((sp, i) => {
          const def = createBlankSpread(i + 1);
          return {
            id: typeof sp?.id === 'string' && sp.id ? sp.id : def.id,
            label: typeof sp?.label === 'string' && sp.label ? sp.label : `第 ${i + 1} 跨页`,
            paperStyle: PAPER_STYLES.some((p) => p.id === sp?.paperStyle) ? sp.paperStyle : 'dot',
            left: sanitizeSpreadSide(sp?.left, def.left),
            right: sanitizeSpreadSide(sp?.right, def.right),
            items: Array.isArray(sp?.items) ? sp.items.map((it) => makeDemoItem({ ...it, side: it?.side === 'left' ? 'left' : 'right' })) : [],
          };
        });
      } else {
        nextSpreadsByTheme[tid] = baseSpreads[tid];
      }

      const rawCover = parsed.coverItemsByTheme?.[tid];
      nextCoverItemsByTheme[tid] = Array.isArray(rawCover)
        ? rawCover.map((it) => makeDemoItem({ ...it, side: 'cover' }))
        : baseCovers[tid];
    }

    return {
      kind: 'scrapbook',
      themeId: BOOK_THEMES[parsed.activeThemeId] ? parsed.activeThemeId : activeThemeId,
      snapshotId: typeof parsed.snapshotId === 'string' ? parsed.snapshotId : '',
      coverItemsByTheme: nextCoverItemsByTheme,
      spreadsByTheme: nextSpreadsByTheme,
      spreadIndexByTheme: parsed.spreadIndexByTheme || { sage: 0, indigo: 0, dusk: 0, blossom: 0 },
      charmOverrides: parsed.charmOverrides || {},
      charmMountOverrides: parsed.charmMountOverrides || {},
      clipOverrides: parsed.clipOverrides || {},
      coverStyleOverrides: parsed.coverStyleOverrides || {},
      ribbonOverrides: parsed.ribbonOverrides || {},
      deskMood: DESK_MOODS.some((m) => m.id === parsed.deskMood) ? parsed.deskMood : 'day',
      importedCount: nextSpreadsByTheme[BOOK_THEMES[parsed.activeThemeId] ? parsed.activeThemeId : activeThemeId].length,
    };
  }

  // Case 2: Standard NotebookPage[] export ({ version: 1, pages: [...] })
  if (Array.isArray(parsed.pages)) {
    const pages = parsed.pages.filter(
      (p) => p && typeof p === 'object' && typeof p.title === 'string' && typeof p.text === 'string',
    );
    if (pages.length === 0) throw new Error('手账备份里没有可读取的页面');
    const convertedSpreads = [];
    for (let i = 0; i < pages.length; i += 2) {
      const leftPg = pages[i];
      const rightPg = pages[i + 1];
      const leftDay = Number.isSafeInteger(leftPg.at) && leftPg.at >= 0 ? Math.floor(leftPg.at / 1440) + 1 : 1;
      const leftCal = formatWorldCalendarDay(leftDay);
      const rightDay = rightPg && Number.isSafeInteger(rightPg.at) && rightPg.at >= 0 ? Math.floor(rightPg.at / 1440) + 1 : leftDay;
      const rightCal = formatWorldCalendarDay(rightDay);
      const leftMood = leftPg.kind === 'observer' ? '专注' : '平静';
      const rightMood = rightPg?.kind === 'observer' ? '专注' : '明快';
      convertedSpreads.push({
        id: `imported-${i / 2 + 1}-${Date.now()}`,
        label: `导入第 ${i / 2 + 1} 跨页`,
        paperStyle: 'lined',
        left: {
          date: leftCal.shortDate,
          title: leftPg.title.slice(0, 60),
          weather: '晴朗',
          mood: leftMood,
          body: leftPg.text.slice(0, 2000),
        },
        right: rightPg
          ? {
            date: rightCal.shortDate,
            title: rightPg.title.slice(0, 60),
            weather: '微风',
            mood: rightMood,
            body: rightPg.text.slice(0, 2000),
          }
          : {
            date: rightCal.shortDate,
            title: '自由拼贴留白',
            weather: '微风',
            mood: '期待',
            body: '可继续在这一页写下随记，或贴上今天的车票与贴纸。',
          },
        items: [],
      });
    }
    return {
      kind: 'notebook-pages',
      themeId: BOOK_THEMES[activeThemeId] ? activeThemeId : 'sage',
      spreads: convertedSpreads,
      importedCount: pages.length,
    };
  }

  throw new Error('未识别的手账备份格式');
}
