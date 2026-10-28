import type { SceneMovementWorld } from '../frontend/scene-movement';
import type { InteriorRestRecord, InteriorStudyRecord, WorldState } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';
import { MARGO_CAFE_LOCATION_ID, MARGO_CAFE_ROOM_ID } from './margo-cafe-venue';

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
  balanceDelta?: number;
  healthDelta?: number;
  stressDelta?: number;
  moraleDelta?: number;
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

/** High-pressure office work is lucrative briefly but cannot be repeated at maximum stress. */
export const MLM_WORK_STRESS_LIMIT = 70;
export function getMlmWorkBlockedReason(interaction: Pick<InteriorInteraction, 'id' | 'balanceDelta'>, stress: number): string | null {
  if (!interaction.id.startsWith('mlm-') || !interaction.balanceDelta || interaction.balanceDelta <= 0) return null;
  return stress >= MLM_WORK_STRESS_LIMIT ? `压力过高（${stress}/100），先休息到 ${MLM_WORK_STRESS_LIMIT} 以下再工作。` : null;
}

/** Prototype campus rooms, shared by movement, deterministic state and rendering. */
export const campusInteriors: readonly CampusInterior[] = [
  {
    id: MARGO_CAFE_ROOM_ID, label: '玛格咖啡馆', parentLocationId: MARGO_CAFE_LOCATION_ID,
    description: '宝生玛格经营的街边咖啡馆。柜台旁摆着咖啡器具与当日甜点，窗边有可坐下喝茶、阅读或画画的小桌；南侧店门通向露台。',
    entrance: { x: 48, z: 55.5, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'margo-cafe-counter', kind: 'desk', minX: -2.2, maxX: 2.2, minZ: -4, maxZ: -2.8 },
      { id: 'margo-cafe-window-table', kind: 'desk', minX: -5.4, maxX: -4, minZ: -1, maxZ: 1.4 },
      { id: 'margo-cafe-cup-shelf', kind: 'shelf', minX: 4.4, maxX: 5.4, minZ: -4.2, maxZ: -2.2 },
    ],
    interactions: [
      { id: 'margo-cafe-menu', label: '看看今日菜单', description: '看看玛格写下的饮品与甜点菜单，不自动点单或领取物品。',
        x: 0, z: -1.8, minutes: 0, energyDelta: 0, result: '看了看柜台上的今日菜单，没有点单或取走物品。', prompt: '你已看过玛格咖啡馆的菜单，没有消费或领取物品；饮品与甜点仍须按地点服务结算。' },
      { id: 'margo-cafe-window-seat', label: '在窗边坐一会儿', description: '安静坐 15 分钟，恢复至多 3 点精力；不会自动获得餐点。',
        x: -3.2, z: 1, minutes: 15, energyDelta: 3, result: '在玛格咖啡馆窗边坐了一会儿，看着露台与街道。', prompt: '你已在玛格咖啡馆窗边坐了十五分钟，程序已推进时间并恢复至多三点精力；没有自动消费、领取餐点或改变人际关系。' },
      { id: 'margo-cafe-cup-display', label: '看看杯具陈列', description: '观察柜台旁的杯具与咖啡器具，不进入工作区或取用店内物品。',
        x: 3.3, z: -1.6, minutes: 0, energyDelta: 0, result: '看过杯具陈列，没有取用店内物品或进入工作区。', prompt: '你已观察玛格咖啡馆的杯具与咖啡器具，没有取用物品；玛格及来客只知道自己当面看到或听到的内容。' },
    ],
  },
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
  {
    id: 'amaori-family-home', label: '甘织家住宅', parentLocationId: 'home',
    description: '杂司谷住宅街中充满生活气息的甘织家一户建客厅。沙发前摆着玲奈子常玩的家用主机与电视，餐厅连着母亲美代子下厨的开放式厨房，二楼通向玲奈子与妹妹遥奈各自的房间。',
    entrance: { x: -180, z: 150, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'amaori-sofa', kind: 'bed', minX: -4.8, maxX: -2.4, minZ: -3.2, maxZ: -1.6 },
      { id: 'amaori-kitchen', kind: 'shelf', minX: 3, maxX: 5.4, minZ: -4.2, maxZ: -2.6 },
      { id: 'amaori-table', kind: 'desk', minX: 0.4, maxX: 2.6, minZ: 0.4, maxZ: 1.8 },
    ],
    interactions: [
      { id: 'amaori-sofa-game', label: '在客厅打会儿游戏', description: '在沙发上打 30 分钟家用机游戏，消耗 2 点精力并放松心情。',
        x: -3.4, z: -0.8, minutes: 30, energyDelta: -2, result: '在甘织家客厅沙发上打了半小时游戏。', prompt: '你在甘织家客厅沙发上打了半小时游戏，程序已推进 30 分钟并扣除 2 点精力。请根据在场人物与日常氛围继续叙述。' },
      { id: 'amaori-tea-rest', label: '在餐桌旁喝茶休息', description: '休息 25 分钟，恢复至多 6 点精力。',
        x: 1.5, z: -0.4, minutes: 25, energyDelta: 6, result: '在甘织家餐桌旁喝茶休息了一会儿。', prompt: '你在甘织家餐桌旁喝茶休息了二十五分钟，程序已推进 25 分钟并恢复至多 6 点精力。' },
      { id: 'amaori-mirror-check', label: '检查今日穿搭与发夹', description: '在玄关镜前整理发型与交叉发夹，不消耗时间或精力。',
        x: 4, z: -1.4, minutes: 0, energyDelta: 0, result: '在镜前整理了衣领与发夹。', prompt: '你在甘织家镜前检查了穿搭与发夹，未消耗时间或精力。' },
    ],
  },
  {
    id: 'ouzuka-residence', label: '王冢家宅邸', parentLocationId: 'downtown',
    description: '目白台高地的王冢家豪宅会客室与内庭回廊。高挑的落地窗映出修剪整齐的玫瑰庭院，室内陈列着「Queen Rose」当季高定礼服与精致茶具。',
    entrance: { x: 20, z: 208, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'ouzuka-rack', kind: 'shelf', minX: 4.2, maxX: 5.6, minZ: -4.2, maxZ: -2.4 },
      { id: 'ouzuka-table', kind: 'desk', minX: -2.2, maxX: 0.8, minZ: -0.6, maxZ: 1.4 },
      { id: 'ouzuka-veranda', kind: 'board', minX: -5.6, maxX: -3.2, minZ: -4.8, maxZ: -4.1 },
    ],
    interactions: [
      { id: 'ouzuka-salon-tea', label: '在会客室品红茶小憩', description: '在会客室安静休息 30 分钟，恢复至多 6 点精力。',
        x: 2.8, z: 2.6, minutes: 30, energyDelta: 6, result: '在王冢家会客室品茶休息了半小时。', prompt: '你在王冢家会客室休息了半小时，程序已推进 30 分钟并恢复至多 6 点精力。' },
      { id: 'ouzuka-dress-observe', label: '欣赏高定礼服陈列', description: '观察「Queen Rose」礼服与画册，不消耗时间或精力。',
        x: 4.6, z: -1.6, minutes: 0, energyDelta: 0, result: '欣赏了王冢家陈列的当季礼服与时尚画册。', prompt: '你观察了王冢家陈列的礼服与画册，未消耗时间或精力。' },
    ],
  },
  {
    id: 'sena-family-home', label: '濑名家住宅', parentLocationId: 'home',
    description: '杂司谷安静街区的濑名家公寓客餐厅。开放式厨房收拾得温馨整洁，沙发旁放着广树与桔平的掌机和绘本。',
    entrance: { x: -190, z: 130, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'sena-sofa', kind: 'bed', minX: -4.6, maxX: -2.2, minZ: -3.4, maxZ: -1.8 },
      { id: 'sena-kitchen', kind: 'shelf', minX: 2.6, maxX: 5.5, minZ: -4.4, maxZ: -2.4 },
      { id: 'sena-table', kind: 'desk', minX: 0.2, maxX: 2.4, minZ: 0.2, maxZ: 1.6 },
    ],
    interactions: [
      { id: 'sena-sofa-rest', label: '在客厅沙发小憩', description: '休息 30 分钟，恢复至多 6 点精力。',
        x: -3.2, z: -1.2, minutes: 30, energyDelta: 6, result: '在濑名家温暖的客厅沙发上休息了半小时。', prompt: '你在濑名家客厅沙发上休息了半小时，程序已推进 30 分钟并恢复至多 6 点精力。' },
      { id: 'sena-kitchen-help', label: '在厨房打下手', description: '在厨房帮忙整理餐具与茶点 20 分钟，消耗 2 点精力。',
        x: 4, z: -1.2, minutes: 20, energyDelta: -2, result: '在濑名家厨房帮忙整理了餐具与点心。', prompt: '你在濑名家厨房帮忙整理了二十分钟，程序已推进 20 分钟并扣除 2 点精力。' },
      { id: 'sena-living-observe', label: '看看弟弟们的掌机与绘本', description: '观察茶几上的游戏机与家庭合照，不消耗时间或精力。',
        x: 1.3, z: -0.4, minutes: 0, energyDelta: 0, result: '观察了濑名家茶几上的掌机与温馨合照。', prompt: '你观察了濑名家客厅的陈设，未消耗时间或精力。' },
    ],
  },
  {
    id: 'koto-apartment', label: '琴家公寓', parentLocationId: 'commercial',
    description: '神田川至池袋方向的单元公寓室内。靠墙的整面书架按作家姓氏整齐排列着厚厚的文学文库本，窗边茶几上放着阅读灯与书签。',
    entrance: { x: 196, z: 127, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'koto-sofa', kind: 'bed', minX: -4.8, maxX: -2.2, minZ: -3.4, maxZ: -1.6 },
      { id: 'koto-bookshelf', kind: 'shelf', minX: 2.8, maxX: 5.4, minZ: -4.4, maxZ: -2.6 },
      { id: 'koto-table', kind: 'desk', minX: 0.2, maxX: 2.2, minZ: 0.4, maxZ: 1.8 },
    ],
    interactions: [
      { id: 'koto-bookshelf-browse', label: '浏览满墙的文库本', description: '安静翻阅书架上的文学藏书 20 分钟，消耗 2 点精力。',
        x: 3.4, z: -1.4, minutes: 20, energyDelta: -2, result: '在琴家公寓书架前安静翻阅了二十分钟文库本。', prompt: '你在琴家公寓翻阅了二十分钟藏书，程序已推进 20 分钟并扣除 2 点精力。' },
      { id: 'koto-sofa-rest', label: '在窗边沙发休息', description: '休息 30 分钟，恢复至多 6 点精力。',
        x: -3.4, z: -1, minutes: 30, energyDelta: 6, result: '在琴家公寓的窗边沙发上安静休息了半小时。', prompt: '你在琴家公寓休息了半小时，程序已推进 30 分钟并恢复至多 6 点精力。' },
      { id: 'koto-window-observe', label: '看看窗边阅读角', description: '观察阅读灯与书签陈设，不消耗时间或精力。',
        x: -5.2, z: 2.6, minutes: 0, energyDelta: 0, result: '观察了琴家公寓窗边的阅读角。', prompt: '你观察了琴家公寓窗边的阅读角，未消耗时间或精力。' },
    ],
  },
  {
    id: 'koyanagi-home', label: '小柳家住宅', parentLocationId: 'junction',
    description: '西早稻田／高田街区的小柳家室内与香穗的 Cosplay 制作空间。衣架上挂着精心缝制的角色服与假发托，桌边摆着缝纫机、布料色卡与环形补光灯。',
    entrance: { x: 0, z: 48, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'koyanagi-table', kind: 'desk', minX: -2.4, maxX: 1.6, minZ: -1.2, maxZ: 1.2 },
      { id: 'koyanagi-sofa', kind: 'bed', minX: 2.8, maxX: 5.4, minZ: -3.8, maxZ: -2.2 },
      { id: 'koyanagi-cos-rack', kind: 'shelf', minX: -5.4, maxX: -3.6, minZ: -4.2, maxZ: -2.8 },
    ],
    interactions: [
      { id: 'koyanagi-cos-observe', label: '看看 Cosplay 工作台与道具', description: '观察制作中的 Cos 服与假发架，不消耗时间或精力。',
        x: -4.4, z: -1.8, minutes: 0, energyDelta: 0, result: '观察了小柳家房间里的 Cosplay 服装架与缝纫工作台。', prompt: '你观察了小柳家房间里的 Cosplay 工作台与服装架，未消耗时间或精力。' },
      { id: 'koyanagi-room-rest', label: '在房间沙发休息', description: '休息 25 分钟，恢复至多 5 点精力。',
        x: 4, z: -1.4, minutes: 25, energyDelta: 5, result: '在小柳家房间沙发上休息了一会儿。', prompt: '你在小柳家房间沙发上休息了二十五分钟，程序已推进 25 分钟并恢复至多 5 点精力。' },
    ],
  },
  {
    id: 'livehouse', label: 'Live House 演出现场', parentLocationId: 'grand-commercial',
    description: '汇聚专业声光音响的大型 Live House 演出现场。正前方是阶梯表演舞台，配备架子鼓、监听音箱与麦克风；台下是观众摇滚池。这里是举办专场演出、乐队排练与音乐交流的核心据点。',
    entrance: { x: -155, z: -135, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'livehouse-stage', kind: 'podium', minX: -5.5, maxX: 5.5, minZ: -4.8, maxZ: -2.0 },
      { id: 'livehouse-drums', kind: 'piano', minX: -1.5, maxX: 1.5, minZ: -4.5, maxZ: -2.5 },
      { id: 'livehouse-amps-left', kind: 'shelf', minX: -5.2, maxX: -3.5, minZ: -4.2, maxZ: -2.2 },
      { id: 'livehouse-amps-right', kind: 'shelf', minX: 3.5, maxX: 5.2, minZ: -4.2, maxZ: -2.2 },
    ],
    interactions: [
      { id: 'livehouse-booking', label: '预约开办 Livehouse', description: '预约舞台档期与声光设备，开办专场演出。除祥子与素世外，其他主角必须选修音乐专业。',
        x: -3.2, z: -1.2, minutes: 30, energyDelta: -5, result: '演出预约已写入名录与日历。', prompt: '只依据已保存的乐队、成员和具体时间描述本次演出预约，不得补造档期。' },
      { id: 'livehouse-create-band', label: '创建乐队', description: '在 Livehouse 音乐名录中登记并组建新乐队。除祥子与素世外，其他主角必须选修音乐专业。',
        x: 3.2, z: -1.2, minutes: 20, energyDelta: -3, result: '乐队名称与已确认成员已写入名录。', prompt: '只依据已保存的乐队名录描述登记，不得自动增加成员。' },
      { id: 'livehouse-rehearsal', label: '舞台试音排练', description: '在舞台上调试监听音响与乐器并排练 25 分钟，消耗 5 点精力。',
        x: 0, z: -1.5, minutes: 25, energyDelta: -5, result: '在 Live House 舞台上完成了认真的乐器调试与试音排练。', prompt: '你在 Live House 舞台上完成了排练试音。' },
      { id: 'livehouse-stage-observe', label: '观察舞台音响与灯光', description: '环视舞台灯光轨道、返听音箱与观众池，不消耗时间或精力。',
        x: 0, z: 1.5, minutes: 0, energyDelta: 0, result: '仔细观察了 Live House 的舞台灯光布局与返听系统。', prompt: '你在 Live House 台下观察了舞台与设备布局。' },
    ],
  },
  {
    id: 'ktv-lounge', label: 'KTV 娱乐包厢', parentLocationId: 'grand-commercial',
    description: '大型商业综合体内的豪华 KTV 娱乐包厢。舒适的环形皮质沙发围绕着长茶几，点歌触控屏与无线麦克风摆在桌上；正前方的大屏幕泛着柔和的霓虹氛围光。',
    entrance: { x: -205, z: -135, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'ktv-sofa', kind: 'bed', minX: -5.2, maxX: -2.2, minZ: -3.8, maxZ: -1.8 },
      { id: 'ktv-table', kind: 'desk', minX: -1.8, maxX: 2.2, minZ: -1.2, maxZ: 1.2 },
      { id: 'ktv-screen', kind: 'board', minX: -4.2, maxX: 4.2, minZ: -4.8, maxZ: -4.4 },
    ],
    interactions: [
      { id: 'ktv-sing', label: '点歌欢唱练声', description: '在包厢里痛快唱歌 40 分钟，消耗 4 点精力，放松身心。',
        x: 0, z: 2.2, minutes: 40, energyDelta: -4, result: '在 KTV 包厢里拿起麦克风尽情欢唱，心情格外舒畅。', prompt: '你在 KTV 包厢里唱了四十分钟歌，程序已扣除 4 点精力。' },
      { id: 'ktv-drink', label: '挑选软饮果盘', description: '享用包厢饮品与小吃点心（15 分钟）。',
        x: 2.8, z: 0.2, minutes: 15, energyDelta: 0, result: '在 KTV 包厢享用了清凉饮品与点心。', prompt: '你在 KTV 包厢里享用了饮品和小吃。' },
      { id: 'ktv-rest', label: '在沙发仰头小憩', description: '靠在包厢沙发上休息 20 分钟，恢复至多 6 点精力。',
        x: -3.6, z: -1.0, minutes: 20, energyDelta: 6, result: '在 KTV 包厢舒适的沙发上放松休息了二十分钟。', prompt: '你在 KTV 包厢沙发上休息了二十分钟，程序已恢复至多 6 点精力。' },
      { id: 'ktv-observe', label: '看看点歌系统', description: '浏览点歌机上的热榜曲目与伴奏音轨，不消耗时间或精力。',
        x: 0, z: 2.8, minutes: 0, energyDelta: 0, result: '查看了 KTV 点歌机界面的热门新歌榜单。', prompt: '你查看了 KTV 点歌机界面。' },
    ],
  },
  {
    id: 'legal-office', label: '枫庭律师事务所', parentLocationId: 'grand-commercial',
    description: '新宿商务楼里的律师事务所。接待台旁陈列着案件卷宗，玻璃会议室里摆着证物白板与模拟法庭席位，工作由持证律师指导。',
    entrance: { x: -145, z: -158, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'legal-office-case-board', kind: 'board', minX: -5, maxX: -2.5, minZ: -4.8, maxZ: -4.4 },
      { id: 'legal-office-case-table', kind: 'desk', minX: -1.8, maxX: 2.0, minZ: -2.2, maxZ: -0.9 },
      { id: 'legal-office-shelf', kind: 'shelf', minX: 4.5, maxX: 5.5, minZ: -3, maxZ: 1 },
    ],
    interactions: [],
  },
  {
    id: 'court-hearing', label: '新宿地方裁判所 · 法庭', parentLocationId: 'grand-commercial',
    description: '地方法院内庄严的公开法庭。正前方是审判席，左右为原告席、被告席与证人席，旁听席排列在后部。书记员记录诉讼进展。人物的身份与证言以真实案卷为准。',
    entrance: { x: -145, z: -158, yaw: 0 }, bounds, spawn: { x: 0, z: 3.5, yaw: 0 },
    obstacles: [
      { id: 'court-judge-bench', kind: 'podium', minX: -4.5, maxX: 4.5, minZ: -4.7, maxZ: -3.4 },
      { id: 'court-witness-stand', kind: 'podium', minX: -5.0, maxX: -3.0, minZ: -2.7, maxZ: -1.6 },
      { id: 'court-claimant-desk', kind: 'desk', minX: -4.1, maxX: -1.0, minZ: -0.8, maxZ: 0.1 },
      { id: 'court-defendant-desk', kind: 'desk', minX: 1.0, maxX: 4.1, minZ: -0.8, maxZ: 0.1 },
      { id: 'court-gallery-left', kind: 'desk', minX: -4.4, maxX: -0.8, minZ: 2.0, maxZ: 2.7 },
      { id: 'court-gallery-right', kind: 'desk', minX: 0.8, maxX: 4.4, minZ: 2.0, maxZ: 2.7 },
    ],
    interactions: [],
  },
  {
    id: 'mlm-office', label: '启航商贸（传销咨询）', parentLocationId: 'grand-commercial',
    description: '商务写字楼高层的商贸咨询办公室。墙上贴满业绩龙虎榜与金字塔分销架构图，茶水桌上堆着宣讲手册与空白加盟合同，空气中弥漫着急功近利的焦躁氛围。',
    entrance: { x: -150, z: -170, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'mlm-board', kind: 'board', minX: -3.5, maxX: 3.5, minZ: -4.8, maxZ: -4.5 },
      { id: 'mlm-desk', kind: 'desk', minX: -2.0, maxX: 2.0, minZ: -1.8, maxZ: -0.5 },
      { id: 'mlm-shelf', kind: 'shelf', minX: 4.2, maxX: 5.4, minZ: -3.0, maxZ: 0.0 },
    ],
    interactions: [
      { id: 'mlm-phone-sales', label: '拨打推销拉人电话', description: '对着客户名单拨打电销拉人入伙（40 分钟），收入 1600 日元，精力 -12，压力 +25，精神 -10。',
        x: -3.0, z: 0.8, minutes: 40, energyDelta: -12, balanceDelta: 1600, stressDelta: 25, moraleDelta: -10,
        result: '在工位上机械地拨打推销拉人电话，承受着客户的斥责与内心的煎熬。',
        prompt: '你在启航商贸工位上拨打了四十分钟推销电话，通过推销分成获得 1600 日元，身心承受了极大的心理压力。' },
      { id: 'mlm-attend-rally', label: '参加财富早会动员', description: '参加洗脑动员早会（30 分钟），领取早会津贴 600 日元，精力 -6，压力 +20，精神 -6。',
        x: 0, z: 1.5, minutes: 30, energyDelta: -6, balanceDelta: 600, stressDelta: 20, moraleDelta: -6,
        result: '在狂热而诡异的口号声中熬过了早会动员，领到了参会津贴。',
        prompt: '你在启航商贸参加了半小时财富动员大会，在高分贝口号中获得 600 日元参会津贴，精神极度紧绷压抑。' },
      { id: 'mlm-fold-flyers', label: '装订宣讲材料与合同', description: '在长桌旁装订传销话术手册与加盟合同（25 分钟），手工费 800 日元，精力 -8，压力 +15，精神 -5。',
        x: 2.8, z: 1.0, minutes: 25, energyDelta: -8, balanceDelta: 800, stressDelta: 15, moraleDelta: -5,
        result: '快速装订了厚厚一叠话术材料与空白合同，赚得手工劳务费。',
        prompt: '你在会议桌旁装订了二十五分钟传销宣讲材料，获得 800 日元手工费，看着合同上的暴利陷阱感到焦虑不安。' },
      { id: 'mlm-observe-board', label: '观察黑板上的分销图', description: '端详写字板上密密麻麻的层级金字塔与提成机制，不消耗时间或精力。',
        x: 0, z: -3.2, minutes: 0, energyDelta: 0,
        result: '端详了白板上的层级提成图，对这种击鼓传花的运作机制有了直观认识。',
        prompt: '你仔细观察了启航商贸白板上的分销层级图，未消耗时间或精力。' },
    ],
  },
  {
    id: 'takao-onsen', label: '极乐汤温泉会馆', parentLocationId: 'takao-mountain',
    description: '位于高尾山麓的日式温泉休养会馆。原木格栅与石质露天汤池被翠竹环绕，白雾袅袅，温热天然泉水散发着淡淡的矿物清香。',
    entrance: { x: 45, z: -155, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'onsen-bath', kind: 'bed', minX: -5.2, maxX: -1.2, minZ: -4.5, maxZ: -1.5 },
      { id: 'onsen-bench', kind: 'desk', minX: 1.5, maxX: 4.8, minZ: -3.5, maxZ: -1.5 },
      { id: 'onsen-rack', kind: 'shelf', minX: 3.5, maxX: 5.2, minZ: 0.5, maxZ: 3.5 },
    ],
    interactions: [
      { id: 'onsen-relax', label: '露天温汤浸泡', description: '在露天温汤中浸泡 40 分钟，消耗 850 日元，精力 +30，健康 +20，精神 +18，压力 -35。',
        x: -3.2, z: -3.0, minutes: 40, energyDelta: 30, balanceDelta: -850, healthDelta: 20, moraleDelta: 18, stressDelta: -35,
        result: '浸泡在温润的天然汤泉中，周身毛孔舒张，寒气与酸痛一扫而空。',
        prompt: '你在高尾山麓极乐汤温泉享受了舒适的露天温泉，身体机能显著改善。' },
      { id: 'onsen-footbath', label: '山泉露天足汤', description: '坐在长凳边享受免费足汤小憩 20 分钟，精力 +10，健康 +5，精神 +8，压力 -15。',
        x: 3.0, z: -2.5, minutes: 20, energyDelta: 10, balanceDelta: 0, healthDelta: 5, moraleDelta: 8, stressDelta: -15,
        result: '将双脚浸入温热的山泉足汤中，暖意顺着小腿蔓延全身。',
        prompt: '你在高尾山温泉足汤边小憩了二十分钟。' },
      { id: 'onsen-rest', label: '休息区躺椅小憩', description: '在榻榻米休息区放松小憩 20 分钟，精力 +8，压力 -10。',
        x: 0, z: 1.5, minutes: 20, energyDelta: 8, balanceDelta: 0, stressDelta: -10,
        result: '在通风舒适的休息区躺椅上安静闭目养神。',
        prompt: '你在温泉休息区静心休养了二十分钟。' },
    ],
  },
  {
    id: 'takao-summit', label: '高尾山顶展望台', parentLocationId: 'takao-mountain',
    description: '海拔599米的高尾山主峰开阔展望台。木质观景步道向外延展，晴空下东京都天际线、筑波山与连绵群山一览无余，山顶立着石质界碑与休息长椅。',
    entrance: { x: 25, z: -215, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'summit-rail', kind: 'board', minX: -5.0, maxX: 5.0, minZ: -4.8, maxZ: -4.2 },
      { id: 'summit-marker', kind: 'podium', minX: -1.0, maxX: 1.0, minZ: -2.0, maxZ: 0.0 },
      { id: 'summit-bench', kind: 'desk', minX: -4.5, maxX: -2.0, minZ: 0.5, maxZ: 2.5 },
    ],
    interactions: [
      { id: 'summit-view', label: '高台极目远眺', description: '站在展望台护栏旁眺望远山天际线（20 分钟），精神 +15，压力 -20，健康 +2。',
        x: 0, z: -4.0, minutes: 20, energyDelta: -2, healthDelta: 2, moraleDelta: 15, stressDelta: -20,
        result: '清风拂过山巅，关东平原的浩瀚全景让人心旷神怡。',
        prompt: '你在高尾山顶展望台远眺群山与城市天际线，心胸开阔，压力全消。' },
      { id: 'summit-breeze', label: '山顶长椅沐风', description: '在山顶木质长椅上吹着清凉山风发呆（15 分钟），精神 +8，压力 -12。',
        x: -3.2, z: 1.5, minutes: 15, energyDelta: 0, moraleDelta: 8, stressDelta: -12,
        result: '坐在山顶长椅上，听着松涛阵阵，呼吸着清澈的山野空气。',
        prompt: '你在高尾山顶长椅上享受清风拂面的宁静时光。' },
    ],
  },
  {
    id: 'takao-teahouse', label: '山间十一丁目茶屋', parentLocationId: 'takao-mountain',
    description: '掩映在古杉林木荫蔽之下的半山腰老铺茶屋。红布长凳摆在展望露台边，炭火烤炉上升起腾腾白烟，烤芝麻三福丸子酱香四溢。',
    entrance: { x: -35, z: -185, yaw: 0 }, bounds, spawn,
    obstacles: [
      { id: 'teahouse-counter', kind: 'desk', minX: -4.5, maxX: -1.5, minZ: -3.5, maxZ: -1.5 },
      { id: 'teahouse-stoves', kind: 'shelf', minX: -4.5, maxX: -2.5, minZ: 0.5, maxZ: 3.5 },
      { id: 'teahouse-seating', kind: 'bed', minX: 1.5, maxX: 4.8, minZ: -2.5, maxZ: 2.5 },
    ],
    interactions: [
      { id: 'teahouse-snack', label: '品尝现烤三福团子', description: '享用炭火现烤的三福芝麻团子与高山煎茶（25 分钟），花费 460 日元，精力 +15，饱腹 +40，精神 +12，压力 -15。',
        x: 3.0, z: 0.0, minutes: 25, energyDelta: 15, balanceDelta: -460, moraleDelta: 12, stressDelta: -15,
        result: '在茶屋长凳上吃下了甜咸适口的现烤三福团子，喝了一大口醇香煎茶，整个人暖融融的。',
        prompt: '你在十一丁目茶屋品尝了著名的烤团子与热茶，补充了充沛体力。' },
      { id: 'teahouse-tea', label: '品饮山泉冷萃煎茶', description: '点一杯清凉甘洌的高山冷萃茶饮（15 分钟），花费 220 日元，精力 +5，精神 +6，压力 -8。',
        x: -2.0, z: -2.5, minutes: 15, energyDelta: 5, balanceDelta: -220, moraleDelta: 6, stressDelta: -8,
        result: '细细品饮冰镇山泉煎茶，茶香清冽回甘。',
        prompt: '你在十一丁目茶屋享用了清凉回甘的冷萃煎茶。' },
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

const protagonistDisplayNames: Record<ProtagonistId, string> = {
  soyo: '长崎素世',
  sakiko: '丰川祥子',
  emma: '樱羽艾玛',
  renako: '甘织玲奈子',
};

export function canManageLivehouseAndBand(state: Pick<WorldState, 'academics'>, owner: ProtagonistId = 'soyo'): { allowed: boolean; reason?: string } {
  if (owner === 'soyo' || owner === 'sakiko') {
    return { allowed: true };
  }
  if (state.academics?.majorId === 'music') {
    return { allowed: true };
  }
  const name = protagonistDisplayNames[owner] ?? owner;
  return {
    allowed: false,
    reason: `除了祥子和素世以外，其他主角（${name}）必须选修音乐专业才能预约开办 Livehouse 和创建乐队。`,
  };
}

