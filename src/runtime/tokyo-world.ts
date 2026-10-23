/** Stable fictional-world ledger conversion; not a live foreign exchange quotation. */
export const TOKYO_MONEY_FACTOR = 20;
export const TOKYO_DELIVERY_FEE = 60;
export const TOKYO_CURRENCY = 'JPY' as const;
export const TOKYO_COUNTRY_ID = 'JPN';
/** Resolve the prefecture from bundled geometry rather than hardcoding map-data IDs. */
export const TOKYO_REGION_NAME = /tokyo|tōkyō|東京都|東京|东京/i;
export const TOKYO_CENTER = { lon: 139.71, lat: 35.73 } as const;
export function historicalToYen(amount: number): number {
  return Math.round(amount * 100) * TOKYO_MONEY_FACTOR / 100;
}
