<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ShellActions, ShellModel } from './types';
import {
  INSTRUMENTS,
  accountSummary,
  bookLevels,
  chartBars,
  estimateOrder,
  fitsMarketSession,
  marketSession,
  maxOrderQuantity,
  nextOpenMinute,
  quote,
} from '../runtime/stock-market/market.mjs';
import {
  buildStockFillSlip,
  buildStockPositionSlip,
  computeMarketIndices,
  marketBulletins,
  tickerAnalysis,
} from '../runtime/stock-market/intelligence';
import { STOCK_CALENDAR_LOCATION, canTradeStocks, stockAccount } from '../runtime/stock-world';
import { activeProtagonist, gameMinute, protagonistNames } from '../runtime/protagonist-world';
import { FICTIONAL_CARDS, appiePayBalance, type FictionalCardId } from '../runtime/dual-protagonists';
import { GAME_START_DATE, formatGameDate, gameCalendar, gameDateISO } from '../runtime/game-calendar';

const props = defineProps<{
  model: ShellModel;
  actions: ShellActions;
  initialCode?: string;
}>();

const CARD_NAMES: Readonly<Record<FictionalCardId, string>> = {
  gpt: 'GPT 储蓄卡',
  claude: 'Claude 联名卡',
  gemini: 'Gemini 零钱卡',
};

const SESSION_LABELS: Readonly<Record<string, string>> = {
  open: '交易中',
  break: '午间休市',
  closed: '已收盘',
  preopen: '待开盘',
  weekend: '周末休市',
};

const ORDER_STATUS_LABELS: Readonly<Record<string, string>> = {
  open: '待成交',
  partial: '部分成交',
  filled: '已成交',
  cancelled: '已撤销',
  expired: '已过期',
};

const INTERVALS = [5, 15, 30, 1440] as const;
const INTERVAL_LABELS: Readonly<Record<number, string>> = {
  5: '5分',
  15: '15分',
  30: '30分',
  1440: '日K',
};

const MARKET_EPOCH_MS = Date.parse(`${GAME_START_DATE}T00:00:00Z`);

const selectedCode = ref(props.initialCode && INSTRUMENTS.some(i => i.code === props.initialCode) ? props.initialCode : INSTRUMENTS[0].code);
const interval = ref<5 | 15 | 30 | 1440>(5);
const showMa = ref(true);
const searchQuery = ref('');
const watchFilter = ref<'all' | 'held'>('all');
const side = ref<'buy' | 'sell'>('buy');
const kind = ref<'limit' | 'market'>('limit');
const limitPrice = ref<number>(quote(selectedCode.value, gameMinute(props.model.state))?.close ?? INSTRUMENTS[0].price);
const quantity = ref<number>(5);
const activeTab = ref<'positions' | 'orders' | 'fills'>('positions');
const hoveredBarIndex = ref<number | null>(null);

const fundsOpen = ref(false);
const fundsDirection = ref<'deposit' | 'withdraw'>('deposit');
const fundsCard = ref<FictionalCardId>('gpt');
const fundsYen = ref<number>(5000);

const scheduleOpen = ref(false);
const scheduleDate = ref('');
const scheduleTime = ref('09:15');
const scheduleDuration = ref(15);

const feedback = ref<{ text: string; error: boolean } | null>(null);
const clippingId = ref<string | null>(null);

const owner = computed(() => activeProtagonist(props.model.state));
const ownerName = computed(() => protagonistNames[owner.value]);
const totalMinute = computed(() => gameMinute(props.model.state));
const canTrade = computed(() => canTradeStocks(props.model.state, owner.value));
const account = computed(() => stockAccount(props.model.state, owner.value));
const stockRevision = computed(() => account.value.revision);
const stockMinute = computed(() => account.value.minute);
const summary = computed(() => accountSummary(account.value));
const session = computed(() => marketSession(totalMinute.value));
const indices = computed(() => computeMarketIndices(totalMinute.value));
const bulletins = computed(() => marketBulletins(totalMinute.value));

const appieTotalYen = computed(() => {
  const accounts = props.model.state.protagonists?.accounts;
  return accounts ? Math.floor(appiePayBalance(accounts, owner.value) / 100) : Math.floor(props.model.state.player.balance);
});

const cardYenMap = computed<Record<FictionalCardId, number>>(() => {
  const accounts = props.model.state.protagonists?.accounts;
  if (!accounts) {
    const fallback = owner.value === 'soyo' ? Math.max(0, Math.floor(props.model.state.player.balance)) : 0;
    return { gpt: fallback, claude: 0, gemini: 0 };
  }
  const person = accounts.people[owner.value];
  return {
    gpt: Math.floor((person?.cards.gpt ?? 0) / 100),
    claude: Math.floor((person?.cards.claude ?? 0) / 100),
    gemini: Math.floor((person?.cards.gemini ?? 0) / 100),
  };
});

const clockDisplay = computed(() => {
  const cal = gameCalendar(props.model.state.clock.day);
  const hh = String(props.model.state.clock.hour).padStart(2, '0');
  const mm = String(props.model.state.clock.minute).padStart(2, '0');
  return `${formatGameDate(props.model.state.clock.day)} ${cal.weekdayLabel} ${hh}:${mm}`;
});

const heldCodes = computed(() => new Set(summary.value.positions.map(p => p.code)));

const watchlistRows = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return INSTRUMENTS.map(inst => tickerAnalysis(inst.code, totalMinute.value)).filter(item => {
    if (watchFilter.value === 'held' && !heldCodes.value.has(item.code)) return false;
    if (!q) return true;
    return item.code.toLowerCase().includes(q) || item.name.toLowerCase().includes(q) || item.sector.toLowerCase().includes(q);
  });
});

