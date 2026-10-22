import type { SceneMovementWorld } from '../frontend/scene-movement';
import type { InteriorRestRecord, InteriorStudyRecord } from '../frontend/types';

export const INTERIOR_ENTRANCE_RANGE = 5;
export const INTERIOR_INTERACTION_RANGE = 3;
export interface InteriorObstacle {
  id: string;
  kind: 'bed' | 'desk' | 'shelf' | 'board' | 'wardrobe' | 'podium' | 'piano';
  minX: number; maxX: number; minZ: number; maxZ: number;
}
export interface InteriorInteraction {
  id: string; label: string; description: string;
  x: number; z: number; minutes: number; energyDelta: number;
  result: string; prompt: string;
}
export interface BedRestOption extends InteriorInteraction {
  minMinutes: number;
  maxMinutes: number;
}
export interface StudyDurationOption {
  id: string;
  label: string;
  minMinutes: number;
  maxMinutes: number;
}
export interface CampusInterior {
  id: string; label: string; description: string; parentLocationId: string;
  entrance: { x: number; z: number; yaw: number };
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: { x: number; z: number; yaw: number };
  obstacles: readonly InteriorObstacle[];
  interactions: readonly InteriorInteraction[];
}

const bounds = { minX: -6, maxX: 6, minZ: -5, maxZ: 5 };
const spawn = { x: 0, z: 3.8, yaw: 0 };
const bedRestAnchor = { x: -2.3, z: -1 };

/** Explicit local choices; selecting one never prepares or requests a story turn. */
export const bedRestOptions: readonly BedRestOption[] = [
  { id: 'dorm-rest-short', label: '短休', description: '随机休息 15–30 分钟，按实际时长恢复至多 6–12 点精力。', ...bedRestAnchor, minMinutes: 15, maxMinutes: 30, minutes: 15, energyDelta: 6, result: '在宿舍床上完成了短休。', prompt: '' },
  { id: 'dorm-rest-medium', label: '中休', description: '随机休息 1–2 小时，按实际时长恢复至多 24–48 点精力。', ...bedRestAnchor, minMinutes: 60, maxMinutes: 120, minutes: 60, energyDelta: 24, result: '在宿舍床上完成了中休。', prompt: '' },
  { id: 'dorm-rest-long', label: '长休', description: '随机休息 7–9 小时，精力恢复至 100。', ...bedRestAnchor, minMinutes: 420, maxMinutes: 540, minutes: 480, energyDelta: 100, result: '在宿舍床上完成了长休。', prompt: '' },
];

/** Shared by classroom revision and library study; only explicit selection samples time. */
export const studyDurationOptions: readonly StudyDurationOption[] = [
  { id: 'study-short', label: '短时学习', minMinutes: 15, maxMinutes: 30 },
  { id: 'study-medium', label: '中时学习', minMinutes: 60, maxMinutes: 120 },
  { id: 'study-long', label: '长时学习', minMinutes: 120, maxMinutes: 240 },
];
export function isStudyInteraction(id: string | null | undefined): boolean {
  return id === 'classroom-notes' || id === 'study-focus' || id === 'study-reading';
}
export function getStudyEnergyCost(minutes: number): number {
  return Math.ceil(minutes / 6);
}

