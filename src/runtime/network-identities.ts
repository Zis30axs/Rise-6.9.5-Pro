import majo from '../worldbook/majo-residents.json';
import watanare from '../worldbook/watanare-residents.json';
import bang from '../worldbook/bang-dream-canon.json';
import circle from '../worldbook/circle-livehouse.json';
import clinic from '../worldbook/fengjin-clinic.json';
import type { ProtagonistId } from './dual-protagonists';

export interface NetworkAccount {
  id: string;
  personId: string | null;
  kind: 'person' | 'institution' | 'chatter' | 'band' | 'guest';
  nickname: string;
  username: string;
  email: string;
  bio: string;
  avatarId: string;
  dormant: boolean;
}
export interface InternetState { follows: [string, string][]; guests: {nickname: string}[] }

// These are authored game identities, not claims about real accounts or addresses.
const authored: Record<string, [string, string, string]> = {
  soyo: ['aroma', 'soyo', '茶与香气，偶尔记下一点日常。'],
  sakiko: ['夜曲', 'sakiko', '把没有说完的话留给音乐。'],
  'bang-tomori': ['流星收集箱', 'tomori', '收集石头，也收集一闪而过的句子。'],
  'bang-anon': ['AnON', 'anon', '今天也想试一点新东西。'],
  'bang-taki': ['一拍之后', 'taki', '鼓、练习，还有忙完后的片刻。'],
  'bang-rana': ['抹茶时间', 'rana', '抹茶。吉他。'],
  'bang-mutsumi': ['CucumberT_T', 'mutsumi', '今天也给植物浇了水。'],
  'bang-uika': ['海边的光', 'uika', '音乐与远处的海。'],
  'bang-umiri': ['低音航线', 'umiri', '让低音稳稳落地。'],
  'bang-nyamu': ['喵梦', 'nyamu', '分享妆容、镜头和日常。'],
  'majo-emma': ['樱色便签', 'emma', '慢慢把想说的话写下来。'],
  'majo-hiro': ['静夜书页', 'hiro', '读书，记事。'],
  'majo-sherry': ['柑橘笔记', 'sherry', '一本还在续写的读书笔记。'],
  'majo-koko': ['可可放送', 'koko', '今天也一起聊聊天。'],
  'watanare-renako': ['软糖暂停中', 'renako', '休息一下，再试着向前一步。'],
  'watanare-mai': ['白昼镜面', 'mai', '记录光与风景。'],
  'watanare-ajisai': ['绣球小径', 'ajisai', '把平凡的好天气留在这里。'],
  'watanare-satsuki': ['月下书签', 'satsuki', '随手读，随手记。'],
  'watanare-kaho': ['小小快门', 'kaho', '发现日常里的有趣瞬间。'],
  fengjin: ['风中的花信', 'fengjin', '愿每个人都能照顾好自己。'],
};
type Entry = { name: string; keys?: string[]; extensions?: { personId?: string } };
const entries: Entry[] = [
  {name: '长崎素世', keys: ['素世'], extensions: {personId: 'soyo'}},
  {name: '丰川祥子', keys: ['祥子'], extensions: {personId: 'sakiko'}},
  ...majo.entries, ...watanare.entries, ...bang.entries, ...circle.entries, ...clinic.entries,
];
const people = [...new Map(entries.filter(e => e.extensions?.personId).map(e => [e.extensions!.personId!, e])).entries()];
const neutralNames = ['微风信笺', '路灯下', '晴窗一角', '晚风来信', '雨后散步', '薄荷书签', '街角手记', '留白日记'];
function code(id: string) {
  let n = 2166136261;
  for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
  return n;
}
function account(id: string, kind: NetworkAccount['kind'], nickname: string, username: string, bio: string, personId: string | null = null): NetworkAccount {
  return { id, kind, personId, nickname, username, bio, email: `${username}@post.sov`, avatarId: personId ?? id, dormant: id === 'band:crychic' };
}
export const networkAccounts: readonly NetworkAccount[] = Object.freeze([
  ...people.map(([id]) => {
    const [nickname, username, bio] = authored[id] ?? [neutralNames[code(id) % neutralNames.length]! + '_' + code(id).toString(16).slice(-4), id.replaceAll('-', '_'), '偶尔在这里留下几句话。'];
    return Object.freeze(account(`person:${id}`, 'person', nickname, username, bio, id));
  }),
  account('institution:reuters', 'institution', 'Reuters 日本动态', 'reuters_jp', '未读之城内的日本动态。'),
  account('institution:nhk', 'institution', 'NHK', 'nhk', '未读之城内的公共新闻与生活资讯。'),
  account('institution:weather', 'institution', '气象厅', 'weather_jp', '天气消息与出行提醒。'),
  account('institution:tokyo', 'institution', '东京公共通知', 'tokyo_notice', '城市公告与公共生活资讯。'),
  account('institution:transit', 'institution', '东京交通', 'tokyo_transit', '公开交通消息与出行资讯。'),
  account('chatter:midnight', 'chatter', '凌晨还没睡', 'midnight_notes', '深夜碎碎念，天亮就去睡。'),
  account('chatter:campus', 'chatter', '窗边观察员', 'campus_window', '校园公共生活的零碎见闻。'),
  account('chatter:livehouse', 'chatter', '最后一排', 'livehouse_backrow', '记录公开演出和散场后的街灯。'),
  account('chatter:plants', 'chatter', '阳台有点绿', 'balcony_green', '植物、浇水和慢慢生长的日子。'),
  account('band:mygo', 'band', 'MyGO!!!!!', 'mygo', 'MyGO!!!!! 官方账号。'),
  account('band:avemujica', 'band', 'Ave Mujica', 'avemujica', 'Ave Mujica 官方账号。'),
  account('band:crychic', 'band', 'CRYCHIC', 'crychic', '留在那段时光里的声音。'),
].map(a => Object.freeze(a)));
const byId = new Map(networkAccounts.map(a => [a.id, a]));
const aliases = new Map<string, string>();
for (const a of networkAccounts) {
  aliases.set(a.id, a.id); aliases.set('@' + a.username, a.id);
  aliases.set(a.nickname, a.id);
  if (a.personId) aliases.set(a.personId, a.id);
}
for (const [id, e] of people) {
  aliases.set(e.name, `person:${id}`);
  // Reuse the authored person aliases for old forum/contact names. Clinic topic
  // triggers are not names and must remain available to unrelated guest accounts.
  for (const key of e.keys ?? []) {
    if (id === 'fengjin' && key === '谈心') continue;
    if (!aliases.has(key)) aliases.set(key, `person:${id}`);
  }
}
for (const name of ['CRYCHIC', 'crychic']) aliases.set(name, 'band:crychic');
export const accountById = (id: string) => byId.get(id) ?? null;
export const resolveNetworkAccount = (id: string) => typeof id === 'string' ? byId.get(aliases.get(id.trim()) ?? aliases.get(id.trim().toLowerCase()) ?? '') ?? null : null;
export const networkOwnerId = (owner: ProtagonistId) => `person:${owner === 'emma' ? 'majo-emma' : owner === 'renako' ? 'watanare-renako' : owner}`;
export const networkLegacyAliases = () => Object.fromEntries(aliases);
export function guestAccount(value: string): NetworkAccount {
  if (typeof value !== 'string' || !value.trim() || value.length > 30 || /[\u0000-\u001f<>|｜]/.test(value)) throw Error('网友昵称无效');
  const nickname = value.trim().normalize('NFC');
  const suffix = code(nickname).toString(16).padStart(8, '0') + code('network:' + nickname).toString(16).padStart(8, '0');
  return account('guest:' + suffix, 'guest', nickname, 'guest_' + suffix, '偶尔在这里留下几句话。');
}
export function allNetworkAccounts(state?: InternetState): NetworkAccount[] {
  return [...networkAccounts, ...(state?.guests ?? []).map(g => guestAccount(g.nickname))];
}
export function parseInternetState(raw: unknown): InternetState {
  if (raw === undefined) return {follows: [], guests: []};
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as InternetState).follows) || (raw as InternetState).follows.length > 10000)
    throw Error('网络关注记录无效');
  const candidates = (raw as InternetState).guests ?? [];
  if (!Array.isArray(candidates) || candidates.length > 1000) throw Error('网友账号记录无效');
  const guests = candidates.map(g => ({nickname: guestAccount(g?.nickname).nickname}));
  const accounts = new Map(allNetworkAccounts({follows: [], guests}).map(a => [a.id, a]));
  if (accounts.size !== networkAccounts.length + guests.length) throw Error('网友账号重复');
  const seen = new Set<string>();
  const follows: [string, string][] = [];
  for (const pair of (raw as InternetState).follows) {
    if (!Array.isArray(pair) || pair.length !== 2 || !accounts.has(pair[0]) || !accounts.has(pair[1]) || pair[0] === pair[1] || accounts.get(pair[0])!.dormant)
      throw Error('网络关注对象无效');
    if (!seen.has(pair.join('|'))) { follows.push([pair[0], pair[1]]); seen.add(pair.join('|')); }
  }
  return {follows, guests};
}
export function changeNetworkFollow(raw: InternetState | undefined, from: string, to: string, following: boolean): InternetState {
  const next = parseInternetState(raw);
  const accounts = new Map(allNetworkAccounts(next).map(a => [a.id, a]));
  if (!accounts.has(from) || !accounts.has(to) || from === to || accounts.get(from)!.dormant) throw Error('无法关注这个账号');
  next.follows = next.follows.filter(([a, b]) => a !== from || b !== to);
  if (following) next.follows.push([from, to]);
  return parseInternetState(next);
}
export function registerNetworkGuests(raw: InternetState | undefined, names: string[]): InternetState {
  const next = parseInternetState(raw);
  for (const nickname of names) {
    const candidate = guestAccount(nickname);
    if (resolveNetworkAccount(candidate.nickname)) continue;
    const existing = next.guests.find(g => guestAccount(g.nickname).id === candidate.id);
    if (existing && existing.nickname !== candidate.nickname) throw Error('网友账号标识冲突');
    if (!existing) next.guests.push({nickname: candidate.nickname});
  }
  return parseInternetState(next);
}
