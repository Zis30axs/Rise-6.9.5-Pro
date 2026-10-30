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
  applyOutdoorHealth,
  applyWeatherForElapsedDays,
  exposureRoll,
  exposureSeed,
  outdoorEnergyDrain,
  outdoorExertionDrain,
  outdoorHealthExposure,
  weatherForDay,
  weatherNarrative,
  type WeatherId,
  type WeatherState,
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
    expect(WEATHER_EFFECTS.sunny.dailyHealth).toBe(1);
    expect(WEATHER_EFFECTS.rain.outdoorHealthChance).toBe(0.1);
    expect(WEATHER_EFFECTS.storm.outdoorHealthChance).toBeGreaterThan(WEATHER_EFFECTS.rain.outdoorHealthChance);
    expect(WEATHER_EFFECTS.storm.outdoorHealthDelta).toBe(-2);
    expect(WEATHER_EFFECTS.snow.outdoorHealthChance).toBe(0.2);
    expect(WEATHER_EFFECTS.snow.outdoorHealthDelta).toBe(-2);
    expect(WEATHER_EFFECTS.hot.outdoorHealthChance).toBe(0.2);
    expect(WEATHER_EFFECTS.hot.outdoorHealthDelta).toBe(-3);
    expect(WEATHER_EFFECTS.rain.outdoorHealthNote).toBe('淋雨着凉');
    expect(WEATHER_EFFECTS.hot.outdoorHealthNote).toBe('中暑');
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
    expect(sunny.health).toBe(81);
    const capped = applyDailyWeatherEffects({ ...player, health: 100 }, { id: 'sunny', day: 3 });
    expect(capped.health).toBe(100);
    expect(applyDailyWeatherEffects(player, { id: 'snow', day: 3 }).health).toBe(player.health);
    expect(applyDailyWeatherEffects(player, { id: 'cloudy', day: 3 })).toEqual(player);
    const rolled = applyWeatherForElapsedDays(player, 1, 1);
    expect(rolled).toEqual(player);
  });

  it('lowers health outdoors at any starting health, and the existing cold check still uses that health', () => {
    const samples = 4000;
    const rates: Record<string, number> = { rain: 0, storm: 0, snow: 0, hot: 0 };
    for (const id of ['rain', 'storm', 'snow', 'hot'] as const) {
      const weather: WeatherState = { id, day: 1 };
      let hits = 0;
      for (let index = 0; index < samples; index++) if (outdoorHealthExposure(weather, `probe|${index}`).healthDelta) hits += 1;
      rates[id] = hits / samples;
    }
    expect(rates.rain).toBeGreaterThan(0.07);
    expect(rates.rain).toBeLessThan(0.14);
    expect(rates.storm).toBeGreaterThan(0.2);
    expect(rates.storm).toBeLessThan(0.31);
    expect(rates.storm).toBeGreaterThan(rates.rain);
    expect(rates.snow).toBeGreaterThan(0.15);
    expect(rates.snow).toBeLessThan(0.26);
    expect(rates.hot).toBeGreaterThan(0.15);
    expect(rates.hot).toBeLessThan(0.26);
    const storm: WeatherState = { id: 'storm', day: 4 };
    const hot: WeatherState = { id: 'hot', day: 4 };
    let stormHit = '';
    let stormMiss = '';
    let hotHit = '';
    for (let index = 0; index < samples && (!stormHit || !stormMiss || !hotHit); index++) {
      const seed = `case|${index}`;
      if (!stormHit && outdoorHealthExposure(storm, seed).healthDelta) stormHit = seed;
      if (!stormMiss && !outdoorHealthExposure(storm, seed).healthDelta) stormMiss = seed;
      if (!hotHit && outdoorHealthExposure(hot, seed).healthDelta) hotHit = seed;
    }
    const healthy = { energy: 80, balance: 0, health: 90, stress: 10, morale: 70, satiety: 70, foodEnergy: 1000 };
    const borderline = { ...healthy, health: 41 };
    const stormExposure = outdoorHealthExposure(storm, stormHit);
    expect(exposureRoll(storm, stormHit)).toBe(exposureRoll(storm, stormHit));
    expect(applyOutdoorHealth(healthy, stormExposure).player.health).toBe(88);
    expect(applyOutdoorHealth(healthy, stormExposure).log).toContain('暴雨着凉');
    expect(diagnosePlayerIllnesses(applyOutdoorHealth(healthy, stormExposure).player).some(illness => illness.id === 'cold')).toBe(false);
    const crossed = applyOutdoorHealth(borderline, stormExposure).player;
    expect(crossed.health).toBe(39);
    expect(diagnosePlayerIllnesses(crossed).some(illness => illness.id === 'cold')).toBe(true);
    expect(applyOutdoorHealth(healthy, outdoorHealthExposure(storm, stormMiss)).player.health).toBe(90);
    const heat = applyOutdoorHealth(healthy, outdoorHealthExposure(hot, hotHit));
    expect(heat.player.health).toBe(87);
    expect(heat.log).toContain('中暑');
    const snow: WeatherState = { id: 'snow', day: 4 };
    const snowSeed = Array.from({ length: samples }, (_, index) => `snow|${index}`).find(seed => outdoorHealthExposure(snow, seed).healthDelta)!;
    expect(applyOutdoorHealth({ ...healthy, health: 95 }, outdoorHealthExposure(snow, snowSeed)).player.health).toBe(93);
    expect(applyOutdoorHealth({ ...healthy, health: 95 }, outdoorHealthExposure(snow, snowSeed)).log).toContain('风雪着凉');
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
    expect(state.player.health).toBe(before.health + WEATHER_EFFECTS.sunny.dailyHealth);
  });

  it('writes a chill note when an outdoor trip rolls rain exposure, without gating on low health', () => {
    const weather: WeatherState = { id: 'rain', day: 1 };
    let minute = 0;
    while (minute < 1440 && !outdoorHealthExposure(weather, exposureSeed({ day: 1, hour: Math.floor(minute / 60), minute: minute % 60 }, 'travel', 'gate>library')).healthDelta) minute += 1;
    expect(minute).toBeLessThan(1440);
    let state = createInitialState();
    state.clock = { day: 1, hour: Math.floor(minute / 60), minute: minute % 60 };
    state.player = { ...state.player, health: 90 };
    state.weather = weather;
    state = parseState(state);
    state = reduceState(state, { type: 'novel_travel', locationId: 'library' });
    expect(state.player.health).toBe(88);
    expect(diagnosePlayerIllnesses(state.player).some(illness => illness.id === 'cold')).toBe(false);
    expect(state.journal.at(-1)?.text).toContain('淋雨着凉，健康-2');
  });
});
