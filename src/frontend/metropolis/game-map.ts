import type { ShellModel, WorldState } from '../types';
import { mapLocationPoint } from '../campus-map-layout';
import { districtBounds, locationDistrict, mapDistricts, type MapDistrictId } from '../map-districts';
import { formatGameNumber } from '../format-game-number';
import { getNovelTravelQuote, getRouteOutlook, locations, mapLocations, novelDestinations, type NovelTravelQuote, type RouteOutlook } from '../../runtime/model';
import { getTransitRoutes, requiresTransitReturn, type TransitVehicleId } from '../../runtime/transit';
import { getLocationStatus } from '../../runtime/location-services';
import { internationalLeg, isInternationalLocation } from '../../runtime/california';
import { formatGameDate, gameCalendar } from '../../runtime/game-calendar';
import { worldScenePeople, worldScenePosition } from '../../runtime/world-presence';
import { activeProtagonist, personState, protagonistNames } from '../../runtime/protagonist-world';
import { getSceneArea, sceneLocationId } from '../../runtime/scene-context';
import { terrainHeight } from './terrain';
import type { V3 } from './types';
import type { GameDestination, GameDistrict, GameMapContext, GameMapOptions, GamePerson } from './game-map.types';
export type { GameDestination, GameDistrict, GameMapContext, GameMapMapping, GameMapOptions, GamePerson, GamePlayerMarker } from './game-map.types';

interface ScenicDistrict { x: number; z: number; radiusX: number; radiusZ: number; en: string; accent: string; distance: number }
/** Authored display anchors, never movement, transit or save coordinates. */
const scenicDistricts: Record<MapDistrictId, ScenicDistrict> = {
  campus: { x: 1.7, z: -7.1, radiusX: 2.1, radiusZ: 2.35, en: 'TAKADA CAMPUS', accent: '#d9c58a', distance: 15 },
  home: { x: -6.55, z: 2.3, radiusX: 1.35, radiusZ: .9, en: 'ZOSHIGAYA HOMES', accent: '#d9ad86', distance: 12 },
  commercial: { x: 10.6, z: -6.8, radiusX: 1.8, radiusZ: 2.15, en: 'IKEBUKURO', accent: '#91c6ce', distance: 15 },
  downtown: { x: 8, z: .8, radiusX: 2.3, radiusZ: 1.65, en: 'MEJIRODAI', accent: '#c9b4df', distance: 16 },
  'city-park': { x: -12, z: 1.1, radiusX: 2.5, radiusZ: 2.25, en: 'KANDA RIVER GREENWAY', accent: '#a3c68f', distance: 15 },
  'grand-commercial': { x: 4.6, z: -3, radiusX: 2.15, radiusZ: 2.1, en: 'SHINJUKU', accent: '#dfba79', distance: 17 },
  'takao-mountain': { x: -12.1, z: -7.6, radiusX: 3.1, radiusZ: 2.75, en: 'MOUNT TAKAO', accent: '#aec5ab', distance: 19 },
  circle: { x: -6.4, z: -1.6, radiusX: 1.25, radiusZ: .75, en: 'CiRCLE LIVE HOUSE', accent: '#d5a48e', distance: 12 },
};
const knownLocations = new Map(locations.map(location => [location.id, location]));
const legacyDestinationIds = new Set(mapLocations.map(location => location.id));
const sourceDistricts = new Map(mapDistricts.map(district => [district.id, district]));
const sourceBounds = new Map(mapDistricts.map(district => [district.id, districtBounds(district.id)]));
const clampUnit = (value: number) => Math.max(-1, Math.min(1, value));
const finitePoint = (point: { x: number; z: number } | null | undefined): point is { x: number; z: number } =>
  !!point && Number.isFinite(point.x) && Number.isFinite(point.z);
const cleanCopy = (text: string) => text.replace(/【(?:示例场景|演示路况|演示路遇)】\s*/g, '');

function projectDistrictPoint(point: { x: number; z: number }, districtId: MapDistrictId): V3 | null {
  if (!finitePoint(point)) return null;
  const source = sourceDistricts.get(districtId), bounds = sourceBounds.get(districtId), target = scenicDistricts[districtId];
  if (!source || !bounds || !target) return null;
  const extentX = Math.max(source.x - bounds.minX, bounds.maxX - source.x, 1);
  const extentZ = Math.max(source.z - bounds.minZ, bounds.maxZ - source.z, 1);
  const x = target.x + clampUnit((point.x - source.x) / extentX) * target.radiusX;
  const z = target.z + clampUnit((point.z - source.z) / extentZ) * target.radiusZ;
  return [x, terrainHeight(x, z) + .22, z];
}

/** Unknown/overseas locations have no city pin; indoor locations use their real entrance. */
export function gameMapPosition(locationId: string, sourcePoint?: { x: number; z: number } | null): V3 | null {
  if (!knownLocations.has(locationId) || isInternationalLocation(locationId)) return null;
  const point = sourcePoint === undefined ? mapLocationPoint(locationId) : sourcePoint;
  return finitePoint(point) ? projectDistrictPoint(point, locationDistrict(locationId)) : null;
}