/** Prototype campus rooms, shared by movement, deterministic state and rendering. */
export const campusInteriors: readonly CampusInterior[] = [
  {
    id: 'dorm-room', label: '学生宿舍', parentLocationId: 'dorm',
    description: '【示例室内】学生公寓中的一间宿舍，床铺、书桌与衣柜围着中央通道摆放；南侧房门通向原来的宿舍院落。室友身份和床位归属尚未设定。',
    entrance: { x: -49, z: -6.5, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'dorm-bed', kind: 'bed', minX: -5.5, maxX: -3.4, minZ: -3.8, maxZ: -0.2 },
      { id: 'dorm-desk', kind: 'desk', minX: 3, maxX: 5.4, minZ: -3.8, maxZ: -2.4 },
      { id: 'dorm-wardrobe', kind: 'wardrobe', minX: 4, maxX: 5.4, minZ: 0.5, maxZ: 2.5 },
    ],
    interactions: [
      // Retain the original completed-activity metadata for existing 1.3.0 saves.
      { id: 'dorm-rest', label: '床边休息', description: '休息 30 分钟，恢复 12 点精力。', ...bedRestAnchor, minutes: 30, energyDelta: 12, result: '在宿舍床边休息了半小时。', prompt: '我已经在宿舍床边休息了半小时，程序已推进 30 分钟并恢复至多 12 点精力。请从休息结束的现场继续，不要重复结算。' },
      { id: 'dorm-desk', label: '整理书桌', description: '整理学习用品 20 分钟，精力 -3、压力 -4、精神 +3。', x: 2, z: -2, minutes: 20, energyDelta: -3, result: '在宿舍书桌旁整理了学习用品。', prompt: '我已经整理好宿舍书桌上的学习用品，程序已推进 20 分钟并扣除 3 点精力。请从整理结束后继续，不要重复结算。' },
      { id: 'dorm-wardrobe', label: '看看衣柜', description: '观察衣柜与宿舍陈设，不消耗时间或精力。', x: 3, z: 1.8, minutes: 0, energyDelta: 0, result: '查看了宿舍衣柜与房间陈设，没有取放物品。', prompt: '我已经看过宿舍衣柜与周围陈设，没有取放物品，也未消耗时间或精力。请描写眼前环境，不要自行增加物品或结算。' },
    ],
  },
  {
    id: 'classroom', label: '普通教室', parentLocationId: 'teaching',
    description: '【示例室内】教学楼中的一间普通教室，前方是黑板和讲台，课桌分列中央过道两侧；南侧房门通向原来的教学楼广场。这里未安排正在进行的课程或固定师生。',
    entrance: { x: 0, z: -38, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'classroom-board', kind: 'board', minX: -4, maxX: 4, minZ: -4.7, maxZ: -4.5 },
      { id: 'classroom-podium', kind: 'podium', minX: -1, maxX: 1, minZ: -4, maxZ: -3.5 },
      { id: 'classroom-desk-nw', kind: 'desk', minX: -4.4, maxX: -2, minZ: -2, maxZ: -0.9 },
      { id: 'classroom-desk-ne', kind: 'desk', minX: 2, maxX: 4.4, minZ: -2, maxZ: -0.9 },
      { id: 'classroom-desk-sw', kind: 'desk', minX: -4.4, maxX: -2, minZ: 0.6, maxZ: 1.7 },
      { id: 'classroom-desk-se', kind: 'desk', minX: 2, maxX: 4.4, minZ: 0.6, maxZ: 1.7 },
    ],
    interactions: [
      { id: 'classroom-board', label: '查看黑板', description: '观察黑板和讲台，不消耗时间或精力。', x: 0, z: -2.9, minutes: 0, energyDelta: 0, result: '查看了普通教室的黑板与讲台，未新增课程信息。', prompt: '我已经走到普通教室前方查看黑板与讲台，未消耗时间或精力。当前没有已设定的课程或授课教师，请根据现场继续，不要虚构已完成的上课。' },
      { id: 'classroom-notes', label: '温习笔记', description: '在课桌旁温习 30 分钟，消耗 5 点精力。', x: 1.3, z: -1.5, minutes: 30, energyDelta: -5, result: '在普通教室课桌旁温习了半小时笔记。', prompt: '我已经在普通教室课桌旁温习了半小时笔记，程序已推进 30 分钟并扣除 5 点精力。请从温习结束后继续，不要重复结算或自动完成课程日程。' },
      { id: 'classroom-window', label: '窗边观察', description: '看看窗边光线与室内环境，不消耗时间或精力。', x: -5, z: 2.8, minutes: 0, energyDelta: 0, result: '在普通教室窗边观察了室内光线与陈设。', prompt: '我已经走到普通教室窗边观察室内光线与陈设，未消耗时间或精力。玩家仍在室内，请继续眼前情境，不要生成天空飞机事件。' },
    ],
  },
  {
    id: 'study-room', label: '图书馆自习室', parentLocationId: 'library',
    description: '【示例室内】图书馆内的安静自习室，长桌分列中央通道两侧，书架靠墙；南侧房门通向原来的图书馆前庭。没有把室外行人带入室内，也未安排固定在场人物。',
    entrance: { x: 0, z: -9, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'study-desk-west', kind: 'desk', minX: -4.8, maxX: -1.2, minZ: -2.8, maxZ: -1.4 },
      { id: 'study-desk-east', kind: 'desk', minX: 1.2, maxX: 4.8, minZ: -2.8, maxZ: -1.4 },
      { id: 'study-shelf-west', kind: 'shelf', minX: -5.5, maxX: -4.4, minZ: 0.5, maxZ: 3 },
      { id: 'study-shelf-north', kind: 'shelf', minX: -3.5, maxX: 3.5, minZ: -4.6, maxZ: -3.8 },
    ],
    interactions: [
      { id: 'study-focus', label: '专注自习', description: '在自习桌旁学习 30 分钟，消耗 5 点精力。', x: 0, z: -2, minutes: 30, energyDelta: -5, result: '在图书馆自习室专注学习了半小时。', prompt: '我已经在图书馆自习室专注学习了半小时，程序已推进 30 分钟并扣除 5 点精力。请从学习结束后继续，不要重复结算或自动完成日程。' },
      { id: 'study-reading', label: '选书阅读', description: '选择学科与阅读时长；本专业正常积累，跨专业可能获得灵感或遇到困惑，不办理借阅。', x: -3.4, z: 1.8, minutes: 0, energyDelta: 0, result: '在图书馆书架旁选择了阅读方向。', prompt: '' },
      { id: 'study-shelf', label: '浏览书架', description: '浏览书架 10 分钟，精力 -1、压力 -2、精神 +2；不办理借阅。', x: -3.4, z: 1.8, minutes: 10, energyDelta: -1, result: '在自习室浏览了十分钟书架，没有借走书籍。', prompt: '我已经在图书馆自习室浏览了十分钟书架，程序已推进 10 分钟并扣除 1 点精力，没有借走书籍。请从浏览结束后继续，不要重复结算或自动增加物品。' },
      { id: 'study-window', label: '看看自习环境', description: '观察自习室的光线与桌椅，不消耗时间或精力。', x: 4.6, z: 2.9, minutes: 0, energyDelta: 0, result: '观察了图书馆自习室的光线、桌椅与安静环境。', prompt: '我已经观察过图书馆自习室的光线与桌椅，未消耗时间或精力。请保持室内安静情境，不要把室外行人当作在场人物。' },
    ],
  },
  {
    id: 'toyokawa-house', label: '丰川家会客厅', parentLocationId: 'downtown',
    description: '丰川家位于市中心。这里是入门后的会客与钢琴区域。祥子与家族正尝试修复关系。',
    entrance: { x: 50, z: 222, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'toyokawa-piano', kind: 'piano', minX: -5.2, maxX: -2.2, minZ: -3.8, maxZ: -2.1 },
      { id: 'toyokawa-bookcase', kind: 'shelf', minX: 4.4, maxX: 5.4, minZ: -2.7, maxZ: 2.4 },
    ],
    interactions: [
      { id: 'toyokawa-piano-observe', label: '看看钢琴', description: '观察钢琴与室内摆设，不自动演奏，也不会替任何人作决定。',
        x: -1.4, z: -2.8, minutes: 0, energyDelta: 0, result: '观察了会客厅里的钢琴，没有触碰琴键。', prompt: '你已在丰川家会客厅观察钢琴，没有演奏或改变物品。请基于在场事实叙述，不虚构祥子在场或家人已同意任何重大决定。' },
      { id: 'toyokawa-room-observe', label: '查看会客厅', description: '观察会客区与书架，不翻找私人信件。',
        x: 3.4, z: 1.4, minutes: 0, energyDelta: 0, result: '看过了会客厅的陈设和书架，未获取私人物品。', prompt: '已观察会客厅，没有自动搜查私人区域、阅读秘密文件或推进家族关系。' },
    ],
  },
  {
    id: 'emma-yuki-home', label: '艾玛与月代雪的家', parentLocationId: 'home',
    description: '两人共同居住的现代公寓客餐厅。料理台、沙发与阅读角在同一空间。',
    entrance: { x: -190, z: 130, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'emma-home-sofa', kind: 'bed', minX: -4.6, maxX: -2.2, minZ: -3.4, maxZ: -1.8 },
      { id: 'emma-home-kitchen', kind: 'shelf', minX: 2.6, maxX: 5.5, minZ: -4.4, maxZ: -2.4 },
      { id: 'emma-home-table', kind: 'desk', minX: 0.2, maxX: 2.4, minZ: 0.2, maxZ: 1.6 },
    ],
    interactions: [
      { id: 'emma-home-window', label: '看看窗外', description: '观察窗外街区与室内光线，不消耗时间或精力。',
        x: -5, z: 2.8, minutes: 0, energyDelta: 0, result: '在窗边看了一会儿街区，没有改变位置或时间。', prompt: '你在艾玛与月代雪家的窗边观察街区，没有消耗时间或精力。请基于已保存的在场事实叙述。' },
      { id: 'emma-home-kitchen', label: '煮点东西', description: '使用料理台 20 分钟，消耗 3 点精力；不会凭空生成食材。',
        x: 4, z: -1.2, minutes: 20, energyDelta: -3, result: '在料理台前简单煮了点东西，食材仍以背包记录为准。', prompt: '你在料理台前煮了东西，程序已推进 20 分钟并扣除 3 点精力；不自动消耗或生成背包物品。' },
      { id: 'emma-home-sofa', label: '在沙发休息', description: '休息 30 分钟，恢复至多 6 点精力。',
        x: -3.2, z: -1.2, minutes: 30, energyDelta: 6, result: '在沙发上休息了半小时。', prompt: '你在沙发上休息了半小时，程序已推进 30 分钟并恢复至多 6 点精力。' },
    ],
  },
  {
    id: 'koko-old-house', label: '泽渡家老宅', parentLocationId: 'home',
    description: '远离校园的老式住宅客厅。旧家具与直播设备共处一室。',
    entrance: { x: -180, z: 150, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'koko-sofa', kind: 'bed', minX: -4.8, maxX: -2.4, minZ: -3.2, maxZ: -1.6 },
      { id: 'koko-shelf', kind: 'shelf', minX: 3, maxX: 5.4, minZ: -4.2, maxZ: -2.6 },
      { id: 'koko-desk', kind: 'desk', minX: 0.4, maxX: 2.6, minZ: 0.4, maxZ: 1.8 },
    ],
    interactions: [
      { id: 'koko-stream-corner', label: '看看直播角', description: '观察直播设备与背景布置，不打开直播。',
        x: 4, z: -1.4, minutes: 0, energyDelta: 0, result: '看了看直播角与设备，没有开播或改动设置。', prompt: '你看了看老宅里的直播角和设备，没有开播、更改设置或替可可发言。' },
      { id: 'koko-tea', label: '在旧客厅坐一会儿', description: '坐 20 分钟，恢复至多 4 点精力。',
        x: -3.4, z: -0.8, minutes: 20, energyDelta: 4, result: '在旧客厅的沙发上坐了一会儿。', prompt: '你在老宅旧客厅坐了一会儿，程序已推进 20 分钟并恢复至多 4 点精力。' },
    ],
  },
  {
    id: 'nikaido-house', label: '二阶堂家', parentLocationId: 'downtown',
    description: '市中心的传统日式宅邸：榻榻米和室、可望见庭院的缘侧、入鞘武士刀刀架与练剑空间。',
    entrance: { x: 20, z: 208, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'nikaido-katana-rack', kind: 'shelf', minX: 4.2, maxX: 5.6, minZ: -4.2, maxZ: -2.4 },
      { id: 'nikaido-low-table', kind: 'desk', minX: -2.2, maxX: 0.8, minZ: -0.6, maxZ: 1.4 },
      { id: 'nikaido-veranda', kind: 'board', minX: -5.6, maxX: -3.2, minZ: -4.8, maxZ: -4.1 },
    ],
    interactions: [
      { id: 'nikaido-katana-observe', label: '看看刀架', description: '观察入鞘武士刀与刀架，不拔出或挥舞。',
        x: 4.6, z: -1.6, minutes: 0, energyDelta: 0, result: '观察了刀架上入鞘的武士刀，没有触碰或拔出。', prompt: '你观察了二阶堂家刀架上入鞘的武士刀，没有拔出、挥舞或改变物品状态。请保持尊重与克制。' },
      { id: 'nikaido-tatami-rest', label: '在和室休息', description: '在榻榻米上休息 30 分钟，恢复至多 6 点精力。',
        x: 2.8, z: 2.6, minutes: 30, energyDelta: 6, result: '在榻榻米和室里安静休息了半小时。', prompt: '你在二阶堂家的榻榻米和室里休息了半小时，程序已推进 30 分钟并恢复至多 6 点精力。' },
      { id: 'nikaido-garden-view', label: '看看庭院', description: '在缘侧观察庭院 10 分钟，不推动时间线以外的行动。',
        x: -4.4, z: -3.2, minutes: 10, energyDelta: 0, result: '在缘侧看了一会儿庭院。', prompt: '你在二阶堂家的缘侧观察庭院，程序已推进 10 分钟。请基于眼前的庭院与室内事实叙述，不虚构人物在场。' },
      { id: 'nikaido-kendo-practice', label: '在练剑空间练习', description: '练习 45 分钟，消耗 8 点精力并小幅恢复精神；不使用真刃。',
        x: 0.4, z: -3.4, minutes: 45, energyDelta: -8, result: '在练剑空间完成了四十五分钟的基础练习，没有使用入鞘的武士刀。', prompt: '你在二阶堂家的练剑空间完成了四十五分钟基础练习，程序已扣除 8 点精力。你没有拔出刀架上的武士刀，也没有替任何人安排对练。' },
    ],
  },
  {
    id: 'anan-noa-milia-home', label: '安安、诺亚与米莉亚的住处', parentLocationId: 'junction',
    description: '三人合住的普通客餐厅，留有画笔、画纸与可以各自安静待着的角落。',
    entrance: { x: 0, z: 48, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'anan-table', kind: 'desk', minX: -2.4, maxX: 1.6, minZ: -1.2, maxZ: 1.2 },
      { id: 'anan-sofa', kind: 'bed', minX: 2.8, maxX: 5.4, minZ: -3.8, maxZ: -2.2 },
      { id: 'anan-art-corner', kind: 'shelf', minX: -5.4, maxX: -3.6, minZ: -4.2, maxZ: -2.8 },
    ],
    interactions: [
      { id: 'anan-art-corner', label: '看看画具', description: '观察画纸与画笔，不擅自使用他人物品。',
        x: -4.4, z: -1.8, minutes: 0, energyDelta: 0, result: '看了看画具和画纸，没有取用。', prompt: '你观察了共用住处的画具与画纸，没有取用或移动他人物品。' },
      { id: 'anan-shared-sofa', label: '在公共区坐一会儿', description: '坐 25 分钟，恢复至多 5 点精力。',
        x: 4, z: -1.4, minutes: 25, energyDelta: 5, result: '在公共区坐了一会儿。', prompt: '你在安安、诺亚与米莉亚的公共区坐了一会儿，程序已推进 25 分钟并恢复至多 5 点精力。' },
    ],
  },
  {
    id: 'majo-highrise-home', label: '雪莉与汉娜的住处', parentLocationId: 'commercial',
    description: '滨水高层住宅的客餐厅，落地窗外是河岸步道。',
    entrance: { x: 196, z: 127, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'highrise-sofa', kind: 'bed', minX: -4.8, maxX: -2.2, minZ: -3.4, maxZ: -1.6 },
      { id: 'highrise-kitchen', kind: 'shelf', minX: 2.8, maxX: 5.4, minZ: -4.4, maxZ: -2.6 },
      { id: 'highrise-table', kind: 'desk', minX: 0.2, maxX: 2.2, minZ: 0.4, maxZ: 1.8 },
    ],
    interactions: [
      { id: 'highrise-window', label: '看看河岸', description: '观察落地窗外的河岸步道，不消耗时间或精力。',
        x: -5.2, z: 2.6, minutes: 0, energyDelta: 0, result: '在高层的落地窗前看了看河岸步道。', prompt: '你在滨水高层的落地窗前观察河岸步道，没有消耗时间或精力。' },
      { id: 'highrise-rest', label: '在客厅休息', description: '休息 30 分钟，恢复至多 6 点精力。',
        x: -3.4, z: -1, minutes: 30, energyDelta: 6, result: '在高层客厅休息了半小时。', prompt: '你在滨水高层的客厅休息了半小时，程序已推进 30 分钟并恢复至多 6 点精力。' },
    ],
  },
  {
    id: 'majo-studio', label: '单身公寓', parentLocationId: 'city-park',
    description: '床、厨房与一张小桌组成的单身公寓室内。',
    entrance: { x: 207, z: -174, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'studio-bed', kind: 'bed', minX: -5, maxX: -2.8, minZ: -3.8, maxZ: -1.2 },
      { id: 'studio-kitchen', kind: 'shelf', minX: 3.2, maxX: 5.4, minZ: -4.2, maxZ: -2.4 },
      { id: 'studio-desk', kind: 'desk', minX: 1.2, maxX: 3.2, minZ: 0.8, maxZ: 2.2 },
    ],
    interactions: [
      { id: 'studio-window', label: '看看窗外', description: '观察公寓窗外的城市公园方向，不消耗时间或精力。',
        x: -5.2, z: 2.6, minutes: 0, energyDelta: 0, result: '在单身公寓的窗边看了看外头的公园方向。', prompt: '你在单身公寓的窗边观察窗外，没有消耗时间或精力。' },
      { id: 'studio-kitchen', label: '用厨房', description: '简单使用厨房 15 分钟，消耗 2 点精力；不会凭空生成食材。',
        x: 4.2, z: -1.6, minutes: 15, energyDelta: -2, result: '在小厨房简单弄了点吃的，食材仍以背包记录为准。', prompt: '你在单身公寓的小厨房忙了十五分钟，程序已扣除 2 点精力；不自动消耗或生成背包物品。' },
      { id: 'studio-rest', label: '在床边休息', description: '休息 30 分钟，恢复至多 6 点精力。',
        x: -3.8, z: -0.6, minutes: 30, energyDelta: 6, result: '在床边休息了半小时。', prompt: '你在单身公寓的床边休息了半小时，程序已推进 30 分钟并恢复至多 6 点精力。' },
    ],
  },
];

