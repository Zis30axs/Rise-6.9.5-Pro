import { housingForInterior, type MajoHousingType } from '../runtime/majo-housing';
import { dayPhase as novelBackgroundPhase } from '../runtime/day-phase';
import towerDay from '../../assets/backgrounds/toyokawa-executive-day.webp?inline';
import towerNight from '../../assets/backgrounds/toyokawa-executive-night.webp?inline';
import parisEiffelBg from '../../assets/backgrounds/paris-eiffel-day.webp?inline';
import parisArcBg from '../../assets/backgrounds/paris-arc-day.webp?inline';
import parisLouvreBg from '../../assets/backgrounds/paris-louvre-day.webp?inline';
import parisNotreDameBg from '../../assets/backgrounds/paris-notre-dame-day.webp?inline';
import parisInvalidesBg from '../../assets/backgrounds/paris-invalides-day.webp?inline';
import parisAlexandreBg from '../../assets/backgrounds/paris-alexandre-day.webp?inline';
import parisCdgAirportBg from '../../assets/backgrounds/paris-cdg-day.webp?inline';
import beijingForbiddenBg from '../../assets/backgrounds/beijing-forbidden-city-day.webp?inline';
import beijingHutongBg from '../../assets/backgrounds/beijing-hutong-day.webp?inline';
import beijingTempleBg from '../../assets/backgrounds/beijing-temple-of-heaven-day.webp?inline';
import beijingRoyalGardenBg from '../../assets/backgrounds/beijing-royal-garden-day.webp?inline';
import beijingCampusLakeBg from '../../assets/backgrounds/beijing-campus-lake-day.webp?inline';
import beijingOlympicBg from '../../assets/backgrounds/beijing-olympic-park-day.webp?inline';
import beijingCbdRiverBg from '../../assets/backgrounds/beijing-cbd-river-day.webp?inline';
import beijingArtSanlitunBg from '../../assets/backgrounds/beijing-art-sanlitun-day.webp?inline';
import beijingStationBg from '../../assets/backgrounds/beijing-station-day.webp?inline';
import londonCulfordSchoolBg from '../../assets/backgrounds/london-culford-school-day.webp?inline';
import londonWestminsterBg from '../../assets/backgrounds/london-westminster-day.webp?inline';
import londonTowerBridgeBg from '../../assets/backgrounds/london-tower-bridge-day.webp?inline';
import londonKingsCrossBg from '../../assets/backgrounds/london-kings-cross-day.webp?inline';
import londonWestEndBg from '../../assets/backgrounds/london-west-end-day.webp?inline';
import moscowPalaceSovietsBg from '../../assets/backgrounds/moscow-palace-soviets-day.webp?inline';
import moscowEighthSisterBg from '../../assets/backgrounds/moscow-eighth-sister-day.webp?inline';
import moscowGrandAlleyBg from '../../assets/backgrounds/moscow-grand-alley-day.webp?inline';
import moscowRedSquareBg from '../../assets/backgrounds/moscow-red-square-day.webp?inline';
import moscowKremlinRiverBg from '../../assets/backgrounds/moscow-kremlin-river-day.webp?inline';
import moscowMsuSparrowBg from '../../assets/backgrounds/moscow-msu-sparrow-day.webp?inline';
import moscowArbatDuskBg from '../../assets/backgrounds/moscow-arbat-dusk-day.webp?inline';
import moscowCitySkylineBg from '../../assets/backgrounds/moscow-city-skyline-day.webp?inline';
import streetDay from '../../assets/backgrounds/street-day.webp?inline';
import streetDusk from '../../assets/backgrounds/street-dusk.webp?inline';
import streetNight from '../../assets/backgrounds/street-night.webp?inline';
import highlandDistrictDay from '../../assets/backgrounds/highland-district-day.webp?inline';
import highlandDistrictDusk from '../../assets/backgrounds/highland-district-dusk.webp?inline';
import highlandDistrictNight from '../../assets/backgrounds/highland-district-night.webp?inline';
import highlandHouseDay from '../../assets/backgrounds/highland-house-day.webp?inline';
import highlandHouseDusk from '../../assets/backgrounds/highland-house-dusk.webp?inline';
import highlandHouseNight from '../../assets/backgrounds/highland-house-night.webp?inline';
import asukayamaDay from '../../assets/backgrounds/asukayama-day.webp?inline';
import asukayamaDusk from '../../assets/backgrounds/asukayama-dusk.webp?inline';
import asukayamaNight from '../../assets/backgrounds/asukayama-night.webp?inline';
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
  source: 'legacy' | 'majo-art' | 'user-art' | 'model-render' | 'city-art';
}

