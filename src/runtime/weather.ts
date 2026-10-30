import type { PlayerState } from '../frontend/types';
import { gameCalendar, gameDateISO } from './game-calendar';
import { adjustEnergy } from './energy';

/** One forecast per civil game day. Ids are save values; labels are player-facing. */
export const WEATHER_IDS = ['sunny', 'cloudy', 'rain', 'storm', 'snow', 'hot'] as const;
export type WeatherId = (typeof WEATHER_IDS)[number];

export interface WeatherState {
  id: WeatherId;
  /** Game day this forecast belongs to. */
  day: number;
}

export interface WeatherEffect {
  readonly id: WeatherId;
  readonly label: string;
  readonly icon: string;
  /** One sentence for the narrative prompt. */
  readonly summary: string;
  /** Extra energy spent on outdoor travel or outdoor exertion. */
  readonly outdoorEnergyDrain: number;
  /** Applied once for each newly entered game day. */
  readonly dailyMorale: number;
  readonly dailyEnergy: number;
  /** Deterministic chance, on that day, of a small health loss. Feeds the existing cold check. */
  readonly illnessChance: number;
  readonly illnessHealthDelta: number;
}

/**
 * Single effect table. Outdoor drain hits travel and outdoor work.
 * A new sunny day adds a little morale and energy. Snow can nudge health
 * down so the existing cold diagnosis (health below 40) is slightly easier to reach.
 */
export const WEATHER_EFFECTS: Readonly<Record<WeatherId, WeatherEffect>> = Object.freeze({
  sunny: { id: 'sunny', label: '晴', icon: '☀️', summary: '今日晴朗，出门会觉得轻松一些。', outdoorEnergyDrain: 0, dailyMorale: 2, dailyEnergy: 1, illnessChance: 0, illnessHealthDelta: 0 },
  cloudy: { id: 'cloudy', label: '多云', icon: '☁️', summary: '今日多云，体感平常。', outdoorEnergyDrain: 0, dailyMorale: 0, dailyEnergy: 0, illnessChance: 0, illnessHealthDelta: 0 },
  rain: { id: 'rain', label: '雨', icon: '🌧️', summary: '今日有雨，外出宜避雨。', outdoorEnergyDrain: 0, dailyMorale: 0, dailyEnergy: 0, illnessChance: 0, illnessHealthDelta: 0 },
  storm: { id: 'storm', label: '暴雨', icon: '⛈️', summary: '今日暴雨，户外行动和赶路会更耗精力。', outdoorEnergyDrain: 3, dailyMorale: 0, dailyEnergy: 0, illnessChance: 0, illnessHealthDelta: 0 },
  snow: { id: 'snow', label: '雪', icon: '❄️', summary: '今日降雪，在户外久留容易受凉。', outdoorEnergyDrain: 1, dailyMorale: 0, dailyEnergy: 0, illnessChance: 0.2, illnessHealthDelta: -2 },
  hot: { id: 'hot', label: '炎热', icon: '🥵', summary: '今日炎热，户外行动和赶路会更耗精力。', outdoorEnergyDrain: 3, dailyMorale: 0, dailyEnergy: 0, illnessChance: 0, illnessHealthDelta: 0 },
});

/**
 * Relative weights for Tokyo: June rainy season, July–August heat,
 * late-summer and autumn typhoons, rare winter snow. Each row sums to 100.
 * Order matches WEATHER_IDS.
 */
export const TOKYO_MONTH_WEIGHTS: Readonly<Record<number, readonly number[]>> = Object.freeze({
  1: Object.freeze([32, 40, 20, 2, 6, 0]),
  2: Object.freeze([36, 38, 18, 2, 6, 0]),
  3: Object.freeze([40, 34, 22, 4, 0, 0]),
  4: Object.freeze([42, 32, 22, 4, 0, 0]),
  5: Object.freeze([36, 30, 28, 6, 0, 0]),
  6: Object.freeze([10, 28, 48, 14, 0, 0]),
  7: Object.freeze([18, 16, 18, 8, 0, 40]),
  8: Object.freeze([14, 14, 16, 20, 0, 36]),
  9: Object.freeze([16, 20, 24, 28, 0, 12]),
  10: Object.freeze([26, 28, 22, 24, 0, 0]),
  11: Object.freeze([38, 36, 20, 4, 2, 0]),
  12: Object.freeze([34, 38, 18, 4, 6, 0]),
});

export function isWeatherId(value: string): value is WeatherId {
  return (WEATHER_IDS as readonly string[]).includes(value);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Same civil date always yields the same forecast. */
export function weatherForDay(day: number): WeatherState {
  const calendar = gameCalendar(day);
  const weights = TOKYO_MONTH_WEIGHTS[calendar.month];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let sample = hashString(`unread-city-weather-v1|${calendar.iso}`) % total;
  for (let index = 0; index < WEATHER_IDS.length; index++) {
    const weight = weights[index] ?? 0;
    if (sample < weight) return { id: WEATHER_IDS[index]!, day };
    sample -= weight;
  }
  return { id: 'cloudy', day };
}

export function resolveWeather(state: { clock: { day: number }; weather?: WeatherState | null }): WeatherState {
  const saved = state.weather;
  if (saved && saved.day === state.clock.day && isWeatherId(saved.id)) return { id: saved.id, day: saved.day };
  return weatherForDay(state.clock.day);
}

export function outdoorEnergyDrain(id: WeatherId): number {
  return WEATHER_EFFECTS[id].outdoorEnergyDrain;
}

/** Extra cost only for outdoor actions that already spend energy. */
export function outdoorExertionDrain(id: WeatherId, outdoor: boolean, energyEffect: number): number {
  if (!outdoor || energyEffect >= 0) return 0;
  return outdoorEnergyDrain(id);
}

export function weatherNarrative(weather: WeatherState) {
  const row = WEATHER_EFFECTS[weather.id];
  return { id: row.id, day: weather.day, label: row.label, icon: row.icon, summary: row.summary };
}

/** Unit interval in [0, 1), stable for a game day. */
export function coldExposureRoll(day: number): number {
  return hashString(`unread-city-weather-cold-v1|${gameDateISO(day)}`) / 4294967296;
}

function clampStat(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** One day's mood, energy and cold nudge. Does not invent a separate weather stat. */
export function applyDailyWeatherEffects(player: PlayerState, weather: WeatherState): PlayerState {
  const effects = WEATHER_EFFECTS[weather.id];
  const chilled = effects.illnessChance > 0 && coldExposureRoll(weather.day) < effects.illnessChance;
  return {
    ...player,
    morale: clampStat(player.morale + effects.dailyMorale),
    energy: adjustEnergy(player.energy, effects.dailyEnergy),
    health: chilled ? clampStat(player.health + effects.illnessHealthDelta) : player.health,
  };
}

/** Effects for each game day entered, not the day the action started on. */
export function applyWeatherForElapsedDays(player: PlayerState, fromDay: number, toDay: number): PlayerState {
  let next = player;
  for (let day = fromDay + 1; day <= toDay; day++) next = applyDailyWeatherEffects(next, weatherForDay(day));
  return next;
}

/** Re-apply only the energy half after a caller replaces energy from a pre-advance snapshot. */
export function dailyEnergyAfter(energy: number, fromDay: number, toDay: number): number {
  let value = energy;
  for (let day = fromDay + 1; day <= toDay; day++) value = adjustEnergy(value, WEATHER_EFFECTS[weatherForDay(day).id].dailyEnergy);
  return value;
}
