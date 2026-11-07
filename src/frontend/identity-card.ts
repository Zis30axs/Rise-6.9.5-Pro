import type { ProtagonistId } from '../runtime/dual-protagonists';
import { locations } from '../runtime/model';
import type { CharacterContact, WorldState } from './types';

export type IdentityCardMode = 'civil' | 'stage';
export type IdentityCardSide = 'front' | 'back';
export type IdentityPhotoPose = 'standard' | 'smile' | 'shy' | 'stage';
export type IdentityMeshGroup = 'all' | 'family' | 'campus' | 'mujica' | 'crychic' | 'legal';

export interface IdentityBondEntry {
  personId: string;
  name: string;
  roleLabel: string;
  affinity: number;
  statusTag: string;
  note: string;
  group?: 'family' | 'campus' | 'mujica' | 'crychic' | 'legal';
}

export interface IdentityMeshNode {
  id: string;
  name: string;
  roleLabel: string;
  affinity: number;
  statusTag: string;
  note: string;
  group: 'center' | 'family' | 'campus' | 'mujica' | 'crychic' | 'legal';
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
  group: 'family' | 'campus' | 'mujica' | 'crychic' | 'legal';
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
  categoryBadge: '学区学生 · 乐团特邀',
  isExemplar: false,
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
  traits: ['浅灰绿长发 · 琥珀金瞳', '寡言克制 · 敏锐好奇', '园艺与黄瓜栽培', '七弦吉他手', '深层依赖 · 占有欲'],
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
      roleLabel: '月之森同班同学 · 隐秘依存',
      affinity: 62,
      statusTag: '依存 · 62',
      note: '在月之森与旧团时期深陷彼此的生活，在少言的外表下对素世怀有深层依赖与隐秘的占有欲，不愿素世被新乐队或他人彻底夺走。',
      group: 'crychic'
    },
    {
      personId: 'bang-rana',
      name: '要乐奈',
      roleLabel: '野猫吉他手 · 探索与浓厚兴趣',
      affinity: 54,
      statusTag: '好奇 · 54',
      note: '对乐奈如野猫般自由随性、不受世俗与规矩束缚的姿态抱有浓厚好奇，偶遇时会主动走近、投以注视或分享抹茶甜点。',
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
    '性格安静克制却绝非被动无为，对外界环境有着敏锐而活跃的探索欲。对如野猫般随性的吉他手要乐奈抱有浓厚兴趣；对长崎素世怀有隐秘的依赖与占有欲。曾担任 CRYCHIC 吉他手，后受丰川祥子之邀加入假面乐队 Ave Mujica，以代号“Mortis”执掌七弦电吉他。'
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
      roleLabel: '月之森同窗 · 内疚与牵挂',
      affinity: 62,
      statusTag: '牵挂 · 62',
      note: '虽然日常仍习惯照顾少言的睦，但经历过退还黄瓜的刺痛后，心中暗藏着未曾说清的内疚与复杂关照。',
      group: 'crychic'
    },
    {
      personId: 'sakiko',
      name: '丰川祥子',
      roleLabel: '旧团同伴 · 微妙和解',
      affinity: 68,
      statusTag: '克制 · 68',
      note: '经历过误会解开后重新接触，在日常中保持着带着一丝尴尬与克制的分寸感。',
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
      roleLabel: 'CRYCHIC 旧友 · 微妙和解',
      affinity: 68,
      statusTag: '克制 · 68',
      note: '解开家变隐情后重新建立联系，深知昔日伤害仍在，在温情中恪守体面分寸。',
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
    },
    {
      personId: 'bang-nyamu',
      name: '祐天寺若麦',
      roleLabel: 'Ave Mujica 鼓手 · 商业与舞台',
      affinity: 52,
      statusTag: '磨合 · 52',
      note: '虽历经武道馆揭面风波与商业理念碰撞，但在乐队重组后已形成成熟务实的舞台默契。',
      group: 'mujica'
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
      personId: 'majo-yuki',
      name: '月代雪',
      roleLabel: '旧友与合租室友 · 深层牵绊',
      affinity: 84,
      statusTag: '羁绊 · 84',
      note: '牢屋敷时期的挚友，如今在城市公寓中一同生活，彼此最信任的存在。',
      group: 'campus'
    },
    {
      personId: 'majo-sherry',
      name: '橘雪莉',
      roleLabel: '法学事务所搭档 · 推理挚友',
      affinity: 88,
      statusTag: '搭档 · 88',
      note: '无论在模拟法庭还是街区委托中都形影不离的黄金搭档。',
      group: 'legal'
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
      personId: 'watanare-haruna',
      name: '甘织遥奈',
      roleLabel: '至亲妹妹 · 重度姐控',
      affinity: 90,
      statusTag: '亲情 · 90',
      note: '嘴硬吐槽却最崇拜自己的亲妹妹，在背后全力守护着自己的现充生活。',
      group: 'family'
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

export function resolveZodiac(month: number, day: number): string {
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return '白羊座';
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return '金牛座';
  if ((month === 5 && day >= 21) || (month === 6 && day <= 21)) return '双子座';
  if ((month === 6 && day >= 22) || (month === 7 && day <= 22)) return '巨蟹座';
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return '狮子座';
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return '处女座';
  if ((month === 9 && day >= 23) || (month === 10 && day <= 23)) return '天秤座';
  if ((month === 10 && day >= 24) || (month === 11 && day <= 22)) return '天蝎座';
  if ((month === 11 && day >= 23) || (month === 12 && day <= 21)) return '射手座';
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return '摩羯座';
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return '水瓶座';
  return '双鱼座';
}

export const HARUNA_IDENTITY_CARD: ResidentIdentityCard = {
  id: 'watanare-haruna',
  personId: 'watanare-haruna',
  name: '甘织遥奈',
  nativeName: '甘織 遥奈',
  romanizedName: 'AMAORI HARUNA',
  gender: '女',
  birthDate: '2009.05.28',
  zodiac: '双子座',
  bloodType: 'A型',
  cardSerial: '5191-0528-0916-08',
  municipality: '东京都丰岛·目白学区 住民基本台帐',
  authorityLabel: '东京都目白学区学生事务署 · 月之森学园联署',
  categoryBadge: '学区高中生 · 亲属档案',
  schoolOrAffiliation: '月之森女子学园 高等部',
  gradeOrTitle: '高等部一年级 · 羽毛球部主力',
  studentNo: 'TSK-2025-0528H',
  residenceAddress: '东京都高田·目白生活圈 甘织家住宅',
  anchorZoneId: 'park',
  anchorZoneLabel: '中央公园',
  anchorSpotDetail: '神田川绿道羽球场与杂司谷甘织家',
  issueDate: '2025.04.01',
  expiryDate: '2030.03.31',
  phoneDisplay: '080-5191-0528',
  appaPayHandle: 'APPA-HARUNA-0528',
  familySummary: '甘织家次女，与姐姐甘织玲奈子及父母同住，极度维护姐姐',
  signatureText: '甘織 遥奈',
  quote: '“老姐，出门前先把穿搭拍给我检查！”',
  traits: ['粉发活力短马尾', '真·现充少女', '羽毛球部王牌', '重度姐控', '行动力拔群'],
  bonds: [
    {
      personId: 'renako',
      name: '甘织玲奈子',
      roleLabel: '至亲姐姐 · 依赖与极度崇拜',
      affinity: 88,
      statusTag: '羁绊 · 88',
      note: '最崇拜和珍视的人，平日嘴硬吐槽，关键时刻永远毫无保留地站在姐姐身旁。',
      group: 'campus'
    },
    {
      personId: 'watanare-seira',
      name: '鬼瓦星来',
      roleLabel: '月之森同班好友 · 挚友搭档',
      affinity: 78,
      statusTag: '挚友 · 78',
      note: '同为月之森高一学生，一起打球、吃甜点与聊天的默契同伴。',
      group: 'campus'
    },
    {
      personId: 'watanare-mai',
      name: '王冢真唯',
      roleLabel: '姐姐的闪耀恋人 · 相互认可',
      affinity: 70,
      statusTag: '认可 · 70',
      note: '承认真唯对姐姐的热切真心，偶尔会提醒她不要把大狗狗一样的黏人劲弄得老姐太难为情。',
      group: 'campus'
    },
    {
      personId: 'watanare-ajisai',
      name: '濑名紫阳花',
      roleLabel: '温柔治愈的紫阳花姐',
      affinity: 74,
      statusTag: '温和 · 74',
      note: '很喜欢紫阳花温和柔顺的长姐气场，经常受到她的贴心点心照顾。',
      group: 'campus'
    }
  ],
  endorsements: [
    {
      authority: '月之森女子学园 教务处',
      scope: '高中部全日制学籍与体育场馆通行认证',
      code: 'TSK-STD-0528',
      validUntil: '2028.03.31'
    },
    {
      authority: '神田川体育运动联合会',
      scope: '东京都青少年羽毛球竞技排位赛注册签注',
      code: 'BDM-FED-0528',
      validUntil: '2027.03.31'
    }
  ],
  bioParagraphs: [
    '月之森女子学园高等部一年级生，甘织玲奈子的亲妹妹。天生爽朗善交际、行动力极强的活力少女，在校担任羽毛球部王牌主力。',
    '亲手在春假帮家里蹲姐姐完成“现充出道”特训；虽然在家常对沉迷单机游戏的姐姐嘴硬吐槽，实则是无条件崇拜与守护姐姐的重度姐控。随着姐姐升入大学，遥奈升入月之森高等部，比玲奈子低两届，展现出耀眼的青春活力。'
  ],
  mrzLine1: 'IDJPN519105288<<AMAORI<<HARUNA<<<<<<<<<<<<<',
  mrzLine2: '0905286F3003315JPN<<<<<<<<<<TSK20250528H<<01'
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
  '甘织玲奈子': RENAKO_IDENTITY_CARD,
  'watanare-haruna': HARUNA_IDENTITY_CARD,
  haruna: HARUNA_IDENTITY_CARD,
  '甘织遥奈': HARUNA_IDENTITY_CARD,
  '遥奈': HARUNA_IDENTITY_CARD
};

interface ResidentProfilePreset {
  birthDate: string;
  zodiac: string;
  bloodType: string;
  gender: string;
  schoolOrAffiliation: string;
  gradeOrTitle: string;
  familySummary: string;
  quote?: string;
}

const KNOWN_RESIDENT_PROFILES: Record<string, ResidentProfilePreset> = {
  // 渡奈系列 - 妹妹与高中同学（高一，16岁，2009年生）
  'watanare-haruna': {
    birthDate: '2009.05.28',
    zodiac: '双子座',
    bloodType: 'A型',
    gender: '女',
    schoolOrAffiliation: '月之森女子学园 高等部',
    gradeOrTitle: '高等部一年级 · 羽毛球部主力',
    familySummary: '甘织家次女，与姐姐甘织玲奈子及父母同住',
    quote: '“老姐，出门前先把穿搭拍给我检查！”'
  },
  'watanare-seira': {
    birthDate: '2009.02.10',
    zodiac: '水瓶座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '月之森女子学园 高等部',
    gradeOrTitle: '高等部一年级 · 鬼瓦洗衣店看板娘',
    familySummary: '鬼瓦洗衣店独生女，与遥奈同在月之森高一',
    quote: '“玲奈子姐！刚熨好的衣服送来啦！”'
  },
  '鬼瓦星来': {
    birthDate: '2009.02.10',
    zodiac: '水瓶座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '月之森女子学园 高等部',
    gradeOrTitle: '高等部一年级 · 鬼瓦洗衣店看板娘',
    familySummary: '鬼瓦洗衣店独生女，与遥奈同在月之森高一',
    quote: '“玲奈子姐！刚熨好的衣服送来啦！”'
  },
  // 渡奈系列 - 母亲长辈（44岁，1981年生）
  'watanare-miyoko': {
    birthDate: '1981.04.18',
    zodiac: '白羊座',
    bloodType: 'A型',
    gender: '女',
    schoolOrAffiliation: '东京都丰岛学区 居民自治会',
    gradeOrTitle: '甘织家主妇 · 兼职工作',
    familySummary: '甘织玲奈子与遥奈的母亲，温和包容的长辈',
    quote: '“欢迎来家里玩呀，今晚要不要留下来一起吃晚饭？”'
  },
  '甘织美代子': {
    birthDate: '1981.04.18',
    zodiac: '白羊座',
    bloodType: 'A型',
    gender: '女',
    schoolOrAffiliation: '东京都丰岛学区 居民自治会',
    gradeOrTitle: '甘织家主妇 · 兼职工作',
    familySummary: '甘织玲奈子与遥奈的母亲，温和包容的长辈',
    quote: '“欢迎来家里玩呀，今晚要不要留下来一起吃晚饭？”'
  },
  // 邦邦系列 - 素世的母亲长辈（46岁，1979年生）
  'nagasaki-mother': {
    birthDate: '1979.08.12',
    zodiac: '狮子座',
    bloodType: 'AB型',
    gender: '女',
    schoolOrAffiliation: '东京都港区 都市商贸集团',
    gradeOrTitle: '企业高级管理层 · 职场高管',
    familySummary: '长崎素世的单亲母亲，深爱女儿的职场女性',
    quote: '“素世，零用钱和便签放在老地方了，想买什么尽管去买。”'
  },
  '长崎夫人': {
    birthDate: '1979.08.12',
    zodiac: '狮子座',
    bloodType: 'AB型',
    gender: '女',
    schoolOrAffiliation: '东京都港区 都市商贸集团',
    gradeOrTitle: '企业高级管理层 · 职场高管',
    familySummary: '长崎素世的单亲母亲，深爱女儿的职场女性',
    quote: '“素世，零用钱和便签放在老地方了，想买什么尽管去买。”'
  },
  'bang-makoto': {
    birthDate: '1979.08.12',
    zodiac: '狮子座',
    bloodType: 'AB型',
    gender: '女',
    schoolOrAffiliation: '东京都港区 都市商贸集团',
    gradeOrTitle: '企业高级管理层 · 职场高管',
    familySummary: '长崎素世的单亲母亲，深爱女儿的职场女性',
    quote: '“素世，零用钱和便签放在老地方了，想买什么尽管去买。”'
  },
  '长崎真琴': {
    birthDate: '1979.08.12',
    zodiac: '狮子座',
    bloodType: 'AB型',
    gender: '女',
    schoolOrAffiliation: '东京都港区 都市商贸集团',
    gradeOrTitle: '企业高级管理层 · 职场高管',
    familySummary: '长崎素世的单亲母亲，深爱女儿的职场女性',
    quote: '“素世，零用钱和便签放在老地方了，想买什么尽管去买。”'
  },
  // CiRCLE 店长长辈（27岁，1997年生）
  'circle-marina': {
    birthDate: '1997.10.16',
    zodiac: '天秤座',
    bloodType: 'O型',
    gender: '女',
    schoolOrAffiliation: 'Live House CiRCLE',
    gradeOrTitle: 'CiRCLE 店长 · 音乐现场总策划',
    familySummary: '都心Live House职员，负责协调各少女乐队活动',
    quote: '“欢迎来到 CiRCLE！今天的排练也要全力以赴哦！”'
  },
  '月岛麻里奈': {
    birthDate: '1997.10.16',
    zodiac: '天秤座',
    bloodType: 'O型',
    gender: '女',
    schoolOrAffiliation: 'Live House CiRCLE',
    gradeOrTitle: 'CiRCLE 店长 · 音乐现场总策划',
    familySummary: '都心Live House职员，负责协调各少女乐队活动',
    quote: '“欢迎来到 CiRCLE！今天的排练也要全力以赴哦！”'
  },
  // 芦谷五人组（大一，18岁，2006~2007年生）
  'watanare-mai': {
    birthDate: '2007.09.01',
    zodiac: '处女座',
    bloodType: 'AB型',
    gender: '女',
    schoolOrAffiliation: '芦谷高校毕业 · 未读之城大学',
    gradeOrTitle: '大一在读 · 现役时尚名模',
    familySummary: 'Queen Rose 社长王冢露涅的独生女',
    quote: '“又在说不行不行了吗？但在我眼里，玲奈子比任何人都耀眼哦。”'
  },
  '王冢真唯': {
    birthDate: '2007.09.01',
    zodiac: '处女座',
    bloodType: 'AB型',
    gender: '女',
    schoolOrAffiliation: '芦谷高校毕业 · 未读之城大学',
    gradeOrTitle: '大一在读 · 现役时尚名模',
    familySummary: 'Queen Rose 社长王冢露涅的独生女',
    quote: '“又在说不行不行了吗？但在我眼里，玲奈子比任何人都耀眼哦。”'
  },
  'watanare-ajisai': {
    birthDate: '2007.06.24',
    zodiac: '巨蟹座',
    bloodType: 'O型',
    gender: '女',
    schoolOrAffiliation: '芦谷高校毕业 · 未读之城大学',
    gradeOrTitle: '大一在读 · 治愈系长女',
    familySummary: '双职工家庭长女，悉心照料两个幼弟',
    quote: '“今天也可以让我稍微对玲奈酱撒会儿娇吗？”'
  },
  '濑名紫阳花': {
    birthDate: '2007.06.24',
    zodiac: '巨蟹座',
    bloodType: 'O型',
    gender: '女',
    schoolOrAffiliation: '芦谷高校毕业 · 未读之城大学',
    gradeOrTitle: '大一在读 · 治愈系长女',
    familySummary: '双职工家庭长女，悉心照料两个幼弟',
    quote: '“今天也可以让我稍微对玲奈酱撒会儿娇吗？”'
  },
  'watanare-satsuki': {
    birthDate: '2006.05.15',
    zodiac: '金牛座',
    bloodType: 'A型',
    gender: '女',
    schoolOrAffiliation: '芦谷高校毕业 · 未读之城大学',
    gradeOrTitle: '大一在读 · 文学社才女',
    familySummary: '与单亲母亲相依为命，自律克制',
    quote: '“哼，甘织，你脑子里的杂音吵得我连书都翻不下去了。”'
  },
  '琴纱月': {
    birthDate: '2006.05.15',
    zodiac: '金牛座',
    bloodType: 'A型',
    gender: '女',
    schoolOrAffiliation: '芦谷高校毕业 · 未读之城大学',
    gradeOrTitle: '大一在读 · 文学社才女',
    familySummary: '与单亲母亲相依为命，自律克制',
    quote: '“哼，甘织，你脑子里的杂音吵得我连书都翻不下去了。”'
  },
  'watanare-kaho': {
    birthDate: '2006.11.11',
    zodiac: '天蝎座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '芦谷高校毕业 · 未读之城大学',
    gradeOrTitle: '大一在读 · 硬核Cosplayer',
    familySummary: '真唯热烈单推人，与玲奈子为损友阿宅',
    quote: '“玲奈蹦～今天的现充营业额度已经耗尽啦！”'
  },
  '小柳香穗': {
    birthDate: '2006.11.11',
    zodiac: '天蝎座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '芦谷高校毕业 · 未读之城大学',
    gradeOrTitle: '大一在读 · 硬核Cosplayer',
    familySummary: '真唯热烈单推人，与玲奈子为损友阿宅',
    quote: '“玲奈蹦～今天的现充营业额度已经耗尽啦！”'
  },
  // Bang Dream 同伴（18岁左右）
  'bang-tomori': {
    birthDate: '2007.01.29',
    zodiac: '水瓶座',
    bloodType: 'O型',
    gender: '女',
    schoolOrAffiliation: '羽丘女子学园 高等部',
    gradeOrTitle: 'MyGO!!!!! 主唱 · 歌词作者',
    familySummary: '收集石头与创可贴的温柔主唱',
    quote: '“就算迷茫……也要一直向前歌唱。”'
  },
  '高松灯': {
    birthDate: '2007.01.29',
    zodiac: '水瓶座',
    bloodType: 'O型',
    gender: '女',
    schoolOrAffiliation: '羽丘女子学园 高等部',
    gradeOrTitle: 'MyGO!!!!! 主唱 · 歌词作者',
    familySummary: '收集石头与创可贴的温柔主唱',
    quote: '“就算迷茫……也要一直向前歌唱。”'
  },
  'bang-anon': {
    birthDate: '2006.09.08',
    zodiac: '处女座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '羽丘女子学园 高等部',
    gradeOrTitle: 'MyGO!!!!! 吉他手 · 气氛核心',
    familySummary: '善于社交的归国女生，乐团行动派',
    quote: '“素世小姐～今天放学一起去喝奶茶吧！”'
  },
  '千早爱音': {
    birthDate: '2006.09.08',
    zodiac: '处女座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '羽丘女子学园 高等部',
    gradeOrTitle: 'MyGO!!!!! 吉他手 · 气氛核心',
    familySummary: '善于社交的归国女生，乐团行动派',
    quote: '“素世小姐～今天放学一起去喝奶茶吧！”'
  },
  'bang-taki': {
    birthDate: '2006.08.09',
    zodiac: '狮子座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '花咲川女子学园 高等部',
    gradeOrTitle: 'MyGO!!!!! 鼓手 · Livehouse打工',
    familySummary: '严谨负责的鼓手，虽然毒舌但内心极度重视同伴',
    quote: '“别发呆了，排练时间已经到了。”'
  },
  '椎名立希': {
    birthDate: '2006.08.09',
    zodiac: '狮子座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '花咲川女子学园 高等部',
    gradeOrTitle: 'MyGO!!!!! 鼓手 · Livehouse打工',
    familySummary: '严谨负责的鼓手，虽然毒舌但内心极度重视同伴',
    quote: '“别发呆了，排练时间已经到了。”'
  },
  'bang-rana': {
    birthDate: '2008.02.22',
    zodiac: '双鱼座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '花咲川女子学园',
    gradeOrTitle: 'MyGO!!!!! 吉他手 · 野猫天才乐手',
    familySummary: '随性自由的吉他天才，Space老店长的孙女',
    quote: '“……有抹茶芭菲吗？吃完再弹。”'
  },
  '要乐奈': {
    birthDate: '2008.02.22',
    zodiac: '双鱼座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '花咲川女子学园',
    gradeOrTitle: 'MyGO!!!!! 吉他手 · 野猫天才乐手',
    familySummary: '随性自由的吉他天才，Space老店长的孙女',
    quote: '“……有抹茶芭菲吗？吃完再弹。”'
  },
  'bang-uika': {
    birthDate: '2007.05.27',
    zodiac: '双子座',
    bloodType: 'A型',
    gender: '女',
    schoolOrAffiliation: '花咲川女子学园 高等部',
    gradeOrTitle: 'Ave Mujica 主唱兼吉他手 · sumimi成员',
    familySummary: '童年与祥子在海岛相识，以初华之名活动的偶像主唱',
    quote: '“只要抬头看星星，就会想起和小祥在岛上的夏天。”'
  },
  '三角初华': {
    birthDate: '2007.05.27',
    zodiac: '双子座',
    bloodType: 'A型',
    gender: '女',
    schoolOrAffiliation: '花咲川女子学园 高等部',
    gradeOrTitle: 'Ave Mujica 主唱兼吉他手 · sumimi成员',
    familySummary: '童年与祥子在海岛相识，以初华之名活动的偶像主唱',
    quote: '“只要抬头看星星，就会想起和小祥在岛上的夏天。”'
  },
  'bang-umiri': {
    birthDate: '2006.04.07',
    zodiac: '白羊座',
    bloodType: 'O型',
    gender: '女',
    schoolOrAffiliation: '花咲川女子学园 高等部',
    gradeOrTitle: 'Ave Mujica 贝斯手 · 职业支援乐手',
    familySummary: '精准冷峻的贝斯手，曾同时支援30支乐队',
    quote: '“日程表上还有四十五分钟，足够我们合奏两遍。”'
  },
  '八幡海铃': {
    birthDate: '2006.04.07',
    zodiac: '白羊座',
    bloodType: 'O型',
    gender: '女',
    schoolOrAffiliation: '花咲川女子学园 高等部',
    gradeOrTitle: 'Ave Mujica 贝斯手 · 职业支援乐手',
    familySummary: '精准冷峻的贝斯手，曾同时支援30支乐队',
    quote: '“日程表上还有四十五分钟，足够我们合奏两遍。”'
  },
  'bang-nyamu': {
    birthDate: '2006.06.01',
    zodiac: '双子座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '艺术学院 高中',
    gradeOrTitle: 'Ave Mujica 鼓手 · 美妆美搭视频博主',
    familySummary: '以喵梦之名活跃的网络博主与实力鼓手',
    quote: '“各位喵梦比～今天也在超努力练习架子鼓喵！”'
  },
  '祐天寺若麦': {
    birthDate: '2006.06.01',
    zodiac: '双子座',
    bloodType: 'B型',
    gender: '女',
    schoolOrAffiliation: '艺术学院 高中',
    gradeOrTitle: 'Ave Mujica 鼓手 · 美妆美搭视频博主',
    familySummary: '以喵梦之名活跃的网络博主与实力鼓手',
    quote: '“各位喵梦比～今天也在超努力练习架子鼓喵！”'
  },
  // 艾玛系列
  'majo-sherry': {
    birthDate: '2006.09.24',
    zodiac: '天秤座',
    bloodType: 'AB型',
    gender: '女',
    schoolOrAffiliation: '未读之城大学 法学部',
    gradeOrTitle: '大一在读 · 法律援助事务所见习',
    familySummary: '逻辑缜密的推理搭档，与艾玛形影不离',
    quote: '“证据链已经完整了，接下来就交给我们吧。”'
  },
  '橘雪莉': {
    birthDate: '2006.09.24',
    zodiac: '天秤座',
    bloodType: 'AB型',
    gender: '女',
    schoolOrAffiliation: '未读之城大学 法学部',
    gradeOrTitle: '大一在读 · 法律援助事务所见习',
    familySummary: '逻辑缜密的推理搭档，与艾玛形影不离',
    quote: '“证据链已经完整了，接下来就交给我们吧。”'
  },
  'majo-yuki': {
    birthDate: '2007.02.28',
    zodiac: '双鱼座',
    bloodType: 'A型',
    gender: '女',
    schoolOrAffiliation: '未读之城大学',
    gradeOrTitle: '大一在读 · 艾玛同居挚友',
    familySummary: '艾玛的中学同窗，共同生活于城市公寓',
    quote: '“只要有艾玛在身边，无论哪里都是安心的家。”'
  },
  '月代雪': {
    birthDate: '2007.02.28',
    zodiac: '双鱼座',
    bloodType: 'A型',
    gender: '女',
    schoolOrAffiliation: '未读之城大学',
    gradeOrTitle: '大一在读 · 艾玛同居挚友',
    familySummary: '艾玛的中学同窗，共同生活于城市公寓',
    quote: '“只要有艾玛在身边，无论哪里都是安心的家。”'
  },
  'majo-hiro': {
    birthDate: '2007.01.10',
    zodiac: '摩羯座',
    bloodType: 'A型',
    gender: '女',
    schoolOrAffiliation: '目白台传统研修院 · 大学一年级',
    gradeOrTitle: '大一在读 · 剑道与礼法研习生',
    familySummary: '注重礼法家风的严谨少女，艾玛的童年旧友',
    quote: '“这样不正确。既是原则问题，我便不会退让。”'
  },
  '二阶堂希罗': {
    birthDate: '2007.01.10',
    zodiac: '摩羯座',
    bloodType: 'A型',
    gender: '女',
    schoolOrAffiliation: '目白台传统研修院 · 大学一年级',
    gradeOrTitle: '大一在读 · 剑道与礼法研习生',
    familySummary: '注重礼法家风的严谨少女，艾玛的童年旧友',
    quote: '“这样不正确。既是原则问题，我便不会退让。”'
  }
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

export function buildContactIdentityCard(
  contact: Partial<CharacterContact> & { id: string; name: string }
): ResidentIdentityCard {
  const builtin = BUILTIN_CARDS[contact.id] ?? BUILTIN_CARDS[contact.name];
  if (builtin) {
    return { ...builtin };
  }

  const serial = formatDeterministicCardSerial(`${contact.id}:${contact.name}`);
  const cleanCode = contact.id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10) || 'RESIDENT';

  const preset =
    KNOWN_RESIDENT_PROFILES[contact.id] ??
    KNOWN_RESIDENT_PROFILES[contact.sourcePersonId ?? ''] ??
    KNOWN_RESIDENT_PROFILES[contact.name];

  let birthDate = '2007.05.15';
  let zodiac = '金牛座';
  let bloodType = 'O型';
  let gender = '登记居民';
  let schoolOrAffiliation = '未读之城大学城 联合学区';
  let gradeOrTitle = contact.tag || '学区常驻居民';
  let familySummary = '学区常规户籍备案居民';
  let quote = contact.summary || '已在人际档案中登记，可通过手机或当面交谈保持联系。';

  if (preset) {
    birthDate = preset.birthDate;
    zodiac = preset.zodiac;
    bloodType = preset.bloodType;
    gender = preset.gender;
    schoolOrAffiliation = preset.schoolOrAffiliation;
    gradeOrTitle = contact.tag || preset.gradeOrTitle;
    familySummary = preset.familySummary;
    quote = contact.summary || preset.quote || quote;
  } else {
    // 智能推导年龄层与生日
    const tagAndName = `${contact.name} ${contact.tag || ''} ${contact.summary || ''}`;
    let birthYear = 2007; // 默认大一同龄层（18岁）
    if (/母|父|妈妈|爸爸|长辈|阿姨|叔/.test(tagAndName)) {
      birthYear = 1981; // 成熟长辈（44岁）
      gradeOrTitle = contact.tag || '学区长辈居民';
      familySummary = '学区家庭长辈，照料家人生活';
    } else if (/店长|店员|经理|职员|顾问|教练|老板/.test(tagAndName)) {
      birthYear = 1997; // 青年职场人（28岁）
      gradeOrTitle = contact.tag || '商业街服务人员';
      familySummary = '都会工作者，活跃于街区与场馆日常';
    } else if (/妹|弟|学妹|学弟|后辈|国中|初中/.test(tagAndName)) {
      birthYear = 2009; // 晚辈/学弟妹（16岁，绝不长于大一主角）
      gradeOrTitle = contact.tag || '学区高中在读生';
      familySummary = '在读学子，与家人同住';
    }

    let hash = 2166136261;
    for (let i = 0; i < contact.name.length; i += 1) {
      hash ^= contact.name.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const abs = Math.abs(hash);
    const month = 1 + (abs % 12);
    const day = 1 + (Math.floor(abs / 12) % 28);
    birthDate = `${birthYear}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
    zodiac = resolveZodiac(month, day);
    const bloodTypes = ['A型', 'B型', 'O型', 'AB型'];
    bloodType = bloodTypes[abs % bloodTypes.length]!;
  }

  const birthParts = birthDate.split('.');
  const birthY2 = (birthParts[0] || '2007').slice(-2);
  const birthM2 = (birthParts[1] || '01').padStart(2, '0');
  const birthD2 = (birthParts[2] || '01').padStart(2, '0');
  const mrzDatePart = `${birthY2}${birthM2}${birthD2}`;

  return {
    id: contact.id,
    personId: contact.sourcePersonId ?? contact.id,
    name: contact.name,
    nativeName: contact.name,
    romanizedName: `RESIDENT · ${cleanCode}`,
    gender,
    birthDate,
    zodiac,
    bloodType,
    cardSerial: serial,
    municipality: '未读之城大学城 住民基本台帐',
    authorityLabel: '未读之城学区市民课 · 校内通行认证',
    categoryBadge: contact.isMain ? '主要人物档案' : '在册联系人',
    schoolOrAffiliation,
    gradeOrTitle,
    studentNo: `UNR-2025-${cleanCode.slice(0, 5)}`,
    residenceAddress: '未读之城 · 大学城常驻社区',
    anchorZoneId: 'library',
    anchorZoneLabel: '校园与街区',
    anchorSpotDetail: contact.status || '常规活动区域',
    issueDate: '2025.09.01',
    expiryDate: '2029.08.31',
    phoneDisplay: '校内通讯录已登记',
    appaPayHandle: `APPA-${cleanCode.slice(0, 6)}`,
    familySummary,
    signatureText: contact.name,
    quote,
    traits: [gradeOrTitle, contact.status || '日常活动', `好感度 ${contact.affinity ?? 50}`],
    bonds: [
      {
        personId: 'protagonist',
        name: '当前主角',
        roleLabel: contact.tag || '相识关系',
        affinity: contact.affinity ?? 50,
        statusTag: `好感 · ${contact.affinity ?? 50}`,
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
      contact.summary || `${contact.name}是当前登记在通讯录中的${gradeOrTitle}。`
    ],
    mrzLine1: `IDJPN${serial.replace(/-/g, '').slice(0, 9)}<<${cleanCode}<<<<<<<<<<<<<<<<<<<`.slice(0, 44),
    mrzLine2: `${mrzDatePart}2U2908315JPN<<<<<<<<<<<${cleanCode.slice(0, 10)}<<<<02`.slice(0, 44)
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
  const defaultCard = PROTAGONIST_CARDS[activeProtagonist] ?? SOYO_IDENTITY_CARD;
  if (!targetIdOrName) {
    return defaultCard;
  }
  const trimmed = targetIdOrName.trim();
  const normalized = trimmed.toLowerCase();

  const directBuiltin = BUILTIN_CARDS[trimmed] ?? BUILTIN_CARDS[normalized];
  if (directBuiltin) {
    return directBuiltin;
  }

  const catalog = getIdentityCardCatalog(state, activeProtagonist);
  const matched = catalog.find(
    (card) =>
      card.id.toLowerCase() === normalized ||
      card.personId.toLowerCase() === normalized ||
      card.name.toLowerCase() === normalized
  );
  if (matched) {
    return matched;
  }

  const profilePreset =
    KNOWN_RESIDENT_PROFILES[trimmed] ??
    KNOWN_RESIDENT_PROFILES[normalized];
  if (profilePreset) {
    return buildContactIdentityCard({
      id: trimmed,
      name: trimmed,
      affinity: 50,
      tag: profilePreset.gradeOrTitle,
      summary: profilePreset.familySummary,
      status: '学区常驻',
      portraitId: 'claude',
      sourcePersonId: trimmed,
      isMain: false
    });
  }

  return defaultCard;
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

  const defaultRoleByProtagonist: Record<ProtagonistId, string> = {
    soyo: '月之森同班同学 · CRYCHIC 旧友',
    sakiko: '幼时青梅竹马 · Ave Mujica 同伴',
    emma: '学区在册学生 · 暂无深入交往',
    renako: '学区常驻同学 · 暂无深入交往'
  };
  const roleLabel =
    existingContact?.tag ||
    presetBond?.roleLabel ||
    defaultRoleByProtagonist[activeProtagonist];

  const hasEstablishedBond = Boolean(presetBond || existingContact);
  const affinity = existingContact?.affinity ?? presetBond?.affinity ?? (hasEstablishedBond ? 50 : 0);

  let statusTag = presetBond?.statusTag ?? (existingContact ? `好感 · ${affinity}` : '未结识 · 0');
  if (existingContact) {
    if (affinity >= 80) statusTag = `挚重 · ${affinity}`;
    else if (affinity >= 60) statusTag = `亲近 · ${affinity}`;
    else if (affinity >= 40) statusTag = `熟识 · ${affinity}`;
    else statusTag = `疏离 · ${affinity}`;
  }

  const note =
    existingContact?.summary ||
    presetBond?.note ||
    `与${protagonistName}在未读之城生活圈暂无深入日常交集。`;

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
  group: 'family' | 'campus' | 'mujica' | 'crychic' | 'legal';
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
  { a: 'emma', b: 'majo-sherry', label: '事务所黄金搭档', affinity: 88, group: 'legal' },
  { a: 'emma', b: 'majo-yuki', label: '合租伙伴 · 牢屋敷旧友', affinity: 84, group: 'campus' },
  { a: 'renako', b: 'watanare-haruna', label: '甘织家亲姐妹', affinity: 90, group: 'family' },
  { a: 'renako', b: 'wata-mai', label: '芦谷闪耀羁绊', affinity: 86, group: 'campus' },
  { a: 'renako', b: 'wata-ajisai', label: '温柔治愈同伴', affinity: 84, group: 'campus' },
  { a: 'watanare-haruna', b: 'watanare-seira', label: '月之森高一同窗', affinity: 78, group: 'campus' }
];

const GROUP_LABELS: Record<'center' | 'family' | 'campus' | 'mujica' | 'crychic' | 'legal', string> = {
  center: '档案中心',
  family: '至亲家庭',
  campus: '学园同窗',
  mujica: 'Ave Mujica',
  crychic: 'CRYCHIC · MyGO',
  legal: '事务搭档'
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
    statusTag: '持证人',
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
