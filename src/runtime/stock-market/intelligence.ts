import { INSTRUMENTS, chartBars, marketSession, quote, type ChartBar, type Quote } from './market.mjs';
import { formatGameDate, gameCalendar, GAME_DAY_LIMIT } from '../game-calendar';
import { PROTAGONISTS, type ProtagonistId } from '../dual-protagonists';
import type { TradingState } from './market.mjs';

export interface StockFundamental {
  readonly code: string;
  readonly tone: 'violet' | 'blue' | 'mint' | 'rose' | 'gold';
  readonly peRatio: number | null;
  readonly pbRatio: number | null;
  readonly marketCapOku: string;
  readonly dividendPerShare: number;
  readonly exDividendEveryDays: number;
  readonly profile: string;
  readonly bullCatalysts: readonly string[];
  readonly bearCatalysts: readonly string[];
  readonly flatCatalysts: readonly string[];
}

export interface StockIndexSnapshot {
  readonly code: string;
  readonly name: string;
  readonly value: number;
  readonly previous: number;
  readonly pct: number;
  readonly series: readonly number[];
}

export interface TickerAnalysis {
  readonly code: string;
  readonly name: string;
  readonly sector: string;
  readonly quote: Quote;
  readonly fundamental: StockFundamental;
  readonly ma5: number;
  readonly ma20: number;
  readonly support: number;
  readonly resistance: number;
  readonly annualYieldPct: number;
  readonly isExDividendToday: boolean;
  readonly nextExDividendDay: number;
  readonly exDividendInDays: number;
  readonly nextExDividendDate: string;
  readonly catalystTag: '偏多催化' | '承压因素' | '箱体整理';
  readonly catalystHeadline: string;
  readonly catalystDetail: string;
}

export interface MarketBulletin {
  readonly id: string;
  readonly tag: string;
  readonly title: string;
  readonly detail: string;
  readonly tone: 'gain' | 'loss' | 'neutral';
}

export interface StockSlipArtifact {
  readonly itemType: 'receipt';
  readonly presetId: string;
  readonly label: string;
  readonly badge: string;
  readonly sourceRef: {
    readonly kind: 'ledger';
    readonly id: string;
    readonly day: number;
  };
  readonly caption: string;
  readonly dataPayload: {
    readonly shop: string;
    readonly itemLabel: string;
    readonly amountYen: number;
    readonly timeText: string;
    readonly meta: string;
    readonly accent: string;
  };
}

