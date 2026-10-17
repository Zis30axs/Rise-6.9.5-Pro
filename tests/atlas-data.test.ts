import { describe, expect, it } from 'vitest';
import type { FeatureCollection, Geometry } from 'geojson';
import { geoContains } from 'd3-geo';
import { borderGeometry, featureBounds, landGeometry, polygons, type AtlasFeature, type AtlasProperties } from '../src/frontend/atlas-geometry';
import atlasText from '../src/frontend/atlas-data.json?raw';

const atlas = JSON.parse(atlasText) as {
  countries: FeatureCollection<Geometry, AtlasProperties>;
  subdivisions: FeatureCollection<Geometry, AtlasProperties>;
  chinaCities: FeatureCollection<Geometry, AtlasProperties>;
  chinaMaritimeLines: FeatureCollection<Geometry, AtlasProperties>;
  metadata: { totalCountries: number; subdivisionCount: number; countriesWithoutSubdivisions: { id: string }[] };
};

describe('embedded global atlas', () => {
  it('retains worldwide administrative coverage with unique IDs and valid parent references', () => {
    const countries = new Set(atlas.countries.features.map(feature => feature.properties.id));
    const subdivisions = new Set(atlas.subdivisions.features.map(feature => feature.properties.id));
    expect(countries.size).toBe(atlas.countries.features.length);
    expect(subdivisions.size).toBe(atlas.subdivisions.features.length);
    expect(countries.size).toBe(atlas.metadata.totalCountries);
    expect(subdivisions.size).toBe(atlas.metadata.subdivisionCount);
    expect(countries.size).toBeGreaterThan(200);
    expect(subdivisions.size).toBeGreaterThan(4000);
    const parentCounts = new Map<string, number>();
    for (const feature of atlas.subdivisions.features) {
      const parent = feature.properties.countryId;
      expect(parent, feature.properties.id).toBeTruthy();
      expect(countries.has(parent!), feature.properties.id).toBe(true);
      parentCounts.set(parent!, (parentCounts.get(parent!) ?? 0) + 1);
    }
    for (const id of ['CHN', 'USA', 'FRA', 'DEU', 'BRA', 'ZAF', 'IND', 'JPN', 'AUS', 'SUN']) expect(parentCounts.get(id), id).toBeGreaterThan(1);
    expect(parentCounts.get('CHN')).toBe(34);
    expect(atlas.subdivisions.features.find(feature => feature.properties.id === '330000')?.properties).toMatchObject({ name: '浙江省', countryId: 'CHN' });
    for (const id of ['TWN', 'TW', 'HKG', 'MAC']) expect(countries.has(id), id).toBe(false);
    const china = atlas.countries.features.find(feature => feature.properties.id === 'CHN')!;
    expect(geoContains(china, [121.5654, 25.0330])).toBe(true);
    for (const point of [[121.5654, 25.0330], [120.3, 22.63], [93, 28]] as [number, number][]) {
      expect(atlas.countries.features.filter(feature => geoContains(feature, point)).map(feature => feature.properties.id), `${point}`).toEqual(['CHN']);
      const covering = atlas.subdivisions.features.filter(feature => geoContains(feature, point));
      expect(covering.length, `${point}`).toBeGreaterThan(0);
      expect(covering.every(feature => feature.properties.countryId === 'CHN'), `${point}`).toBe(true);
    }
    expect(atlas.subdivisions.features.find(feature => feature.properties.id === '710000')?.properties).toMatchObject({ name: '台湾省', countryId: 'CHN' });
    expect([...countries].filter(id => !parentCounts.has(id)).sort()).toEqual(atlas.metadata.countriesWithoutSubdivisions.map(item => item.id).sort());
  });

  it('keeps the fictional union as one country and preserves the fifteen republics administrative records', () => {
    const former = ['RUS', 'UKR', 'BLR', 'MDA', 'EST', 'LVA', 'LTU', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK'];
    expect(atlas.countries.features.filter(feature => feature.properties.id === 'SUN')).toHaveLength(1);
    expect(atlas.countries.features.filter(feature => former.includes(feature.properties.id))).toHaveLength(0);
    const union = atlas.subdivisions.features.filter(feature => feature.properties.countryId === 'SUN');
    expect(union.length).toBeGreaterThan(400);
    expect([...new Set(union.map(feature => feature.properties.sourceCountryId))].sort()).toEqual(former.sort());
    expect(atlas.subdivisions.features.filter(feature => former.includes(feature.properties.countryId ?? ''))).toHaveLength(0);
  });

  it('merges Kosovo into Serbia consistently in country geometry and subdivision ownership', () => {
    expect(atlas.countries.features.filter(feature => ['KOS', 'XKX'].includes(feature.properties.id))).toHaveLength(0);
    const serbia = atlas.countries.features.find(feature => feature.properties.id === 'SRB')!;
    expect(geoContains(serbia, [21.1662, 42.6629])).toBe(true);
    const kosovoDivisions = atlas.subdivisions.features.filter(feature => feature.properties.id.startsWith('KOS-') || feature.properties.sourceCountryId === 'KOS');
    expect(kosovoDivisions.length).toBeGreaterThan(0);
    expect(kosovoDivisions.every(feature => feature.properties.countryId === 'SRB')).toBe(true);
    expect(kosovoDivisions.find(feature => feature.properties.id === 'KOS-5902')?.properties.name).toBe('普里什蒂纳');
    expect(kosovoDivisions.map(feature => feature.properties.name).join(' ')).not.toMatch(/1963|1968/);
    expect(atlas.subdivisions.features.filter(feature => ['KOS', 'XKX'].includes(feature.properties.countryId ?? ''))).toHaveLength(0);
  });

  it('retains the South China Sea and Taiwan east-side auxiliary segments without treating them as destinations', () => {
    expect(atlas.chinaMaritimeLines.features).toHaveLength(1);
    const feature = atlas.chinaMaritimeLines.features[0];
    expect(feature.properties).toMatchObject({ id: 'CHN-JD', countryId: 'CHN' });
    const parts = polygons(feature);
    expect(parts).toHaveLength(10);
    expect(Math.min(...parts.flat(2).map(point => point[1]))).toBeLessThan(5);
    expect(parts.some(part => part[0].some(([lon, lat]) => lon > 122 && lat > 23))).toBe(true);
    expect([...atlas.countries.features, ...atlas.subdivisions.features].some(item => item.properties.id === 'CHN-JD')).toBe(false);
  });

  it('contains finite closed polygon rings so every packaged region can be projected without invalid coordinates', () => {
    const errors: string[] = [];
    for (const feature of [...atlas.countries.features, ...atlas.subdivisions.features, ...atlas.chinaCities.features, ...atlas.chinaMaritimeLines.features]) {
      const parts = polygons(feature);
      if (!parts.length) errors.push(`${feature.properties.id}: missing polygon`);
      for (const part of parts) for (const ring of part) {
        if (ring.length < 4 || ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) errors.push(`${feature.properties.id}: unclosed ring`);
        if (ring.some(([lon, lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90)) errors.push(`${feature.properties.id}: invalid coordinate`);
        if (new Set(ring.map(point => `${point[0]},${point[1]}`)).size < 3) errors.push(`${feature.properties.id}: collapsed ring`);
      }
      const bounds = featureBounds(feature);
      if (!Object.values(bounds).every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) errors.push(`${feature.properties.id}: invalid focus bounds`);
    }
    expect(errors).toEqual([]);
  });

  it('builds finite terrain meshes and never draws a border segment across the antimeridian', () => {
    for (const id of ['CHN', 'SUN', 'FRA', 'FJI']) {
      const feature = atlas.countries.features.find(item => item.properties.id === id)!;
      const geometry = landGeometry(feature);
      const positions = geometry.getAttribute('position');
      expect(positions.count, id).toBeGreaterThan(3);
      expect(positions.count % 3, id).toBe(0);
      expect(Array.from(positions.array).every(Number.isFinite), id).toBe(true);
      expect(geometry.getAttribute('color').count, id).toBe(positions.count);
      geometry.dispose();
    }
    const seam: AtlasFeature = { type: 'Feature', properties: { id: 'seam-fixture', name: 'seam' }, geometry: { type: 'Polygon', coordinates: [[[179, 10], [-179, 10], [-179, 12], [179, 12], [179, 10]]] } };
    const geometry = borderGeometry(seam);
    const positions = geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index += 2) expect(Math.abs(positions.getX(index) - positions.getX(index + 1))).toBeLessThanOrEqual(180);
    geometry.dispose();
  });
});
