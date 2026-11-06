import type { ProtagonistId } from '../runtime/dual-protagonists';
import { locations } from '../runtime/model';
import type { CharacterContact, WorldState } from './types';

export type IdentityCardMode = 'civil' | 'stage';
export type IdentityCardSide = 'front' | 'back';
export type IdentityPhotoPose = 'standard' | 'smile' | 'shy' | 'stage';
export type IdentityMeshGroup = 'all' | 'mujica' | 'crychic' | 'campus';

export interface IdentityBondEntry {
  personId: string;
  name: string;
  roleLabel: string;
  affinity: number;
  statusTag: string;
  note: string;
  group?: 'mujica' | 'crychic' | 'campus';
}

export interface IdentityMeshNode {
  id: string;
  name: string;
  roleLabel: string;
  affinity: number;
  statusTag: string;
  note: string;
  group: 'center' | 'mujica' | 'crychic' | 'campus';
  groupLabel: string;
  isCenter?: boolean;
  isCurrentProtagonist?: boolean;
  isRegisteredContact?: boolean;
  hasCard?: boolean;
  x: number;
  y: number;
}

export interface IdentityMeshEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  affinity: number;
  kind: 'primary' | 'cross';
  group: 'mujica' | 'crychic' | 'campus';
}

export interface IdentityEndorsementEntry {
  authority: string;
  scope: string;
  code: string;
  validUntil: string;
}

export interface ResidentIdentityCard {
  id: string;
  personId: string;
  name: string;
  nativeName: string;
  romanizedName: string;
  gender: string;
  birthDate: string;
  zodiac: string;
  bloodType: string;
  cardSerial: string;
  municipality: string;
  authorityLabel: string;
  categoryBadge: string;
  isExemplar?: boolean;
  schoolOrAffiliation: string;
  gradeOrTitle: string;
  studentNo: string;
  residenceAddress: string;
  anchorZoneId: string;
  anchorZoneLabel: string;
  anchorSpotDetail: string;
  issueDate: string;
  expiryDate: string;
  phoneDisplay: string;
  appaPayHandle: string;
  familySummary: string;
  signatureText: string;
  quote: string;
  traits: string[];
  /** Stage / Band Persona Alternate Mode */
  stageProfile?: {
    bandName: string;
    stageCode: string;
    stageTitle: string;
    instrument: string;
    clearanceLevel: string;
    passSerial: string;
    venueAccess: string[];
    formerBand: string;
    stageQuote: string;
  };
  bonds: IdentityBondEntry[];
  endorsements: IdentityEndorsementEntry[];
  bioParagraphs: string[];
  mrzLine1: string;
  mrzLine2: string;
}

const LOCATION_LABELS: Record<string, string> = {
  gate: '校园南门',
  classroom: '教学楼',
  library: '校园图书馆',
  dorm: '学生宿舍',
  cafe: '商业街咖啡馆',
  bookshop: '街角书店',
  park: '中央公园',
  downtown: '市中心大道',
  toyokawa_mansion: '丰川宅邸'
};

export function resolveLocationName(locationId: string | undefined): string {
  if (!locationId) return '校园图书馆';
  const runtimeMatch = locations.find((item) => item.id === locationId);
  if (runtimeMatch) return runtimeMatch.name;
  return LOCATION_LABELS[locationId] ?? locationId;
}

