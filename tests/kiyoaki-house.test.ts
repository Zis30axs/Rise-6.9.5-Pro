import { describe, expect, it } from 'vitest';
import { getCampusInterior } from '../src/runtime/campus-interiors';
import { novelDestinations } from '../src/runtime/model';
import { getAdjacentLocations } from '../src/runtime/location-links';
import { protagonistHomeRooms } from '../src/runtime/natural-interactions';
import { selectTravelVehicle } from '../src/runtime/transit';
import { districtBounds, locationDistrict } from '../src/frontend/map-districts';
import bangDreamWorldbook from '../src/worldbook/bang-dream-canon.json';
import coreWorldbook from '../src/worldbook/core.json';
import sakikoDowntownWorldbook from '../src/worldbook/sakiko-downtown.json';

describe('清告家：祥子的第二住所', () => {
  it('registers kiyoaki-house as a downtown interior inside the district bounds', () => {
    const room = getCampusInterior('kiyoaki-house')!;
    expect(room).toBeDefined();
    expect(room.label).toBe('清告家');
    expect(room.parentLocationId).toBe('downtown');
    expect(locationDistrict('kiyoaki-house')).toBe('downtown');
    const bounds = districtBounds('downtown');
    expect(room.entrance.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(room.entrance.x).toBeLessThanOrEqual(bounds.maxX);
    expect(room.entrance.z).toBeGreaterThanOrEqual(bounds.minZ);
    expect(room.entrance.z).toBeLessThanOrEqual(bounds.maxZ);
    expect(room.interactions.some(item => item.id === 'kiyoaki-sofa-rest')).toBe(true);
  });

  it('is a travel destination reachable from downtown, while home still defaults to the mansion', () => {
    expect(novelDestinations.some(place => place.id === 'kiyoaki-house')).toBe(true);
    const adjacent = getAdjacentLocations({ locationId: 'downtown', interior: null });
    expect(adjacent.find(place => place.id === 'kiyoaki-house')?.kind).toBe('enter');
    expect(protagonistHomeRooms.sakiko).toBe('toyokawa-house');
    expect(selectTravelVehicle('kiyoaki-house', 'campus')).toBe('zbd04a');
  });

  it('is written into the worldbook as a provisional second home, not a replacement residence', () => {
    const sakiko = bangDreamWorldbook.entries.find(entry => entry.name === '丰川祥子')!;
    expect(sakiko.content).toContain('2025年8月之前已搬回位于目白台的丰川宅邸居住');
    expect(sakiko.content).toContain('父亲丰川清告并未随她搬回');
    expect(sakiko.content).toContain('清告家，具体住址暂定');
    expect(sakiko.content).toContain('可自由往来丰川宅邸与清告家两地');
    expect(sakiko.content).toContain('清告目前是否还在酗酒、靠什么生活尚未设定');
    const antiOmniscience = coreWorldbook.entries.find(entry => entry.name.includes('视角边界'))!;
    expect(antiOmniscience.content).toContain('清告家及艾玛与雪的合租屋都是私人住宅');
    const downtown = sakikoDowntownWorldbook.entries.find(entry => entry.name.includes('目白台'))!;
    expect(downtown.content).toContain('清告家');
    expect(downtown.keys).toContain('清告家');
  });
});