export const STOCK_FUNDAMENTALS: Readonly<Record<string, StockFundamental>> = Object.freeze({
  '6418': {
    code: '6418',
    tone: 'blue',
    peRatio: 19.4,
    pbRatio: 1.82,
    marketCapOku: '4,260 亿',
    dividendPerShare: 18,
    exDividendEveryDays: 21,
    profile: '主营精密伺服电机与演出舞台功放电源模块，出口订单占比约四成。',
    bullCatalysts: [
      '工业自动化精密驱动订单季度环增，午盘大单稳步吸纳',
      '首都圈场馆音响改造招标落地，电子部品板块景气回升',
      '外汇避险比率上调至七成，毛利率指引维持上沿',
    ],
    bearCatalysts: [
      '铜箔与稀土磁材现货报价走高，市场担忧短线成本承压',
      '日元汇价盘中急升压制出口板块估值，精密机电获利回吐',
      '北美分销商库存去化略慢于预期，短线买盘观望',
    ],
    flatCatalysts: [
      '财报窗口前交投平稳，股价围绕五日均线窄幅换手',
      '主营业务出货节奏合乎季初指引，机构维持中性评级',
    ],
  },
  '9136': {
    code: '9136',
    tone: 'mint',
    peRatio: 13.8,
    pbRatio: 1.24,
    marketCapOku: '2,980 亿',
    dividendPerShare: 14,
    exDividendEveryDays: 28,
    profile: '运营东京湾岸冷链仓储、集装箱短驳及首都高速夜间干线配送。',
    bullCatalysts: [
      '东京湾港口准班率与冷链周转率创季度新高，运价弹性显现',
      '电商大促临近推高首都圈城配仓容利用率，物流股走强',
      '航运燃油附加费传导顺畅，机构上修单季营运现金流预测',
    ],
    bearCatalysts: [
      '湾岸高速晚高峰拥堵拉高燃油单耗，干线利润率略受挤压',
      '港湾装卸加班成本上升，短线资金转往防御板块',
      '远洋集运运价指数回调，牵动运输板块同步整理',
    ],
    flatCatalysts: [
      '首都圈日常货运量稳健，盘面多空分歧有限',
      '冷链二期仓投产按既定节奏推进，股价温和横盘',
    ],
  },
  '2874': {
    code: '2874',
    tone: 'gold',
    peRatio: 16.5,
    pbRatio: 1.56,
    marketCapOku: '1,940 亿',
    dividendPerShare: 11,
    exDividendEveryDays: 14,
    profile: '覆盖东京都便利店鲜食、烘焙联名与常温抹茶饮品的综合食品厂。',
    bullCatalysts: [
      '秋季新品鲜食上架首周动销走高，防御消费资金稳步流入',
      '便利店现磨冷萃联名销量超预期，食品板块防御属性凸显',
      '糖乳原料锁价锁定季度毛利，稳健分红预期吸引买盘',
    ],
    bearCatalysts: [
      '进口小麦与可可豆期货反弹，市场观望终端提价接受度',
      '市场风险偏好转向科技成长股，必需消费板块资金微幅流出',
      '雨天堂食与户外售卖机销量短线走平，筹码温和换手',
    ],
    flatCatalysts: [
      '常年稳定两周除息节奏，股价波动率居八大标的最低区间',
      '商超补货节奏平稳，适合观察均线与现金分红回报',
    ],
  },
  '4827': {
    code: '4827',
    tone: 'rose',
    peRatio: 24.6,
    pbRatio: 2.35,
    marketCapOku: '3,150 亿',
    dividendPerShare: 22,
    exDividendEveryDays: 30,
    profile: '涉及都市数字出版、地下偶像现场影像版权及流媒体点播矩阵。',
    bullCatalysts: [
      '流媒体付费会员月度净增创高，版权二次分发收入超预期',
      '秋冬季剧场联播与现场直播票务分成指引上调',
      '广告主预算向竖屏短视频频道回流，传媒弹性居前',
    ],
    bearCatalysts: [
      '内容制作摊销成本集中确认，季度净利同比增速承压',
      '前期获利盘在高位兑现，高贝塔传媒股回调明显',
      '户外大屏广告续约价格竞争加剧，引发短线抛压',
    ],
    flatCatalysts: [
      '版权储备维持稳定现金牛结构，多空在月线附近拉锯',
      '剧集排期平稳落地，静待下一档付费点播数据',
    ],
  },
  '7642': {
    code: '7642',
    tone: 'violet',
    peRatio: 11.9,
    pbRatio: 1.08,
    marketCapOku: '6,410 亿',
    dividendPerShare: 20,
    exDividendEveryDays: 21,
    profile: '深耕能源金属贸易、海外电网设备总包与都市商业地产持股。',
    bullCatalysts: [
      '长协能源资产现金流充沛，宣布追加年度股东回馈预算',
      '东南亚变电总包项目进入并表高峰，低估值商社获重新定价',
      '大宗现货基差走阔扩大贸易利差，买盘推高全日高点',
    ],
    bearCatalysts: [
      '隔夜伦敦基本金属回落，资源贸易商社随周期板块承压',
      '长端国债收益率波动抑制高杠杆基建预期，买盘转趋谨慎',
      '汇兑重估收益低于上季均值，股价回测前低支撑',
    ],
    flatCatalysts: [
      '市净率接近一点零八倍，高股息配置盘托底下方买盘',
      '综合商社多业务对冲景气周期，日内波动相对克制',
    ],
  },
  '3516': {
    code: '3516',
    tone: 'mint',
    peRatio: 21.2,
    pbRatio: 2.04,
    marketCapOku: '5,320 亿',
    dividendPerShare: 28,
    exDividendEveryDays: 28,
    profile: '研发自律神经缓解制剂、过敏性鼻炎新剂型与院线慢病常备药。',
    bullCatalysts: [
      '新适应症三期临床随访数据稳健，医药权重获配置资金追捧',
      '换季花粉与感冒药房备货启动，院外OTC渠道出货加速',
      '仿制药集中议价影响好于市场悲观预期，股价止跌回稳',
    ],
    bearCatalysts: [
      '医保药价年度例行重估方案临近，医药板块短暂承压',
      '海外研发里程碑节点微调延后，部分成长型资金减仓',
      '防御资金轮动至顺周期标的，药企估值小幅回吐',
    ],
    flatCatalysts: [
      '现金储备充裕支撑每二十八日稳定派息，长线交投平稳',
      '常规处方药销售符合季节曲线，盘面以震荡消化为主',
    ],
  },
  '6953': {
    code: '6953',
    tone: 'blue',
    peRatio: 29.8,
    pbRatio: 3.41,
    marketCapOku: '8,890 亿',
    dividendPerShare: 32,
    exDividendEveryDays: 30,
    profile: '生产车规功率器件、光刻涂胶显影材料与高速存储测试晶圆。',
    bullCatalysts: [
      '先进封装光刻配套材料通过头部客户验证，科技龙头领涨',
      '算力服务器电源管理芯片排期满产至下季，量价齐升',
      '半导体设备出货同比转正，成长资金集中回流权重核心',
    ],
    bearCatalysts: [
      '隔夜芯片设备股冲高回落，高估值半导体板块顺势回调',
      '部分成熟制程代工报价出现让利迹象，短线波动放大',
      '获利盘集中了结前期涨幅，五分线触发均值回归',
    ],
    flatCatalysts: [
      '高弹性权重大盘股日内振幅居前，紧盯五日均线得失',
      '功率芯片订单稳步交付，筹码在高换手中寻找新方向',
    ],
  },
  T100: {
    code: 'T100',
    tone: 'violet',
    peRatio: null,
    pbRatio: 1.48,
    marketCapOku: 'ETF',
    dividendPerShare: 26,
    exDividendEveryDays: 14,
    profile: '按自由流通市值加权追踪东都交易所核心百支成分，每两周结算成分派息。',
    bullCatalysts: [
      '权重蓝筹与半导体合力上行，宽基申购净流入明显扩大',
      '外汇企稳带动海外被动基金回补东京大型权重一揽子',
      '金融与商社权重托底大盘，东都精选ETF稳步创阶段高点',
    ],
    bearCatalysts: [
      '权重成长与周期股同步休整，宽基ETF随东都大盘小幅回落',
      '季末再平衡临近引发部分被动赎回，尾盘承压微跌',
      '宏观通胀数据公布前观望情绪升温，指数温和收阴',
    ],
    flatCatalysts: [
      '百支成分自然分散单股风险，每十四日稳健派发一揽子红利',
      '全天贴合东都综合指数运行，流动性居全市场首位',
    ],
  },
});