export function getCampusInterior(id: string | null | undefined): CampusInterior | undefined {
  return campusInteriors.find(room => room.id === id);
}

/** Restore historical metadata or the exact, already-settled duration from a saved choice. */
export function getInteriorActivity(room: CampusInterior, id: string | null | undefined, lastRest?: InteriorRestRecord | null, lastStudy?: InteriorStudyRecord | null): InteriorInteraction | undefined {
  const fixed = room.interactions.find(interaction => interaction.id === id);
  if (fixed && isStudyInteraction(fixed.id) && lastStudy?.interactionId === fixed.id) {
    const option = studyDurationOptions.find(option => option.id === lastStudy.optionId);
    if (option) return {
      ...fixed, minutes: lastStudy.minutes, energyDelta: -lastStudy.energyConsumed,
      result: `在${room.label}完成了${fixed.label}（${lastStudy.minutes} 分钟），消耗 ${lastStudy.energyConsumed} 点精力。`,
      prompt: '',
    };
  }
  if (fixed || room.id !== 'dorm-room') return fixed;
  const option = bedRestOptions.find(option => option.id === id);
  if (!option || !lastRest || lastRest.optionId !== option.id) return option;
  return { ...option, minutes: lastRest.minutes, energyDelta: lastRest.energyRecovered, result: `在宿舍床上${option.label}了 ${lastRest.minutes} 分钟，恢复 ${lastRest.energyRecovered} 点精力。` };
}

export function getInteriorMovementWorld(room: CampusInterior): SceneMovementWorld {
  return { bounds: { ...room.bounds }, colliders: room.obstacles.map(obstacle => ({ ...obstacle, kind: 'box' as const })), surfaces: [] };
}
