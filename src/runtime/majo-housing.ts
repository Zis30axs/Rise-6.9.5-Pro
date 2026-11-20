import { residentById } from './npc-cast';

/** Game-authored Tokyo homes reuse the six residential interior art styles. */
export type MajoHousingType =
  | 'riverfront-highrise'
  | 'traditional-courtyard'
  | 'old-family-house'
  | 'modern-open-plan'
  | 'shared-apartment'
  | 'studio-apartment';

export type MajoDistrictType =
  | 'business-district'
  | 'highland'
  | 'riverfront-highrise-district'
  | 'old-town-lowrise'
  | 'older-apartment-courtyard'
  | 'traditional-downtown'
  | 'lakeside-apartment'
  | 'student-shared';

export interface MajoHousing {
  readonly id: string;
  readonly type: MajoHousingType;
  readonly label: string;
  readonly description: string;
  readonly interiorId: string;
  /** Street door and a detail visible from the sitting area. */
  readonly visit?: { x: number; z: number; feature: string; detail?: string };
  readonly district: MajoDistrictType;
  readonly parentLocationId: string;
  /** Recovered runtime art exists for this district; false means authored fallback. */
  readonly districtArt: boolean;
}

export const majoHousings: readonly MajoHousing[] = Object.freeze([
  {
    id: 'emma-yuki-home', type: 'modern-open-plan', label: '艾玛与月代雪的家',
    description: '杂司谷住宅街中两人共同居住的现代公寓客餐厅；料理台、沙发与阅读角在同一空间。',
    interiorId: 'emma-yuki-home', district: 'riverfront-highrise-district', parentLocationId: 'home', districtArt: false,
  },
  {
    id: 'koko-old-house', type: 'old-family-house', label: '泽渡家老宅',
    description: '杂司谷旧街区的老式住宅客厅，保留着旧家具与直播设备旁的生活痕迹；是否与爷爷同住由实际剧情决定。',
    interiorId: 'koko-old-house', district: 'old-town-lowrise', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'nikaido-house', type: 'traditional-courtyard', label: '二阶堂家',
    description: '目白台的传统日式宅邸：榻榻米和室、可望见庭院的缘侧、入鞘武士刀刀架与练剑空间。',
    interiorId: 'nikaido-house', district: 'traditional-downtown', parentLocationId: 'downtown', districtArt: false,
  },
  {
    id: 'anan-noa-milia-home', type: 'shared-apartment', label: '安安、诺亚与米莉亚的住处',
    description: '高田／西早稻田一带三人合住的普通客餐厅，留有画笔、画纸与可以各自安静待着的角落。',
    interiorId: 'anan-noa-milia-home', district: 'older-apartment-courtyard', parentLocationId: 'junction', districtArt: true,
  },
  {
    id: 'nanoka-honoka-home', type: 'shared-apartment', label: '黑部姐妹的家',
    description: '杂司谷住宅区的黑部家公寓，奈叶香与已大学毕业的姐姐穗奈香共同生活；两人各有卧室，共用客厅、厨房与书架。',
    interiorId: 'nanoka-honoka-home', district: 'old-town-lowrise', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'sherry-hanna-home', type: 'riverfront-highrise', label: '雪莉与汉娜的住处',
    description: '神田川沿岸高层住宅的客餐厅，落地窗外是河岸步道。',
    interiorId: 'majo-highrise-home', district: 'riverfront-highrise-district', parentLocationId: 'commercial', districtArt: true,
  },
  {
    id: 'residential-prototype', type: 'studio-apartment', label: '单身公寓',
    description: '目白台一带床、厨房与一张小桌组成的单身公寓室内。',
    interiorId: 'majo-studio', district: 'lakeside-apartment', parentLocationId: 'city-park', districtArt: false,
  },
]);