const INDEX_GROUPS = [
  { name: '东都综合指数', code: 'TMI', base: 3184, members: ['T100', '6418', '7642', '3516', '2874'] },
  { name: '成长市场指数', code: 'TGI', base: 1652, members: ['4827', '6953', '6418'] },
  { name: '湾岸运输指数', code: 'BTI', base: 2067, members: ['9136', '7642'] },
  { name: '防御板块指数', code: 'TDI', base: 1246, members: ['2874', '3516', 'T100'] },
] as const;

const BY_CODE = Object.fromEntries(INSTRUMENTS.map(item => [item.code, item]));

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function advanceToTradingWeekday(day: number): number {
  let cursor = Math.max(1, Math.min(GAME_DAY_LIMIT, Math.floor(day)));
  while (cursor <= GAME_DAY_LIMIT && gameCalendar(cursor).weekday > 5) cursor += 1;
  return cursor;
}

export function isTradingWeekday(day: number): boolean {
  if (!Number.isSafeInteger(day) || day < 1 || day > GAME_DAY_LIMIT) return false;
  return gameCalendar(day).weekday <= 5;
}

export function dividendFundamental(code: string): StockFundamental {
  return STOCK_FUNDAMENTALS[code] ?? STOCK_FUNDAMENTALS.T100;
}

