import { describe, expect, it } from 'vitest';
import { gameCalendar } from '../src/runtime/game-calendar';
import { diagnosePlayerIllnesses } from '../src/runtime/illness';
import { createInitialState, getNovelTravelQuote, parseState, reduceState } from '../src/runtime/model';
import { worldSceneContext } from '../src/runtime/world-presence';
import {
  TOKYO_MONTH_WEIGHTS,
  WEATHER_EFFECTS,
  WEATHER_IDS,
  applyDailyWeatherEffects,
  applyWeatherForElapsedDays,
  coldExposureRoll,
  outdoorEnergyDrain,
  outdoorExertionDrain,
  weatherForDay,
  weatherNarrative,
  type WeatherId,
} from '../src/runtime/weather';

const DAYS = 365 * 3;

function countsFor(month: number) {
  const totals = Object.fromEntries(WEATHER_IDS.map(id => [id, 0])) as Record<WeatherId, number>;
  let days = 0;
  for (let day = 1; day <= DAYS; day++) {
    const calendar = gameCalendar(day);
    if (calendar.month !== month) continue;
    days += 1;
    totals[weatherForDay(day).id] += 1;
  }
  return { days, totals };
}

describe('Tokyo daily weather', () => {
  it('is deterministic for the civil date and stable across a reload', () => {
    for (let day = 1; day <= 400; day++) {
      const first = weatherForDay(day);
      expect(weatherForDay(day)).toEqual(first);
      expect(first.day).toBe(day);
      expect(WEATHER_IDS).toContain(first.id);
    }
    const state = createInitialState();
    expect(state.weather).toEqual(weatherForDay(1));
    state.weather = { id: 'cloudy', day: 1 };
    expect(parseState(state).weather).toEqual({ id: 'cloudy', day: 1 });
    const legacy = JSON.parse(JSON.stringify(createInitialState())) as Record<string, unknown>;
    delete legacy.weather;
    const restored = parseState(legacy);
    expect(restored.weather).toEqual(weatherForDay(1));
    expect(parseState(restored)).toEqual(restored);
  });

  it('replaces a forecast when the saved day no longer matches the clock', () => {
    const state = createInitialState();
    state.clock = { ...state.clock, day: 40 };
    state.weather = { id: 'snow', day: 1 };
    expect(parseState(state).weather).toEqual(weatherForDay(40));
    expect(() => parseState({ ...createInitialState(), weather: { id: 'fog', day: 1 } })).toThrow(/weather\.id/);
  });

  it('changes the saved forecast when the game day advances', () => {
    let state = createInitialState();
    state.clock = { day: 1, hour: 23, minute: 0 };
    state.weather = weatherForDay(1);
    state = parseState(state);
    state = reduceState(state, { type: 'wait', minutes: 90 });
    expect(state.clock.day).toBe(2);
    expect(state.weather).toEqual(weatherForDay(2));
    const sameDay = reduceState(state, { type: 'wait', minutes: 15 });
    expect(sameDay.weather).toEqual(state.weather);
  });

  it('uses season weights that sum to 100 and favor Tokyo patterns', () => {
    for (const weights of Object.values(TOKYO_MONTH_WEIGHTS)) {
      expect(weights.reduce((sum, weight) => sum + weight, 0)).toBe(100);
      expect(weights).toHaveLength(WEATHER_IDS.length);
    }
    const june = countsFor(6);
    const january = countsFor(1);
    const july = countsFor(7);
    const august = countsFor(8);
    const september = countsFor(9);
    const october = countsFor(10);
    const march = countsFor(3);
    const wet = (row: ReturnType<typeof countsFor>) => row.totals.rain + row.totals.storm;
    expect(june.days).toBeGreaterThan(0);
    expect(wet(june) / june.days).toBeGreaterThan(wet(january) / january.days);
    expect(wet(june) / june.days).toBeGreaterThanOrEqual(0.45);
    expect(june.totals.snow).toBe(0);
    expect(july.totals.snow).toBe(0);
    expect(august.totals.snow).toBe(0);
    expect(january.totals.hot).toBe(0);
    const summerHot = july.totals.hot + august.totals.hot;
    const summerDays = july.days + august.days;
    expect(summerHot / summerDays).toBeGreaterThanOrEqual(0.25);
    expect(summerHot / summerDays).toBeGreaterThan((september.totals.hot) / september.days);
    const autumnStorm = (september.totals.storm + october.totals.storm) / (september.days + october.days);
    expect(autumnStorm).toBeGreaterThan(march.totals.storm / march.days);
    expect(autumnStorm).toBeGreaterThanOrEqual(0.15);
    let winterDays = 0;
    let winterSnow = 0;
    for (const month of [12, 1, 2]) {
      const row = countsFor(month);
      winterDays += row.days;
      winterSnow += row.totals.snow;
    }
    expect(winterSnow).toBeGreaterThan(0);
    expect(winterSnow / winterDays).toBeLessThan(0.15);
  });
});

