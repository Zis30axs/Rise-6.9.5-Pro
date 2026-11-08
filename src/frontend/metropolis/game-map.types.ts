import type { CharacterPortraitId } from '../types';
import type { MapDistrictId } from '../map-districts';
import type { ProtagonistId } from '../../runtime/dual-protagonists';
import type { NovelTravelQuote, RouteOutlook } from '../../runtime/model';
import type { TransitRoute } from '../../runtime/transit';
import type { InternationalLeg } from '../../runtime/california';
import type { getLocationStatus } from '../../runtime/location-services';
import type { Landmark, V3 } from './types';

export type GameMapMapping = 'city' | 'international' | 'unmapped';
export interface GameMapOptions { novelMode?: boolean }

export interface GameDistrict extends Landmark {
  id: MapDistrictId;
  caption: string;
  count: number;
  current: boolean;
}

export interface GameDestination {
  id: string;
  locationId: string;
  districtId: MapDistrictId | null;
  name: string;
  kind: 'outdoor' | 'interior';
  category: string;
  description: string;
  position: V3 | null;
  mapping: GameMapMapping;
  international: boolean;
  current: boolean;
  openState: ReturnType<typeof getLocationStatus>;
  quote: NovelTravelQuote | null;
  outlook: RouteOutlook;
  transitRoutes: TransitRoute[];
  internationalLeg: InternationalLeg | null;
  legacy: {
    disabledReason: string | null;
    minutes: number | null;
    event: RouteOutlook['event'];
  };
  actionType: 'novel_travel' | 'travel';
  actionLabel: string;
  quoteLabel: string;
  disabled: boolean;
  disabledReason: string | null;
  reason: string | null;
  routeLine: V3[];
}

export interface GamePlayerMarker {
  id: 'player';
  protagonistId: ProtagonistId;
  name: string;
  locationId: string;
  districtId: MapDistrictId | null;
  position: V3 | null;
}

export interface GamePerson {
  id: string;
  personId: string;
  contactId: string;
  name: string;
  portraitId: CharacterPortraitId;
  protagonistId?: ProtagonistId;
  districtId: MapDistrictId;
  position: V3;
  source: 'protagonist' | 'scene';
}

export interface GameMapContext {
  clockLabel: string;
  dayLabel: string;
  clock: {
    day: number;
    hour: number;
    minute: number;
    minutesOfDay: number;
    label: string;
    dayLabel: string;
  };
  protagonist: { id: ProtagonistId; name: string };
  currentLocation: {
    id: string;
    name: string;
    districtId: MapDistrictId | null;
    position: V3 | null;
    mapping: GameMapMapping;
  };
  currentDistrictId: MapDistrictId | null;
  player: GamePlayerMarker;
  districts: GameDistrict[];
  destinations: GameDestination[];
  people: GamePerson[];
  novelMode: boolean;
  busy: boolean;
  inInterior: boolean;
  requiresTransitReturn: boolean;
  international: boolean;
  notice: string;
}