function districtLandmarks(currentId: MapDistrictId | null, destinations: GameDestination[]): GameDistrict[] {
  return mapDistricts.map(district => {
    const target = scenicDistricts[district.id], y = terrainHeight(target.x, target.z);
    return {
      id: district.id, name: district.name, caption: district.shortName,
      en: target.en, category: '城市区域', description: district.description,
      position: [target.x, y + .46, target.z], accent: target.accent,
      camera: { target: [target.x, Math.max(1.15, y + .65), target.z], yaw: -.52, pitch: .68, distance: target.distance },
      count: destinations.filter(place => place.districtId === district.id).length,
      current: currentId === district.id,
    };
  });
}

/** A schematic direction curve above the terrain, never a travel calculation. */
function directionLine(from: V3 | null, to: V3 | null, current: boolean): V3[] {
  if (!from || !to || current) return [];
  const dx = to[0] - from[0], dz = to[2] - from[2], distance = Math.hypot(dx, dz);
  if (distance < .001) return [];
  const bend = Math.min(.8, distance * .07);
  return Array.from({ length: 19 }, (_, i) => {
    const t = i / 18, curve = Math.sin(t * Math.PI) * bend;
    const x = from[0] + dx * t - dz / distance * curve, z = from[2] + dz * t + dx / distance * curve;
    const y = Math.max(terrainHeight(x, z) + .2, from[1] * (1 - t) + to[1] * t) + Math.sin(t * Math.PI) * .09;
    return [x, y, z];
  });
}

function routeOutlook(state: WorldState, locationId: string): RouteOutlook {
  const outlook = getRouteOutlook(state, locationId);
  return { ...outlook, event: outlook.event ? { ...outlook.event, description: cleanCopy(outlook.event.description) } : null };
}
function quoteFor(state: WorldState, locationId: string): NovelTravelQuote | null {
  // A future or malformed location must not masquerade as campus or a free trip.
  if (!knownLocations.has(state.locationId)) return null;
  try { return getNovelTravelQuote(state, locationId); }
  catch { return null; }
}
function quoteLabel(quote: NovelTravelQuote | null): string {
  if (!quote) return '暂时无法规划这段行程。';
  if (quote.alreadyThere) return '当前地点';
  if (quote.blockedReason) return quote.blockedReason;
  const parts = [`${quote.minutes} 分钟`, `精力 −${formatGameNumber(quote.energyCost)}`];
  if (quote.fare) parts.push(`车费 ¥${formatGameNumber(quote.fare)}`);
  if (quote.rides.length) parts.push(quote.rides.length > 1 ? '经校园换乘' : '地区接驳');
  return parts.join(' · ');
}
function legacyReason(model: ShellModel, id: string, busy: boolean, transitReturn: boolean): string | null {
  if (busy) return '请等待当前行动完成。';
  if (!knownLocations.has(model.state.locationId)) return '当前位置暂时没有可用路线。';
  if (model.state.interior) return '离开房间后可以继续出行。';
  if (transitReturn) return '请从当前接驳站返程，再继续出行。';
  if (id === model.state.locationId) return '当前地点';
  if (!legacyDestinationIds.has(id)) return '请通过现有建筑入口或接驳站前往。';
  return null;
}
function displayPeople(state: WorldState, currentDistrict: MapDistrictId | null, currentPosition: V3 | null): GamePerson[] {
  const origin = worldScenePosition(state);
  if (!finitePoint(origin) || !currentDistrict || !currentPosition || isInternationalLocation(state.locationId)) return [];
  return worldScenePeople(state).flatMap(person => {
    // Match WorldMapJourney's viewpoint rules: another playable person must
    // really share this outdoor location; indoor attendance comes from the
    // authoritative worldScenePeople room/court projection.
    if (person.protagonistId && !state.interior &&
      (!state.protagonists || personState(state, person.protagonistId).locationId !== state.locationId)) return [];
    const contact = state.contacts.find(item => item.id === person.contactId || item.sourcePersonId === person.id || item.id === person.id);
    // Distance is measured in the old world BEFORE scenic compression, so a
    // faraway resident never becomes disclosed by the miniature projection.
    if (!person.protagonistId && (!contact || contact.affinity < 10 || Math.hypot(person.x - origin.x, person.z - origin.z) > 35)) return [];
    let sourceLocation = state.interior?.roomId ?? state.locationId;
    let sourcePoint: { x: number; z: number } | undefined;
    if (state.interior) sourcePoint = mapLocationPoint(state.interior.roomId);
    else {
      const area = getSceneArea(person.x, person.z);
      if (!area) return [];
      sourceLocation = person.protagonistId ? personState(state, person.protagonistId).locationId : sceneLocationId(area.id);
      sourcePoint = { x: person.x, z: person.z };
    }
    if (!finitePoint(sourcePoint)) return [];
    const position = gameMapPosition(sourceLocation, sourcePoint);
    if (!position) return [];
    return [{
      id: person.id, personId: person.id, contactId: person.contactId ?? person.id,
      name: person.protagonistId ? protagonistNames[person.protagonistId] : person.name,
      portraitId: person.portraitId, protagonistId: person.protagonistId,
      districtId: locationDistrict(sourceLocation), position,
      source: person.protagonistId ? 'protagonist' as const : 'scene' as const,
    }];
  });
}