export function nextExDividendDay(code: string, fromDay: number): number {
  const every = dividendFundamental(code).exDividendEveryDays;
  const safeFrom = Math.max(1, Math.floor(fromDay));
  let cycle = Math.max(1, Math.floor((safeFrom - 1) / every));
  while (cycle * every <= GAME_DAY_LIMIT) {
    const exDay = advanceToTradingWeekday(cycle * every);
    if (exDay >= safeFrom) return exDay;
    cycle += 1;
  }
  return advanceToTradingWeekday(every);
}

export function isExDividendDay(code: string, day: number): boolean {
  if (!Number.isSafeInteger(day) || day < 14 || !isTradingWeekday(day)) return false;
  return nextExDividendDay(code, day) === day;
}

export function computeMarketIndices(totalMinute: number): StockIndexSnapshot[] {
  return INDEX_GROUPS.map(({ name, code, base, members }) => {
    const seriesList = members.map(member => chartBars(member, totalMinute, 5, 32));
    const calcIndex = (prices: number[]) =>
      base * prices.reduce((sum, price, idx) => sum + price / Math.max(1, BY_CODE[members[idx]]?.price ?? 1), 0) / members.length;
    const values = seriesList[0].map((_: ChartBar, barIdx: number) => calcIndex(seriesList.map(bars => bars[barIdx].close)));
    const prevValue = calcIndex(members.map(member => quote(member, totalMinute)?.previous ?? BY_CODE[member]?.price ?? 1));
    const latest = values.at(-1) ?? base;
    const pct = prevValue > 0 ? ((latest / prevValue) - 1) * 100 : 0;
    return {
      code,
      name,
      value: Number(latest.toFixed(2)),
      previous: Number(prevValue.toFixed(2)),
      pct: Number(pct.toFixed(2)),
      series: values,
    };
  });
}

function avgClose(bars: ChartBar[], count: number): number {
  const slice = bars.slice(-Math.max(1, count));
  if (!slice.length) return 0;
  return slice.reduce((sum, bar) => sum + bar.close, 0) / slice.length;
}