const backgrounds: Record<BackgroundFamily, Partial<Record<NovelBackgroundPhase, string>> & { day: string }> = {
  street: { day: streetDay, dusk: streetDusk, night: streetNight },
  park: { day: parkDay, dusk: parkDusk, night: parkNight },
  commercial: { day: commercialDay, dusk: commercialDusk, night: commercialNight },
  classroom: { day: classroomDay, dusk: classroomDusk, night: classroomNight },
  bedroom: { day: bedroomDay },
};

const cityBackgrounds: Readonly<Record<string, string>> = {
  'paris-eiffel': parisEiffelBg,
  'paris-arc': parisArcBg,
  'paris-louvre': parisLouvreBg,
  'paris-notre-dame': parisNotreDameBg,
  'paris-invalides': parisInvalidesBg,
  'paris-alexandre': parisAlexandreBg,
  'cdg-airport': parisCdgAirportBg,
  'paris-roissypole': parisCdgAirportBg,

  'beijing-forbidden-city': beijingForbiddenBg,
  'beijing-tiananmen': beijingForbiddenBg,
  'beijing-jingshan': beijingForbiddenBg,
  'beijing-bell-drum': beijingHutongBg,
  'beijing-nanluoguxiang': beijingHutongBg,
  'beijing-qianmen': beijingHutongBg,
  'beijing-wangfujing': beijingHutongBg,
  'beijing-fangzhuang': beijingHutongBg,
  'beijing-temple-of-heaven': beijingTempleBg,
  'beijing-yongdingmen': beijingTempleBg,
  'beijing-summer-palace': beijingRoyalGardenBg,
  'beijing-yuanmingyuan': beijingRoyalGardenBg,
  'beijing-beihai': beijingRoyalGardenBg,
  'beijing-shichahai': beijingRoyalGardenBg,
  'beijing-yuyuantan': beijingRoyalGardenBg,
  'beijing-peking-university': beijingCampusLakeBg,
  'beijing-tsinghua-university': beijingCampusLakeBg,
  'beijing-olympic': beijingOlympicBg,
  'beijing-bird-nest': beijingOlympicBg,
  'beijing-water-cube': beijingOlympicBg,
  'beijing-olympic-tower': beijingOlympicBg,
  'beijing-ice-ribbon': beijingOlympicBg,
  'beijing-cbd': beijingCbdRiverBg,
  'beijing-china-zun': beijingCbdRiverBg,
  'beijing-cctv-headquarters': beijingCbdRiverBg,
  'beijing-liangma-river': beijingCbdRiverBg,
  'beijing-ncp': beijingCbdRiverBg,
  'beijing-central-tv-tower': beijingCbdRiverBg,
  'beijing-798-art-zone': beijingArtSanlitunBg,
  'beijing-sanlitun': beijingArtSanlitunBg,
  'beijing-station': beijingStationBg,
  'beijing-west': beijingStationBg,
  'beijing-south': beijingStationBg,

  'london-anon-school': londonCulfordSchoolBg,
  'london-culford-park': londonCulfordSchoolBg,
  'london-bury-st-edmunds': londonKingsCrossBg,
  'london-cambridge-junction': londonCulfordSchoolBg,
  'london-kings-cross': londonKingsCrossBg,
  'london-british-museum': londonCulfordSchoolBg,
  'london-denmark-street': londonWestEndBg,
  'london-piccadilly': londonWestEndBg,
  'london-covent-garden': londonWestEndBg,
  'london-trafalgar': londonWestminsterBg,
  'london-big-ben': londonWestminsterBg,
  'london-westminster-abbey': londonWestminsterBg,
  'london-eye': londonWestminsterBg,
  'london-buckingham': londonCulfordSchoolBg,
  'london-hyde-park': londonCulfordSchoolBg,
  'london-paddington': londonKingsCrossBg,
  'london-abbey-road': londonWestEndBg,
  'london-st-pauls': londonTowerBridgeBg,
  'london-shard-borough': londonTowerBridgeBg,
  'london-tower-bridge': londonTowerBridgeBg,
  'london-greenwich': londonTowerBridgeBg,
  'london-heathrow': londonKingsCrossBg,

  'moscow-palace-soviets': moscowPalaceSovietsBg,
  'moscow-palace-alley': moscowGrandAlleyBg,
  'moscow-eighth-sister': moscowEighthSisterBg,
  'moscow-narkomtiazhprom': moscowEighthSisterBg,
  'moscow-aeroflot-house': moscowGrandAlleyBg,
  'moscow-pantheon': moscowMsuSparrowBg,
  'moscow-kotelnicheskaya': moscowEighthSisterBg,
  'moscow-ukraina-hotel': moscowCitySkylineBg,
  'moscow-mid-tower': moscowArbatDuskBg,
  'moscow-red-square': moscowRedSquareBg,
  'moscow-st-basils': moscowEighthSisterBg,
  'moscow-kremlin': moscowKremlinRiverBg,
  'moscow-gum': moscowRedSquareBg,
  'moscow-historical-museum': moscowRedSquareBg,
  'moscow-zaryadye': moscowEighthSisterBg,
  'moscow-bolshoi': moscowGrandAlleyBg,
  'moscow-tverskaya': moscowArbatDuskBg,
  'moscow-state-library': moscowGrandAlleyBg,
  'moscow-christ-saviour': moscowPalaceSovietsBg,
  'moscow-arbat': moscowArbatDuskBg,
  'moscow-tretyakov': moscowKremlinRiverBg,
  'moscow-gorky-park': moscowKremlinRiverBg,
  'moscow-novodevichy': moscowKremlinRiverBg,
  'moscow-luzhniki': moscowMsuSparrowBg,
  'moscow-sparrow-hills': moscowMsuSparrowBg,
  'moscow-msu': moscowMsuSparrowBg,
  'moscow-city': moscowCitySkylineBg,
  'moscow-belorussky': moscowGrandAlleyBg,
  'moscow-komsomolskaya': moscowRedSquareBg,
  'moscow-vdnkh': moscowMsuSparrowBg,
  'moscow-svo': moscowCitySkylineBg,
};

