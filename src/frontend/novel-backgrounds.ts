import streetDay from '../../assets/backgrounds/street-day.webp?inline';
import streetDusk from '../../assets/backgrounds/street-dusk.webp?inline';
import streetNight from '../../assets/backgrounds/street-night.webp?inline';
import parkDay from '../../assets/backgrounds/park-day.webp?inline';
import parkDusk from '../../assets/backgrounds/park-dusk.webp?inline';
import parkNight from '../../assets/backgrounds/park-night.webp?inline';
import commercialDay from '../../assets/backgrounds/commercial-day.webp?inline';
import commercialDusk from '../../assets/backgrounds/commercial-dusk.webp?inline';
import commercialNight from '../../assets/backgrounds/commercial-night.webp?inline';
import classroomDay from '../../assets/backgrounds/classroom-day.webp?inline';
import classroomDusk from '../../assets/backgrounds/classroom-dusk.webp?inline';
import classroomNight from '../../assets/backgrounds/classroom-night.webp?inline';
import bedroomDay from '../../assets/backgrounds/bedroom-day.webp?inline';
import livehouseBg from '../../assets/backgrounds/livehouse.webp?inline';
import ktvBg from '../../assets/backgrounds/ktv.webp?inline';
import mlmOfficeBg from '../../assets/backgrounds/mlm-office.webp?inline';
import constructionDayBg from '../../assets/backgrounds/construction-day.avif?inline';
import courtHearingBg from '../../assets/backgrounds/court-hearing-day.avif?inline';
import legalOfficeDayBg from '../../assets/backgrounds/legal-office-day.avif?inline';
import legalOfficeNightBg from '../../assets/backgrounds/legal-office-night.avif?inline';
import margoCafeDayBg from '../../assets/backgrounds/margo-cafe-day.avif?inline';
import margoCafeNightBg from '../../assets/backgrounds/margo-cafe-night.avif?inline';
import clinicDayBg from '../../assets/backgrounds/clinic-day.webp?inline';
import clinicNightBg from '../../assets/backgrounds/clinic-night.webp?inline';
import kiyoakiHouseDayBg from '../../assets/backgrounds/kiyoaki-house-day.webp?inline';
import kiyoakiHouseNightBg from '../../assets/backgrounds/kiyoaki-house-night.webp?inline';
import aquariumDay from '../../assets/backgrounds/aquarium-day.webp?inline';
import hanedaAirportDay from '../../assets/backgrounds/haneda-airport-day.webp?inline';
import hanedaAirportDusk from '../../assets/backgrounds/haneda-airport-dusk.webp?inline';
import hanedaAirportNight from '../../assets/backgrounds/haneda-airport-night.webp?inline';
import { majoDistrictArt, majoInteriorArt } from './majo-art';

export type NovelBackgroundPhase = 'day' | 'dusk' | 'night';
type BackgroundFamily = 'street' | 'park' | 'commercial' | 'classroom' | 'bedroom';
export interface NovelBackground {
  id: string;
  src: string;
  phase: NovelBackgroundPhase;
  imagePhase: NovelBackgroundPhase;
  source: 'legacy' | 'majo-art' | 'user-art';
}

const backgrounds: Record<BackgroundFamily, Partial<Record<NovelBackgroundPhase, string>> & { day: string }> = {
  street: { day: streetDay, dusk: streetDusk, night: streetNight },
  park: { day: parkDay, dusk: parkDusk, night: parkNight },
  commercial: { day: commercialDay, dusk: commercialDusk, night: commercialNight },
  classroom: { day: classroomDay, dusk: classroomDusk, night: classroomNight },
  bedroom: { day: bedroomDay },
};

const hanedaAirportBackgrounds: Readonly<Record<NovelBackgroundPhase, string>> = {
  day: hanedaAirportDay, dusk: hanedaAirportDusk, night: hanedaAirportNight,
};