export function tickerAnalysis(code: string, totalMinute: number): TickerAnalysis {
  const instrument = BY_CODE[code] ?? INSTRUMENTS[0];
  const fundamental = dividendFundamental(instrument.code);
  const q: Quote = quote(instrument.code, totalMinute) ?? {
    at: totalMinute,
    code: instrument.code,
    open: instrument.price,
    high: instrument.price,
    low: instrument.price,
    close: instrument.price,
    previous: instrument.price,
    volume: instrument.volume,
    change: 0,
    pct: 0,
  };
  const daily: ChartBar[] = chartBars(instrument.code, totalMinute, 1440, 24);
  const recent = daily.slice(-10);
  const ma5 = Math.round(avgClose(daily, 5));
  const ma20 = Math.round(avgClose(daily, 20));
  const support = recent.length ? Math.min(...recent.map((b: ChartBar) => b.low)) : q.low;
  const resistance = recent.length ? Math.max(...recent.map((b: ChartBar) => b.high)) : q.high;
  const day = Math.max(1, Math.floor(Math.max(0, totalMinute) / 1440) + 1);
  const nextExDay = nextExDividendDay(instrument.code, day);
  const isExToday = nextExDay === day;
  const annualYieldPct = Number((((fundamental.dividendPerShare * (365 / fundamental.exDividendEveryDays)) / Math.max(1, q.close)) * 100).toFixed(2));
  const idxBase = day + hashText(instrument.code);
  const pool = q.pct >= 0.45
    ? fundamental.bullCatalysts
    : q.pct <= -0.45
      ? fundamental.bearCatalysts
      : fundamental.flatCatalysts;
  const catalystTag: TickerAnalysis['catalystTag'] = q.pct >= 0.45 ? '偏多催化' : q.pct <= -0.45 ? '承压因素' : '箱体整理';
  const catalystHeadline = pool[idxBase % pool.length] ?? pool[0];
  const catalystDetail = `${fundamental.profile} 当前报价较二十日均值（¥${ma20}）${q.close >= ma20 ? '上方' : '下方'}运行，支撑关注 ¥${support}、压力关注 ¥${resistance}。`;
  return {
    code: instrument.code,
    name: instrument.name,
    sector: instrument.sector,
    quote: q,
    fundamental,
    ma5,
    ma20,
    support,
    resistance,
    annualYieldPct,
    isExDividendToday: isExToday,
    nextExDividendDay: nextExDay,
    exDividendInDays: Math.max(0, nextExDay - day),
    nextExDividendDate: formatGameDate(nextExDay),
    catalystTag,
    catalystHeadline,
    catalystDetail,
  };
}

export function marketBulletins(totalMinute: number): MarketBulletin[] {
  const safeMin = Math.max(0, totalMinute);
  const day = Math.floor(safeMin / 1440) + 1;
  const cal = gameCalendar(day);
  const session = marketSession(safeMin);
  const indices = computeMarketIndices(safeMin);
  const tmi = indices[0];
  const analyses = INSTRUMENTS.map(inst => tickerAnalysis(inst.code, safeMin));
  const sorted = [...analyses].sort((a, b) => b.quote.pct - a.quote.pct);
  const topGain = sorted[0];
  const topLoss = sorted[sorted.length - 1];
  const upCount = analyses.filter(item => item.quote.pct > 0).length;
  const downCount = analyses.filter(item => item.quote.pct < 0).length;
  const soonEx = [...analyses].sort((a, b) => a.exDividendInDays - b.exDividendInDays)[0];
  const sessionNote = session === 'open'
    ? '盘中连续竞价时段'
    : session === 'break'
      ? '午间休市时段'
      : session === 'weekend'
        ? '周末休市（延用上一交易日收盘数据）'
        : session === 'preopen'
          ? '早盘待开盘准备期'
          : '当日收盘总结';

  return [
    {
      id: `mkt-idx-${day}`,
      tag: '大盘风向',
      title: `东都综合 ${tmi.value.toFixed(2)}（${tmi.pct >= 0 ? '+' : ''}${tmi.pct.toFixed(2)}%）`,
      detail: `${cal.iso} ${cal.weekdayLabel} · ${sessionNote}。全市场 ${upCount} 涨 ${downCount} 跌，科技成长 ${indices[1].pct >= 0 ? '+' : ''}${indices[1].pct.toFixed(2)}%，防御板块 ${indices[3].pct >= 0 ? '+' : ''}${indices[3].pct.toFixed(2)}%。`,
      tone: tmi.pct > 0.15 ? 'gain' : tmi.pct < -0.15 ? 'loss' : 'neutral',
    },
    {
      id: `mkt-gain-${day}-${topGain.code}`,
      tag: '强势领涨',
      title: `${topGain.name}（${topGain.code}） ${topGain.quote.pct >= 0 ? '+' : ''}${topGain.quote.pct.toFixed(2)}%`,
      detail: topGain.catalystHeadline,
      tone: topGain.quote.pct >= 0 ? 'gain' : 'neutral',
    },
    {
      id: `mkt-loss-${day}-${topLoss.code}`,
      tag: '承压动向',
      title: `${topLoss.name}（${topLoss.code}） ${topLoss.quote.pct >= 0 ? '+' : ''}${topLoss.quote.pct.toFixed(2)}%`,
      detail: topLoss.catalystHeadline,
      tone: topLoss.quote.pct < 0 ? 'loss' : 'neutral',
    },
    {
      id: `mkt-div-${day}-${soonEx.code}`,
      tag: '派息日程',
      title: soonEx.isExDividendToday
        ? `今日除息：${soonEx.name}（每股派 ¥${soonEx.fundamental.dividendPerShare}）`
        : `近期除息：${soonEx.name}（距除息 ${soonEx.exDividendInDays} 天）`,
      detail: `除息基准日 ${soonEx.nextExDividendDate} 收盘（15:30）结算，持有股份将按每股 ¥${soonEx.fundamental.dividendPerShare} 自动发放至证券可用资金。`,
      tone: soonEx.isExDividendToday ? 'gain' : 'neutral',
    },
  ];
}