export const watanareHousings: readonly MajoHousing[] = Object.freeze([
  {
    id: 'amaori-family-home', type: 'old-family-house', label: '甘织家住宅',
    description: '杂司谷住宅街充满生活气息的甘织家一户建；玲奈子、妹妹遥奈与母亲美代子、父亲同住于此，二楼有玲奈子与遥奈各自的房间，客厅摆着全家共用的沙发与电视游戏机。',
    interiorId: 'amaori-family-home', district: 'old-town-lowrise', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'soyo-house', type: 'riverfront-highrise', label: '长崎家高层公寓',
    description: '目白台与池袋交界高地的豪华高层塔楼公寓复式户；配有挑高落地窗、开放式料理岛台与厨房、原木餐桌和贝斯练习角，长崎素世与母亲长崎夫人居住于此。',
    interiorId: 'soyo-house', district: 'traditional-downtown', parentLocationId: 'downtown', districtArt: true,
  },
  {
    id: 'ouzuka-residence', type: 'traditional-courtyard', label: '王冢家宅邸',
    description: '目白台高地的王冢家豪宅，配有宽敞的西式会客室、私人庭院与试衣间；王冢真唯、母亲王冢露涅、专职管家花取单衣居住于此，露西来日期间亦下榻于宅邸客房。',
    interiorId: 'ouzuka-residence', district: 'traditional-downtown', parentLocationId: 'downtown', districtArt: false,
  },
  {
    id: 'sena-family-home', type: 'modern-open-plan', label: '濑名家住宅',
    description: '杂司谷安静街区的家庭公寓；濑名紫阳花与双职工父母及两个年幼弟弟（濑名广树、濑名桔平）同住，厨房与客厅总是飘着紫阳花手作料理的香气。',
    interiorId: 'sena-family-home', district: 'older-apartment-courtyard', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'koto-apartment', type: 'riverfront-highrise', label: '琴家公寓',
    description: '高田至池袋方向的普通单元公寓；琴纱月与单亲母亲（琴之母）同住，纱月的房间里整齐排列着满墙的文学文库本。',
    interiorId: 'koto-apartment', district: 'riverfront-highrise-district', parentLocationId: 'commercial', districtArt: true,
  },
  {
    id: 'koyanagi-home', type: 'shared-apartment', label: '小柳家住宅',
    description: '西早稻田／高田一带的住宅；小柳香穗的房间内设有专业的Cosplay缝纫工作台、假发架与环形补光灯。',
    interiorId: 'koyanagi-home', district: 'older-apartment-courtyard', parentLocationId: 'junction', districtArt: true,
  },
  {
    id: 'onigawara-laundry-home', type: 'old-family-house', label: '鬼瓦洗衣店住宅',
    description: '杂司谷商店街旁「鬼瓦洗衣店」一楼店面与二楼起居室合一的住宅，鬼瓦星来与家人同住于此。',
    visit: { x: -179, z: 151, feature: '楼梯口', detail: '楼梯通向店铺二楼。起居室的饭桌上铺着方格桌布，楼下传来衣架碰在一起的声音。' },
    interiorId: 'onigawara-laundry-home', district: 'old-town-lowrise', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'terazawa-flat', type: 'studio-apartment', label: '照泽家公寓',
    description: '护国寺／城市公园附近的安静公寓，照泽耀子整理校园情报与休息的住处。',
    visit: { x: 166, z: -155, feature: '窗边的书桌', detail: '窗下的书桌收得很干净，软木板上贴着彩色便签，旁边留出一块放茶杯的位置。' },
    interiorId: 'terazawa-flat', district: 'lakeside-apartment', parentLocationId: 'city-park', districtArt: false,
  },
  {
    id: 'hirosaki-staff-flat', type: 'studio-apartment', label: '广崎教员公寓',
    description: '靠近高田校区的教员单身公寓，1年A组班主任广崎美智留的住处。',
    visit: { x: 183, z: -157, feature: '备课桌', detail: '小餐桌的一头留给备课用的书架，另一头摆着一人份的餐具。' },
    interiorId: 'hirosaki-staff-flat', district: 'lakeside-apartment', parentLocationId: 'city-park', districtArt: false,
  },
  {
    id: 'takada-residence', type: 'riverfront-highrise', label: '高田家宅邸',
    description: '目白台的高级住宅，1年B组「5déesse」领袖高田卑弥呼的住处。',
    visit: { x: -54, z: 207, feature: '会客区', detail: '深色沙发与扶手椅围着一张矮桌，落地窗把庭树的影子投到厚地毯上。' },
    interiorId: 'takada-residence', district: 'traditional-downtown', parentLocationId: 'downtown', districtArt: false,
  },
  {
    id: 'haga-residence', type: 'modern-open-plan', label: '羽贺家住宅',
    description: '杂司谷一带的安静住宅，羽贺铃兰的住处。',
    visit: { x: -207, z: 165, feature: '飘窗', detail: '飘窗上铺着素色坐垫，窄边桌上放着一只细口花瓶。' },
    interiorId: 'haga-residence', district: 'old-town-lowrise', parentLocationId: 'home', districtArt: true,
  },
  {
    id: 'kamezaki-residence', type: 'riverfront-highrise', label: '龟崎家公寓',
    description: '神田川沿岸的现代公寓，龟崎千鹤的住处。',
    visit: { x: 201, z: 157, feature: '河景窗', detail: '客厅朝河的一面没有大件家具，从窗边能看见步道的路灯逐盏亮起的位置。' },
    interiorId: 'kamezaki-residence', district: 'riverfront-highrise-district', parentLocationId: 'commercial', districtArt: true,
  },
  {
    id: 'nemoto-residence', type: 'shared-apartment', label: '根本家公寓',
    description: '高田街区附近的公寓，根本美纪的住处。',
    visit: { x: 7, z: 46, feature: '衣饰架', detail: '客厅镜子旁边摆着一排衣钩，帆布袋、帽子和几条彩色围巾分开挂着。' },
    interiorId: 'nemoto-residence', district: 'older-apartment-courtyard', parentLocationId: 'junction', districtArt: true,
  },
]);

