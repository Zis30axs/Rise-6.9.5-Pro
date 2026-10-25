import type { WorldState } from '../frontend/types';
import type { ProtagonistId } from './dual-protagonists';
import { gameCalendar } from './game-calendar';

type Clock = WorldState['clock'];

// Each opening belongs to one character's personal story; these are not
// shared memories or automatically witnessed events.
const openingPlaces: Record<ProtagonistId, string> = {
  soyo: '校园南门',
  sakiko: '目白台',
  emma: '杂司谷住宅区',
  renako: '杂司谷住宅区',
};

const openingProse: Record<ProtagonistId, string> = {
  soyo: [
    "晚夏的空气还滞留着散不去的余热。长崎素世在高田校园的南门外停下脚步，抬手扶正了肩上的贝斯包。",
    "排练室里嘈杂的余音似乎还粘在耳膜上——爱音生疏的和弦、立希不耐烦的催促，还有那股总是缺了点什么的喧闹。其实也并不算讨厌，只是每当热闹散去、独自一人走在归途上时，心底那块空落落的角落就会不合时宜地泛起微酸。那些已经走散的旧友、再也回不去的晴朗午后，就像背带勒在肩膀上的重量一样，明明已经习惯了，却依然清晰得让人心烦。",
    "她的指尖无意识地摩挲了一下背带边缘，很快又轻轻吸了口气，将眼底那一丝倦意重新藏回温和得体的微笑后面。",
    "路口的信号灯刚刚变绿，沿街的人群慢慢散去。是直接回那间空旷得有些冷清的公寓、点开吵闹的乐队群组看一眼，还是干脆谁也不理、顺着晚风一个人走走——接下来该怎么打发这段傍晚，她还没有拿定主意。",
  ].join('\n\n'),
  sakiko: [
    "目白台的街灯渐次亮起，远处的车流在十字路口短暂停住，晚风里混着些夏末的热气。丰川祥子合上装着乐谱的文件夹，目光冷淡地掠过街边张贴的演出海报。",
    "Ave Mujica 的世界正在按她的意志成形，舞台上的每一道光影、每一句台词都在她的掌控之中；可一旦合上乐谱，排练表上写不下的现实便会接踵而至。丰川家逐渐缓和却尚未填平的隔阂、不得不亲自打理的乐队与生活事务、还有那些绝不能向外人轻易展露的软弱……她比谁都清楚自己正踩在怎样的钢丝上，但那又如何？既然已经亲手戴上了假面，就绝没有半途软弱的余地。",
    "她将文件夹利落地收进包里，微微抬起下巴，站在喧嚣的路边思索着下一步：是先到丰川宅邸处理家中的事、联系队友推进接下来的排练，还是先去处理那些只属于她自己的现实琐事。没有人能替她作出选择，她也从不需要任何人来替她分担。",
  ].join('\n\n'),
  emma: [
    "公寓楼旁有晚风吹过，樱羽艾玛连忙抬手按住头顶的黑色贝雷帽。",
    "街道上有行人谈笑着擦肩而过，不远处传来便利店开门的电子音。牢屋敷里那场漫长而冰冷的审判早已成为了过去，如今她和月代雪就生活在这片再普通不过的街区里。只是偶尔被风吹起衣角、听见身后传来的脚步声时，她还是会有一瞬间的恍惚——紧接着，一种近乎奢侈的庆幸感便会涌上心头，让她觉得眼前这份平淡的安稳是如此难能可贵。",
    "只要一想起雪，再想起希罗，心里最柔软的地方就像被温水轻轻浸过一样，连嘴角都不自觉地向上扬了一点。",
    "艾玛抬头望向公寓的窗户，还不知道雪此刻是否已经在家。是现在就上楼推开家门、顺着街道再散会儿步，还是先为自己安排些别的小事——毕竟在这样和平的傍晚里，无论做什么都还来得及。",
  ].join('\n\n'),
  renako: [
    "傍晚的微风吹过杂司谷住宅区的街角，甘织玲奈子下意识摸了摸左耳上方别着的两枚十字发夹，长长地吐出一口终于活过来的气。",
    "为了摆脱国中时的阴角黑历史、努力在高中当个普通现充，她每天都在超负荷运转社交能量。明明只是想交几个能一起吃午饭的普通朋友，不知为什么却和王冢真唯、濑名紫阳花、琴纱月还有小柳香穗组成了备受瞩目的「芦谷五人组」——而且那几个人看她的眼神，偶尔总会让她心惊肉跳地怀疑是不是哪里越过了挚友的界线。",
    "只要一想到家里还有等着她回去联机打游戏的妹妹遥奈，还有妈妈美代子准备的晚饭，玲奈子紧绷了一整天的神经就稍微松弛了下来。",
    "她站在熟悉的街口，犹豫着是直接回家躲进被窝打FPS、顺路去便利店给遥奈带份甜点，还是先点开五人组的群聊看看大家又在聊什么——在这个随时可能触发修罗场的傍晚，每一步都得小心翼翼才行。",
  ].join('\n\n'),
};

const openingJournalText: Record<ProtagonistId, string> = {
  soyo: '在校园南门思考接下来的安排：联系乐队同伴，或先独自走走。',
  sakiko: '人在目白台，带着乐谱，还没有决定下一步的行程。',
  emma: '人在与雪同住的公寓附近，想回去看看雪，也想留一点时间给自己。',
  renako: '人在杂司谷的家里附近，惦记着妹妹遥奈和五人组的朋友们，想先喘口气再决定今晚的安排。',
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