/** Public-only Tokyo market summary for Xitter network feeds. Never reads protagonist portfolios or private stories. */
export function buildXitterMarketPublicFacts(day: number, totalMinute: number): { id: string; text: string }[] {
  const safeDay = Math.max(1, Math.min(GAME_DAY_LIMIT, Math.floor(day)));
  const bulletins = marketBulletins(totalMinute);
  const summary = bulletins.map(b => `${b.title}：${b.detail}`).join(' ');
  return [
    {
      id: `stock-market-${safeDay}`,
      text:
        `【东都证券公开行情】${summary}` +
        ' 【人物范围约束】长崎素世、丰川祥子、樱羽艾玛、甘织玲奈子等现有主角以及 MyGO!!!!!、Ave Mujica、全部固定世界书人物均对股票毫无兴趣，绝不要写这些已有角色发帖、点赞或回复讨论股票；只有新闻/财经机构、兜町茶水间（chatter:kabuto）、东都财经观察（chatter:finwatch）或随机路人散户可在公开广场闲聊股票与大盘。',
    },
  ];
}

export interface DividendSettlementContext {
  readonly minuteBefore: number;
  readonly minuteAfter: number;
  readonly stockAccounts: Partial<Record<ProtagonistId, TradingState>> | undefined;
  readonly hasJournalId: (owner: ProtagonistId, id: string) => boolean;
  readonly pushJournal: (owner: ProtagonistId, entry: { id: string; text: string; at: string }) => void;
  readonly notify: (owner: ProtagonistId, id: string, text: string) => void;
}

const MAX_BROKER_CASH = 2_000_000_000;

export function settleStockDividends(ctx: DividendSettlementContext): void {
  const accounts = ctx.stockAccounts;
  if (!accounts || ctx.minuteAfter <= ctx.minuteBefore) return;
  const startDay = Math.max(1, Math.floor(ctx.minuteBefore / 1440) + 1);
  const endDay = Math.max(startDay, Math.floor(ctx.minuteAfter / 1440) + 1);
  for (let day = startDay; day <= endDay; day += 1) {
    const closeMinute = (day - 1) * 1440 + 930;
    if (!(ctx.minuteBefore < closeMinute && ctx.minuteAfter >= closeMinute)) continue;
    for (const inst of INSTRUMENTS) {
      if (!isExDividendDay(inst.code, day)) continue;
      const perShare = dividendFundamental(inst.code).dividendPerShare;
      if (perShare <= 0) continue;
      const divId = `stock-div:${day}:${inst.code}`;
      for (const owner of PROTAGONISTS) {
        const account = accounts[owner];
        if (!account) continue;
        const holding = account.positions[inst.code];
        if (!holding || holding.quantity <= 0 || ctx.hasJournalId(owner, divId)) continue;
        const rawPayout = Math.floor(holding.quantity * perShare);
        const room = Math.max(0, MAX_BROKER_CASH - account.cash);
        const payout = Math.min(rawPayout, room);
        if (payout <= 0) continue;
        account.cash += payout;
        account.minute = Math.max(account.minute, closeMinute);
        const note = `【东都证券除息】持有 ${inst.name}（${inst.code}）${holding.quantity} 股，按每股 ¥${perShare} 派发股息 ¥${payout}，已入账证券可用资金。`;
        ctx.pushJournal(owner, { id: divId, text: note, at: `第 ${day} 天 15:30` });
        ctx.notify(owner, divId, `东都证券派息到账：${inst.name} +¥${payout}`);
      }
    }
  }
}