const highlandBackgrounds = {
  district: { day: highlandDistrictDay, dusk: highlandDistrictDusk, night: highlandDistrictNight },
  house: { day: highlandHouseDay, dusk: highlandHouseDusk, night: highlandHouseNight },
};
const asukayamaBackgrounds = { day: asukayamaDay, dusk: asukayamaDusk, night: asukayamaNight };

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

export { novelBackgroundPhase };

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

const interiorByHousingType = {
  'old-family-house': 'koko-old-house', 'modern-open-plan': 'emma-yuki-home',
  'riverfront-highrise': 'majo-highrise-home', 'traditional-courtyard': 'nikaido-house',
  'shared-apartment': 'anan-noa-milia-home', 'studio-apartment': 'majo-studio',
} satisfies Record<MajoHousingType, string>;

/** Pure selection from bundled resources. No clock mutation, weather inference or network. */
export function getNovelBackground(locationId: string, hour: number): NovelBackground {
  if (Object.hasOwn(cityBackgrounds, locationId)) {
    return { id: locationId + '-day', src: cityBackgrounds[locationId], phase: novelBackgroundPhase(hour), imagePhase: 'day', source: 'city-art' };
  }
  if (locationId === 'toyokawa-executive-tower') {
    const phase = novelBackgroundPhase(hour);
    const night = phase === 'night';
    return { id: 'toyokawa-executive-' + (night ? 'night' : 'day'), src: night ? towerNight : towerDay,
      phase, imagePhase: night ? 'night' : 'day', source: 'model-render' };
  }
  if (locationId === 'highland' || locationId === 'residential-mutsumi') {
    const phase = novelBackgroundPhase(hour);
    const view = locationId === 'highland' ? 'district' : 'house';
    return { id: `highland-${view}-${phase}`, src: highlandBackgrounds[view][phase], phase, imagePhase: phase, source: 'model-render' };
  }
  if (locationId === 'asukayama' || locationId === 'asukayama-park') {
    const phase = novelBackgroundPhase(hour);
    return { id: `asukayama-${phase}`, src: asukayamaBackgrounds[phase], phase, imagePhase: phase, source: 'user-art' };
  }
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
  const housing = housingForInterior(locationId);
  const artKey = housing?.visit ? interiorByHousingType[housing.type] : locationId;
  const authored = Object.hasOwn(majoBackgrounds, artKey) ? majoBackgrounds[artKey] : undefined;
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