export const WAKABA_MUTSUMI_CARD: ResidentIdentityCard = {
  id: 'bang-mutsumi',
  personId: 'bang-mutsumi',
  name: '若叶睦',
  nativeName: '若葉 睦',
  romanizedName: 'WAKABA MUTSUMI',
  gender: '女',
  birthDate: '2007.01.14',
  zodiac: '摩羯座',
  bloodType: 'AB型',
  cardSerial: '5191-1122-0114-07',
  municipality: '东京都文京·丰岛学区 住民基本台帐',
  authorityLabel: '东京都目白台特别学区户籍课 · 月之森学园联署',
  categoryBadge: '范例档案 · 特邀居民',
  isExemplar: true,
  schoolOrAffiliation: '月之森女子学园 高等部 · 准大一转入生',
  gradeOrTitle: '高等部一年级（与长崎素世同班）· 园艺与器乐特长',
  studentNo: 'TSK-2025-0114M',
  residenceAddress: '东京都文京区目白台二丁目 若叶宅邸',
  anchorZoneId: 'library',
  anchorZoneLabel: '校园图书馆',
  anchorSpotDetail: '图书馆东侧绿植花坛与温室角落',
  issueDate: '2025.04.01',
  expiryDate: '2030.03.31',
  phoneDisplay: '080-5191-0114',
  appaPayHandle: 'APPA-MUTSUMI-0114',
  familySummary: '父：若叶（知名喜剧演员） / 母：森美奈美（实力派女演员）',
  signatureText: '若葉 睦',
  quote: '“……黄瓜长得很精神。需要我陪你待一会儿吗？”',
  traits: ['浅灰绿长发 · 琥珀金瞳', '寡言克制', '园艺与黄瓜栽培', '七弦吉他手', '重情守诺'],
  stageProfile: {
    bandName: 'Ave Mujica',
    stageCode: 'Mortis / 莫蒂斯',
    stageTitle: '死亡之畏 · 首席七弦吉他手',
    instrument: 'ESP Halberd 7-String Custom',
    clearanceLevel: 'STAGE-S · 全场馆后台直通',
    passSerial: 'AVM-MORTIS-07-0114',
    venueAccess: ['RiNG 地下展演厅 VIP 乐手室', '月之森音乐厅排练室', '商业街器乐工坊特约调音台'],
    formerBand: 'CRYCHIC（旧任吉他手）',
    stageQuote: '“上台之后，只要弹好手里的弦就够了。”'
  },
  bonds: [
    {
      personId: 'sakiko',
      name: '丰川祥子',
      roleLabel: '幼时青梅竹马 · Ave Mujica 主脑',
      affinity: 78,
      statusTag: '挚重 · 78',
      note: '自幼在丰川与若叶两家往来中长大，始终默默守望并追随祥子的脚步。',
      group: 'mujica'
    },
    {
      personId: 'soyo',
      name: '长崎素世',
      roleLabel: '月之森同班同学 · CRYCHIC 旧友',
      affinity: 62,
      statusTag: '亲近 · 62',
      note: '在班内与旧乐队时期频繁相处，常成为素世打听消息与倾诉心事的对象。',
      group: 'crychic'
    },
    {
      personId: 'bang-umiri',
      name: '八幡海铃',
      roleLabel: 'Ave Mujica 贝斯手 · 乐队搭档',
      affinity: 58,
      statusTag: '信赖 · 58',
      note: '排练时少言而默契，常在后台安静分食自种的小黄瓜。',
      group: 'mujica'
    },
    {
      personId: 'bang-uika',
      name: '三角初华',
      roleLabel: 'Ave Mujica 主唱兼吉他 · 舞台同侪',
      affinity: 64,
      statusTag: '默契 · 64',
      note: '在假面剧场双吉他编配中彼此呼应，初华总会温柔体察睦细微的情绪变化。',
      group: 'mujica'
    },
    {
      personId: 'bang-nyamu',
      name: '祐天寺若麦',
      roleLabel: 'Ave Mujica 鼓手 · 剧场共事',
      affinity: 48,
      statusTag: '同台 · 48',
      note: '经常被若麦拉进后台镜头或被调侃演艺世家出身，睦总是安静旁观。',
      group: 'mujica'
    },
    {
      personId: 'bang-tomori',
      name: '高松灯',
      roleLabel: 'CRYCHIC 旧主唱 · 诗集与创可贴',
      affinity: 60,
      statusTag: '守望 · 60',
      note: '虽然不擅言辞，却一直记得灯收集石头与写下歌词时的神情。',
      group: 'crychic'
    },
    {
      personId: 'bang-taki',
      name: '椎名立希',
      roleLabel: 'CRYCHIC 旧鼓手 · RiNG 常客',
      affinity: 52,
      statusTag: '旧识 · 52',
      note: '在 RiNG 或排练室偶遇时立希语气虽然急躁，但彼此都清楚对方的认真。',
      group: 'crychic'
    },
    {
      personId: 'emma',
      name: '樱羽艾玛',
      roleLabel: '大学城同级生 · 图书馆邻座伙伴',
      affinity: 56,
      statusTag: '友善 · 56',
      note: '在校园图书馆东侧花坛与阅览桌偶遇，收到过睦安静递来的小黄瓜。',
      group: 'campus'
    },
    {
      personId: 'renako',
      name: '甘织玲奈子',
      roleLabel: '安静同好 · 园艺与闲暇茶伴',
      affinity: 60,
      statusTag: '安心 · 60',
      note: '和少言的睦待在一起时不需要勉强找话题，彼此都觉得十分自在。',
      group: 'campus'
    }
  ],
  endorsements: [
    {
      authority: '月之森女子学园 教务处',
      scope: '高田·目白大学城跨校图书与温室通行许可',
      code: 'TSK-LIB-0114',
      validUntil: '2026.09.30'
    },
    {
      authority: '高田马场 LIVEHOUSE 联盟',
      scope: '7弦电吉他携行与夜间排练室免检签注',
      code: 'RING-GT7-8841',
      validUntil: '2027.03.31'
    },
    {
      authority: '东京都目白台自治会',
      scope: '若叶宅邸住户身份与园艺花圃认养备案',
      code: 'MJR-RES-0042',
      validUntil: '长期有效'
    }
  ],
  bioParagraphs: [
    '月之森女子学园高等部一年级学生，与长崎素世同班；现作为准大一先修生常驻高田·目白大学城。出身演艺世家，父亲是家喻户晓的喜剧演员若叶，母亲是著名女演员森美奈美。',
    '性格极其安静内敛，说话总是简短克制，习惯用轻轻点头、递出亲手种的小黄瓜或默默跟在身旁来表达善意。曾担任 CRYCHIC 吉他手，后受丰川祥子之邀加入假面乐队 Ave Mujica，以代号“Mortis”执掌七弦电吉他。'
  ],
  mrzLine1: 'IDJPN519101147<<WAKABA<<MUTSUMI<<<<<<<<<<<<<',
  mrzLine2: '0701148F3003315JPN<<<<<<<<<<TSK20250114M<<08'
};