export function buildStockFillSlip(params: {
  id: string;
  code: string;
  name: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  netAmount: number;
  minute: number;
  ownerName: string;
  accent?: string;
}): StockSlipArtifact {
  const day = Math.max(1, Math.floor(Math.max(0, params.minute) / 1440) + 1);
  const hh = String(Math.floor(((params.minute % 1440) + 1440) % 1440 / 60)).padStart(2, '0');
  const mm = String(((params.minute % 60) + 60) % 60).padStart(2, '0');
  const dateLabel = formatGameDate(day);
  const sideLabel = params.side === 'buy' ? '买入成交' : '卖出成交';
  return {
    itemType: 'receipt',
    presetId: `tx-stock-${params.id}`,
    label: `东都证券 · ${params.name}`,
    badge: `¥${params.netAmount}`,
    sourceRef: {
      kind: 'ledger',
      id: `stock-fill:${params.id}`,
      day,
    },
    caption: `${sideLabel} ${params.name}（${params.code}）${params.quantity} 股 @ ¥${params.price}｜手续费 ¥${params.fee}`,
    dataPayload: {
      shop: '东都证券交割凭条',
      itemLabel: `${params.side === 'buy' ? '买' : '卖'} ${params.code} ${params.name} ×${params.quantity}`,
      amountYen: params.netAmount,
      timeText: `${dateLabel} ${hh}:${mm}`,
      meta: `${params.ownerName} · 均价 ¥${params.price} · 佣金 ¥${params.fee}`,
      accent: params.accent ?? (params.side === 'buy' ? '#365847' : '#6c414d'),
    },
  };
}

export function buildStockPositionSlip(params: {
  code: string;
  name: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  pnl: number;
  minute: number;
  ownerName: string;
}): StockSlipArtifact {
  const day = Math.max(1, Math.floor(Math.max(0, params.minute) / 1440) + 1);
  const hh = String(Math.floor(((params.minute % 1440) + 1440) % 1440 / 60)).padStart(2, '0');
  const mm = String(((params.minute % 60) + 60) % 60).padStart(2, '0');
  const dateLabel = formatGameDate(day);
  const sign = params.pnl > 0 ? '+' : params.pnl < 0 ? '−' : '';
  return {
    itemType: 'receipt',
    presetId: `tx-pos-${day}-${params.code}`,
    label: `东都证券持仓 · ${params.name}`,
    badge: `${sign}¥${Math.abs(params.pnl)}`,
    sourceRef: {
      kind: 'ledger',
      id: `stock-pos:${day}:${params.code}`,
      day,
    },
    caption: `持仓 ${params.name}（${params.code}）${params.quantity} 股 · 成本 ¥${params.avgCost} · 现价 ¥${params.currentPrice}`,
    dataPayload: {
      shop: '东都证券持仓纪要',
      itemLabel: `${params.code} ${params.name} ×${params.quantity}股`,
      amountYen: params.quantity * params.currentPrice,
      timeText: `${dateLabel} ${hh}:${mm}`,
      meta: `${params.ownerName} · 浮动盈亏 ${sign}¥${Math.abs(params.pnl)}`,
      accent: params.pnl >= 0 ? '#2f5a4a' : '#73424c',
    },
  };
}
