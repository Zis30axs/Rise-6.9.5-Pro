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
    "晚夏的空气还滞留着散不去的余热。长崎素世在月之森的南门外停下脚步，抬手扶正了肩上的贝斯包。",
    "排练室里嘈杂的余音似乎还粘在耳膜上——爱音生疏的和弦、立希不耐烦的催促，还有那股总是缺了点什么的喧闹。其实也并不算讨厌，只是每当热闹散去、独自一人走在放学路上时，心底那块空落落的角落就会不合时宜地泛起微酸。那些已经走散的旧友、再也回不去的晴朗午后，就像背带勒在肩膀上的重量一样，明明已经习惯了，却依然清晰得让人心烦。",
    "她的指尖无意识地摩挲了一下背带边缘，很快又轻轻吸了口气，将眼底那一丝倦意重新藏回温和得体的微笑后面。",
    "路口的信号灯刚刚变绿，沿街的人群慢慢散去。是直接回那间空旷得有些冷清的公寓、点开吵闹的乐队群组看一眼，还是干脆谁也不理、顺着晚风一个人走走——接下来该怎么打发这段傍晚，她还没有拿定主意。",
  ].join('\n\n'),
  sakiko: [
    "市中心的车流在十字路口短暂停住，尾气与晚风混杂出都市特有的燥热。丰川祥子合上装着乐谱的文件夹，目光冷淡地掠过街边张贴的演出海报。",
    "Ave Mujica 的世界正在按她的意志成形，舞台上的每一道光影、每一句台词都在她的掌控之中；可一旦合上乐谱，排练表上写不下的现实便会接踵而至。待缴的账单、令人窒息的屋檐、还有那些绝不能向外人展露分毫的狼狈……她比谁都清楚自己正踩在怎样的钢丝上，但那又如何？既然已经亲手戴上了假面，就绝没有半途软弱的余地。",
    "她将文件夹利落地收进包里，微微抬起下巴，站在喧嚣的路边思索着下一步：是先回那个狭小的落脚处、联系队友推进接下来的排练，还是先去处理那些只属于她自己的现实琐事。没有人能替她作出选择，她也从不需要任何人来替她分担。",
  ].join('\n\n'),
  emma: [
    "公寓楼旁有晚风吹过，樱羽艾玛连忙抬手按住头顶的黑色贝雷帽。",
    "街道上有行人谈笑着擦肩而过，不远处传来便利店开门的电子音。牢屋敷里那场漫长而冰冷的审判早已成为了过去，如今她和月代雪就生活在这片再普通不过的街区里。只是偶尔被风吹起衣角、听见身后传来的脚步声时，她还是会有一瞬间的恍惚——紧接着，一种近乎奢侈的庆幸感便会涌上心头，让她觉得眼前这份平淡的安稳是如此难能可贵。",
    "只要一想起雪，再想起希罗，心里最柔软的地方就像被温水轻轻浸过一样，连嘴角都不自觉地向上扬了一点。",
    "艾玛抬头望向公寓的窗户，还不知道雪此刻是否已经在家。是现在就上楼推开家门、顺着街道再散会儿步，还是先为自己安排些别的小事——毕竟在这样和平的傍晚里，无论做什么都还来得及。",
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