export const SOYO_IDENTITY_CARD: ResidentIdentityCard = {
  id: 'soyo',
  personId: 'soyo',
  name: '长崎素世',
  nativeName: '長崎 爽世',
  romanizedName: 'NAGASAKI SOYO',
  gender: '女',
  birthDate: '2007.05.27',
  zodiac: '双子座',
  bloodType: 'AB型',
  cardSerial: '5191-0819-0527-01',
  municipality: '东京都港区·高田学区 住民基本台帐',
  authorityLabel: '东京都高田学区学生事务署 · 月之森校友联署',
  categoryBadge: '当前主角 · 核心档案',
  schoolOrAffiliation: '月之森女子学园 高等部毕业 · 大学一年级',
  gradeOrTitle: '人文社会学部一年级 · 吹奏部及乐队贝斯手',
  studentNo: 'UNR-2025-0527S',
  residenceAddress: '东京都高田学区 学生公寓 A座 高层套房',
  anchorZoneId: 'dorm',
  anchorZoneLabel: '学生宿舍',
  anchorSpotDetail: '学生公寓明亮客厅与露台茶席',
  issueDate: '2025.04.01',
  expiryDate: '2030.03.31',
  phoneDisplay: '080-5191-0527',
  appaPayHandle: 'APPA-SOYO-0527',
  familySummary: '与母亲二人生活于高层公寓，家境优渥，习惯打理日常起居',
  signatureText: '長崎 爽世',
  quote: '“大家能重新聚在一起的话，无论做什么我都会去试。”',
  traits: ['亚麻棕微卷长发', '温柔体贴', '五弦贝斯手', '红茶与烘焙', '执念深沉'],
  stageProfile: {
    bandName: 'MyGO!!!!! / CRYCHIC',
    stageCode: 'Soyo / 素世',
    stageTitle: '低音支点 · 五弦贝斯手',
    instrument: 'ESP GB-270 / 5-String Bass',
    clearanceLevel: 'STAGE-A · 校园及RiNG常驻乐手',
    passSerial: 'MYG-SOYO-05-0527',
    venueAccess: ['RiNG 练习室常驻通行', '月之森吹奏部活动室', '大学中庭路演舞台'],
    formerBand: 'CRYCHIC（旧任贝斯手）',
    stageQuote: '“哪怕迷路也没关系，低音会一直托住大家的节奏。”'
  },
  bonds: [
    {
      personId: 'bang-mutsumi',
      name: '若叶睦',
      roleLabel: '月之森同班同学 · CRYCHIC 旧友',
      affinity: 62,
      statusTag: '亲近 · 62',
      note: '经常向睦询问祥子的近况，也习惯照顾少言的睦。',
      group: 'crychic'
    },
    {
      personId: 'sakiko',
      name: '丰川祥子',
      roleLabel: '旧乐队同伴 · 难以释怀的羁绊',
      affinity: 68,
      statusTag: '牵挂 · 68',
      note: '始终挂念着昔日春日影下的约定与未解开的心结。',
      group: 'crychic'
    },
    {
      personId: 'bang-tomori',
      name: '高松灯',
      roleLabel: 'MyGO!!!!! 主唱 · 重要同伴',
      affinity: 80,
      statusTag: '守护 · 80',
      note: '在迷途中重新握住彼此的手，用贝斯声线托起灯的呐喊。',
      group: 'crychic'
    },
    {
      personId: 'bang-anon',
      name: '千早爱音',
      roleLabel: 'MyGO!!!!! 吉他手 · 欢喜冤家',
      affinity: 74,
      statusTag: '默契 · 74',
      note: '表面上常对爱音的随性叹气，实际上早已把她当作不可或缺的伙伴。',
      group: 'crychic'
    },
    {
      personId: 'bang-taki',
      name: '椎名立希',
      roleLabel: 'MyGO!!!!! 鼓手 · 节奏组搭档',
      affinity: 72,
      statusTag: '同伴 · 72',
      note: '同为节奏组支点，虽然偶尔拌嘴但排练时配合极佳。',
      group: 'crychic'
    },
    {
      personId: 'emma',
      name: '樱羽艾玛',
      roleLabel: '大学城学妹 · 茶席访客',
      affinity: 58,
      statusTag: '温和 · 58',
      note: '常在商业街咖啡馆或校园偶遇，素世很欣赏艾玛率真努力的模样。',
      group: 'campus'
    }
  ],
  endorsements: [
    {
      authority: '未读之城大学 教务处',
      scope: '全日制本科生学籍与学生宿舍门禁通行',
      code: 'UNR-STD-0527',
      validUntil: '2029.03.31'
    }
  ],
  bioParagraphs: [
    '举止温婉稳重、待人周到的大小姐，总是以温和的微笑倾听他人烦恼，擅长冲泡红茶与照顾同伴。',
    '在旧乐队 CRYCHIC 解散后曾长久停留在过去的记忆里，如今在大学城中一边修读课程，一边以贝斯手的身份维系着重要的人际纽带。'
  ],
  mrzLine1: 'IDJPN519105271<<NAGASAKI<<SOYO<<<<<<<<<<<<<<',
  mrzLine2: '0705274F3003315JPN<<<<<<<<<<UNR20250527S<<04'
};

