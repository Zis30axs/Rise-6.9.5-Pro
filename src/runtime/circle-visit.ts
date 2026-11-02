import type { WorldState } from '../frontend/types';
import {
  CIRCLE_LOCATION_ID, CIRCLE_STAFF_NAME, CIRCLE_STUDIO_ROOM_ID, circleBorrowedPrice,
} from './circle-venue';
import { prepareLivehouseService, type LivehouseServiceFacts } from './livehouse-visit';

/** Shifts the shared bill generator so CiRCLE does not copy RiNG's lineup. */
export const CIRCLE_BILL_SHIFT = 3;

export function isCircleVisitService(serviceId: string): boolean {
  return serviceId.startsWith('circle-watch-') || serviceId.startsWith('circle-practice-');
}

export function atCirclePerformance(state: Pick<WorldState, 'locationId' | 'interior'>): boolean {
  return state.locationId === CIRCLE_LOCATION_ID || state.locationId === CIRCLE_STUDIO_ROOM_ID
    || state.interior?.roomId === CIRCLE_STUDIO_ROOM_ID;
}

/** Same ticket and rental settlement as the existing live house, with this venue's price and bill. */
export function prepareCircleVisitService(state: WorldState, serviceId: string, authority?: WorldState): {
  service: import('./location-services').LocationService;
  blockedReason: string | null;
  blockedCode: import('./livehouse-visit').LivehouseBlockedCode | null;
  facts: LivehouseServiceFacts;
} | null {
  if (!isCircleVisitService(serviceId)) return null;
  const liveId = serviceId.replace('circle-', 'livehouse-');
  const prepared = prepareLivehouseService(state, liveId, authority, {
    here: atCirclePerformance,
    billDay: state.clock.day + CIRCLE_BILL_SHIFT,
    showIdFor: (day, key) => `circle-d${day}-${key}`,
    priceFor: circleBorrowedPrice,
    locationIds: [CIRCLE_LOCATION_ID, CIRCLE_STUDIO_ROOM_ID],
    serviceId,
    omitDutyNote: true,
  });
  if (!prepared) return null;
  return {
    ...prepared,
    facts: { ...prepared.facts, summary: `${prepared.facts.summary}店员${CIRCLE_STAFF_NAME}在咖啡厅。` },
  };
}
