import lore from '../worldbook/majo-residents.json' with { type: 'json' };
import { housingForPerson, residentOutfit } from './majo-housing';

/** Person IDs outlive phone ownership and playable-character assignments. */
export const residentCast = lore.entries.filter(entry => entry.extensions.personId).map(entry => ({
  id: entry.extensions.personId!, name: entry.name, aliases: entry.keys,
  profile: entry.content, publicProfile: entry.extensions.publicProfile!,
  anchor: entry.extensions.anchor!, home: entry.extensions.home!,
}));
export const MAJO_GROUP_ID = 'majo-circle';
export const MAJO_GROUP_NAME = '大家的日常';
export const residentById = (id: string) => residentCast.find(row => row.id === id);

/** Small authored schedules, not agents or claims about canonical itineraries. */
export function residentPresence(id: string, clock: { hour: number; minute: number }) {
  const person = residentById(id);
  if (!person) return null;
  const minute = clock.hour * 60 + clock.minute;
  const sleeping = minute < 8 * 60 || minute >= 23 * 60;
  const streaming = id === 'majo-koko' && minute >= 20 * 60;
  const working = minute >= 9 * 60 && minute < 12 * 60;
  const outside = minute >= 14 * 60 && minute < 20 * 60;
  const housing = housingForPerson(id);
  return {
    anchorId: outside ? person.anchor : null,
    // At home the authored housing interior is a real map location; the older
    // home marker string remains authoritative only when no interior exists.
    locationId: outside ? person.anchor : housing?.interiorId ?? person.home,
    activity: sleeping ? '休息' : streaming ? '直播中' : working ? '处理自己的日常事务' : outside ? '外出与休闲' : '在住处休息',
    available: !sleeping && !streaming && !working,
    housing: housing?.id ?? null,
    district: housing?.district ?? null,
    outfit: residentOutfit(id),
  };
}