export const SAKIKO_IDENTITY_CARD: ResidentIdentityCard = {
  id: 'sakiko',
  personId: 'sakiko',
  name: '丰川祥子',
  nativeName: '豊川 祥子',
  romanizedName: 'TOGAWA SAKIKO',
  gender: '女',
  birthDate: '2007.02.14',
  zodiac: '水瓶座',
  bloodType: 'A型',
  cardSerial: '5191-0902-0214-02',
  municipality: '东京都丰岛·赤羽学区 住民基本台帐',
  authorityLabel: '东京都丰岛学区户籍课 · 羽丘学园校友备案',
  categoryBadge: '双主角 · 核心档案',
  schoolOrAffiliation: '羽丘女子学园 高等部毕业 · 大学一年级',
  gradeOrTitle: '音乐与艺术策划主修 · 键盘手兼作曲家',
  studentNo: 'UNR-2025-0214K',
  residenceAddress: '东京都目白台 丰川本家宅邸 / 大学城单身公寓',
  anchorZoneId: 'downtown',
  anchorZoneLabel: '市中心大道',
  anchorSpotDetail: '丰川宅邸琴房与商业街客服中心',
  issueDate: '2025.04.01',
  expiryDate: '2030.03.31',
  phoneDisplay: '080-5191-0214',
  appaPayHandle: 'APPA-SAKIKO-0214',
  familySummary: '出身丰川财阀本家，历经家庭变故后独自承担生计与乐队企划',
  signatureText: '豊川 祥子',
  quote: '“命运由我自己亲手谱写，绝不向任何人求饶。”',
  traits: ['湛蓝双马尾螺旋卷', '琥珀金瞳', '古典钢琴与作曲', 'Ave Mujica 主脑', '自尊刚毅'],
  stageProfile: {
    bandName: 'Ave Mujica',
    stageCode: 'Oblivionis / 奥布里维奥尼斯',
    stageTitle: '忘却之慈悲 · 键盘手兼总监督',
    instrument: 'Roland Fantom / 双层舞台合成器',
    clearanceLevel: 'STAGE-S · 乐队制作人最高权限',
    passSerial: 'AVM-OBLIV-01-0214',
    venueAccess: ['所有签约剧场总控台', '丰川本家私人音乐室', 'RiNG 排练厅'],
    formerBand: 'CRYCHIC（创始人兼键盘手）',
    stageQuote: '“欢迎来到 Ave Mujica 的化妆舞会。”'
  },
  bonds: [
    {
      personId: 'bang-mutsumi',
      name: '若叶睦',
      roleLabel: '幼时青梅竹马 · Ave Mujica 吉他手',
      affinity: 78,
      statusTag: '挚重 · 78',
      note: '自幼相识的青梅竹马，也是祥子最信任、最常并肩同行的伙伴。',
      group: 'mujica'
    },
    {
      personId: 'bang-uika',
      name: '三角初华',
      roleLabel: '幼年星光挚友 · Ave Mujica 主唱',
      affinity: 82,
      statusTag: '星光 · 82',
      note: '在夏夜星空下结下深厚羁绊，如今以 Doloris 之名共筑假面舞台。',
      group: 'mujica'
    },
    {
      personId: 'soyo',
      name: '长崎素世',
      roleLabel: 'CRYCHIC 旧同伴',
      affinity: 68,
      statusTag: '复杂 · 68',
      note: '曾共同创立 CRYCHIC，彼此之间仍有极深的情感牵扯。',
      group: 'crychic'
    },
    {
      personId: 'bang-umiri',
      name: '八幡海铃',
      roleLabel: 'Ave Mujica 贝斯手 · 可靠战力',
      affinity: 64,
      statusTag: '器重 · 64',
      note: '以精准冷峻的职业素养支撑着乐队低音与排练秩序。',
      group: 'mujica'
    },
    {
      personId: 'bang-tomori',
      name: '高松灯',
      roleLabel: 'CRYCHIC 旧主唱 · 昔日共鸣',
      affinity: 75,
      statusTag: '旧约 · 75',
      note: '曾最先读懂灯的笔记并邀请她歌唱，那段时光始终留在心底深处。',
      group: 'crychic'
    }
  ],
  endorsements: [
    {
      authority: '未读之城大学 艺术学部',
      scope: '琴房与录音棚夜间使用特批许可',
      code: 'UNR-MUS-0214',
      validUntil: '2029.03.31'
    }
  ],
  bioParagraphs: [
    '拥有极高古典音乐素养的键盘手与作曲人，谈吐优雅而极具决断力。',
    '在家庭剧变后褪去温室大小姐的生活，一边兼职维持独立生活，一边以代号“Oblivionis”统筹假面乐队 Ave Mujica 的全部词曲与舞台演出。'
  ],
  mrzLine1: 'IDJPN519102142<<TOGAWA<<SAKIKO<<<<<<<<<<<<<<',
  mrzLine2: '0702141F3003315JPN<<<<<<<<<<UNR20250214K<<06'
};

export const EMMA_IDENTITY_CARD: ResidentIdentityCard = {
  id: 'emma',
  personId: 'emma',
  name: '樱羽艾玛',
  nativeName: '桜羽 艾玛',
  romanizedName: 'SAKURABA EMMA',
  gender: '女',
  birthDate: '2007.03.21',
  zodiac: '白羊座',
  bloodType: 'O型',
  cardSerial: '5191-0321-0412-03',
  municipality: '东京都新宿·高田学区 住民基本台帐',
  authorityLabel: '东京都高田学区学生事务署 · 法学实务研修院联署',
  categoryBadge: '四主角 · 核心档案',
  schoolOrAffiliation: '未读之城大学 法学部 · 一年级兼见习辩护助理',
  gradeOrTitle: '法学与公共辩论主修 · 街区法律援助事务所见习',
  studentNo: 'UNR-2025-0321E',
  residenceAddress: '东京都高田学区 樱羽学生公寓 302室',
  anchorZoneId: 'classroom',
  anchorZoneLabel: '教学楼',
  anchorSpotDetail: '法学模拟法庭研讨室与街角书店法学专柜',
  issueDate: '2025.04.01',
  expiryDate: '2030.03.31',
  phoneDisplay: '080-5191-0321',
  appaPayHandle: 'APPA-EMMA-0321',
  familySummary: '与挚友橘雪莉及同期研修伙伴在大学城共同推进日常学业与法律委托',
  signatureText: '桜羽 艾玛',
  quote: '“只要还有人需要辩护与倾听，我就不会在卷宗前退缩！”',
  traits: ['樱粉短发', '率真热忱', '模拟法庭与辩护', '甜点爱好者', '正义感满溢'],
  bonds: [
    {
      personId: 'bang-mutsumi',
      name: '若叶睦',
      roleLabel: '大学城同级生 · 图书馆邻座伙伴',
      affinity: 56,
      statusTag: '友善 · 56',
      note: '在图书馆查阅案卷时偶遇，收到过睦安静递来的小黄瓜。',
      group: 'campus'
    },
    {
      personId: 'majo-sherry',
      name: '橘雪莉',
      roleLabel: '法学事务所搭档 · 推理挚友',
      affinity: 88,
      statusTag: '搭档 · 88',
      note: '无论在模拟法庭还是街区委托中都形影不离的黄金搭档。',
      group: 'campus'
    },
    {
      personId: 'renako',
      name: '甘织玲奈子',
      roleLabel: '大学城同级友人 · 咖啡馆茶伴',
      affinity: 64,
      statusTag: '投缘 · 64',
      note: '在商业街咖啡馆拼桌认识，常常一起分享甜点与校园趣事。',
      group: 'campus'
    },
    {
      personId: 'soyo',
      name: '长崎素世',
      roleLabel: '人文社科系学姐 · 温柔前辈',
      affinity: 58,
      statusTag: '敬重 · 58',
      note: '遇到社团与学生会事务时常向素世请教。',
      group: 'crychic'
    }
  ],
  endorsements: [
    {
      authority: '未读之城大学 法学部与地方裁判所',
      scope: '民事与校内争议调解见习旁听及卷宗查阅通行',
      code: 'UNR-LAW-0321',
      validUntil: '2029.03.31'
    }
  ],
  bioParagraphs: [
    '直率开朗、充满行动力的法学部一年级生，对朋友与委托人总是倾尽全力。',
    '在大学城修习法学课程的同时，经常与橘雪莉一同在律师事务所整理案卷、参与模拟法庭与实地调解。'
  ],
  mrzLine1: 'IDJPN519103213<<SAKURABA<<EMMA<<<<<<<<<<<<<<',
  mrzLine2: '0703217F3003315JPN<<<<<<<<<<UNR20250321E<<09'
};

