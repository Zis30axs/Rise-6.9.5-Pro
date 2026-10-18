import type { SceneMovementWorld } from '../frontend/scene-movement';
import type { InteriorRestRecord, InteriorStudyRecord } from '../frontend/types';

export const INTERIOR_ENTRANCE_RANGE = 5;
export const INTERIOR_INTERACTION_RANGE = 3;
export interface InteriorObstacle {
  id: string;
  kind: 'bed' | 'desk' | 'shelf' | 'board' | 'wardrobe' | 'podium';
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
  return id === 'classroom-notes' || id === 'study-focus';
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
      { id: 'dorm-desk', label: '整理书桌', description: '整理学习用品 20 分钟，消耗 3 点精力。', x: 2, z: -2, minutes: 20, energyDelta: -3, result: '在宿舍书桌旁整理了学习用品。', prompt: '我已经整理好宿舍书桌上的学习用品，程序已推进 20 分钟并扣除 3 点精力。请从整理结束后继续，不要重复结算。' },
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
      { id: 'study-shelf', label: '浏览书架', description: '浏览书架 10 分钟，消耗 1 点精力；不办理借阅。', x: -3.4, z: 1.8, minutes: 10, energyDelta: -1, result: '在自习室浏览了十分钟书架，没有借走书籍。', prompt: '我已经在图书馆自习室浏览了十分钟书架，程序已推进 10 分钟并扣除 1 点精力，没有借走书籍。请从浏览结束后继续，不要重复结算或自动增加物品。' },
      { id: 'study-window', label: '看看自习环境', description: '观察自习室的光线与桌椅，不消耗时间或精力。', x: 4.6, z: 2.9, minutes: 0, energyDelta: 0, result: '观察了图书馆自习室的光线、桌椅与安静环境。', prompt: '我已经观察过图书馆自习室的光线与桌椅，未消耗时间或精力。请保持室内安静情境，不要把室外行人当作在场人物。' },
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