/** Illustrative reuse only; these pictures do not create or rename world locations. */
export const novelBackgroundLocations: Readonly<Record<string, BackgroundFamily>> = Object.freeze({
  gate: 'street', 'south-gate': 'street',
  library: 'park', teaching: 'park',
  dorm: 'street', residences: 'street',
  cafe: 'commercial', 'campus-cafe': 'commercial',
  sports: 'park', promenade: 'park', campus: 'park',
  bookshop: 'commercial', convenience: 'commercial', 'street-cafe': 'commercial',
  'bus-stop': 'street', junction: 'street', neighborhood: 'street', 'city-roads': 'street',
  'sfo-airport': 'commercial', 'california-openai': 'commercial', 'california-market': 'commercial',
  'pocket-park': 'park', 'city-park': 'park', home: 'street', commercial: 'commercial', downtown: 'commercial', 'grand-commercial': 'commercial',
  'takao-mountain': 'park', 'takao-summit': 'park', 'takao-teahouse': 'park', 'takao-onsen': 'commercial',
  circle: 'commercial', 'circle-cafe': 'commercial',
  'dorm-room': 'bedroom', classroom: 'classroom', 'study-room': 'classroom', 'toyokawa-house': 'bedroom', 'kiyoaki-house': 'bedroom', 'soyo-house': 'bedroom', 'mlm-office': 'commercial',
  clinic: 'commercial', 'clinic-room': 'commercial', aquarium: 'commercial',
});

export function novelBackgroundPhase(hour: number): NovelBackgroundPhase {
  const safeHour = Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : 12;
  return safeHour < 6 || safeHour >= 19 ? 'night' : safeHour >= 17 ? 'dusk' : 'day';
}

/**
 * Recovered PR #16 art. Interior pictures are fixed-time derivatives, so they
 * report their actual image phase instead of pretending to be day/night variants.
 * A room may add nightSrc; dusk and night then show that picture.
 */
type MajoBackgroundEntry = {
  src: string;
  imagePhase: NovelBackgroundPhase;
  /** Late-day picture. Dusk and night use it and report imagePhase 'night'. */
  nightSrc?: string;
};
const majoBackgrounds: Readonly<Record<string, MajoBackgroundEntry>> = Object.freeze({
  'emma-yuki-home': { src: majoInteriorArt['emma-yuki-home'], imagePhase: 'day' },
  'koko-old-house': { src: majoInteriorArt['koko-old-house'], imagePhase: 'day' },
  'nikaido-house': { src: majoInteriorArt['nikaido-house'], imagePhase: 'day' },
  'anan-noa-milia-home': { src: majoInteriorArt['anan-noa-milia-home'], imagePhase: 'day' },
  'majo-highrise-home': { src: majoInteriorArt['majo-highrise-home'], imagePhase: 'dusk' },
  'soyo-house': { src: majoInteriorArt['majo-highrise-home'], imagePhase: 'dusk' },
  'majo-studio': { src: majoInteriorArt['majo-studio'], imagePhase: 'day' },
  'margo-cafe-room': { src: margoCafeDayBg, imagePhase: 'day', nightSrc: margoCafeNightBg },
  'amaori-family-home': { src: majoInteriorArt['koko-old-house'], imagePhase: 'day' },
  'ouzuka-residence': { src: majoInteriorArt['nikaido-house'], imagePhase: 'day' },
  'sena-family-home': { src: majoInteriorArt['emma-yuki-home'], imagePhase: 'day' },
  'koto-apartment': { src: majoInteriorArt['majo-highrise-home'], imagePhase: 'dusk' },
  'koyanagi-home': { src: majoInteriorArt['anan-noa-milia-home'], imagePhase: 'day' },
  home: { src: majoDistrictArt['old-town-lowrise'], imagePhase: 'day' },
  commercial: { src: majoDistrictArt['riverfront-highrise'], imagePhase: 'dusk' },
  neighborhood: { src: majoDistrictArt['older-apartment-courtyard'], imagePhase: 'day' },
  livehouse: { src: livehouseBg, imagePhase: 'night' },
  'ktv-lounge': { src: ktvBg, imagePhase: 'night' },
  'mlm-office': { src: mlmOfficeBg, imagePhase: 'day' },
  'grand-commercial': { src: majoDistrictArt['riverfront-highrise'], imagePhase: 'dusk' },
});