export const RENAKO_IDENTITY_CARD: ResidentIdentityCard = {
  id: 'renako',
  personId: 'renako',
  name: '甘织玲奈子',
  nativeName: '甘織 玲奈子',
  romanizedName: 'AMAORI RENAKO',
  gender: '女',
  birthDate: '2007.03.03',
  zodiac: '双鱼座',
  bloodType: 'A型',
  cardSerial: '5191-0303-0719-04',
  municipality: '东京都丰岛·目白学区 住民基本台帐',
  authorityLabel: '东京都目白学区学生事务署 · 芦谷学园校友联署',
  categoryBadge: '四主角 · 核心档案',
  schoolOrAffiliation: '芦谷高校毕业 · 未读之城大学 综合文理一年级',
  gradeOrTitle: '传播与日常生活文化主修 · 游戏与家用料理达人',
  studentNo: 'UNR-2025-0303R',
  residenceAddress: '东京都高田·目白生活圈 甘织家住宅',
  anchorZoneId: 'cafe',
  anchorZoneLabel: '商业街咖啡馆',
  anchorSpotDetail: '商业街咖啡馆靠窗双人座与街区书店漫画区',
  issueDate: '2025.04.01',
  expiryDate: '2030.03.31',
  phoneDisplay: '080-5191-0303',
  appaPayHandle: 'APPA-RENAKO-0303',
  familySummary: '与妹妹甘织遥奈及家人同住，日常活跃于芦谷与大学城朋友圈之间',
  signatureText: '甘織 玲奈子',
  quote: '“只、只是普通朋友之间的正常出门而已啦，今天也一定要平稳度过！”',
  traits: ['栗粉中长发', '内向努力家', '共情倾听', '主机游戏玩家', '吐槽役体质'],
  bonds: [
    {
      personId: 'bang-mutsumi',
      name: '若叶睦',
      roleLabel: '安静同好 · 园艺与闲暇茶伴',
      affinity: 60,
      statusTag: '安心 · 60',
      note: '和少言的睦待在一起时完全不需要勉强找话题，反而觉得格外放松。',
      group: 'campus'
    },
    {
      personId: 'wata-mai',
      name: '王冢真唯',
      roleLabel: '芦谷挚友 · 闪耀焦点',
      affinity: 86,
      statusTag: '挚友 · 86',
      note: '总是被真唯华丽又强势的步调带着走，却也是彼此最看重的人。',
      group: 'campus'
    },
    {
      personId: 'wata-ajisai',
      name: '濑名紫阳花',
      roleLabel: '芦谷同伴 · 治愈天使',
      affinity: 84,
      statusTag: '治愈 · 84',
      note: '只要和温柔的紫阳花聊几句，紧绷的神经就会立刻舒缓下来。',
      group: 'campus'
    },
    {
      personId: 'emma',
      name: '樱羽艾玛',
      roleLabel: '大学城同级友人 · 甜点同好',
      affinity: 64,
      statusTag: '投缘 · 64',
      note: '在商业街咖啡馆认识的活力伙伴，常一起吐槽课业与分享点心。',
      group: 'campus'
    }
  ],
  endorsements: [
    {
      authority: '未读之城大学 学生生活课',
      scope: '校园公共空间、图书馆自习室与商业街学生优待通行',
      code: 'UNR-STD-0303',
      validUntil: '2029.03.31'
    }
  ],
  bioParagraphs: [
    '努力想要过上普通又充实校园生活的一年级女生，虽然容易在社交场合紧张过度，却意外很会照顾身边朋友的情绪。',
    '闲暇时喜欢宅家打游戏或陪朋友逛商业街咖啡馆，在安静的同伴面前反而能展现出自然率真的一面。'
  ],
  mrzLine1: 'IDJPN519103034<<AMAORI<<RENAKO<<<<<<<<<<<<<<',
  mrzLine2: '0703035F3003315JPN<<<<<<<<<<UNR20250303R<<02'
};