const additionalHousings: readonly MajoHousing[] = [
  {
    id: 'residential-tomori', interiorId: 'residential-tomori', label: '高松家', type: 'old-family-house',
    parentLocationId: 'home', district: 'old-town-lowrise', districtArt: true,
    description: '鞋柜上放着一只浅浅的木盘。里面的石头按大小排成半圈，靠门那一端还留着空位。',
    visit: { x: -212, z: 152, feature: '玄关的石头' },
  },
  {
    id: 'residential-anon', interiorId: 'residential-anon', label: '千早家', type: 'modern-open-plan',
    parentLocationId: 'home', district: 'old-town-lowrise', districtArt: true,
    description: '玄关的全身镜照得到客厅一角。吉他包靠着镜框，换下来的两条背带搭在椅背上。',
    visit: { x: -196, z: 154, feature: '全身镜' },
  },
  {
    id: 'residential-taki', interiorId: 'residential-taki', label: '椎名家', type: 'modern-open-plan',
    parentLocationId: 'city-park', district: 'lakeside-apartment', districtArt: false,
    description: '河边公寓的窗子装着厚窗帘。矮桌旁放着一块架在橡胶垫上的练习鼓垫，鼓棒收在布袋里。',
    visit: { x: 151, z: -154, feature: '练习垫' },
  },
  {
    id: 'residential-rana', interiorId: 'residential-rana', label: '要家', type: 'old-family-house',
    parentLocationId: 'home', district: 'old-town-lowrise', districtArt: true,
    description: '木地板在檐廊边低下一级，能坐着系鞋。墙边给吉他留了一小块背阴的地方。',
    visit: { x: -224, z: 161, feature: '檐廊' },
  },
  {
    id: 'residential-uika', interiorId: 'residential-uika', label: '初华的公寓', type: 'studio-apartment',
    parentLocationId: 'commercial', district: 'riverfront-highrise-district', districtArt: true,
    description: '靠窗的折叠谱架旁放着一把木吉他。帘子拉开一半，坐在矮凳上就能望见楼顶上方的一方天空。',
    visit: { x: 191, z: 141, feature: '窗边的谱架' },
  },
  {
    id: 'residential-umiri', interiorId: 'residential-umiri', label: '海铃的公寓', type: 'studio-apartment',
    parentLocationId: 'junction', district: 'older-apartment-courtyard', districtArt: true,
    description: '玄关到房间留出了一条能背着琴包通过的窄道。墙边的贝斯架旁码着备用弦和收好的导线。',
    visit: { x: -7, z: 49, feature: '乐器架' },
  },
  {
    id: 'residential-nyamu', interiorId: 'residential-nyamu', label: '若麦的公寓', type: 'modern-open-plan',
    parentLocationId: 'commercial', district: 'riverfront-highrise-district', districtArt: true,
    description: '梳妆台旁支着可折叠的补光灯。转开镜子就是饭桌，回家吃饭时可以把脚架收到柜子旁。',
    visit: { x: 229, z: 165, feature: '梳妆台' },
  },
  {
    id: 'residential-marina', interiorId: 'residential-marina', label: '麻里奈的公寓', type: 'studio-apartment',
    parentLocationId: 'grand-commercial', district: 'business-district', districtArt: false,
    description: '小厨房门边的杯架上倒扣着两只厚瓷杯。餐桌正好容得下笔记本和一份迟来的晚饭。',
    visit: { x: -213, z: -153, feature: '杯架' },
  },
  {
    id: 'residential-leia', interiorId: 'residential-leia', label: '莲见家', type: 'traditional-courtyard',
    parentLocationId: 'downtown', district: 'traditional-downtown', districtArt: false,
    description: '起居室的纸门对着一方小院。石灯底座留着一圈雨痕，屋檐挡住了缘侧上的藤椅。',
    visit: { x: 32, z: 204, feature: '庭院的石灯' },
  },
  {
    id: 'residential-margo', interiorId: 'residential-margo', label: '玛格的住处', type: 'studio-apartment',
    parentLocationId: 'junction', district: 'older-apartment-courtyard', districtArt: true,
    description: '一人用的小厨房里，一把用旧的细口壶挂在架上。家里只有一张餐桌，窗旁还晾着洗好的围裙。',
    visit: { x: 6, z: 53, feature: '手冲壶' },
  },
  {
    id: 'residential-arisa', interiorId: 'residential-arisa', label: '紫藤家', type: 'modern-open-plan',
    parentLocationId: 'city-park', district: 'lakeside-apartment', districtArt: false,
    description: '靠河的起居室铺着浅色地板，玄关的换鞋凳底下并排放着运动鞋。窗外能听到自行车铃。',
    visit: { x: 201, z: -148, feature: '玄关的长凳' },
  },
  {
    id: 'residential-meruru', interiorId: 'residential-meruru', label: '梅露露的住处', type: 'studio-apartment',
    parentLocationId: 'home', district: 'old-town-lowrise', districtArt: true,
    description: '小圆桌上插着几枝干花，桌下收着一只提篮。窗帘束起的时候，午后的光能一直落到玄关。',
    visit: { x: -170, z: 159, feature: '窗边的花瓶' },
  },
  {
    id: 'mizuho-apartment', interiorId: 'mizuho-apartment', label: '瑞穗的公寓', type: 'modern-open-plan',
    parentLocationId: 'downtown', district: 'traditional-downtown', districtArt: false,
    description: '起居室临着目白台一条小路。茶桌对面留着一把椅子，窗下的矮柜刚好放下一套白瓷茶具。',
    visit: { x: -42, z: 200, feature: '茶桌' },
  },
  {
    id: 'clinic-room', interiorId: 'clinic-room', label: '街区全科诊所·风堇的住处', type: 'studio-apartment',
    parentLocationId: 'commercial', district: 'riverfront-highrise-district', districtArt: true,
    description: '从门诊侧廊进去，推门就是风堇起居的后间。茶桌边有她自己的床铺，窗台的花草能晒到上午的太阳。',
    visit: { x: 172, z: 134, feature: '后窗的茶席' },
  },
  {
    id: 'toyokawa-executive-tower', interiorId: 'toyokawa-executive-tower', label: '丰川集团总裁楼', type: 'riverfront-highrise',
    parentLocationId: 'grand-commercial', district: 'business-district', districtArt: false,
    description: '电梯从石材门厅直达顶层。会客区与董事长办公室隔着木格屏风，里侧的门通往定治的私人起居套间。',
    visit: { x: -177, z: -198, feature: '高层会客区' },
  },
];