describe('weather effects', () => {
  it('keeps outdoor drain, sunny bonus and snow illness in one modest table', () => {
    expect(outdoorEnergyDrain('storm')).toBeGreaterThanOrEqual(2);
    expect(outdoorEnergyDrain('hot')).toBe(outdoorEnergyDrain('storm'));
    expect(outdoorEnergyDrain('rain')).toBe(0);
    expect(outdoorEnergyDrain('sunny')).toBe(0);
    expect(WEATHER_EFFECTS.sunny.dailyMorale).toBeGreaterThan(0);
    expect(WEATHER_EFFECTS.sunny.dailyMorale).toBeLessThanOrEqual(3);
    expect(WEATHER_EFFECTS.sunny.dailyEnergy).toBeGreaterThan(0);
    expect(WEATHER_EFFECTS.sunny.dailyEnergy).toBeLessThanOrEqual(2);
    expect(WEATHER_EFFECTS.snow.illnessChance).toBeGreaterThan(0);
    expect(WEATHER_EFFECTS.snow.illnessChance).toBeLessThanOrEqual(0.35);
    expect(WEATHER_EFFECTS.snow.illnessHealthDelta).toBeLessThan(0);
    expect(WEATHER_EFFECTS.snow.illnessHealthDelta).toBeGreaterThanOrEqual(-3);
    expect(outdoorExertionDrain('storm', true, -10)).toBe(outdoorEnergyDrain('storm'));
    expect(outdoorExertionDrain('storm', false, -10)).toBe(0);
    expect(outdoorExertionDrain('storm', true, 5)).toBe(0);
    for (const id of WEATHER_IDS) {
      expect(WEATHER_EFFECTS[id].label).toMatch(/^[\u4e00-\u9fff]{1,2}$/);
      expect(WEATHER_EFFECTS[id].summary.length).toBeGreaterThan(4);
    }
  });

  it('adds sunny morale and energy once per new day and clamps the existing stats', () => {
    const player = { energy: 99.5, balance: 0, health: 80, stress: 10, morale: 99, satiety: 70, foodEnergy: 1000 };
    const sunny = applyDailyWeatherEffects(player, { id: 'sunny', day: 3 });
    expect(sunny.morale).toBe(100);
    expect(sunny.energy).toBe(100);
    expect(sunny.health).toBe(80);
    expect(applyDailyWeatherEffects(player, { id: 'cloudy', day: 3 })).toEqual(player);
    const rolled = applyWeatherForElapsedDays(player, 1, 1);
    expect(rolled).toEqual(player);
  });

  it('lets a snow day nudge health into the existing cold diagnosis', () => {
    let hit: number | null = null;
    let miss: number | null = null;
    for (let day = 1; day <= 8000 && (hit === null || miss === null); day++) {
      const weather = weatherForDay(day);
      if (weather.id !== 'snow') continue;
      const exposed = coldExposureRoll(day) < WEATHER_EFFECTS.snow.illnessChance;
      if (exposed && hit === null) hit = day;
      if (!exposed && miss === null) miss = day;
    }
    expect(hit).not.toBeNull();
    expect(miss).not.toBeNull();
    const base = { energy: 50, balance: 0, health: 41, stress: 10, morale: 70, satiety: 70, foodEnergy: 1000 };
    const chilled = applyDailyWeatherEffects(base, weatherForDay(hit!));
    expect(chilled.health).toBe(41 + WEATHER_EFFECTS.snow.illnessHealthDelta);
    expect(diagnosePlayerIllnesses(chilled).some(illness => illness.id === 'cold')).toBe(true);
    const spared = applyDailyWeatherEffects(base, weatherForDay(miss!));
    expect(spared.health).toBe(41);
    expect(diagnosePlayerIllnesses(spared).some(illness => illness.id === 'cold')).toBe(false);
    expect(coldExposureRoll(hit!)).toBe(coldExposureRoll(hit!));
  });

  it('spends extra energy on storm travel and tells the scene about today', () => {
    const storm = parseState({ ...createInitialState(), weather: { id: 'storm' as const, day: 1 } });
    const sunny = parseState({ ...createInitialState(), weather: { id: 'sunny' as const, day: 1 } });
    const stormQuote = getNovelTravelQuote(storm, 'library');
    const sunnyQuote = getNovelTravelQuote(sunny, 'library');
    expect(stormQuote.blockedReason).toBeNull();
    expect(sunnyQuote.blockedReason).toBeNull();
    expect(stormQuote.calculatedEnergyCost - sunnyQuote.calculatedEnergyCost).toBeCloseTo(outdoorEnergyDrain('storm'), 5);
    expect(stormQuote.energyCost - sunnyQuote.energyCost).toBeCloseTo(outdoorEnergyDrain('storm'), 5);
    const outside = parseState({
      ...storm,
      locationId: 'gate',
      scene: { x: -2, z: 29, yaw: 0, areaId: 'south-gate', seed: 'weather-test', encounterId: null },
    });
    const scene = worldSceneContext(outside);
    expect(scene?.weather).toEqual(weatherNarrative(outside.weather!));
    expect(scene?.weather.summary).toContain('暴雨');
  });

  it('grants the sunny day bonus when a wait crosses midnight onto a sunny day', () => {
    let day = 1;
    while (weatherForDay(day + 1).id !== 'sunny' && day < 400) day += 1;
    expect(weatherForDay(day + 1).id).toBe('sunny');
    let state = createInitialState();
    state.clock = { day, hour: 23, minute: 0 };
    state.player = { ...state.player, morale: 40, energy: 40, health: 80 };
    state.weather = weatherForDay(day);
    state = parseState(state);
    const before = { ...state.player };
    state = reduceState(state, { type: 'wait', minutes: 90 });
    expect(state.clock.day).toBe(day + 1);
    expect(state.player.morale).toBe(before.morale + Math.floor(90 / 15) + WEATHER_EFFECTS.sunny.dailyMorale);
    expect(state.player.energy).toBe(before.energy + Math.floor(90 / 15) * 2 + WEATHER_EFFECTS.sunny.dailyEnergy);
  });
});