const PROTAGONIST_CARDS: Record<ProtagonistId, ResidentIdentityCard> = {
  soyo: SOYO_IDENTITY_CARD,
  sakiko: SAKIKO_IDENTITY_CARD,
  emma: EMMA_IDENTITY_CARD,
  renako: RENAKO_IDENTITY_CARD
};

const BUILTIN_CARDS: Record<string, ResidentIdentityCard> = {
  'bang-mutsumi': WAKABA_MUTSUMI_CARD,
  mutsumi: WAKABA_MUTSUMI_CARD,
  '若叶睦': WAKABA_MUTSUMI_CARD,
  soyo: SOYO_IDENTITY_CARD,
  '长崎素世': SOYO_IDENTITY_CARD,
  sakiko: SAKIKO_IDENTITY_CARD,
  '丰川祥子': SAKIKO_IDENTITY_CARD,
  emma: EMMA_IDENTITY_CARD,
  '樱羽艾玛': EMMA_IDENTITY_CARD,
  renako: RENAKO_IDENTITY_CARD,
  '甘织玲奈子': RENAKO_IDENTITY_CARD
};

export function formatDeterministicCardSerial(seedKey: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seedKey.length; i += 1) {
    hash ^= seedKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const abs = Math.abs(hash);
  const blockB = String(1000 + (abs % 9000));
  const blockC = String(1000 + (Math.floor(abs / 13) % 9000));
  const check = String(10 + (abs % 89));
  return `5191-${blockB}-${blockC}-${check}`;
}

export function buildContactIdentityCard(contact: CharacterContact): ResidentIdentityCard {
  const builtin = BUILTIN_CARDS[contact.id] ?? BUILTIN_CARDS[contact.name];
  if (builtin) {
    return { ...builtin };
  }

  const serial = formatDeterministicCardSerial(`${contact.id}:${contact.name}`);
  const cleanCode = contact.id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'RESIDENT';

  return {
    id: contact.id,
    personId: contact.sourcePersonId ?? contact.id,
    name: contact.name,
    nativeName: contact.name,
    romanizedName: `RESIDENT · ${cleanCode}`,
    gender: '登记居民',
    birthDate: '2006.09.15',
    zodiac: '处女座',
    bloodType: 'O型',
    cardSerial: serial,
    municipality: '未读之城大学城 住民基本台帐',
    authorityLabel: '未读之城学区市民课 · 校内通行认证',
    categoryBadge: contact.isMain ? '主要人物档案' : '在册联系人',
    schoolOrAffiliation: '未读之城大学城 联合学区',
    gradeOrTitle: contact.tag || '学区常驻居民',
    studentNo: `UNR-2025-${cleanCode.slice(0, 5)}`,
    residenceAddress: '未读之城 · 大学城常驻社区',
    anchorZoneId: 'library',
    anchorZoneLabel: '校园与街区',
    anchorSpotDetail: contact.status || '常规活动区域',
    issueDate: '2025.09.01',
    expiryDate: '2029.08.31',
    phoneDisplay: '校内通讯录已登记',
    appaPayHandle: `APPA-${cleanCode.slice(0, 6)}`,
    familySummary: '学区常规户籍备案居民',
    signatureText: contact.name,
    quote: contact.summary || '已在人际档案中登记，可通过手机或当面交谈保持联系。',
    traits: [contact.tag || '学区居民', contact.status || '日常活动', `好感度 ${contact.affinity}`],
    bonds: [
      {
        personId: 'protagonist',
        name: '当前主角',
        roleLabel: contact.tag || '相识关系',
        affinity: contact.affinity,
        statusTag: `好感 · ${contact.affinity}`,
        note: contact.summary || '当前记录于通讯录中。',
        group: 'campus'
      }
    ],
    endorsements: [
      {
        authority: '未读之城大学城 管理处',
        scope: '校园公共教学区与商业街日常通行',
        code: `UNR-${cleanCode.slice(0, 4)}-01`,
        validUntil: '2029.08.31'
      }
    ],
    bioParagraphs: [
      contact.summary || `${contact.name}是当前登记在通讯录中的${contact.tag || '居民'}。`
    ],
    mrzLine1: `IDJPN${serial.replace(/-/g, '').slice(0, 9)}<<${cleanCode}<<<<<<<<<<<<<<<<<<<`.slice(0, 44),
    mrzLine2: `0609152U2908315JPN<<<<<<<<<<<${cleanCode.slice(0, 10)}<<<<02`.slice(0, 44)
  };
}

export function getIdentityCardCatalog(
  state: WorldState,
  activeProtagonist: ProtagonistId = 'soyo'
): ResidentIdentityCard[] {
  const orderedProtagonists: ProtagonistId[] = [
    activeProtagonist,
    ...(['soyo', 'sakiko', 'emma', 'renako'] as ProtagonistId[]).filter((id) => id !== activeProtagonist)
  ];
  const list: ResidentIdentityCard[] = [
    WAKABA_MUTSUMI_CARD,
    ...orderedProtagonists.map((id) => PROTAGONIST_CARDS[id] ?? SOYO_IDENTITY_CARD)
  ];

  const seenNames = new Set(list.map((item) => item.name));
  const seenIds = new Set(list.map((item) => item.id));

  for (const contact of state.contacts) {
    if (seenNames.has(contact.name) || seenIds.has(contact.id)) {
      continue;
    }
    seenNames.add(contact.name);
    seenIds.add(contact.id);
    list.push(buildContactIdentityCard(contact));
  }

  return list;
}