export const allHousings: readonly MajoHousing[] = Object.freeze([...majoHousings, ...watanareHousings, ...additionalHousings, {
  id: 'residential-mutsumi', type: 'traditional-courtyard' as const, label: '高原住宅区·若叶家',
  description: '坡上庭院住宅，南向阳台连着起居室，睦在窗边用花箱和竹架种黄瓜。',
  interiorId: 'residential-mutsumi', district: 'highland' as const, parentLocationId: 'highland', districtArt: true,
}]);

const housingByPerson: Readonly<Record<string, string>> = Object.freeze({
  'bang-mutsumi': 'residential-mutsumi',
  'majo-emma': 'emma-yuki-home',
  'majo-yuki': 'emma-yuki-home',
  'majo-nanoka': 'nanoka-honoka-home',
  'majo-honoka': 'nanoka-honoka-home',
  'majo-koko': 'koko-old-house',
  'majo-hiro': 'nikaido-house',
  'majo-anan': 'anan-noa-milia-home',
  'majo-noa': 'anan-noa-milia-home',
  'majo-milia': 'anan-noa-milia-home',
  'majo-sherry': 'sherry-hanna-home',
  'majo-hanna': 'sherry-hanna-home',
  'watanare-renako': 'amaori-family-home',
  'watanare-haruna': 'amaori-family-home',
  'watanare-miyoko': 'amaori-family-home',
  'watanare-mai': 'ouzuka-residence',
  'watanare-rene': 'ouzuka-residence',
  'watanare-hitoe': 'ouzuka-residence',
  'watanare-lucie': 'ouzuka-residence',
  'watanare-ajisai': 'sena-family-home',
  'watanare-hiroki': 'sena-family-home',
  'watanare-kippei': 'sena-family-home',
  'watanare-satsuki': 'koto-apartment',
  'watanare-koto-mother': 'koto-apartment',
  'watanare-kaho': 'koyanagi-home',
  'watanare-seira': 'onigawara-laundry-home',
  'watanare-youko': 'terazawa-flat',
  'watanare-michiru': 'hirosaki-staff-flat',
  'watanare-himiko': 'takada-residence',
  'watanare-suzuran': 'haga-residence',
  'watanare-chizuru': 'kamezaki-residence',
  'watanare-miki': 'nemoto-residence',
  'nagasaki-mother': 'soyo-house',
});

