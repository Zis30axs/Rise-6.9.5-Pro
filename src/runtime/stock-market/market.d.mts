export type StockSide = 'buy' | 'sell';
export type StockStatus = 'open' | 'partial' | 'filled' | 'cancelled' | 'expired';
export interface StockInstrument {
  code: string; name: string; sector: string; short: string; tone: string;
  price: number; drift: number; volume: number;
}
export interface StockHolding { quantity: number; cost: number }
export interface StockOrder {
  id: string; code: string; side: StockSide; kind: 'market' | 'limit';
  quantity: number; limit: number | null; filled: number; gross: number;
  fee: number; created: number; status: StockStatus;
}
export interface StockFill {
  id: string; orderId: string; at: number; code: string; side: StockSide;
  quantity: number; price: number; fee: number; realized: number;
}
export interface TradingState {
  version: 1; revision: number; minute: number; cash: number; realized: number;
  nextId: number; positions: Record<string, StockHolding>; orders: StockOrder[];
  fills: StockFill[]; book: { at: number; used: Record<string, number> };
  receipts: { id: string; signature: string }[];
}
export type StockTrade =
  | { type: 'submit'; code: string; side: StockSide; kind: 'market' | 'limit'; quantity: number; limit: number | null }
  | { type: 'cancel'; orderId: string };
export const INSTRUMENTS: readonly StockInstrument[];
export function fitsMarketSession(start: number, duration: number): boolean;
export function createTradingState(options: { minute: number }): TradingState;
export function restoreTradingState(raw: unknown): TradingState;
export function advanceTradingState(previous: TradingState, target: number, allowMatching?: boolean): TradingState;
export function applyTradeAction(previous: TradingState, action: StockTrade & { requestId: string }): TradingState;
export function marketSession(minute: number): 'open' | 'preopen' | 'break' | 'closed' | 'weekend';
export interface ChartBar {
  at: number; open: number; high: number; low: number; close: number; volume: number;
}
export interface Quote extends ChartBar {
  code: string; previous: number; change: number; pct: number;
}
export interface BookLevel {
  key: string; price: number; quantity: number;
}
export interface OrderEstimate {
  quantity: number; gross: number; fee: number; total: number;
}
export interface PositionSummary {
  code: string; quantity: number; available: number; costPerShare: number;
  last: number; value: number; profit: number;
}
export function quote(code: string, minute: number): Quote | null;
export function accountSummary(state: TradingState): {
  cash: number; availableCash: number; frozenCash: number; marketValue: number;
  equity: number; unrealized: number; realized: number; positions: PositionSummary[];
};
export function nextOpenMinute(minute: number): number;
export function chartBars(code: string, minute: number, interval?: number, limit?: number): ChartBar[];
export function bookLevels(state: TradingState, code: string, side: StockSide): BookLevel[];
export function estimateOrder(
  state: TradingState,
  order: { code: string; side: StockSide; kind: 'market' | 'limit'; quantity: number; limit: number | null },
): OrderEstimate | null;
export function maxOrderQuantity(
  state: TradingState,
  order: { code: string; side: StockSide; kind: 'market' | 'limit'; limit: number | null },
): number;