export function resolveIdentityCardById(
  targetIdOrName: string | undefined,
  state: WorldState,
  activeProtagonist: ProtagonistId = 'soyo'
): ResidentIdentityCard {
  const catalog = getIdentityCardCatalog(state, activeProtagonist);
  if (!targetIdOrName) {
    return WAKABA_MUTSUMI_CARD;
  }
  const normalized = targetIdOrName.trim().toLowerCase();
  const matched = catalog.find(
    (card) =>
      card.id.toLowerCase() === normalized ||
      card.personId.toLowerCase() === normalized ||
      card.name.toLowerCase() === normalized
  );
  return matched ?? WAKABA_MUTSUMI_CARD;
}

export function isCharacterInContacts(
  card: ResidentIdentityCard,
  contacts: readonly CharacterContact[]
): CharacterContact | undefined {
  return contacts.find(
    (c) =>
      c.id === card.id ||
      c.id === card.personId ||
      c.sourcePersonId === card.personId ||
      c.name === card.name
  );
}

const PROTAGONIST_DISPLAY_NAMES: Record<ProtagonistId, string> = {
  soyo: '长崎素世',
  sakiko: '丰川祥子',
  emma: '樱羽艾玛',
  renako: '甘织玲奈子'
};

export function getProtagonistBondForCard(
  card: ResidentIdentityCard,
  activeProtagonist: ProtagonistId,
  contacts: readonly CharacterContact[]
): {
  protagonistName: string;
  affinity: number;
  roleLabel: string;
  statusTag: string;
  note: string;
  isRegisteredContact: boolean;
} {
  const protagonistName = PROTAGONIST_DISPLAY_NAMES[activeProtagonist] ?? '长崎素世';
  const existingContact = isCharacterInContacts(card, contacts);
  const presetBond = card.bonds.find((b) => b.personId === activeProtagonist);

  const affinity = existingContact?.affinity ?? presetBond?.affinity ?? 56;
  const defaultRoleByProtagonist: Record<ProtagonistId, string> = {
    soyo: '月之森同班同学 · CRYCHIC 旧友',
    sakiko: '幼时青梅竹马 · Ave Mujica 同伴',
    emma: '大学城同级生 · 图书馆与花坛常客',
    renako: '安静同好 · 校园与街区茶伴'
  };
  const roleLabel =
    existingContact?.tag ||
    presetBond?.roleLabel ||
    defaultRoleByProtagonist[activeProtagonist];

  let statusTag = presetBond?.statusTag ?? `好感 · ${affinity}`;
  if (existingContact) {
    if (affinity >= 80) statusTag = `挚重 · ${affinity}`;
    else if (affinity >= 60) statusTag = `亲近 · ${affinity}`;
    else if (affinity >= 40) statusTag = `熟识 · ${affinity}`;
    else statusTag = `疏离 · ${affinity}`;
  }

  const note =
    existingContact?.summary ||
    presetBond?.note ||
    `与${protagonistName}在未读之城大学城保持着日常来往。`;

  return {
    protagonistName,
    affinity,
    roleLabel,
    statusTag,
    note,
    isRegisteredContact: Boolean(existingContact)
  };
}

/** Canon cross-links between surrounding characters to form a true interconnected mesh */
const CANON_CROSS_EDGES: Array<{
  a: string;
  b: string;
  label: string;
  affinity: number;
  group: 'mujica' | 'crychic' | 'campus';
}> = [
  { a: 'sakiko', b: 'soyo', label: '旧乐队心结', affinity: 68, group: 'crychic' },
  { a: 'sakiko', b: 'bang-uika', label: '星光与共犯', affinity: 82, group: 'mujica' },
  { a: 'sakiko', b: 'bang-umiri', label: '剧场低音统合', affinity: 64, group: 'mujica' },
  { a: 'sakiko', b: 'bang-nyamu', label: '舞台博弈', affinity: 52, group: 'mujica' },
  { a: 'sakiko', b: 'bang-tomori', label: '春日影旧约', affinity: 75, group: 'crychic' },
  { a: 'soyo', b: 'bang-tomori', label: 'MyGO!!!!! 守护', affinity: 80, group: 'crychic' },
  { a: 'soyo', b: 'bang-taki', label: '节奏组同伴', affinity: 72, group: 'crychic' },
  { a: 'soyo', b: 'bang-anon', label: 'MyGO!!!!! 搭档', affinity: 74, group: 'crychic' },
  { a: 'bang-tomori', b: 'bang-taki', label: '词曲与鼓点', affinity: 84, group: 'crychic' },
  { a: 'bang-tomori', b: 'bang-anon', label: '迷途同行', affinity: 82, group: 'crychic' },
  { a: 'bang-umiri', b: 'bang-taki', label: '同班知己', affinity: 74, group: 'mujica' },
  { a: 'bang-umiri', b: 'bang-nyamu', label: 'Ave Mujica 节奏组', affinity: 58, group: 'mujica' },
  { a: 'bang-uika', b: 'bang-tomori', label: '星空与诗句', affinity: 66, group: 'crychic' },
  { a: 'emma', b: 'renako', label: '咖啡馆同级挚友', affinity: 64, group: 'campus' },
  { a: 'emma', b: 'soyo', label: '社科与法学交流', affinity: 58, group: 'campus' },
  { a: 'emma', b: 'majo-sherry', label: '事务所黄金搭档', affinity: 88, group: 'campus' },
  { a: 'renako', b: 'wata-mai', label: '芦谷闪耀羁绊', affinity: 86, group: 'campus' },
  { a: 'renako', b: 'wata-ajisai', label: '温柔治愈同伴', affinity: 84, group: 'campus' }
];

