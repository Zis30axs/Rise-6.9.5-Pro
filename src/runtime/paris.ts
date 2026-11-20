import city from '../../assets/paris-sandbox/places.json';
import airport from '../../assets/paris-sandbox/airport.json';
import { gameCalendar } from './game-calendar';
import type { InternationalLeg } from './california';
import type { WorldState } from '../frontend/types';

export const parisPlaces = [
  ...city.map(p => ({ id: 'paris-' + p.id, name: p.name, subtitle: p.area, description: p.description })),
  ...airport.map(p => ({ id: p.id, name: p.name, subtitle: p.area, description: p.description })),
];
const ids = new Set(parisPlaces.map(p => p.id));
export const isParisLocation = (id: string) => ids.has(id);
export const isParisAirport = (id: string) => airport.some(p => p.id === id);

// Authored returnable game fares in JPY and durations in minutes.
export const parisTravelLegs: readonly InternationalLeg[] = [
  { from: 'haneda-airport', to: 'cdg-airport', minutes: 865, fare: 86000, method: '羽田－戴高乐国际航班' },
  { from: 'cdg-airport', to: 'paris-roissypole', minutes: 12, fare: 0, method: 'CDGVAL 机场接驳车' },
  { from: 'paris-roissypole', to: 'paris-notre-dame', minutes: 50, fare: 2200, method: 'RER B 线及圣米歇尔站步行接驳' },
  { from: 'paris-notre-dame', to: 'paris-louvre', minutes: 25, fare: 0, method: '沿塞纳河步行' },
  { from: 'paris-louvre', to: 'paris-alexandre', minutes: 32, fare: 0, method: '经杜乐丽花园步行' },
  { from: 'paris-alexandre', to: 'paris-invalides', minutes: 12, fare: 0, method: '沿荣军院广场步行' },
  { from: 'paris-invalides', to: 'paris-eiffel', minutes: 27, fare: 0, method: '经战神广场步行' },
  { from: 'paris-alexandre', to: 'paris-arc', minutes: 33, fare: 0, method: '经香榭丽舍大街步行' },
  { from: 'paris-arc', to: 'paris-eiffel', minutes: 28, fare: 450, method: '巴黎地铁及步行接驳' },
];

const parisCivil = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
export function parisLocalClock(clock: WorldState['clock']) {
  const date = gameCalendar(clock.day);
  const midnight = Date.UTC(date.year, date.month - 1, date.date);
  const instant = new Date(midnight + ((clock.hour - 9) * 60 + clock.minute) * 60_000);
  const parts = Object.fromEntries(parisCivil.formatToParts(instant).map(p => [p.type, Number(p.value)]));
  return { day: clock.day + (Date.UTC(parts.year, parts.month - 1, parts.day) - midnight) / 86_400_000,
    hour: parts.hour, minute: parts.minute };
}
