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

export type NovelBackgroundPhase = 'day' | 'dusk' | 'night';
type BackgroundFamily = 'street' | 'park' | 'commercial' | 'classroom' | 'bedroom';
export interface NovelBackground {
  id: string;
  src: string;
  phase: NovelBackgroundPhase;
  imagePhase: NovelBackgroundPhase;
}

const backgrounds: Record<BackgroundFamily, Partial<Record<NovelBackgroundPhase, string>> & { day: string }> = {
  street: { day: streetDay, dusk: streetDusk, night: streetNight },
  park: { day: parkDay, dusk: parkDusk, night: parkNight },
  commercial: { day: commercialDay, dusk: commercialDusk, night: commercialNight },
  classroom: { day: classroomDay, dusk: classroomDusk, night: classroomNight },
  bedroom: { day: bedroomDay },
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
  'pocket-park': 'park', 'city-park': 'park', home: 'street', commercial: 'commercial', downtown: 'commercial',
  'dorm-room': 'bedroom', classroom: 'classroom', 'study-room': 'classroom', 'toyokawa-house': 'bedroom',
});

export function novelBackgroundPhase(hour: number): NovelBackgroundPhase {
  const safeHour = Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : 12;
  return safeHour < 6 || safeHour >= 19 ? 'night' : safeHour >= 17 ? 'dusk' : 'day';
}

/** Pure selection from bundled resources. No clock mutation, weather inference or network. */
export function getNovelBackground(locationId: string, hour: number): NovelBackground {
  const family = Object.hasOwn(novelBackgroundLocations, locationId) ? novelBackgroundLocations[locationId] : 'street';
  const variants = backgrounds[family], phase = novelBackgroundPhase(hour);
  const imagePhase = variants[phase] ? phase : 'day';
  return { id: `${family}-${imagePhase}`, src: variants[imagePhase]!, phase, imagePhase };
}