/** Read-only bridge from the existing world to the new scenic city. */
export function buildGameMapContext(model: ShellModel, options: GameMapOptions = {}): GameMapContext {
  const state = model.state, novelMode = options.novelMode ?? true;
  const busy = Boolean(model.busy || model.switchingProtagonist);
  const protagonistId = activeProtagonist(state), protagonistName = protagonistNames[protagonistId];
  const clockLabel = `${String(state.clock.hour).padStart(2, '0')}:${String(state.clock.minute).padStart(2, '0')}`;
  const dayLabel = `${formatGameDate(state.clock.day)} ${gameCalendar(state.clock.day).weekdayLabel}`;
  const currentId = state.interior?.roomId ?? state.locationId;
  const international = isInternationalLocation(state.locationId);
  const currentSource = state.interior ? mapLocationPoint(state.interior.roomId) : worldScenePosition(state);
  const currentPosition = international || !knownLocations.has(state.locationId) ? null
    : gameMapPosition(currentId, finitePoint(currentSource) ? currentSource : null);
  const currentDistrictId = currentPosition ? locationDistrict(currentId) : null;
  const currentName = knownLocations.get(currentId)?.name ?? knownLocations.get(state.locationId)?.name ?? '尚未识别的地点';
  const transitReturn = requiresTransitReturn(state.locationId, state.scene);
  const destinations: GameDestination[] = novelDestinations.map(place => {
    const overseas = isInternationalLocation(place.id);
    const position = gameMapPosition(place.id), districtId = position ? locationDistrict(place.id) : null;
    const quote = quoteFor(state, place.id), outlook = routeOutlook(state, place.id);
    const current = currentId === place.id;
    const legacy = {
      disabledReason: legacyReason(model, place.id, busy, transitReturn),
      // This is exactly the old scene UI's walking estimate. All complete trips
      // (including transfers, rooms and overseas legs) use the runtime quote.
      minutes: legacyDestinationIds.has(place.id) ? 15 + outlook.extraMinutes : null,
      event: outlook.event,
    };
    const actionType = novelMode || overseas || international ? 'novel_travel' as const : 'travel' as const;
    const disabledReason = actionType === 'novel_travel'
      ? busy ? '请等待当前行动完成。' : !quote ? '暂时无法规划这段行程。'
        : quote.alreadyThere ? '当前地点' : quote.blockedReason
      : legacy.disabledReason;
    const transitRoutes = (quote?.rides ?? []).flatMap(ride => {
      if (ride.vehicleId !== 'btr82a' && ride.vehicleId !== 'zbd04a') return [];
      const route = getTransitRoutes(ride.fromStopId, ride.vehicleId as TransitVehicleId).find(item => item.stop.id === ride.toStopId);
      return route ? [{ ...route, stop: { ...route.stop } }] : [];
    });
    const internationalRoute = internationalLeg(state.locationId, place.id);
    return {
      id: place.id, locationId: place.id, districtId, name: place.name, kind: place.kind,
      category: overseas ? '国际与湾区出行' : place.kind === 'interior' ? '室内入口' : '室外地点',
      description: cleanCopy(place.description), position,
      mapping: overseas ? 'international' : position ? 'city' : 'unmapped', international: overseas, current,
      openState: getLocationStatus(place.id, state.clock), quote, outlook, transitRoutes,
      internationalLeg: internationalRoute ? { ...internationalRoute } : null, legacy, actionType,
      actionLabel: current ? '当前地点' : actionType === 'novel_travel' && place.kind === 'interior' ? '进入这里' : '前往这里',
      quoteLabel: actionType === 'novel_travel' ? quoteLabel(quote)
        : current ? '当前地点' : legacy.minutes === null ? '通过现有入口或接驳站出行'
          : `预计 ${legacy.minutes} 分钟 · ${outlook.event?.title ?? '路线通畅'}`,
      disabled: disabledReason !== null, disabledReason, reason: disabledReason,
      routeLine: directionLine(currentPosition, position, current),
    };
  });
  const mapping = international ? 'international' as const : currentPosition ? 'city' as const : 'unmapped' as const;
  return {
    clockLabel, dayLabel, clock: { ...state.clock, minutesOfDay: state.clock.hour * 60 + state.clock.minute, label: clockLabel, dayLabel },
    protagonist: { id: protagonistId, name: protagonistName },
    currentLocation: { id: currentId, name: currentName, districtId: currentDistrictId, position: currentPosition, mapping },
    currentDistrictId,
    player: { id: 'player', protagonistId, name: protagonistName, locationId: currentId, districtId: currentDistrictId, position: currentPosition },
    districts: districtLandmarks(currentDistrictId, destinations), destinations,
    people: displayPeople(state, currentDistrictId, currentPosition),
    novelMode, busy, inInterior: !!state.interior, requiresTransitReturn: transitReturn, international, notice: model.notice,
  };
}