const currentAnalysis = computed(() => tickerAnalysis(selectedCode.value, totalMinute.value));
const bars = computed(() => chartBars(selectedCode.value, totalMinute.value, interval.value, 32));
const inspectedBar = computed(() => {
  const list = bars.value;
  if (!list.length) return null;
  if (hoveredBarIndex.value !== null && hoveredBarIndex.value >= 0 && hoveredBarIndex.value < list.length) {
    return list[hoveredBarIndex.value];
  }
  return list[list.length - 1];
});

const orderbook = computed(() => {
  const rawAsks = bookLevels(account.value, selectedCode.value, 'sell');
  const rawBids = bookLevels(account.value, selectedCode.value, 'buy');
  return {
    asks: [...rawAsks].reverse(),
    bids: rawBids,
  };
});

const orderEstimate = computed(() => {
  const qty = Math.max(1, Math.floor(Number(quantity.value) || 0));
  const lim = kind.value === 'market' ? null : Math.max(1, Math.floor(Number(limitPrice.value) || currentAnalysis.value.quote.close));
  try {
    return estimateOrder(account.value, {
      code: selectedCode.value,
      side: side.value,
      kind: kind.value,
      quantity: qty,
      limit: lim,
    });
  } catch {
    return null;
  }
});

const maxAllowedQuantity = computed(() => {
  const lim = kind.value === 'market' ? null : Math.max(1, Math.floor(Number(limitPrice.value) || currentAnalysis.value.quote.close));
  try {
    return maxOrderQuantity(account.value, {
      code: selectedCode.value,
      side: side.value,
      kind: kind.value,
      limit: lim,
    });
  } catch {
    return 0;
  }
});

const positionsList = computed(() => {
  return summary.value.positions.map(p => {
    const analysis = tickerAnalysis(p.code, totalMinute.value);
    const price = p.last;
    const avgCost = Math.round(p.costPerShare);
    const pnl = p.profit;
    const pnlPct = p.costPerShare > 0 ? ((price - p.costPerShare) / p.costPerShare) * 100 : 0;
    return {
      code: p.code,
      name: analysis.name,
      quantity: p.quantity,
      available: p.available,
      avgCost,
      currentPrice: price,
      marketValue: p.value,
      pnl,
      pnlPct,
      exDividendInDays: analysis.exDividendInDays,
      isExDividendToday: analysis.isExDividendToday,
    };
  });
});

function fillNetAmount(fill: (typeof fillsList.value)[number]): number {
  const gross = fill.price * fill.quantity;
  return fill.side === 'buy' ? gross + fill.fee : Math.max(0, gross - fill.fee);
}

const ordersList = computed(() => [...account.value.orders].reverse().slice(0, 40));
const fillsList = computed(() => [...account.value.fills].reverse().slice(0, 40));

// Chart SVG geometry (640 x 236)
const CHART_W = 640;
const CHART_H = 236;
const PRICE_TOP = 14;
const PRICE_BOTTOM = 172;
const VOL_TOP = 186;
const VOL_BOTTOM = 224;

const chartGeometry = computed(() => {
  const list = bars.value;
  if (!list.length) return null;
  const highs = list.map(b => b.high);
  const lows = list.map(b => b.low);
  const minP = Math.min(...lows);
  const maxP = Math.max(...highs);
  const span = Math.max(2, maxP - minP);
  const padP = Math.max(1, Math.round(span * 0.08));
  const lo = minP - padP;
  const hi = maxP + padP;
  const maxVol = Math.max(1, ...list.map(b => b.volume));
  const plotLeft = 10;
  const plotRight = CHART_W - 58;
  const stepX = (plotRight - plotLeft) / list.length;
  const bodyW = Math.max(4, Math.min(13, stepX * 0.62));
  const yPrice = (price: number) => PRICE_TOP + ((hi - price) / Math.max(1, hi - lo)) * (PRICE_BOTTOM - PRICE_TOP);

  const candles = list.map((b, i) => {
    const cx = plotLeft + (i + 0.5) * stepX;
    const yHigh = yPrice(b.high);
    const yLow = yPrice(b.low);
    const yOpen = yPrice(b.open);
    const yClose = yPrice(b.close);
    const top = Math.min(yOpen, yClose);
    const height = Math.max(2, Math.abs(yClose - yOpen));
    const up = b.close >= b.open;
    const volH = Math.max(2, (b.volume / maxVol) * (VOL_BOTTOM - VOL_TOP));
    return {
      idx: i,
      cx,
      xLeft: cx - bodyW / 2,
      bodyW,
      yHigh,
      yLow,
      top,
      height,
      up,
      volY: VOL_BOTTOM - volH,
      volH,
      bar: b,
    };
  });

  const ma5Points = list
    .map((_, i) => {
      const slice = list.slice(Math.max(0, i - 4), i + 1);
      const avg = slice.reduce((acc, item) => acc + item.close, 0) / slice.length;
      return `${candles[i].cx.toFixed(1)},${yPrice(avg).toFixed(1)}`;
    })
    .join(' ');

  const ticks = [0, 0.5, 1].map(ratio => {
    const val = Math.round(hi - ratio * (hi - lo));
    return { y: PRICE_TOP + ratio * (PRICE_BOTTOM - PRICE_TOP), label: `¥${val}` };
  });

  return { candles, ma5Points, ticks, plotLeft, plotRight };
});

watch(
  () => props.initialCode,
  nextCode => {
    if (nextCode && INSTRUMENTS.some(i => i.code === nextCode)) selectSymbol(nextCode);
  },
);