/** Stable outfit descriptors used by schedules and prompts; not a claim of complete art. */
const residentOutfits: Readonly<Record<string, string>> = Object.freeze({
  'majo-hiro': '和服',
});

export function housingForPerson(personId: string): MajoHousing | null {
  const housingId = housingByPerson[personId] ?? residentById(personId)?.home;
  return housingId ? allHousings.find(housing => housing.id === housingId) ?? null : null;
}

export function housingForHomeMarker(home: string): MajoHousing | null {
  return allHousings.find(housing => housing.id === home) ?? null;
}

export function housingForInterior(interiorId: string): MajoHousing | null {
  return allHousings.find(housing => housing.interiorId === interiorId) ?? null;
}

export function residentOutfit(personId: string): string | null {
  return residentOutfits[personId] ?? null;
}

/** Game-prototype district assignment for existing map locations. */
export const residentDistrictByLocation: Readonly<Record<string, MajoDistrictType>> = Object.freeze({
  highland: 'highland',
  home: 'old-town-lowrise',
  commercial: 'riverfront-highrise-district',
  downtown: 'traditional-downtown',
  neighborhood: 'older-apartment-courtyard',
  'city-park': 'lakeside-apartment',
  residences: 'student-shared',
});

export function districtForLocation(locationId: string): MajoDistrictType | null {
  return residentDistrictByLocation[locationId] ?? null;
}

/** A resident's current authored home marker, with a safe fallback for older data. */
export function residentHomeMarker(personId: string): string | null {
  return residentById(personId)?.home ?? null;
}