/** Pure selection from bundled resources. No clock mutation, weather inference or network. */
export function getNovelBackground(locationId: string, hour: number): NovelBackground {
  if (locationId === 'haneda-airport') {
    const phase = novelBackgroundPhase(hour);
    return {
      id: `haneda-airport-${phase}`, src: hanedaAirportBackgrounds[phase],
      phase, imagePhase: phase, source: 'user-art',
    };
  }
  if (locationId === 'legal-office') {
    const phase = novelBackgroundPhase(hour);
    const isNight = phase === 'night';
    return {
      id: isNight ? 'legal-office-night' : 'legal-office-day',
      src: isNight ? legalOfficeNightBg : legalOfficeDayBg,
      phase, imagePhase: isNight ? 'night' : 'day', source: 'user-art',
    };
  }
  if (locationId === 'clinic' || locationId === 'clinic-room') {
    const phase = novelBackgroundPhase(hour);
    const isNight = phase === 'night';
    return {
      id: isNight ? 'clinic-night' : 'clinic-day',
      src: isNight ? clinicNightBg : clinicDayBg,
      phase,
      imagePhase: isNight ? 'night' : 'day',
      source: 'user-art',
    };
  }
  if (locationId === 'kiyoaki-house') {
    const phase = novelBackgroundPhase(hour);
    const isDay = phase === 'day';
    return {
      id: isDay ? 'kiyoaki-house-day' : 'kiyoaki-house-night',
      src: isDay ? kiyoakiHouseDayBg : kiyoakiHouseNightBg,
      phase, imagePhase: isDay ? 'day' : 'night', source: 'user-art',
    };
  }
  // This locally supplied construction photo depicts daylight in every game-time phase.
  if (locationId === 'construction-site') return { id: 'construction-site-day', src: constructionDayBg,
    phase: novelBackgroundPhase(hour), imagePhase: 'day', source: 'user-art' };
  // One indoor courtroom photograph. Dusk and night keep the same picture and only use the existing shade.
  if (locationId === 'court-hearing') return { id: 'court-hearing-day', src: courtHearingBg,
    phase: novelBackgroundPhase(hour), imagePhase: 'day', source: 'user-art' };
  if (locationId === 'circle-studio') return { id: 'circle-studio-fallback', src: livehouseBg,
    phase: novelBackgroundPhase(hour), imagePhase: 'night', source: 'legacy' };
  if (locationId === 'aquarium') return { id: 'aquarium-day', src: aquariumDay,
    phase: novelBackgroundPhase(hour), imagePhase: 'day', source: 'user-art' };
  const authored = Object.hasOwn(majoBackgrounds, locationId) ? majoBackgrounds[locationId] : undefined;
  if (authored) {
    const phase = novelBackgroundPhase(hour);
    const nightSrc = phase !== 'day' ? authored.nightSrc : undefined;
    return {
      id: nightSrc ? `majo-${locationId}-night` : `majo-${locationId}`,
      src: nightSrc ?? authored.src,
      phase,
      imagePhase: nightSrc ? 'night' : authored.imagePhase,
      source: 'majo-art',
    };
  }
  const family = Object.hasOwn(novelBackgroundLocations, locationId) ? novelBackgroundLocations[locationId] : 'street';
  const variants = backgrounds[family], phase = novelBackgroundPhase(hour);
  const imagePhase = variants[phase] ? phase : 'day';
  return { id: `${family}-${imagePhase}`, src: variants[imagePhase]!, phase, imagePhase, source: 'legacy' };
}