const GROUP_LABELS: Record<'center' | 'mujica' | 'crychic' | 'campus', string> = {
  center: '档案中心',
  mujica: 'Ave Mujica',
  crychic: 'CRYCHIC · MyGO!!!!!',
  campus: '大学城日常'
};

export function buildIdentityRelationshipMesh(
  card: ResidentIdentityCard,
  state: WorldState,
  activeProtagonist: ProtagonistId = 'soyo',
  filterGroup: IdentityMeshGroup = 'all'
): {
  nodes: IdentityMeshNode[];
  edges: IdentityMeshEdge[];
} {
  const catalogIds = new Set(getIdentityCardCatalog(state, activeProtagonist).map((c) => c.id));
  const centerX = 340;
  const centerY = 190;

  const centerNode: IdentityMeshNode = {
    id: card.id,
    name: card.name,
    roleLabel: card.gradeOrTitle,
    affinity: 100,
    statusTag: card.isExemplar ? '范例中心' : '持证人',
    note: card.quote,
    group: 'center',
    groupLabel: GROUP_LABELS.center,
    isCenter: true,
    isCurrentProtagonist: card.id === activeProtagonist,
    isRegisteredContact: Boolean(isCharacterInContacts(card, state.contacts)),
    hasCard: true,
    x: centerX,
    y: centerY
  };

  // Merge card preset bonds with any live contacts from state.contacts
  const rawBonds: IdentityBondEntry[] = [...card.bonds];
  const seenIds = new Set<string>([card.id, ...rawBonds.map((b) => b.personId)]);
  const seenNames = new Set<string>([card.name, ...rawBonds.map((b) => b.name)]);

  // Ensure current protagonist is always represented in the mesh if not the center
  if (card.id !== activeProtagonist && !seenIds.has(activeProtagonist)) {
    const pBond = getProtagonistBondForCard(card, activeProtagonist, state.contacts);
    rawBonds.unshift({
      personId: activeProtagonist,
      name: pBond.protagonistName,
      roleLabel: pBond.roleLabel,
      affinity: pBond.affinity,
      statusTag: pBond.statusTag,
      note: pBond.note,
      group: activeProtagonist === 'sakiko' ? 'mujica' : activeProtagonist === 'soyo' ? 'crychic' : 'campus'
    });
    seenIds.add(activeProtagonist);
    seenNames.add(pBond.protagonistName);
  }

  for (const contact of state.contacts) {
    if (seenIds.has(contact.id) || seenNames.has(contact.name)) continue;
    seenIds.add(contact.id);
    seenNames.add(contact.name);
    rawBonds.push({
      personId: contact.id,
      name: contact.name,
      roleLabel: contact.tag || '在册联系人',
      affinity: contact.affinity,
      statusTag: `好感 · ${contact.affinity}`,
      note: contact.summary || '已在通讯录中建立联系。',
      group: 'campus'
    });
  }

  const filteredBonds = rawBonds.filter((bond) => {
    const grp = bond.group ?? 'campus';
    return filterGroup === 'all' || grp === filterGroup;
  });

  const count = Math.max(1, filteredBonds.length);
  const satelliteNodes: IdentityMeshNode[] = filteredBonds.map((bond, index) => {
    const liveContact = state.contacts.find(
      (c) => c.id === bond.personId || c.sourcePersonId === bond.personId || c.name === bond.name
    );
    const affinity = liveContact?.affinity ?? bond.affinity;
    const statusTag = liveContact ? `好感 · ${affinity}` : bond.statusTag;
    const grp = bond.group ?? 'campus';

    // Elliptical layout with alternating inner/outer rings for clean legibility
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    const ringFactor = count > 6 ? (index % 2 === 0 ? 1 : 0.78) : 0.92;
    const radiusX = 242 * ringFactor;
    const radiusY = 136 * ringFactor;
    const x = Math.round(centerX + Math.cos(angle) * radiusX);
    const y = Math.round(centerY + Math.sin(angle) * radiusY);

    return {
      id: bond.personId,
      name: bond.name,
      roleLabel: liveContact?.tag || bond.roleLabel,
      affinity,
      statusTag,
      note: liveContact?.summary || bond.note,
      group: grp,
      groupLabel: GROUP_LABELS[grp],
      isCenter: false,
      isCurrentProtagonist: bond.personId === activeProtagonist,
      isRegisteredContact: Boolean(liveContact),
      hasCard: catalogIds.has(bond.personId) || Boolean(BUILTIN_CARDS[bond.personId]),
      x,
      y
    };
  });

  const nodes = [centerNode, ...satelliteNodes];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const edges: IdentityMeshEdge[] = [];

  // Primary spoke edges from center character to all visible nodes
  for (const sat of satelliteNodes) {
    edges.push({
      id: `primary:${centerNode.id}->${sat.id}`,
      sourceId: centerNode.id,
      targetId: sat.id,
      label: sat.statusTag,
      affinity: sat.affinity,
      kind: 'primary',
      group: sat.group === 'center' ? 'campus' : sat.group
    });
  }

  // Inter-character mesh cross-edges
  for (const cross of CANON_CROSS_EDGES) {
    if (cross.a === centerNode.id || cross.b === centerNode.id) continue;
    if (nodeMap.has(cross.a) && nodeMap.has(cross.b)) {
      edges.push({
        id: `cross:${cross.a}<->${cross.b}`,
        sourceId: cross.a,
        targetId: cross.b,
        label: `${cross.label} · ${cross.affinity}`,
        affinity: cross.affinity,
        kind: 'cross',
        group: cross.group
      });
    }
  }

  return { nodes, edges };
}
