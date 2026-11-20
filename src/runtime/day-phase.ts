export type DayPhase = 'day' | 'dusk' | 'night';

export function dayPhase(hour: number): DayPhase {
  const safeHour = Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : 12;
  return safeHour < 6 || safeHour >= 19 ? 'night' : safeHour >= 17 ? 'dusk' : 'day';
}
