import type { WorldState } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';
import { gameCalendar } from './game-calendar';

type Clock = WorldState['clock'];

// Each opening belongs to one character's personal story; these are not
// shared memories or automatically witnessed events.
const openingPlaces: Record<ProtagonistId, string> = {
  soyo: '校园南门',
  sakiko: '市中心',
  emma: '住宅区',
};

const openingProse: Record<ProtagonistId, string> = {
  soyo: [
    '晚夏的空气还带着余热。长崎素世在校园南门外停下脚步，抬手扶正肩上的贝斯包。MyGO!!!!!练习时的旋律似乎还在耳边；想到某些旧友，她的指尖无意识地摩挲了一下背带。',
    '路口的信号灯刚刚变绿，沿街的人群慢慢散去。回住处、联系乐队同伴，或暂时一个人走走——接下来怎么安排，她还没有决定。',
  ].join('\n\n'),
  sakiko: [
    '市中心的车流在十字路口短暂停住。丰川祥子合上装着乐谱的文件夹，目光掠过街边的演出海报。Ave Mujica的音乐始终占据她生活中重要的一部分，但排练表上写不下所有需要面对的事情。',
    '她把文件夹收好，站在路边思索下一步：回住处、联系队友，或先去处理自己的安排。没有人替她作出选择。',
  ].join('\n\n'),
  emma: [
    '公寓楼旁有风吹过，樱羽艾玛连忙按住黑色贝雷帽。她和月代雪如今住在这里。牢屋敷的审判已成往事，普通街道上往来的脚步声，却仍会让她觉得这份安稳难能可贵。',
    '艾玛想起雪，也想起希罗，嘴角不自觉地扬了一点。她还不知道雪此刻是否在家。先回公寓、沿街走走，还是为自己安排些别的事，现在都来得及。',
  ].join('\n\n'),
};

const openingJournalText: Record<ProtagonistId, string> = {
  soyo: '在校园南门思考接下来的安排：联系乐队同伴，或先独自走走。',
  sakiko: '人在市中心，带着乐谱，还没有决定下一步的行程。',
  emma: '人在与雪同住的公寓附近，想回去看看雪，也想留一点时间给自己。',
};

const clockTime = (clock: Clock) => `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`;

export function protagonistOpening(owner: ProtagonistId, clock: Clock): string {
  const date = gameCalendar(clock.day);
  return `${date.year}年${date.month}月${date.date}日，${date.weekdayLabel}，${clockTime(clock)}。${openingPlaces[owner]}。\n\n${openingProse[owner]}`;
}

export function protagonistOpeningJournal(owner: ProtagonistId, clock: Clock) {
  return {
    id: owner === 'soyo' ? 'entry-1' : `${owner}-opening-journal`,
    text: openingJournalText[owner],
    at: `第 ${clock.day} 天 ${clockTime(clock)}`,
  };
}
