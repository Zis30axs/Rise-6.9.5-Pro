import type { WorldState } from '../frontend/types';
import { PROTAGONISTS, type FictionalCardId, type ProtagonistId } from './dual-protagonists';
import {
  accountSummary, advanceTradingState, applyTradeAction, createTradingState, INSTRUMENTS,
  quote, restoreTradingState, type StockTrade, type TradingState,
} from './stock-market/market.mjs';
import { activeProtagonist, gameMinute, personState } from './protagonist-world';
import { recordWeeklyEvidence } from './weekly-memory';
import { GAME_DAY_LIMIT } from './game-calendar';

export type StockAccounts = Partial<Record<ProtagonistId, TradingState>>;
export type StockCommand =
  | { type: 'stock_trade'; trade: StockTrade; minute: number; revision: number }
  | { type: 'stock_funds'; direction: 'deposit' | 'withdraw'; card: FictionalCardId; yen: number; revision: number; minute: number }
  | { type: 'stock_review'; id: string };

export const STOCK_CALENDAR_LOCATION = 'phone';
export const STOCK_MAX_MINUTE = GAME_DAY_LIMIT * 1440 - 1;
export const stockName = (code: string) => INSTRUMENTS.find(item => item.code === code)?.name;
export const canTradeStocks = (s: WorldState, owner: ProtagonistId) =>
  owner === activeProtagonist(s) && s.protagonists?.strategy?.people[owner]?.controller !== 'auto';

export function parseStockAccounts(raw: unknown, now: number): StockAccounts {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('证券账户无效');
  const accounts: StockAccounts = {};
  for (const [key, value] of Object.entries(raw)) {
    const owner = PROTAGONISTS.find(id => id === key);
    if (!owner) throw Error('证券账户持有人无效');
    const state = restoreTradingState(value);
    if (state.minute !== now) throw Error('证券账户与游戏时间不同步');
    accounts[owner] = state;
  }
  return accounts;
}

export function stockAccount(state: WorldState, owner: ProtagonistId): TradingState {
  return state.protagonists?.stockAccounts?.[owner] ?? createTradingState({ minute: gameMinute(state) });
}

export function applyStockCommand(
  state: WorldState, owner: ProtagonistId, requestId: string,
  command: Exclude<StockCommand, { type: 'stock_review' }>,
  ledger: (card: FictionalCardId, delta: number, suffix: string, note: string) => void,
) {
  if (!canTradeStocks(state, owner)) throw Error('请先接管本人，再操作证券账户');
  const previous = stockAccount(state, owner);
  if (command.minute !== previous.minute || command.revision !== previous.revision)
    throw Error('账户或行情已更新，请重新确认');
  let next: TradingState;
  if (command.type === 'stock_trade') {
    next = applyTradeAction(previous, { ...command.trade, requestId });
  } else {
    const deposit = command.direction === 'deposit';
    if (!deposit && command.yen > accountSummary(previous).availableCash) throw Error('证券账户可转出资金不足');
    const cash = previous.cash + (deposit ? command.yen : -command.yen);
    if (cash > 1_000_000_000) throw Error('超过证券账户资金上限');
    ledger(command.card, (deposit ? -1 : 1) * command.yen * 100, 'stock', deposit ? '东都证券 · 转入' : '东都证券 · 转出');
    next = { ...previous, cash, revision: previous.revision + 1 };
  }
  const p = state.protagonists!;
  (p.stockAccounts ??= {})[owner] = next;
}

export function reviewStockEvent(state: WorldState, owner: ProtagonistId, id: string, at: number) {
  const event = state.protagonists?.devices[owner].calendar.find(item => item.id === id);
  if (!event?.stockCode || event.start > at) throw Error('行情回顾尚未开始');
  if (event.reviewed) return;
  const quoteAtReview = quote(event.stockCode, at)!;
  const person = personState(state, owner);
  const entryId = `stock-review:${id}:${event.start}`;
  const text = `回顾了${stockName(event.stockCode)}的行情，参考价 ¥${quoteAtReview.close}。`;
  const minute = at % 1440;
  const stamp = `第 ${Math.floor(at / 1440) + 1} 天 ${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  event.reviewed = true;
  if (!person.journal.some(item => item.id === entryId)) {
    recordWeeklyEvidence(state, owner, { id: entryId, at, text });
    person.journal.push({ id: entryId, text, at: stamp });
    const storyIds = new Set(person.story.filter(entry => entry.role === 'assistant').map(entry => entry.id));
    while (person.journal.length > 100) {
      const index = person.journal.findIndex(entry => {
        const proof = /^(.*):wa:[0-9a-f]{24}$/.exec(entry.id);
        return !proof || !storyIds.has(proof[1]);
      });
      person.journal.splice(index < 0 ? 0 : index, 1);
    }
  }
}

/** All settlement runs on saved game-time transitions, including when the phone is closed. */
export function settleStockWorld(before: WorldState, after: WorldState) {
  const p = after.protagonists;
  if (!p) return;
  const start = gameMinute(before), end = gameMinute(after);
  if (end === start) return;
  for (const owner of PROTAGONISTS) {
    const controlled = canTradeStocks(before, owner);
    const account = p.stockAccounts?.[owner];
    if (account) p.stockAccounts![owner] = advanceTradingState(account, end, controlled);
    if (controlled) continue;
    const due=p.devices[owner].calendar.filter(event=>event.stockCode && !event.reviewed && event.start>=start && event.start<=end);
    for (const event of due.sort((a,b)=>a.start-b.start||a.id.localeCompare(b.id))) {
      reviewStockEvent(after, owner, event.id, event.start);
    }
  }
}