function yen(value: number): string {
  return '¥' + Math.round(value).toLocaleString('zh-CN');
}

function signedYen(value: number): string {
  const prefix = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${prefix}${yen(Math.abs(value))}`;
}

function signedPct(value: number): string {
  const prefix = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${prefix}${Math.abs(value).toFixed(2)}%`;
}

function changeClass(value: number): string {
  return value > 0 ? 'stock-gain' : value < 0 ? 'stock-loss' : 'stock-neutral';
}

function sparkPath(series: readonly number[]): string {
  if (!series.length) return '';
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  return series
    .map((v, i) => {
      const x = (i * 68) / Math.max(1, series.length - 1);
      const y = 20 - ((v - min) / span) * 16;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function formatMinuteStamp(minute: number): string {
  const day = Math.max(1, Math.floor(minute / 1440) + 1);
  const hh = String(Math.floor(((minute % 1440) + 1440) % 1440 / 60)).padStart(2, '0');
  const mm = String(((minute % 60) + 60) % 60).padStart(2, '0');
  return `${gameDateISO(day).slice(5)} ${hh}:${mm}`;
}

function selectSymbol(code: string) {
  selectedCode.value = code;
  hoveredBarIndex.value = null;
  limitPrice.value = quote(code, totalMinute.value)?.close ?? INSTRUMENTS.find(i => i.code === code)?.price ?? 1000;
  feedback.value = null;
}

function setKind(nextKind: 'limit' | 'market') {
  kind.value = nextKind;
  if (nextKind === 'limit') {
    limitPrice.value = currentAnalysis.value.quote.close;
  }
}

function selectBookPrice(price: number) {
  kind.value = 'limit';
  limitPrice.value = price;
}

function runCommand(command: Parameters<NonNullable<ShellActions['performPhoneCommand']>>[1], okMessage: string) {
  feedback.value = null;
  if (props.actions.performPhoneCommand) {
    const result = props.actions.performPhoneCommand(owner.value, command);
    if (result.ok) {
      feedback.value = { text: okMessage, error: false };
    } else {
      feedback.value = { text: result.error || '操作未能完成。', error: true };
    }
    return result.ok;
  }
  const requestId = `st-${Date.now().toString(36)}`;
  props.actions.dispatch({ type: 'phone_app', requestId, owner: owner.value, command });
  feedback.value = { text: okMessage, error: false };
  return true;
}

function submitTrade() {
  if (!canTrade.value || props.model.busy) return;
  const qty = Math.floor(Number(quantity.value) || 0);
  if (qty <= 0 || qty > 9999) {
    feedback.value = { text: '委托股数需在 1 至 9999 之间。', error: true };
    return;
  }
  const lim = kind.value === 'limit' ? Math.floor(Number(limitPrice.value) || 0) : null;
  if (kind.value === 'limit' && (!lim || lim <= 0)) {
    feedback.value = { text: '请输入有效的限价金额。', error: true };
    return;
  }
  const actionLabel = `${side.value === 'buy' ? '买入' : '卖出'} ${currentAnalysis.value.name} ${qty} 股`;
  runCommand(
    {
      type: 'stock_trade',
      minute: stockMinute.value,
      revision: stockRevision.value,
      trade: {
        type: 'submit',
        code: selectedCode.value,
        side: side.value,
        kind: kind.value,
        quantity: qty,
        limit: lim,
      },
    },
    `已提交委托：${actionLabel}（${kind.value === 'market' ? '市价单' : `限价 ¥${lim}`}）。`,
  );
}

function cancelOrder(orderId: string) {
  if (!canTrade.value || props.model.busy) return;
  runCommand(
    {
      type: 'stock_trade',
      minute: stockMinute.value,
      revision: stockRevision.value,
      trade: { type: 'cancel', orderId },
    },
    '已撤销该笔证券委托，冻结资产已解除。',
  );
}

function submitFunds() {
  if (!canTrade.value || props.model.busy) return;
  const amount = Math.floor(Number(fundsYen.value) || 0);
  if (amount <= 0 || amount > 20000000) {
    feedback.value = { text: '请输入 1 至 20,000,000 日元之间的有效划转金额。', error: true };
    return;
  }
  if (fundsDirection.value === 'deposit' && amount > cardYenMap.value[fundsCard.value]) {
    feedback.value = { text: `${CARD_NAMES[fundsCard.value]}余额不足（当前可用 ${yen(cardYenMap.value[fundsCard.value])}）。`, error: true };
    return;
  }
  if (fundsDirection.value === 'withdraw' && amount > summary.value.availableCash) {
    feedback.value = { text: `证券可用资金不足（当前可转出 ${yen(summary.value.availableCash)}）。`, error: true };
    return;
  }
  const dirLabel = fundsDirection.value === 'deposit' ? '从 Appie Pay 转入证券账户' : '从证券账户转回 Appie Pay';
  const ok = runCommand(
    {
      type: 'stock_funds',
      direction: fundsDirection.value,
      card: fundsCard.value,
      yen: amount,
      minute: stockMinute.value,
      revision: stockRevision.value,
    },
    `资金划转成功：${dirLabel} ${yen(amount)}（${CARD_NAMES[fundsCard.value]}）。`,
  );
  if (ok) fundsOpen.value = false;
}

function toggleFundsDrawer() {
  fundsOpen.value = !fundsOpen.value;
  if (fundsOpen.value) {
    scheduleOpen.value = false;
    const avail = fundsDirection.value === 'deposit' ? cardYenMap.value[fundsCard.value] : summary.value.availableCash;
    if (avail > 0) fundsYen.value = Math.min(5000, avail);
  }
}

function toggleScheduleDrawer() {
  scheduleOpen.value = !scheduleOpen.value;
  if (scheduleOpen.value) {
    fundsOpen.value = false;
    let targetStart = totalMinute.value + 5;
    if (!fitsMarketSession(targetStart, scheduleDuration.value)) {
      targetStart = nextOpenMinute(targetStart);
    }
    const d = new Date(MARKET_EPOCH_MS + Math.floor(targetStart / 1440) * 86400000);
    scheduleDate.value = d.toISOString().slice(0, 10);
    const hh = String(Math.floor(((targetStart % 1440) + 1440) % 1440 / 60)).padStart(2, '0');
    const mm = String(((targetStart % 60) + 60) % 60).padStart(2, '0');
    scheduleTime.value = `${hh}:${mm}`;
  }
}

function submitSchedule() {
  if (!canTrade.value || props.model.busy) return;
  const parts = scheduleDate.value.split('-').map(Number);
  const tm = scheduleTime.value.split(':').map(Number);
  if (parts.length !== 3 || tm.length !== 2 || parts.some(Number.isNaN) || tm.some(Number.isNaN)) {
    feedback.value = { text: '请填写完整的日期和时间。', error: true };
    return;
  }
  const startDayOffset = Math.round((Date.UTC(parts[0], parts[1] - 1, parts[2]) - MARKET_EPOCH_MS) / 86400000);
  const startMinute = startDayOffset * 1440 + tm[0] * 60 + tm[1];
  const duration = Math.max(5, Math.min(60, Math.floor(Number(scheduleDuration.value) || 15)));
  const id = `stock-${Date.now().toString(36)}`;
  const ok = runCommand(
    {
      type: 'calendar_save',
      id,
      title: `回顾${currentAnalysis.value.name}行情`,
      locationId: STOCK_CALENDAR_LOCATION,
      start: startMinute,
      duration,
      stockCode: selectedCode.value,
    },
    `已将「${currentAnalysis.value.name} 行情回顾」加入手机日程。`,
  );
  if (ok) scheduleOpen.value = false;
}

async function clipFillToNotebook(fill: (typeof fillsList.value)[number]) {
  if (!props.actions.clipNotebookItem) return;
  const inst = INSTRUMENTS.find(i => i.code === fill.code);
  clippingId.value = fill.id;
  try {
    const slip = buildStockFillSlip({
      id: fill.id,
      code: fill.code,
      name: inst?.name ?? fill.code,
      side: fill.side,
      quantity: fill.quantity,
      price: fill.price,
      fee: fill.fee,
      netAmount: fillNetAmount(fill),
      minute: fill.at,
      ownerName: ownerName.value,
    });
    const saved = await props.actions.clipNotebookItem(slip);
    feedback.value = saved
      ? { text: `已将「${slip.label}」交割凭条贴入${ownerName.value}的手账本，可在手账中随时调整位置或文字。`, error: false }
      : { text: '暂时未能写入手账本，请稍后再试。', error: true };
  } finally {
    clippingId.value = null;
  }
}

async function clipPositionToNotebook(pos: (typeof positionsList.value)[number]) {
  if (!props.actions.clipNotebookItem) return;
  clippingId.value = `pos-${pos.code}`;
  try {
    const slip = buildStockPositionSlip({
      code: pos.code,
      name: pos.name,
      quantity: pos.quantity,
      avgCost: pos.avgCost,
      currentPrice: pos.currentPrice,
      pnl: pos.pnl,
      minute: totalMinute.value,
      ownerName: ownerName.value,
    });
    const saved = await props.actions.clipNotebookItem(slip);
    feedback.value = saved
      ? { text: `已将「${pos.name}」持仓纪要单贴入${ownerName.value}的手账本。`, error: false }
      : { text: '暂时未能写入手账本，请稍后再试。', error: true };
  } finally {
    clippingId.value = null;
  }
}
</script>

<template>
  <div class="uc-stock" data-stock-terminal>
    <!-- Top Indices & Session Bar -->
    <div class="stock-topbar">
      <div class="stock-indices" aria-label="东都市场主要指数">
        <article v-for="idx in indices" :key="idx.code" class="stock-index-card">
          <div class="stock-index-top">
            <span>{{ idx.name }}</span>
            <span class="stock-index-code">{{ idx.code }}</span>
          </div>
          <div class="stock-index-val">
            <strong class="stock-mono">{{ idx.value.toFixed(2) }}</strong>
            <span :class="changeClass(idx.pct)">{{ signedPct(idx.pct) }}</span>
          </div>
          <svg class="stock-spark" viewBox="0 0 68 24" aria-hidden="true">
            <path :d="sparkPath(idx.series)" fill="none" :stroke="idx.pct >= 0 ? '#68dfae' : '#f294a3'" stroke-width="1.4" stroke-linejoin="round" />
          </svg>
        </article>
      </div>
      <div class="stock-session-card">
        <div class="stock-session-badge" :class="{ live: session === 'open' }" data-stock-session>
          <span class="stock-session-dot" aria-hidden="true"></span>
          <span>{{ SESSION_LABELS[session] ?? '休市' }}</span>
        </div>
        <span class="stock-session-time stock-mono">{{ clockDisplay }}</span>
      </div>
    </div>

    <!-- Protagonist Custody Banner if Delegated -->
    <div v-if="!canTrade" class="stock-delegated-banner" role="status">
      当前由代理人托管，仅展示只读盘面；如需委托或资金划转，请在左上角切换至「{{ ownerName }}」本人视角。
    </div>

    <!-- Account Bar -->
    <section class="stock-account-bar" aria-label="证券账户概览">
      <div class="stock-metrics">
        <div class="stock-metric">
          <small>账户持有人</small>
          <strong>{{ ownerName }}</strong>
        </div>
        <div class="stock-metric">
          <small>可用资金</small>
          <strong class="stock-mono" data-stock-cash>{{ yen(summary.availableCash) }}</strong>
        </div>
        <div class="stock-metric">
          <small>持仓市值</small>
          <strong class="stock-mono">{{ yen(summary.marketValue) }}</strong>
        </div>
        <div class="stock-metric">
          <small>证券总资产</small>
          <strong class="stock-mono" data-stock-equity>{{ yen(summary.equity) }}</strong>
        </div>
        <div class="stock-metric">
          <small>浮动盈亏</small>
          <strong class="stock-mono" :class="changeClass(summary.unrealized)">{{ signedYen(summary.unrealized) }}</strong>
        </div>
        <div class="stock-metric">
          <small>Appie Pay</small>
          <strong class="stock-mono">{{ yen(appieTotalYen) }}</strong>
        </div>
      </div>
      <div class="stock-account-actions">
        <button
          type="button"
          class="stock-btn"
          :class="{ active: fundsOpen }"
          :disabled="!canTrade || model.busy"
          data-stock-funds-toggle
          @click="toggleFundsDrawer"
        >
          Appie Pay 划转
        </button>
        <button
          type="button"
          class="stock-btn"
          :class="{ active: scheduleOpen }"
          :disabled="!canTrade || model.busy"
          data-stock-schedule-toggle
          @click="toggleScheduleDrawer"
        >
          安排行情回顾
        </button>
      </div>
    </section>

    <p v-if="feedback" class="stock-feedback" :class="{ error: feedback.error }" role="status" data-stock-feedback>
      {{ feedback.text }}
    </p>

    <!-- Funds Transfer Drawer -->
    <section v-if="fundsOpen" class="stock-drawer" data-stock-funds-drawer aria-label="Appie Pay 资金划转">
      <div class="stock-drawer-head">
        <h3>Appie Pay ⇄ 东都证券资金划转</h3>
        <button type="button" class="stock-btn sm" @click="fundsOpen = false">收起</button>
      </div>
      <div class="stock-form-row">
        <label class="stock-field">
          <span>划转方向</span>
          <select v-model="fundsDirection" data-stock-funds-direction>
            <option value="deposit">转入证券账户</option>
            <option value="withdraw">转回 Appie Pay</option>
          </select>
        </label>
        <label class="stock-field">
          <span>选择银行卡</span>
          <select v-model="fundsCard" data-stock-funds-card>
            <option v-for="cardId in FICTIONAL_CARDS" :key="cardId" :value="cardId">
              {{ CARD_NAMES[cardId] }}（{{ yen(cardYenMap[cardId]) }}）
            </option>
          </select>
        </label>
        <label class="stock-field">
          <span>金额（日元）</span>
          <input v-model.number="fundsYen" type="number" min="1" max="20000000" step="1000" data-stock-funds-amount />
        </label>
        <button type="button" class="stock-btn primary" :disabled="!canTrade || model.busy" data-stock-funds-submit @click="submitFunds">
          确认划转
        </button>
      </div>
      <div class="stock-quick-pills">
        <button v-for="preset in [1000, 3000, 5000, 10000]" :key="preset" type="button" class="stock-pill stock-mono" @click="fundsYen = preset">
          {{ yen(preset) }}
        </button>
        <button
          type="button"
          class="stock-pill"
          @click="fundsYen = fundsDirection === 'deposit' ? cardYenMap[fundsCard] : summary.availableCash"
        >
          全部可用
        </button>
      </div>
    </section>

    <!-- Schedule Review Drawer -->
    <section v-if="scheduleOpen" class="stock-drawer" data-stock-schedule-drawer aria-label="安排看盘回顾日程">
      <div class="stock-drawer-head">
        <h3>预约「{{ currentAnalysis.name }}」开市时段行情回顾</h3>
        <button type="button" class="stock-btn sm" @click="scheduleOpen = false">收起</button>
      </div>
      <div class="stock-form-row">
        <label class="stock-field">
          <span>交易日期</span>
          <input v-model="scheduleDate" type="date" />
        </label>
        <label class="stock-field">
          <span>开始时刻（开盘时段）</span>
          <input v-model="scheduleTime" type="time" />
        </label>
        <label class="stock-field">
          <span>时长（分钟）</span>
          <input v-model.number="scheduleDuration" type="number" min="5" max="60" step="5" />
        </label>
        <button type="button" class="stock-btn primary" :disabled="!canTrade || model.busy" data-stock-schedule-submit @click="submitSchedule">
          保存至日程
        </button>
      </div>
    </section>

    <!-- Main 3-Column Terminal -->
    <div class="stock-workspace">
      <!-- Watchlist -->
      <section class="stock-panel stock-watchlist-panel" aria-label="自选列表">
        <div class="stock-panel-head">
          <h2>证券列表</h2>
          <div class="stock-tab-bar">
            <button type="button" class="stock-btn sm" :class="{ active: watchFilter === 'all' }" @click="watchFilter = 'all'">全部</button>
            <button type="button" class="stock-btn sm" :class="{ active: watchFilter === 'held' }" @click="watchFilter = 'held'">持仓</button>
          </div>
        </div>
        <input v-model="searchQuery" class="stock-search" type="search" placeholder="搜索代码或板块…" aria-label="搜索证券" data-stock-search />
        <div class="stock-watch-list">
          <button
            v-for="item in watchlistRows"
            :key="item.code"
            type="button"
            class="stock-watch-item"
            :class="{ selected: item.code === selectedCode }"
            :data-stock-symbol="item.code"
            @click="selectSymbol(item.code)"
          >
            <span class="stock-watch-left">
              <span class="stock-watch-title">
                <strong>{{ item.name }}</strong>
                <span v-if="item.isExDividendToday" class="stock-ex-tag">今日除息</span>
                <span v-else-if="item.exDividendInDays <= 3" class="stock-ex-tag">{{ item.exDividendInDays }}天后息</span>
              </span>
              <span class="stock-watch-sub">
                <span class="stock-mono">{{ item.code }}</span>
                <span>{{ item.sector }}</span>
              </span>
            </span>
            <span class="stock-watch-right stock-mono">
              <strong>{{ yen(item.quote.close) }}</strong>
              <small :class="changeClass(item.quote.pct)">{{ signedPct(item.quote.pct) }}</small>
            </span>
          </button>
        </div>
      </section>

      <!-- Center Chart & Catalyst -->
      <section class="stock-panel stock-center" aria-label="K线走势与基本面">
        <div class="stock-quote-head">
          <div class="stock-quote-title">
            <h2>{{ currentAnalysis.name }}</h2>
            <span class="stock-mono stock-neutral">{{ currentAnalysis.code }}</span>
            <span class="stock-sector-badge">{{ currentAnalysis.sector }}</span>
          </div>
          <div class="stock-quote-price stock-mono">
            <strong :class="changeClass(currentAnalysis.quote.change)" data-stock-current-price>{{ yen(currentAnalysis.quote.close) }}</strong>
            <span :class="changeClass(currentAnalysis.quote.change)">
              {{ signedYen(currentAnalysis.quote.change) }} ({{ signedPct(currentAnalysis.quote.pct) }})
            </span>
          </div>
        </div>

        <div class="stock-chart-toolbar">
          <div class="stock-intervals" role="group" aria-label="K线周期切换">
            <button
              v-for="iv in INTERVALS"
              :key="iv"
              type="button"
              :class="{ selected: interval === iv }"
              :data-stock-interval="iv"
              @click="interval = iv; hoveredBarIndex = null"
            >
              {{ INTERVAL_LABELS[iv] }}
            </button>
          </div>
          <button type="button" class="stock-btn sm" :class="{ active: showMa }" @click="showMa = !showMa">MA5 均线</button>
        </div>

        <div v-if="inspectedBar" class="stock-ohlc-bar stock-mono">
          <span>时段 <b>{{ formatMinuteStamp(inspectedBar.at) }}</b></span>
          <span>开 <b>¥{{ inspectedBar.open }}</b></span>
          <span>高 <b>¥{{ inspectedBar.high }}</b></span>
          <span>低 <b>¥{{ inspectedBar.low }}</b></span>
          <span>收 <b>¥{{ inspectedBar.close }}</b></span>
          <span>量 <b>{{ inspectedBar.volume.toLocaleString('zh-CN') }}</b></span>
        </div>

        <div v-if="chartGeometry" class="stock-chart-svg-wrap" @mouseleave="hoveredBarIndex = null">
          <svg
            class="stock-chart-svg"
            :viewBox="`0 0 ${CHART_W} ${CHART_H}`"
            role="img"
            :aria-label="`${currentAnalysis.name} ${INTERVAL_LABELS[interval]} 蜡烛图`"
          >
            <g v-for="tick in chartGeometry.ticks" :key="tick.label">
              <line :x1="chartGeometry.plotLeft" :x2="chartGeometry.plotRight" :y1="tick.y" :y2="tick.y" stroke="rgba(201,216,191,0.12)" stroke-dasharray="3 3" />
              <text :x="chartGeometry.plotRight + 6" :y="tick.y + 3" fill="#9eb0a2" font-size="10" font-family="monospace">{{ tick.label }}</text>
            </g>
            <line :x1="chartGeometry.plotLeft" :x2="chartGeometry.plotRight" :y1="PRICE_BOTTOM + 6" :y2="PRICE_BOTTOM + 6" stroke="rgba(201,216,191,0.16)" />
            <g v-for="c in chartGeometry.candles" :key="c.idx" @pointerenter="hoveredBarIndex = c.idx" @click="hoveredBarIndex = c.idx">
              <rect
                :x="c.cx - 8"
                :y="PRICE_TOP"
                width="16"
                :height="VOL_BOTTOM - PRICE_TOP"
                fill="transparent"
                style="cursor:crosshair"
              />
              <rect
                v-if="hoveredBarIndex === c.idx"
                :x="c.cx - 7"
                :y="PRICE_TOP"
                width="14"
                :height="VOL_BOTTOM - PRICE_TOP"
                fill="rgba(230,198,135,0.08)"
              />
              <line :x1="c.cx" :x2="c.cx" :y1="c.yHigh" :y2="c.yLow" :stroke="c.up ? '#68dfae' : '#f294a3'" stroke-width="1.2" />
              <rect :x="c.xLeft" :y="c.top" :width="c.bodyW" :height="c.height" rx="1" :fill="c.up ? '#68dfae' : '#f294a3'" />
              <rect :x="c.xLeft" :y="c.volY" :width="c.bodyW" :height="c.volH" rx="1" :fill="c.up ? 'rgba(104,223,174,0.34)' : 'rgba(242,148,163,0.34)'" />
            </g>
            <polyline v-if="showMa" :points="chartGeometry.ma5Points" fill="none" stroke="#e6c687" stroke-width="1.4" stroke-linejoin="round" />
          </svg>
        </div>

        <!-- Catalyst & Fundamental Panel -->
        <div class="stock-catalyst-box">
          <div class="stock-catalyst-top">
            <span
              class="stock-catalyst-pill"
              :class="{ bear: currentAnalysis.catalystTag === '承压因素', flat: currentAnalysis.catalystTag === '箱体整理' }"
            >
              {{ currentAnalysis.catalystTag }}
            </span>
            <strong>{{ currentAnalysis.catalystHeadline }}</strong>
          </div>
          <p style="font-size:11px;line-height:1.55;color:#aebcae">{{ currentAnalysis.catalystDetail }}</p>
          <div class="stock-fund-grid stock-mono">
            <div class="stock-fund-cell">
              <small>市盈率 / 市值</small>
              <strong>{{ currentAnalysis.fundamental.peRatio ?? '指数' }} / {{ currentAnalysis.fundamental.marketCapOku }}</strong>
            </div>
            <div class="stock-fund-cell">
              <small>均线 MA5 / MA20</small>
              <strong>¥{{ currentAnalysis.ma5 }} / ¥{{ currentAnalysis.ma20 }}</strong>
            </div>
            <div class="stock-fund-cell">
              <small>股息 · 年化估算</small>
              <strong>¥{{ currentAnalysis.fundamental.dividendPerShare }}/股 ({{ currentAnalysis.annualYieldPct }}%)</strong>
            </div>
            <div class="stock-fund-cell">
              <small>下次除息结算</small>
              <strong>{{ currentAnalysis.isExDividendToday ? '今日 15:30' : `${currentAnalysis.exDividendInDays} 天后` }}</strong>
            </div>
          </div>
        </div>
      </section>

      <!-- Right Column: 5-Level Book & Order Ticket -->
      <section class="stock-right">
        <div class="stock-panel" aria-label="五档盘口">
          <div class="stock-panel-head">
            <h2>五档盘口</h2>
            <small class="stock-neutral">点击价位填入限价</small>
          </div>
          <div class="stock-book-rows stock-mono">
            <p v-if="orderbook.asks.length === 0 && orderbook.bids.length === 0" class="stock-book-empty">
              非交易时段暂未挂出五档盘口（开市时间：交易日 09:00–11:30、12:30–15:00）。
            </p>
            <template v-else>
              <button
                v-for="(level, idx) in orderbook.asks"
                :key="`ask-${level.key}`"
                type="button"
                class="stock-book-row"
                @click="selectBookPrice(level.price)"
              >
                <span class="stock-loss">卖{{ orderbook.asks.length - idx }}</span>
                <strong class="stock-loss">¥{{ level.price }}</strong>
                <span class="stock-neutral">{{ level.quantity.toLocaleString('zh-CN') }}</span>
              </button>
              <div class="stock-book-divider"></div>
              <button
                v-for="(level, idx) in orderbook.bids"
                :key="`bid-${level.key}`"
                type="button"
                class="stock-book-row"
                @click="selectBookPrice(level.price)"
              >
                <span class="stock-gain">买{{ idx + 1 }}</span>
                <strong class="stock-gain">¥{{ level.price }}</strong>
                <span class="stock-neutral">{{ level.quantity.toLocaleString('zh-CN') }}</span>
              </button>
            </template>
          </div>
        </div>

        <div class="stock-panel" data-stock-ticket aria-label="委托下单">
          <div class="stock-panel-head">
            <h2>快速委托</h2>
            <small class="stock-mono stock-neutral">{{ currentAnalysis.code }}</small>
          </div>
          <div class="stock-side-tabs">
            <button type="button" class="buy" :class="{ selected: side === 'buy' }" data-stock-side="buy" @click="side = 'buy'">买入</button>
            <button type="button" class="sell" :class="{ selected: side === 'sell' }" data-stock-side="sell" @click="side = 'sell'">卖出</button>
          </div>
          <div class="stock-ticket-fields">
            <label class="stock-field">
              <span>委托类型</span>
              <select :value="kind" data-stock-kind @change="setKind(($event.target as HTMLSelectElement).value as 'limit' | 'market')">
                <option value="limit">限价单（当日有效）</option>
                <option value="market">市价单（即时按盘口撮合）</option>
              </select>
            </label>
            <label class="stock-field">
              <span>委托价格（日元）</span>
              <input v-model.number="limitPrice" type="number" min="1" max="1000000" :disabled="kind === 'market'" data-stock-limit />
            </label>
            <label class="stock-field">
              <span>委托股数（当前上限 {{ maxAllowedQuantity }} 股）</span>
              <input v-model.number="quantity" type="number" min="1" max="9999" data-stock-qty />
            </label>
            <div class="stock-quick-pills">
              <button v-for="q in [1, 5, 10, 50]" :key="q" type="button" class="stock-pill stock-mono" @click="quantity = q">{{ q }} 股</button>
              <button type="button" class="stock-pill" :disabled="maxAllowedQuantity <= 0" @click="quantity = Math.max(1, maxAllowedQuantity)">最大</button>
            </div>
            <div v-if="orderEstimate" class="stock-estimate-box stock-mono">
              <div class="stock-estimate-line">
                <span>预估佣金</span>
                <strong>{{ yen(orderEstimate.fee) }}</strong>
              </div>
              <div class="stock-estimate-line">
                <span>{{ side === 'buy' ? (kind === 'market' ? '预计成交扣款' : '最高冻结资金') : '预计实收金额' }}</span>
                <strong>{{ yen(orderEstimate.total) }}</strong>
              </div>
            </div>
            <button
              type="button"
              class="stock-btn primary"
              :class="{ sell: side === 'sell' }"
              :disabled="!canTrade || model.busy"
              data-stock-submit
              @click="submitTrade"
            >
              {{ side === 'buy' ? '确认买入' : '确认卖出' }} {{ currentAnalysis.name }}
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- Bottom Ledger & News Digest -->
    <div class="stock-bottom-grid">
      <section class="stock-panel" aria-label="持仓、委托与交割记录">
        <div class="stock-panel-head">
          <div class="stock-tab-bar" role="tablist">
            <button type="button" class="stock-tab-btn" :class="{ selected: activeTab === 'positions' }" data-stock-tab="positions" @click="activeTab = 'positions'">
              当前持仓 ({{ positionsList.length }})
            </button>
            <button type="button" class="stock-tab-btn" :class="{ selected: activeTab === 'orders' }" data-stock-tab="orders" @click="activeTab = 'orders'">
              委托单 ({{ ordersList.length }})
            </button>
            <button type="button" class="stock-tab-btn" :class="{ selected: activeTab === 'fills' }" data-stock-tab="fills" @click="activeTab = 'fills'">
              历史成交 ({{ fillsList.length }})
            </button>
          </div>
        </div>

        <div v-if="activeTab === 'positions'" class="stock-record-list">
          <p v-if="!positionsList.length" class="stock-empty">暂无股票持仓。可以先通过 Appie Pay 转入资金后下单。</p>
          <article v-for="pos in positionsList" :key="pos.code" class="stock-record-item">
            <div class="stock-record-main">
              <strong>{{ pos.name }} <span class="stock-mono stock-neutral">{{ pos.code }}</span></strong>
              <small class="stock-mono">
                持股 {{ pos.quantity }}（可用 {{ pos.available }}）· 成本 ¥{{ pos.avgCost }} · 现价 ¥{{ pos.currentPrice }}
              </small>
            </div>
            <div class="stock-record-aside stock-mono">
              <strong :class="changeClass(pos.pnl)">{{ signedYen(pos.pnl) }} ({{ signedPct(pos.pnlPct) }})</strong>
              <button type="button" class="stock-btn sm" @click="selectSymbol(pos.code); side = 'sell'; quantity = pos.available || pos.quantity">卖出</button>
              <button
                type="button"
                class="stock-btn sm"
                :disabled="clippingId === `pos-${pos.code}`"
                data-stock-clip-position
                @click="clipPositionToNotebook(pos)"
              >
                贴入手账
              </button>
            </div>
          </article>
        </div>

        <div v-else-if="activeTab === 'orders'" class="stock-record-list">
          <p v-if="!ordersList.length" class="stock-empty">今日暂无委托记录。</p>
          <article v-for="ord in ordersList" :key="ord.id" class="stock-record-item">
            <div class="stock-record-main">
              <strong>
                <span :class="ord.side === 'buy' ? 'stock-gain' : 'stock-loss'">{{ ord.side === 'buy' ? '买入' : '卖出' }}</span>
                {{ INSTRUMENTS.find(i => i.code === ord.code)?.name ?? ord.code }}
              </strong>
              <small class="stock-mono">
                {{ formatMinuteStamp(ord.created) }} · {{ ord.kind === 'market' ? '市价' : `限价 ¥${ord.limit}` }} · 成交 {{ ord.filled }}/{{ ord.quantity }} 股
              </small>
            </div>
            <div class="stock-record-aside">
              <span class="stock-sector-badge">{{ ORDER_STATUS_LABELS[ord.status] ?? ord.status }}</span>
              <button
                v-if="ord.status === 'open' || ord.status === 'partial'"
                type="button"
                class="stock-btn sm"
                :disabled="!canTrade || model.busy"
                data-stock-cancel
                @click="cancelOrder(ord.id)"
              >
                撤单
              </button>
            </div>
          </article>
        </div>

        <div v-else class="stock-record-list">
          <p v-if="!fillsList.length" class="stock-empty">暂无历史成交明细。</p>
          <article v-for="fill in fillsList" :key="fill.id" class="stock-record-item">
            <div class="stock-record-main">
              <strong>
                <span :class="fill.side === 'buy' ? 'stock-gain' : 'stock-loss'">{{ fill.side === 'buy' ? '买入成交' : '卖出成交' }}</span>
                {{ INSTRUMENTS.find(i => i.code === fill.code)?.name ?? fill.code }}
              </strong>
              <small class="stock-mono">
                {{ formatMinuteStamp(fill.at) }} · {{ fill.quantity }} 股 @ ¥{{ fill.price }} · 佣金 ¥{{ fill.fee }}
              </small>
            </div>
            <div class="stock-record-aside stock-mono">
              <strong>{{ yen(fillNetAmount(fill)) }}</strong>
              <button
                type="button"
                class="stock-btn sm"
                :disabled="clippingId === fill.id"
                data-stock-clip-fill
                @click="clipFillToNotebook(fill)"
              >
                贴入手账
              </button>
            </div>
          </article>
        </div>
      </section>

      <section class="stock-panel" aria-label="东都市场当日公开财讯">
        <div class="stock-panel-head">
          <h2>今日东都财讯摘要</h2>
          <small class="stock-neutral">交易所公开简报</small>
        </div>
        <div class="stock-bulletin-list">
          <article v-for="item in bulletins" :key="item.id" class="stock-bulletin-card">
            <div class="stock-bulletin-head">
              <span class="stock-bulletin-tag">{{ item.tag }}</span>
              <strong :class="changeClass(item.tone === 'gain' ? 1 : item.tone === 'loss' ? -1 : 0)">{{ item.title }}</strong>
            </div>
            <p>{{ item.detail }}</p>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
