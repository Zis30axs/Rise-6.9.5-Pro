/**
 * Build the offline world / ADM1 atlas. Inputs are cached, trusted public data;
 * output is always the project's atlas-data.json, never an input-provided path.
 * See assets/atlas-sources.md for sources, fictional edits and limitations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import polygonClipping from 'polygon-clipping';
import { geoArea, geoContains } from 'd3-geo';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input || input.startsWith('--')) throw new Error('Usage: node scripts/prepare_atlas_data.mjs <source-directory> [--download]');
const source = path.resolve(input);
const commit = 'ca96624a56bd078437bca8184e78163e5039ad19';
const urls = {
  'countries.json': `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${commit}/geojson/ne_10m_admin_0_countries.geojson`,
  'subdivisions.json': `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${commit}/geojson/ne_10m_admin_1_states_provinces.geojson`,
  'china-full.json': 'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json',
  'china-outline.json': 'https://geo.datav.aliyun.com/areas_v3/bound/100000.json',
};
if (process.argv.includes('--download')) {
  fs.mkdirSync(source, { recursive: true });
  await Promise.all(Object.entries(urls).map(async ([name, url]) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Source request failed: ${response.status} ${name}`);
    const data = await response.text();
    if (data.length > 100_000_000) throw new Error(`Source exceeds expected size: ${name}`);
    const parsed = JSON.parse(data);
    if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) throw new Error(`Invalid source: ${name}`);
    fs.writeFileSync(path.join(source, name), data);
  }));
}
const checksums = {};
const read = name => {
  const text = fs.readFileSync(path.join(source, name), 'utf8');
  checksums[name] = createHash('sha256').update(text).digest('hex');
  const collection = JSON.parse(text);
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error(`Invalid source: ${name}`);
  return collection.features;
};
const rawCountries = read('countries.json');
const rawSubdivisions = read('subdivisions.json');
const rawChina = read('china-full.json');
const rawChinaOutline = read('china-outline.json');
const chinaOutline = rawChinaOutline.find(item => item.properties.adcode === 100000);
const chinaMaritimeSource = rawChina.find(item => item.properties.adchar === 'JD');
if (!chinaOutline || !chinaMaritimeSource) throw new Error('Expected the complete DataV China outline and JD maritime auxiliary feature.');
const previous = JSON.parse(fs.readFileSync(path.join(root, 'src/frontend/map-data.json'), 'utf8'));
if (previous.china?.features.length !== 34 || previous.zhejiang?.features.length !== 11) throw new Error('Expected the existing 34 Chinese province shapes and 11 Zhejiang city shapes.');

const republics = new Set(['RUS', 'UKR', 'BLR', 'MDA', 'EST', 'LVA', 'LTU', 'GEO', 'ARM', 'AZE', 'KAZ', 'UZB', 'TKM', 'KGZ', 'TJK']);
const chinaParts = new Set(['CHN', 'TWN', 'HKG', 'MAC', 'PGA', 'SCR']);
const officialPresentationMerges = {
  KOS: 'SRB', XKX: 'SRB', SOL: 'SOM', CYN: 'CYP', CNM: 'CYP', USG: 'CUB',
};
const officialPresentationSources = {
  SRB: 'https://www.fmprc.gov.cn/web/zyxw/202605/t20260525_11917435.shtml',
  SOM: 'https://www.fmprc.gov.cn/wjbzhd/202601/t20260112_11811361.shtml',
  CYP: 'https://www.fmprc.gov.cn/ziliao_674904/zt_674979/dnzt_674981/qtzt/gytwwtdlc/zwgzs/202208/t20220805_10734887.shtml',
  CUB: 'https://www.fmprc.gov.cn/web/gjhdq_676201/gj_676203/bmz_679954/1206_680302/1206x2_680322/202401/t20240125_11232992.shtml',
};
const asMulti = shape => shape.type === 'MultiPolygon' ? shape.coordinates : [shape.coordinates];
const validId = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const countryAliases = new Map(rawCountries.map(item => [item.properties.ADM0_A3, validId(item.properties.ISO_A3_EH) ? item.properties.ISO_A3_EH : item.properties.ADM0_A3]));
const fictionalId = id => republics.has(id) ? 'SUN' : chinaParts.has(id) ? 'CHN' : officialPresentationMerges[id] || id;
const feature = (shape, properties) => ({ type: 'Feature', properties, geometry: shape });
const collection = features => ({ type: 'FeatureCollection', features });

// Ring-aware Douglas-Peucker simplification: preserve every polygon, even tiny
// island countries, and fall back to full ring precision if rounding collapses it.
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
const squareDistance = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
function segmentDistance(point, start, end) {
  const length = squareDistance(start, end);
  const t = length ? Math.max(0, Math.min(1, ((point[0] - start[0]) * (end[0] - start[0]) + (point[1] - start[1]) * (end[1] - start[1])) / length)) : 0;
  return squareDistance(point, [start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])]);
}
function simplifyOpen(points, tolerance) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maximum = tolerance * tolerance;
    let farthest = -1;
    for (let index = first + 1; index < last; index++) {
      const distance = segmentDistance(points[index], points[first], points[last]);
      if (distance > maximum) { maximum = distance; farthest = index; }
    }
    if (farthest !== -1) { keep[farthest] = 1; stack.push([first, farthest], [farthest, last]); }
  }
  return points.filter((_, index) => keep[index]);
}
function normalizeRing(input, outer, tolerance, precision = 1000) {
  let values = input.map(point => {
    if (!Array.isArray(point) || point.length < 2 || !point.slice(0, 2).every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error('Invalid geographic coordinate');
    return point.slice(0, 2);
  }).filter((point, index, points) => !index || !samePoint(point, points[index - 1]));
  if (samePoint(values[0], values.at(-1))) values.pop();
  if (values.length < 3) throw new Error('Source contains a collapsed polygon');
  const bounds = values.reduce((box, point) => [Math.min(box[0], point[0]), Math.min(box[1], point[1]), Math.max(box[2], point[0]), Math.max(box[3], point[1])], [180, 90, -180, -90]);
  const smallerSpan = Math.min(bounds[2] - bounds[0], bounds[3] - bounds[1]);
  tolerance = Math.min(tolerance, Math.max(1e-9, smallerSpan * .1));
  let farthest = 1;
  for (let index = 2; index < values.length; index++) if (squareDistance(values[0], values[index]) > squareDistance(values[0], values[farthest])) farthest = index;
  const simplifyClosed = epsilon => [
    ...simplifyOpen(values.slice(0, farthest + 1), epsilon).slice(0, -1),
    ...simplifyOpen([...values.slice(farthest), values[0]], epsilon).slice(0, -1),
  ];
  let simplified = simplifyClosed(tolerance);
  // A large tolerance must not replace a small island with a line, nor force its
  // entire high-resolution shoreline into the bundle. Reduce tolerance locally.
  for (let epsilon = tolerance / 4; simplified.length < 3 && epsilon > 1e-9; epsilon /= 4) simplified = simplifyClosed(epsilon);
  if (simplified.length >= 3) values = simplified;
  const rounded = precision => values.map(point => point.map(value => Math.round(value * precision) / precision)).filter((point, index, points) => !index || !samePoint(point, points[index - 1]));
  const signedArea = points => points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + point[0] * next[1] - next[0] * point[1];
  }, 0);
  const collapsed = points => new Set(points.map(point => point.join(','))).size < 3 || Math.abs(signedArea(points)) < 1e-12;
  let result = precision ? rounded(precision) : values.map(point => [...point]);
  if (collapsed(result)) result = rounded(1_000_000);
  if (collapsed(result)) result = values;
  if (!samePoint(result[0], result.at(-1))) result.push([...result[0]]);
  const signed = signedArea(result);
  // d3-geo expects clockwise outer rings for polygons smaller than a hemisphere.
  if ((outer && signed > 0) || (!outer && signed < 0)) result.reverse();
  return result;
}
const normalizePolygon = (rings, tolerance, precision) => rings.map((ring, index) => normalizeRing(ring, index === 0, tolerance, precision));
function geometry(shape, tolerance = .03, precision = 1000) {
  if (shape?.type === 'Polygon') return { type: 'Polygon', coordinates: normalizePolygon(shape.coordinates, tolerance, precision) };
  if (shape?.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: shape.coordinates.map(rings => normalizePolygon(rings, tolerance, precision)) };
  throw new Error(`Unsupported source geometry: ${shape?.type}`);
}

const countries = [];
const countryGroups = new Map();
const foundRepublics = new Set();
for (const item of rawCountries) {
  const id = countryAliases.get(item.properties.ADM0_A3);
  if (id === 'ATA') continue;
  if (republics.has(id)) foundRepublics.add(id);
  const target = fictionalId(id);
  const group = countryGroups.get(target) || [];
  group.push(item);
  countryGroups.set(target, group);
}
if (foundRepublics.size !== 15 || countryGroups.get('CHN')?.length !== 6) throw new Error('Expected all fifteen republics and six China source shapes.');
for (const [id, group] of countryGroups) {
  // Union before simplification also groups small source territories sharing an
  // ISO code (e.g. Clipperton/FRA), avoiding duplicated identifiers and countries.
  const shape = id === 'CHN' ? chinaOutline.geometry : group.length === 1 ? group[0].geometry : { type: 'MultiPolygon', coordinates: polygonClipping.union(...group.map(item => asMulti(item.geometry))) };
  const primary = group.find(item => item.properties.ADM0_A3 === id) || group[0];
  const name = id === 'SUN' ? '苏维埃社会主义共和国联盟' : id === 'CHN' ? '中国' : id === 'KAS' ? '克什米尔争议地区（锡亚琴冰川）' : primary.properties.NAME_ZH || primary.properties.NAME_EN || primary.properties.NAME;
  countries.push(feature(geometry(shape), { id, name }));
}
const china = countries.find(item => item.properties.id === 'CHN');
const planarRingArea = ring => Math.abs(ring.reduce((total, point, index) => {
  const next = ring[(index + 1) % ring.length];
  return total + point[0] * next[1] - next[0] * point[1];
}, 0)) / 2;
const planarPolygonArea = rings => planarRingArea(rings[0]) - rings.slice(1).reduce((area, ring) => area + planarRingArea(ring), 0);
const polygonBounds = polygon => polygon[0].reduce((box, point) => [Math.min(box[0], point[0]), Math.min(box[1], point[1]), Math.max(box[2], point[0]), Math.max(box[3], point[1])], [180, 90, -180, -90]);
const boundsIntersect = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const chinaPieces = asMulti(china.geometry).map(polygon => ({ polygon, bounds: polygonBounds(polygon) }));
const chinaOverlapClipping = { countryIds: [], subdivisionIds: [], excludedSubdivisionIds: [], originalPartCount: 0, resultPartCount: 0, removedPlanarAreaDegreesSquared: 0, discardedNumericalFragments: 0 };
function clipOutsideChina(shape, id, level) {
  let changed = false;
  const output = [];
  for (const polygon of asMulti(shape)) {
    const bounds = polygonBounds(polygon);
    const candidates = chinaPieces.filter(piece => boundsIntersect(bounds, piece.bounds)).map(piece => piece.polygon);
    if (!candidates.length) { output.push(polygon); continue; }
    const intersection = polygonClipping.intersection([polygon], candidates);
    const overlapArea = intersection.reduce((area, part) => area + planarPolygonArea(part), 0);
    if (overlapArea <= 1e-10) { output.push(polygon); continue; }
    changed = true;
    chinaOverlapClipping.removedPlanarAreaDegreesSquared += overlapArea;
    const remaining = polygonClipping.difference([polygon], candidates);
    chinaOverlapClipping.originalPartCount++;
    for (const part of remaining) {
      // Discard only new sub-metre clipping noise, never original island parts.
      if (planarPolygonArea(part) <= 1e-10) { chinaOverlapClipping.discardedNumericalFragments++; continue; }
      output.push(part);
      chinaOverlapClipping.resultPartCount++;
    }
  }
  if (!changed) return shape;
  chinaOverlapClipping[level === 'country' ? 'countryIds' : 'subdivisionIds'].push(id);
  if (!output.length) return null;
  // Preserve calculated intersection coordinates. Any re-rounding can put a
  // thin strip back on the Chinese side of the same boundary.
  return geometry({ type: 'MultiPolygon', coordinates: output }, 0, 0);
}
for (const item of countries) {
  if (item.properties.id === 'CHN') continue;
  const clipped = clipOutsideChina(item.geometry, item.properties.id, 'country');
  if (!clipped) throw new Error(`Whole country unexpectedly inside China outline: ${item.properties.id}`);
  item.geometry = clipped;
}
countries.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
const countryIds = new Set(countries.map(item => item.properties.id));
if (countryIds.size !== countries.length) throw new Error('Duplicate country identifiers');
if (Object.keys(officialPresentationMerges).some(id => countryIds.has(id))) throw new Error('A region merged by the configured presentation remains a selectable country');
const missingCountryReferences = [];
const subdivisions = [];
// These source translations refer to different entities or administrative levels.
// Use the municipality's primary name (also corroborated by gn_name/woe_name)
// when Natural Earth's translated name cannot safely identify the same feature.
const subdivisionNameOverrides = {
  'KOS-5902': '普里什蒂纳',
  'KOS-5908': 'Prizren',
  'KOS-5907': 'Kosovska Kamenica',
  'KOS-5894': 'Kosovska Mitrovica',
};
for (const item of rawSubdivisions) {
  const original = countryAliases.get(item.properties.adm0_a3) || item.properties.adm0_a3;
  if (chinaParts.has(original) || original === 'ATA') continue;
  const countryId = fictionalId(original);
  if (!countryIds.has(countryId)) { missingCountryReferences.push({ id: item.properties.adm1_code, sourceCountryId: original }); continue; }
  const properties = {
    id: String(item.properties.adm1_code),
    name: subdivisionNameOverrides[item.properties.adm1_code] || (original === 'KAS' ? '克什米尔争议地区（锡亚琴冰川）' : String(item.properties.name_zh || item.properties.name_en || item.properties.name || item.properties.adm1_code)),
    countryId,
  };
  if (original !== countryId) properties.sourceCountryId = original;
  const clipped = clipOutsideChina(geometry(item.geometry, .02), properties.id, 'subdivision');
  if (clipped) subdivisions.push(feature(clipped, properties));
  else chinaOverlapClipping.excludedSubdivisionIds.push(properties.id);
}
for (const item of previous.china.features) subdivisions.push(feature(item.geometry, { id: String(item.properties.id), name: item.properties.name, countryId: 'CHN' }));
subdivisions.sort((a, b) => a.properties.countryId.localeCompare(b.properties.countryId) || a.properties.id.localeCompare(b.properties.id));
if (new Set(subdivisions.map(item => item.properties.id)).size !== subdivisions.length) throw new Error('Duplicate subdivision identifiers');
const chinaCities = previous.zhejiang.features.map(item => feature(item.geometry, { id: String(item.properties.id), name: item.properties.name, countryId: 'CHN', parentId: '330000' }));
const chinaMaritimeLines = [feature(geometry(chinaMaritimeSource.geometry, 0, 100_000_000), {
  id: 'CHN-JD', name: '南海及台湾东侧断续线', countryId: 'CHN', kind: 'maritime-boundary', sourceId: '100000_JD',
})];
const taiwan = subdivisions.find(item => item.properties.id === '710000');
if (countries.some(item => chinaParts.has(item.properties.id) && item.properties.id !== 'CHN') || !taiwan || taiwan.properties.countryId !== 'CHN') throw new Error('China regions must not be emitted as independent selectable countries.');
// Coordinate probes are validation only; no geometry is invented from them.
if (!geoContains(china, [121.5, 25.03]) || !geoContains(china, [120.3, 22.63])) throw new Error('China outline must contain the Taiwan validation points.');
if (asMulti(chinaMaritimeLines[0].geometry).length !== 10) throw new Error('Expected all ten maritime segments from the source, including the Taiwan east-coast segment.');
let validatedPolygonCount = 0;
for (const item of [...countries, ...subdivisions, ...chinaCities, ...chinaMaritimeLines]) {
  for (const coordinates of asMulti(item.geometry)) {
    const area = geoArea({ type: 'Polygon', coordinates });
    if (!Number.isFinite(area) || area <= 0 || area >= Math.PI * 2) throw new Error(`Invalid d3-geo polygon orientation/area: ${item.properties.id}`);
    validatedPolygonCount++;
  }
}
const countsByCountry = Object.fromEntries(countries.map(item => [item.properties.id, 0]));
for (const item of subdivisions) countsByCountry[item.properties.countryId]++;
const without = countries.filter(item => !countsByCountry[item.properties.id]).map(item => ({ id: item.properties.id, name: item.properties.name }));
const oneRegion = countries.filter(item => countsByCountry[item.properties.id] === 1).map(item => item.properties.id);
const specialIds = rawCountries.filter(item => !validId(item.properties.ISO_A3_EH)).filter(item => countryIds.has(item.properties.ADM0_A3)).map(item => ({ id: item.properties.ADM0_A3, name: countries.find(country => country.properties.id === item.properties.ADM0_A3).properties.name }));
const metadata = {
  schemaVersion: 1,
  checkedOn: '2026-10-17',
  naturalEarthCommit: commit,
  sourceUrls: urls,
  sourceSha256: checksums,
  sourceCountryFeatureCount: rawCountries.length,
  sourceSubdivisionFeatureCount: rawSubdivisions.length,
  totalCountries: countries.length,
  subdivisionCount: subdivisions.length,
  countriesWithSubdivisions: countries.length - without.length,
  countriesWithoutSubdivisions: without,
  countriesWithSingleSubdivision: oneRegion,
  subdivisionCountsByCountry: countsByCountry,
  chinaProvinceCount: 34,
  chinaCityCount: chinaCities.length,
  chinaMaritimeFeatureCount: chinaMaritimeLines.length,
  chinaMaritimeSegmentCount: asMulti(chinaMaritimeLines[0].geometry).length,
  chinaPresentation: { countryId: 'CHN', taiwanSubdivisionId: '710000', taiwanCountryId: 'CHN', outlineSource: urls['china-outline.json'], maritimeSource: urls['china-full.json'], maritimeSourceId: '100000_JD', maritimeGeometryType: 'MultiPolygon', taiwanPointChecksPassed: true },
  chinaOverlapClipping,
  officialPresentation: { mergeMap: officialPresentationMerges, sources: officialPresentationSources, standardMapReference: 'https://bzdt.tianditu.gov.cn/', contentSpecification: 'https://www.mfa.gov.cn/web/wjb_673085/zzjg_673183/bjhysws_674671/bhflfg/dtdmxgfl/202303/P020230313585504979937.pdf', unresolvedRegionIds: ['KAS', 'ESH', 'SPI', 'BRT', 'BJN', 'SER'], note: '按用户指定呈现及已核对的中方官方说明归并；来源未明确归属的地区不擅自归并，Natural Earth的CN字段不等同于中国官方标准地图审核。' },
  validatedPolygonCount,
  cityCoverageProvinceIds: ['330000'],
  fictionalUnion: { id: 'SUN', sourceCountryIds: [...republics], subdivisionCount: countsByCountry.SUN },
  specialCountryIds: specialIds,
  mergedSourceCountryIds: Object.fromEntries([...countryGroups].filter(([, group]) => group.length > 1).map(([id, group]) => [id, group.map(item => item.properties.ADM0_A3)])),
  missingCountryReferences,
  simplification: { countryToleranceDegrees: .03, subdivisionToleranceDegrees: .02, smallRingToleranceFraction: .1, coordinateDecimalPlaces: 3, tinyRingFallbackDecimalPlaces: 6, preserveAllPolygonParts: true },
  limitations: [
    '国家集合包含 Natural Earth 国家、属地及特殊制图区域；条目数不是现实主权国家数量。',
    '使用 Natural Earth 10m 全球 ADM1，而非 50m/110m 的美国、加拿大子集；源数据是制图概括，不是实时行政区登记。',
    '未删去小岛或小国家；缩小尺度时仍可能小于屏幕像素，需搜索、列表或标记点访问。',
    '没有 ADM1 的国家记录在 countriesWithoutSubdivisions；只有一个区域的记录不表示存在有意义的内部分区。',
    '原十五个加盟共和国合并为架空 SUN；其一级区划保留 sourceCountryId，不作为独立国家重复显示。',
    '中国外框采用 DataV 完整中国边界，内含台湾及南海诸岛；省级沿用既有 DataV 34 省，台湾为710000/CHN，不独立列为国家。',
    'Natural Earth 外国国家与一级区划几何减去完整CHN范围，避免不同图源重叠时中国区域被外国图块覆盖或点选；变更及完全被排除的源区划在chinaOverlapClipping记录。',
    '南海断续线来自 DataV 无名辅助要素100000_JD，含南海九段及台湾东侧一段，按原始狭长多面几何单独渲染，不当作省份或国家。',
    'Natural Earth 的CHN/TWN/HKG/MAC/PGA/SCR在本项目中国地图呈现中归入CHN；保留来源映射仅供溯源，不构成独立搜索国家。',
    '依据已核对中方官方说明，科索沃归入塞尔维亚、索马里兰归入索马里、北塞及联合国缓冲区归入塞浦路斯、关塔那摩基地归入古巴，一级区划引用同步调整。',
    '克什米尔等未核实最终归属的特殊地区保留地区表达；不把Natural Earth的CN属性自动当成中国官方认可，未宣称全球每条边界通过官方标准地图核验。',
    '仅浙江有地级城市轮廓；其他省份和各国没有附加城市、道路、出行或剧情数据。',
    '坐标简化用于手机交互与单 PNG，细小相邻边界可能出现亚像素缝隙；不是测绘、导航或外交边界依据。',
  ],
};
if (missingCountryReferences.length) throw new Error('ADM1 references absent country shapes: ' + JSON.stringify(missingCountryReferences));
const output = path.join(root, 'src/frontend/atlas-data.json');
fs.writeFileSync(output, JSON.stringify({ countries: collection(countries), subdivisions: collection(subdivisions), chinaCities: collection(chinaCities), chinaMaritimeLines: collection(chinaMaritimeLines), metadata }) + '\n');
console.log(JSON.stringify({ bytes: fs.statSync(output).size, countries: countries.length, subdivisions: subdivisions.length, countriesWithSubdivisions: metadata.countriesWithSubdivisions, countriesWithoutSubdivisions: without, chinaProvinces: 34, chinaCities: chinaCities.length, unionSubdivisions: countsByCountry.SUN, specialIds }, null, 2));
