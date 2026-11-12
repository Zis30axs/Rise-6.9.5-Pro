#!/usr/bin/env python3
"""Procedurally build the California state-scale 3D sandbox.

Writes two files, both derived from the single PLACES table below:
  assets/models/unread-city-california-sandbox.glb
  assets/models/unread-city-california-sandbox-data.json

The model is a stylized state-scale diorama, NOT city density: a terrain mesh
(Sierra Nevada high in the east, Central Valley low in the middle, Coast
Ranges, Mojave/Death Valley desert in the southeast, Pacific on the west),
denser city blocks with downtown clusters for each place, a plaza disc per
place, and four recognizable landmark structures (Golden Gate Bridge,
Hollywood Sign, Transamerica Pyramid, Griffith Observatory). Travel
routes are NOT baked into the GLB; they live in the data JSON ("routes") and
are drawn by the scene at runtime so the selected route can be highlighted.

Coordinate frame (same convention as the Tokyo sandbox: x east, z south, y up):
  x = (lon - LON0) * K_LON
  z = (LAT0 - lat) * K_LAT
  LON0 = -119.25, LAT0 = 37.25, K_LAT = 480 / 9.5, K_LON = K_LAT * (km per
  degree lon / km per degree lat at 37.25 deg) so shapes are undistorted.
  Model plane: x in [-210, 210], z in [-240, 240]; 1 unit is about 2.2 km.

Deterministic: no wall-clock, no salted hash, no randomness. Re-running the
script reproduces the same GLB bytes (the data JSON carries an exportedAt
stamp only; the GLB has no timestamps).
"""

from __future__ import annotations

import hashlib
import json
import math
import struct
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_GLB = ROOT / "assets" / "models" / "unread-city-california-sandbox.glb"
OUT_DATA = ROOT / "assets" / "models" / "unread-city-california-sandbox-data.json"

# ---------------------------------------------------------------------------
# Projection
# ---------------------------------------------------------------------------

LON0 = -119.25
LAT0 = 37.25
K_LAT = 480.0 / 9.5            # model units per degree of latitude
K_LON = K_LAT * 0.7984         # aspect-corrected units per degree of longitude
X_MIN, X_MAX = -210.0, 210.0
Z_MIN, Z_MAX = -240.0, 240.0


def project(lat: float, lon: float) -> tuple[float, float]:
    """lat/lon -> model (x, z). North is -z, east is +x."""
    return ((lon - LON0) * K_LON, (LAT0 - lat) * K_LAT)


def unproject(x: float, z: float) -> tuple[float, float]:
    return (LAT0 - z / K_LAT, LON0 + x / K_LON)


# ---------------------------------------------------------------------------
# Places (single source of truth for geometry; ids/names/descriptions must
# match src/runtime/california.ts `californiaPlaces` — tests enforce this)
# ---------------------------------------------------------------------------

# district, lat, lon per place; descriptions/services are authored below.
PLACE_GEO: dict[str, tuple[str, float, float]] = {
    # id: (district, lat, lon)
    "sfo-airport": ("bay-area", 37.6213, -122.3790),
    "california-openai": ("bay-area", 37.7680, -122.3900),
    "california-anthropic": ("bay-area", 37.7890, -122.4030),
    "california-market": ("bay-area", 37.7749, -122.4194),
    "california-eureka": ("north-coast", 40.8021, -124.1637),
    "california-redding": ("sacramento-valley", 40.5865, -122.3917),
    "california-sacramento": ("sacramento-valley", 38.5816, -121.4944),
    "california-yosemite": ("sierra-nevada", 37.7459, -119.5936),
    "california-fresno": ("central-valley", 36.7378, -119.7871),
    "california-monterey": ("central-coast", 36.6002, -121.8947),
    "california-los-angeles": ("southern-california", 34.0522, -118.2437),
    "california-death-valley": ("desert", 36.4628, -116.8668),
    "california-san-diego": ("southern-california", 32.7157, -117.1611),
}

# (name, subtitle, description) — must match src/runtime/california.ts.
PLACE_TEXT: dict[str, tuple[str, str, str]] = {
    "sfo-airport": ("旧金山国际机场", "加州 · 入境大厅",
                    "旧金山湾区的国际航空门户，可以搭乘机场接驳车前往市区，也可以购票返回东京。"),
    "california-openai": ("OpenAI 办公地点", "加州 · 旧金山",
                          "OpenAI 访客大厅设有专门的登记柜台，开放时可申请领取 Pro200 收藏券。"),
    "california-anthropic": ("Anthropic 访客中心", "加州 · 旧金山",
                             "湾区另一家 AI 公司，设有安静的访客大厅与研究展示区。神秘研究者偶尔会在附近出现。"),
    "california-market": ("湾区二手交易市场", "加州 · 旧金山",
                          "湾区的收藏品交易市场，常有商人收购各式纪念券，其中也包括 Pro200。"),
    "california-sacramento": ("萨克拉门托", "加州 · 州府",
                              "加利福尼亚州首府，萨克拉门托河与美国河交汇处的城市。"),
    "california-eureka": ("尤里卡", "加州 · 北海岸",
                          "北海岸港城，周边分布着古老的海岸红杉森林。"),
    "california-redding": ("雷丁", "加州 · 北部内陆",
                          "北加州内陆交通节点，可前往沙斯塔山与湖区。"),
    "california-yosemite": ("优胜美地国家公园", "加州 · 内华达山脉",
                            "花岗岩峭壁、瀑布与高山森林构成的国家公园。"),
    "california-fresno": ("弗雷斯诺", "加州 · 中央谷地",
                          "中央谷地城市，通往优胜美地与塞拉山脉南段。"),
    "california-monterey": ("蒙特雷", "加州 · 中央海岸",
                            "太平洋海湾城市，以海岸线、渔港与水族馆闻名。"),
    "california-los-angeles": ("洛杉矶", "加州 · 南部都会区",
                               "南加州大型都会区，连接海岸、影视工业与山地社区。"),
    "california-death-valley": ("死亡谷国家公园", "加州 · 莫哈韦沙漠",
                                "极端干旱的沙漠盆地、盐滩与荒漠山脉。"),
    "california-san-diego": ("圣迭戈", "加州 · 南部海岸",
                             "南加州海滨城市，靠近美墨边境。"),
}

# Services mirror the Tokyo data JSON shape:
# {id, label, minutes, price, result, energyDelta, moraleDelta, stressDelta}.
# The two real interactions reuse the runtime service ids (see
# src/runtime/california.ts: PRO200_CLAIM_SERVICE_ID / PRO200_RESELL_SERVICE_ID).
PLACE_SERVICES: dict[str, list[dict]] = {
    "sfo-airport": [
        {"id": "sfo-spotting", "label": "在观景台看飞机起降", "minutes": 30, "price": 0,
         "result": "在观景台看了一会儿飞机起降，湾区的海风吹走了旅途的疲惫。",
         "energyDelta": -2, "moraleDelta": 6, "stressDelta": -4},
    ],
    "california-openai": [
        {"id": "openai-pro200-claim", "label": "登记领取 Pro200 收藏券", "minutes": 15, "price": 0,
         "result": "在访客大厅的登记柜台领取了一张 Pro200 收藏券。",
         "energyDelta": -1, "moraleDelta": 10, "stressDelta": 0},
    ],
    "california-anthropic": [
        {"id": "anthropic-visit", "label": "参观研究展示区", "minutes": 40, "price": 0,
         "result": "在安静的访客大厅里看了研究展示，顺便在窗边发了一会儿呆。",
         "energyDelta": -3, "moraleDelta": 8, "stressDelta": -5},
    ],
    "california-market": [
        {"id": "pro200-resell", "label": "出售 Pro200 收藏券", "minutes": 10, "price": 0,
         "result": "把一张 Pro200 收藏券卖给了市场里的收藏商。",
         "energyDelta": 0, "moraleDelta": 4, "stressDelta": 0},
    ],
    "california-sacramento": [
        {"id": "sacramento-capitol", "label": "参观州议会大厦", "minutes": 45, "price": 0,
         "result": "在州议会大厦前逛了一圈，两条河交汇处的风很舒服。",
         "energyDelta": -3, "moraleDelta": 7, "stressDelta": -4},
    ],
    "california-eureka": [
        {"id": "eureka-old-town", "label": "漫步老城木板路", "minutes": 40, "price": 0,
         "result": "沿着老城的木板路慢慢走，红杉林的气息从海边飘过来。",
         "energyDelta": -3, "moraleDelta": 7, "stressDelta": -5},
    ],
    "california-redding": [
        {"id": "redding-sundial", "label": "走过日晷桥", "minutes": 35, "price": 0,
         "result": "走过横跨萨克拉门托河的日晷桥，在河边坐了一会儿。",
         "energyDelta": -3, "moraleDelta": 7, "stressDelta": -4},
    ],
    "california-yosemite": [
        {"id": "yosemite-falls", "label": "徒步观赏瀑布", "minutes": 90, "price": 0,
         "result": "沿着山谷步道走到瀑布脚下，花岗岩峭壁在头顶耸立。",
         "energyDelta": -8, "moraleDelta": 14, "stressDelta": -10},
    ],
    "california-fresno": [
        {"id": "fresno-market", "label": "逛农夫市集", "minutes": 40, "price": 0,
         "result": "在农夫市集买了些中央谷地的水果，边走边吃。",
         "energyDelta": -2, "moraleDelta": 8, "stressDelta": -4},
    ],
    "california-monterey": [
        {"id": "monterey-aquarium", "label": "参观水族馆", "minutes": 60, "price": 0,
         "result": "在水族馆看了海獭和水母，出来时正好赶上海边的落日。",
         "energyDelta": -4, "moraleDelta": 12, "stressDelta": -8},
    ],
    "california-los-angeles": [
        {"id": "la-walk", "label": "在星光大道散步", "minutes": 50, "price": 0,
         "result": "沿着星光大道散步，街头艺人和棕榈树一路不断。",
         "energyDelta": -4, "moraleDelta": 9, "stressDelta": -3},
    ],
    "california-death-valley": [
        {"id": "death-valley-sunset", "label": "观赏盐滩日落", "minutes": 45, "price": 0,
         "result": "站在盐滩上看太阳沉进荒漠山脉，整个盆地都变成了金色。",
         "energyDelta": -3, "moraleDelta": 11, "stressDelta": -6},
    ],
    "california-san-diego": [
        {"id": "san-diego-boardwalk", "label": "在海滨步道散步", "minutes": 45, "price": 0,
         "result": "沿着海滨步道慢慢走，海风里带着咸味，港口的船进进出出。",
         "energyDelta": -3, "moraleDelta": 9, "stressDelta": -6},
    ],
}

# Districts (regions). Bounds are lon/lat boxes, projected here.
# color is a decimal RGB int like the Tokyo data file.
DISTRICTS: dict[str, dict] = {
    "bay-area": {"name": "旧金山湾区", "shortName": "湾区",
                 "description": "旧金山湾区的城市群：国际机场、OpenAI 与 Anthropic 的访客大厅、湾区二手交易市场。",
                 "lon": (-122.8, -121.8), "lat": (37.0, 38.3), "color": 0x4B7A8F},
    "north-coast": {"name": "北海岸", "shortName": "北海岸",
                    "description": "加州北海岸：尤里卡港城与海岸红杉森林。",
                    "lon": (-124.4, -122.0), "lat": (38.3, 42.0), "color": 0x4F7A5A},
    "sacramento-valley": {"name": "萨克拉门托谷地", "shortName": "萨克拉门托谷地",
                          "description": "北加州内陆谷地：州府萨克拉门托与通往沙斯塔山的雷丁。",
                          "lon": (-122.5, -121.0), "lat": (38.5, 41.0), "color": 0x8A9A5B},
    "sierra-nevada": {"name": "内华达山脉", "shortName": "内华达山脉",
                      "description": "加州东部的花岗岩山脉：优胜美地国家公园与惠特尼峰。",
                      "lon": (-120.5, -117.8), "lat": (35.5, 39.8), "color": 0x8D7D6B},
    "central-valley": {"name": "中央谷地", "shortName": "中央谷地",
                       "description": "加州中部的农业谷地：弗雷斯诺与通往塞拉山脉南段的路口。",
                       "lon": (-122.0, -119.0), "lat": (35.5, 38.5), "color": 0x9AA45E},
    "central-coast": {"name": "中央海岸", "shortName": "中央海岸",
                      "description": "太平洋中央海岸：蒙特雷海湾、渔港与水族馆。",
                      "lon": (-122.5, -120.0), "lat": (34.5, 37.0), "color": 0x5E8A8A},
    "southern-california": {"name": "南加州", "shortName": "南加州",
                            "description": "南加州都会区：洛杉矶与圣迭戈的太平洋沿岸城市。",
                            "lon": (-120.5, -117.0), "lat": (32.5, 34.8), "color": 0xB07A4F},
    "desert": {"name": "莫哈韦沙漠", "shortName": "沙漠",
               "description": "加州东南部的沙漠盆地：死亡谷国家公园的盐滩与荒漠山脉。",
               "lon": (-117.0, -114.1), "lat": (32.5, 36.6), "color": 0xC9A86A},
}

# Major peaks (model heights in the same units as the terrain).
MOUNTAINS: list[dict] = [
    {"id": "mount-whitney", "name": "惠特尼峰", "lat": 36.5785, "lon": -118.2923,
     "radius": 18, "height": 44},
    {"id": "mount-shasta", "name": "沙斯塔山", "lat": 41.4092, "lon": -122.1949,
     "radius": 14, "height": 30},
    {"id": "mount-san-gorgonio", "name": "圣戈尔戈尼奥峰", "lat": 34.0992, "lon": -116.8245,
     "radius": 12, "height": 22},
    {"id": "mount-san-jacinto", "name": "圣哈辛托峰", "lat": 33.8147, "lon": -116.6793,
     "radius": 12, "height": 20},
    {"id": "mount-lassen", "name": "拉森峰", "lat": 40.4922, "lon": -121.5088,
     "radius": 11, "height": 20},
    {"id": "mount-tamalpais", "name": "塔玛佩斯山", "lat": 37.9234, "lon": -122.5965,
     "radius": 10, "height": 8},
]

# Travel legs (from PR #85, mirrored in src/runtime/california.ts).
LEGS: list[dict] = [
    {"from": "sfo-airport", "to": "california-sacramento", "minutes": 125, "fare": 4200, "method": "城际铁路"},
    {"from": "sfo-airport", "to": "california-eureka", "minutes": 300, "fare": 7800, "method": "沿海长途巴士"},
    {"from": "california-sacramento", "to": "california-redding", "minutes": 165, "fare": 3900, "method": "北上城际铁路"},
    {"from": "california-sacramento", "to": "california-yosemite", "minutes": 210, "fare": 5200, "method": "山地观光巴士"},
    {"from": "california-sacramento", "to": "california-fresno", "minutes": 180, "fare": 4600, "method": "中央谷地城际铁路"},
    {"from": "sfo-airport", "to": "california-monterey", "minutes": 145, "fare": 3600, "method": "海岸线巴士"},
    {"from": "california-fresno", "to": "california-yosemite", "minutes": 105, "fare": 2100, "method": "国家公园接驳车"},
    {"from": "california-fresno", "to": "california-los-angeles", "minutes": 260, "fare": 6200, "method": "南下城际铁路"},
    {"from": "california-los-angeles", "to": "california-death-valley", "minutes": 270, "fare": 6800, "method": "沙漠长途巴士"},
    {"from": "california-los-angeles", "to": "california-san-diego", "minutes": 150, "fare": 3400, "method": "太平洋沿岸城际铁路"},
    # Bay Area legs already in src/runtime/california.ts (kept here for routes).
    {"from": "sfo-airport", "to": "california-openai", "minutes": 65, "fare": 2600, "method": "湾区机场接驳车"},
    {"from": "california-openai", "to": "california-market", "minutes": 25, "fare": 520, "method": "湾区有轨电车"},
    {"from": "california-openai", "to": "california-anthropic", "minutes": 20, "fare": 450, "method": "湾区市内接驳车"},
    {"from": "california-anthropic", "to": "california-market", "minutes": 15, "fare": 350, "method": "湾区市内接驳车"},
]

# ---------------------------------------------------------------------------
# Height function (stylized, in model units)
# ---------------------------------------------------------------------------

# Coastline longitude by latitude (linear interpolation between anchors).
COAST: list[tuple[float, float]] = [
    (42.0, -124.20), (40.8, -124.16), (39.0, -123.80), (37.8, -122.52),
    (36.6, -121.90), (35.6, -121.20), (34.6, -120.65), (34.05, -118.45),
    (33.0, -117.60), (32.55, -117.05),
]


def coast_lon(lat: float) -> float:
    if lat >= COAST[0][0]:
        return COAST[0][1]
    if lat <= COAST[-1][0]:
        return COAST[-1][1]
    for (lat1, lon1), (lat2, lon2) in zip(COAST, COAST[1:]):
        if lat2 <= lat <= lat1:
            t = (lat1 - lat) / (lat1 - lat2)
            return lon1 + t * (lon2 - lon1)
    return COAST[-1][1]


def _gauss(d: float, sigma: float) -> float:
    return math.exp(-(d * d) / (2 * sigma * sigma))


def _seg_dist(lat: float, lon: float, lat1: float, lon1: float,
              lat2: float, lon2: float) -> float:
    """Distance in degrees from (lat, lon) to the segment (lat1,lon1)-(lat2,lon2)."""
    dx, dy = lon2 - lon1, lat2 - lat1
    seg_len2 = dx * dx + dy * dy
    if seg_len2 == 0:
        return math.hypot(lon - lon1, lat - lat1)
    t = max(0.0, min(1.0, ((lon - lon1) * dx + (lat - lat1) * dy) / seg_len2))
    return math.hypot(lon - (lon1 + t * dx), lat - (lat1 + t * dy))


def _hash_noise(lat: float, lon: float) -> float:
    """Deterministic value noise in [-1, 1] from a hashed grid cell."""
    ix, iz = math.floor(lat * 3.0), math.floor(lon * 3.0)
    fx, fz = lat * 3.0 - ix, lon * 3.0 - iz

    def cell(a: int, b: int) -> float:
        digest = hashlib.md5(f"{a},{b}".encode("ascii")).digest()
        return (digest[0] / 255.0) * 2.0 - 1.0

    def smooth(t: float) -> float:
        return t * t * (3 - 2 * t)

    v00, v10, v01, v11 = cell(ix, iz), cell(ix + 1, iz), cell(ix, iz + 1), cell(ix + 1, iz + 1)
    sx, sz = smooth(fx), smooth(fz)
    return (v00 * (1 - sx) + v10 * sx) * (1 - sz) + (v01 * (1 - sx) + v11 * sx) * sz


def _ridged(lat: float, lon: float) -> float:
    """Ridged multifractal in [-1, 1]: sharp crests, flat valleys."""
    n1 = 1.0 - abs(_hash_noise(lat * 1.6, lon * 1.6))
    n2 = 1.0 - abs(_hash_noise(lat * 3.4 + 7.3, lon * 3.4 + 2.9))
    return (n1 * 0.7 + n2 * 0.3) * 2.0 - 1.0


def _valley_blend(lat: float, lon: float) -> float:
    """Central Valley floor: 1.0 deep inside, 0 outside, 0.3-deg edge fade.

    The east edge follows the Sierra foothills so the range itself is never
    flattened; the west edge is the Coast Ranges foothills.
    """
    if not (35.0 <= lat <= 38.8 and -122.3 <= lon <= -118.5):
        return 0.0
    east_edge = -118.5 - (lat - 35.0) * 0.35
    edge = min(lat - 35.0, 38.8 - lat, lon + 122.3, east_edge - lon)
    return max(0.0, min(1.0, edge / 0.3))


def height_at(lat: float, lon: float) -> float:
    """Stylized terrain height in model units. Ocean is negative.

    Land is clamped to >= 0.5: the diorama has no separate water plane, but
    the demo renderer does, and inland ground must never sit below it --
    Death Valley stays a dry salt flat, never a blue lake.
    """
    if lon < coast_lon(lat):
        return -2.5
    h = 2.0
    # Sierra Nevada crest (36.0,-118.6) -> (39.6,-120.4).
    d = _seg_dist(lat, lon, 36.0, -118.6, 39.6, -120.4)
    h += 40.0 * _gauss(d, 0.55)
    # Ridged noise along the crest for craggy ridges (masked to the crest).
    sierra_mask = _gauss(d, 0.9)
    if sierra_mask > 0.01:
        h += 6.0 * sierra_mask * _ridged(lat, lon)
    # Coast Ranges along lon -122.9, lat 35.5..40.5 (narrow: the bay stays low).
    if 35.5 <= lat <= 40.5:
        h += 13.0 * _gauss(lon + 122.9, 0.35)
    # Coastal bluffs: a narrow rise just inland of the shoreline (Big Sur).
    coast_d = lon - coast_lon(lat)
    if 0.0 <= coast_d <= 0.6 and 35.5 <= lat <= 37.0:
        h += 2.5 * _gauss(coast_d - 0.15, 0.10)
    # Klamath Mountains, Mt. Shasta, Lassen Peak.
    h += 20.0 * _gauss(math.hypot(lat - 41.0, lon + 123.2), 0.55)
    h += 26.0 * _gauss(math.hypot(lat - 41.41, lon + 122.19), 0.35)
    h += 18.0 * _gauss(math.hypot(lat - 40.49, lon + 121.51), 0.3)
    # Transverse Ranges as a narrow segment (San Gabriels, north of LA).
    d = _seg_dist(lat, lon, 34.32, -118.7, 34.22, -117.5)
    h += 18.0 * _gauss(d, 0.13)
    # Peninsular Ranges.
    d = _seg_dist(lat, lon, 33.0, -116.6, 33.8, -117.3)
    h += 14.0 * _gauss(d, 0.25)
    # Death Valley depression.
    h -= 4.0 * _gauss(math.hypot(lat - 36.46, lon + 116.87), 0.5)
    # Central Valley floor: blend toward 2.0, then carve river channels.
    vb = _valley_blend(lat, lon)
    if vb > 0.0:
        h = h * (1.0 - vb) + 2.0 * vb
        h -= 0.9 * _gauss(lon + 121.5, 0.12) * vb
        h -= 0.7 * _gauss(lon + 120.9, 0.12) * vb
    noise = 1.2 * _hash_noise(lat, lon) + 0.5 * _hash_noise(lat * 2.7, lon * 2.7)
    h += noise * (1.0 - 0.75 * vb)
    return max(0.5, min(46.0, h))


def is_desert(lat: float, lon: float) -> bool:
    # Inland desert only: the coastal strip (San Diego, LA) is not desert.
    return (lon > coast_lon(lat) + 0.5 and lon > -117.6 and lat < 36.8
            and height_at(lat, lon) < 8.0)


def is_salt_flat(lat: float, lon: float) -> bool:
    return math.hypot(lat - 36.46, lon + 116.87) < 0.5


def is_farmland(lat: float, lon: float) -> bool:
    return _valley_blend(lat, lon) > 0.5


def _field_color(lat: float, lon: float) -> tuple[float, float, float]:
    """Central Valley field patchwork: one crop color per ~0.25 deg cell."""
    fields = [
        (0.62, 0.68, 0.34),  # wheat green
        (0.74, 0.66, 0.38),  # dry tan
        (0.45, 0.58, 0.30),  # deep green
        (0.68, 0.62, 0.42),  # pale straw
    ]
    key = f"field:{math.floor(lat * 4.0)},{math.floor(lon * 4.0)}"
    digest = hashlib.md5(key.encode("ascii")).digest()
    return fields[digest[0] % len(fields)]


def _near_place(lat: float, lon: float) -> bool:
    for _, plat, plon in PLACE_GEO.values():
        if math.hypot(lat - plat, lon - plon) < 0.16:
            return True
    return False


# Terrain colors: (height, r, g, b) stops, lerped.
COLOR_STOPS: list[tuple[float, tuple[float, float, float]]] = [
    (-3.0, (0.16, 0.42, 0.55)),
    (-0.5, (0.30, 0.56, 0.66)),
    (0.0, (0.52, 0.67, 0.38)),
    (5.0, (0.53, 0.67, 0.38)),
    (12.0, (0.49, 0.57, 0.33)),
    (22.0, (0.43, 0.49, 0.28)),
    (32.0, (0.48, 0.42, 0.32)),
    (40.0, (0.54, 0.48, 0.40)),
    (46.0, (0.91, 0.93, 0.93)),
]
DESERT_COLOR = (0.79, 0.66, 0.42)


def color_at(lat: float, lon: float, h: float) -> tuple[float, float, float]:
    if lon < coast_lon(lat):
        # Ocean: deeper further from the coast.
        t = min(1.0, (coast_lon(lat) - lon) / 1.5)
        deep, shallow = COLOR_STOPS[0][1], COLOR_STOPS[1][1]
        return tuple(deep[i] + (shallow[i] - deep[i]) * t for i in range(3))
    if is_salt_flat(lat, lon) and h < 3.0:
        # Death Valley salt flat: dry, pale, never water-blue.
        return (0.85, 0.82, 0.72)
    if is_desert(lat, lon):
        return DESERT_COLOR
    # Beach sand just inland of the shoreline.
    if h < 1.4 and 0.0 <= lon - coast_lon(lat) <= 0.15:
        return (0.76, 0.70, 0.55)
    # Elevation base color, smoothly lerped between stops.
    base: tuple[float, float, float] = COLOR_STOPS[-1][1]
    for (h0, c0), (h1, c1) in zip(COLOR_STOPS, COLOR_STOPS[1:]):
        if h0 <= h <= h1:
            t = (h - h0) / (h1 - h0) if h1 > h0 else 0.0
            base = tuple(c0[i] + (c1[i] - c0[i]) * t for i in range(3))
            break
    if is_farmland(lat, lon) and h < 6.0:
        # Field patchwork: 70% crop color, 30% elevation base.
        field = _field_color(lat, lon)
        return tuple(field[i] * 0.7 + base[i] * 0.3 for i in range(3))
    if 6.0 <= h <= 28.0:
        # Forest: deterministic light variation so hills are not flat green.
        vary = 0.88 + 0.24 * (0.5 + 0.5 * _hash_noise(lat * 5.0, lon * 5.0))
        base = tuple(min(1.0, base[i] * vary) for i in range(3))
    if _near_place(lat, lon) and h < 8.0:
        # Urban tint around city centers.
        urban = (0.55, 0.52, 0.48)
        return tuple(base[i] * 0.5 + urban[i] * 0.5 for i in range(3))
    return base


# ---------------------------------------------------------------------------
# Deterministic layout helpers
# ---------------------------------------------------------------------------

def _stable_frac(key: str, salt: str) -> float:
    digest = hashlib.md5(f"{key}:{salt}".encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "little") / 0xFFFFFFFF


# Per-place city profile: (box count, max height, spread).
CITY_PROFILE: dict[str, tuple[int, float, float]] = {
    "california-market": (34, 20.0, 16.0),        # downtown San Francisco
    "california-los-angeles": (28, 18.0, 16.0),   # downtown Los Angeles
    "california-san-diego": (16, 12.0, 13.0),
    "california-sacramento": (16, 10.0, 13.0),
    "california-fresno": (14, 8.0, 13.0),
    "sfo-airport": (10, 6.0, 14.0),
    "california-openai": (8, 8.0, 10.0),
    "california-anthropic": (8, 8.0, 10.0),
    "california-eureka": (10, 6.0, 11.0),
    "california-redding": (10, 6.0, 11.0),
    "california-monterey": (10, 6.0, 11.0),
    "california-yosemite": (1, 22.0, 0.0),       # granite monolith, not a city
    "california-death-valley": (0, 0.0, 0.0),     # no buildings in the desert
}


def _vary_color(color: int, key: str) -> str:
    """Deterministic per-box shade of a district color (+/-15% lightness)."""
    r, g, b = (color >> 16) & 255, (color >> 8) & 255, color & 255
    f = 0.85 + 0.30 * _stable_frac(key, "shade")
    r, g, b = (min(255, round(c * f)) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def city_boxes(place_id: str, cx: float, cz: float, ground: float,
               district_color: int) -> list[dict]:
    """City blocks for one place. Parks get a monolith instead.

    Boxes cluster taller toward the center (a downtown silhouette) and each
    carries its own shade of the district color so cities are not flat blobs.
    """
    if place_id == "california-yosemite":
        return [{
            "id": f"building:{place_id}:0", "name": "花岗岩峭壁", "x": cx, "z": cz,
            "width": 9.0, "depth": 9.0, "height": 22.0, "floors": 1,
            "color": "#8d7d6b", "roofType": "peak", "roomId": "",
        }]
    if place_id == "california-death-valley":
        return []
    count, height_max, spread = CITY_PROFILE[place_id]
    boxes = []
    for i in range(count):
        jx = (_stable_frac(place_id, f"jx{i}") - 0.5) * spread
        jz = (_stable_frac(place_id, f"jz{i}") - 0.5) * spread
        w = 3.0 + _stable_frac(place_id, f"w{i}") * 4.0
        d = 3.0 + _stable_frac(place_id, f"d{i}") * 4.0
        # Downtown falloff: boxes near the center reach the full height.
        r = math.hypot(jx, jz) / (spread / 2) if spread else 0.0
        t = _stable_frac(place_id, f"h{i}")
        height = 2.0 + (height_max - 2.0) * t * (1.0 - 0.6 * min(1.0, r))
        boxes.append({
            "id": f"building:{place_id}:{i}",
            "name": PLACE_TEXT[place_id][0],
            "x": round(cx + jx, 2), "z": round(cz + jz, 2),
            "width": round(w, 2), "depth": round(d, 2),
            "height": round(height, 2),
            "floors": max(1, round(height / 3.0)),
            "color": _vary_color(district_color, f"{place_id}:{i}"),
            "roofType": "flat", "roomId": "",
        })
    if place_id == "sfo-airport":
        # One long runway strip east-west across the airfield.
        boxes.append({
            "id": f"building:{place_id}:runway", "name": "机场跑道",
            "x": round(cx, 2), "z": round(cz, 2),
            "width": 26.0, "depth": 3.5, "height": 0.8, "floors": 1,
            "color": "#3a3f44", "roofType": "flat", "roomId": "",
        })
    return boxes


# ---------------------------------------------------------------------------
# GLB construction (glTF 2.0 binary, no textures, no animations)
# ---------------------------------------------------------------------------

def _box_triangles(cx: float, cy: float, cz: float, w: float, h: float, d: float):
    """Axis-aligned box as (positions, normals, indices) with outward faces."""
    x0, x1 = cx - w / 2, cx + w / 2
    y0, y1 = cy, cy + h
    z0, z1 = cz - d / 2, cz + d / 2
    # Per-face quads (4 verts each, no shared verts so normals stay flat).
    faces = [
        ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
        ([(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)], (0, 0, -1)),
        ([(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)], (1, 0, 0)),
        ([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], (-1, 0, 0)),
        ([(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], (0, 1, 0)),
        ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
    ]
    positions, normals, indices = [], [], []
    base = 0
    for verts, normal in faces:
        for v in verts:
            positions.extend(v)
            normals.extend(normal)
        indices.extend([base, base + 1, base + 2, base, base + 2, base + 3])
        base += 4
    return positions, normals, indices


def _vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _vcross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def _vnorm(a):
    length = math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) or 1.0
    return (a[0] / length, a[1] / length, a[2] / length)


def _emit_quad(pos, nrm, idx, verts):
    """Append one flat-shaded quad; verts must wind CCW seen from outside."""
    n = _vnorm(_vcross(_vsub(verts[1], verts[0]), _vsub(verts[3], verts[0])))
    base = len(pos) // 3
    for v in verts:
        pos.extend(v)
        nrm.extend(n)
    idx.extend([base, base + 1, base + 2, base, base + 2, base + 3])


def _emit_tri(pos, nrm, idx, a, b, c):
    """Append one flat-shaded triangle; (a, b, c) wind CCW seen from outside."""
    n = _vnorm(_vcross(_vsub(b, a), _vsub(c, a)))
    base = len(pos) // 3
    for v in (a, b, c):
        pos.extend(v)
        nrm.extend(n)
    idx.extend([base, base + 1, base + 2])


def _beam_triangles(p1, p2, thickness):
    """Thin square-section beam between two points (for bridge cables)."""
    d = _vnorm(_vsub(p2, p1))
    up = (0.0, 1.0, 0.0) if abs(d[1]) < 0.9 else (1.0, 0.0, 0.0)
    u = _vnorm(_vcross(d, up))
    v = _vcross(d, u)
    s = thickness / 2.0

    def corner(p, su, sv):
        return (p[0] + u[0] * su * s + v[0] * sv * s,
                p[1] + u[1] * su * s + v[1] * sv * s,
                p[2] + u[2] * su * s + v[2] * sv * s)

    a1, b1, c1, d1 = corner(p1, 1, 1), corner(p1, 1, -1), corner(p1, -1, -1), corner(p1, -1, 1)
    a2, b2, c2, d2 = corner(p2, 1, 1), corner(p2, 1, -1), corner(p2, -1, -1), corner(p2, -1, 1)
    pos, nrm, idx = [], [], []
    _emit_quad(pos, nrm, idx, [a1, a2, b2, b1])   # +u side
    _emit_quad(pos, nrm, idx, [b1, b2, c2, c1])   # -v side
    _emit_quad(pos, nrm, idx, [c1, c2, d2, d1])   # -u side
    _emit_quad(pos, nrm, idx, [d1, d2, a2, a1])   # +v side
    _emit_quad(pos, nrm, idx, [a2, d2, c2, b2])   # p2 cap
    _emit_quad(pos, nrm, idx, [a1, b1, c1, d1])   # p1 cap
    return pos, nrm, idx


def _frustum_triangles(cx, cy, cz, w0, d0, w1, d1, h):
    """Tapered box: bottom rect w0 x d0 at cy, top rect w1 x d1 at cy + h."""
    x0, x1 = cx - w0 / 2, cx + w0 / 2
    z0, z1 = cz - d0 / 2, cz + d0 / 2
    X0, X1 = cx - w1 / 2, cx + w1 / 2
    Z0, Z1 = cz - d1 / 2, cz + d1 / 2
    y0, y1 = cy, cy + h
    pos, nrm, idx = [], [], []
    _emit_quad(pos, nrm, idx, [(x0, y0, z1), (x1, y0, z1), (X1, y1, Z1), (X0, y1, Z1)])
    _emit_quad(pos, nrm, idx, [(x1, y0, z0), (x0, y0, z0), (X0, y1, Z0), (X1, y1, Z0)])
    _emit_quad(pos, nrm, idx, [(x1, y0, z1), (x1, y0, z0), (X1, y1, Z0), (X1, y1, Z1)])
    _emit_quad(pos, nrm, idx, [(x0, y0, z0), (x0, y0, z1), (X0, y1, Z1), (X0, y1, Z0)])
    _emit_quad(pos, nrm, idx, [(X0, y1, Z1), (X1, y1, Z1), (X1, y1, Z0), (X0, y1, Z0)])
    _emit_quad(pos, nrm, idx, [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)])
    return pos, nrm, idx


def _pyramid_triangles(cx, cy, cz, w, d, h, sides=4):
    """Pyramid with an N-gon base inscribed in a w x d ellipse."""
    apex = (cx, cy + h, cz)
    ring = []
    for k in range(sides):
        ang = 2 * math.pi * k / sides
        ring.append((cx + (w / 2) * math.cos(ang), cy, cz + (d / 2) * math.sin(ang)))
    pos, nrm, idx = [], [], []
    for k in range(sides):
        _emit_tri(pos, nrm, idx, apex, ring[(k + 1) % sides], ring[k])
    center = (cx, cy, cz)
    for k in range(sides):
        _emit_tri(pos, nrm, idx, center, ring[k], ring[(k + 1) % sides])
    return pos, nrm, idx


def _cylinder_triangles(cx, cy, cz, radius, h, sides=12):
    """Straight prism (for observatory drums); flat-shaded."""
    ring_b, ring_t = [], []
    for k in range(sides):
        ang = 2 * math.pi * k / sides
        ring_b.append((cx + radius * math.cos(ang), cy, cz + radius * math.sin(ang)))
        ring_t.append((cx + radius * math.cos(ang), cy + h, cz + radius * math.sin(ang)))
    pos, nrm, idx = [], [], []
    for k in range(sides):
        k2 = (k + 1) % sides
        _emit_quad(pos, nrm, idx, [ring_b[k], ring_t[k], ring_t[k2], ring_b[k2]])
    top, bottom = (cx, cy + h, cz), (cx, cy, cz)
    for k in range(sides):
        k2 = (k + 1) % sides
        _emit_tri(pos, nrm, idx, top, ring_t[k2], ring_t[k])
        _emit_tri(pos, nrm, idx, bottom, ring_b[k], ring_b[k2])
    return pos, nrm, idx


# ---------------------------------------------------------------------------
# Landmark structures (recognizable at diorama scale; deliberately
# exaggerated — a true-scale Golden Gate span would be under one unit wide).
# Each landmark is one GLB mesh named california-landmark-<id> plus one
# data-JSON building entry (kind "landmark") attributed to its nearest place.
# ---------------------------------------------------------------------------

LANDMARKS: list[dict] = [
    {"id": "golden-gate", "name": "金门大桥", "place": "california-market",
     "lat": 37.8199, "lon": -122.4783,
     "desc": "横跨金门海峡的悬索桥，国际橘色的桥身是旧金山最醒目的地标。"},
    {"id": "hollywood-sign", "name": "好莱坞标志", "place": "california-los-angeles",
     "lat": 34.1347, "lon": -118.3215,
     "desc": "好莱坞山脊上的白色字母标志，洛杉矶的象征。"},
    {"id": "transamerica", "name": "泛美金字塔", "place": "california-market",
     "lat": 37.7952, "lon": -122.4028,
     "desc": "旧金山市中心的金字塔形摩天楼，尖顶直插云霄。"},
    {"id": "griffith", "name": "格里菲斯天文台", "place": "california-los-angeles",
     "lat": 34.1184, "lon": -118.3004,
     "desc": "格里菲斯公园山顶的白色圆顶天文台，俯瞰洛杉矶全城。"},
]


def _merge_parts(parts: list[tuple]) -> tuple:
    pos: list[float] = []
    nrm: list[float] = []
    idx: list[int] = []
    for part_pos, part_nrm, part_idx in parts:
        base = len(pos) // 3
        pos.extend(part_pos)
        nrm.extend(part_nrm)
        idx.extend(v + base for v in part_idx)
    return pos, nrm, idx


def _landmark_golden_gate(cx: float, cz: float, ground: float) -> tuple:
    """Deck + two towers + suspension cables, International Orange.

    The deck runs north-south (along z) across the strait; towers stand at
    z = cz - 6 and z = cz + 6, main cables sag between the tower tops.
    """
    deck_y = ground + 5.5
    tower_top = ground + 14.0
    parts: list[tuple] = []
    # Deck: 26 long, 2.5 wide, 0.9 thick, top at deck_y.
    parts.append(_box_triangles(cx, deck_y - 0.9, cz, 2.5, 0.9, 26.0))
    # Towers: two legs + four crossbars each.
    for tz in (cz - 6.0, cz + 6.0):
        for sx in (-1.3, 1.3):
            parts.append(_box_triangles(cx + sx, ground - 0.3, tz, 1.0, 14.3, 1.0))
        for hy in (3.0, 7.0, 11.0, 13.2):
            parts.append(_box_triangles(cx, ground + hy - 0.35, tz, 3.4, 0.7, 0.7))
    # Main cables: parabolic sag between the tower tops, both sides.
    for sx in (-1.25, 1.25):
        span = [(cz - 6.0 + s * 12.0 / 8,
                 tower_top - 7.0 * (1 - ((s - 4) / 4) ** 2))
                for s in range(9)]
        for (z1, y1), (z2, y2) in zip(span, span[1:]):
            parts.append(_beam_triangles((cx + sx, y1, z1), (cx + sx, y2, z2), 0.35))
        # Side cables: tower tops down to the deck ends.
        parts.append(_beam_triangles((cx + sx, tower_top, cz - 6.0),
                                     (cx + sx, deck_y, cz - 13.0), 0.35))
        parts.append(_beam_triangles((cx + sx, tower_top, cz + 6.0),
                                     (cx + sx, deck_y, cz + 13.0), 0.35))
    return _merge_parts(parts)


def _landmark_hollywood_sign(cx: float, cz: float, ground: float) -> tuple:
    """Nine white letters on the ridge, each base following the terrain."""
    parts: list[tuple] = []
    for i in range(9):
        lx = cx + (i - 4) * 2.3
        lat, lon = unproject(lx, cz)
        base = height_at(lat, lon) - 0.3
        parts.append(_box_triangles(lx, base, cz, 1.6, 2.4, 0.5))
    return _merge_parts(parts)


def _landmark_transamerica(cx: float, cz: float, ground: float) -> tuple:
    """Tapering tower + pyramid cap + two side wings."""
    parts: list[tuple] = []
    parts.append(_frustum_triangles(cx, ground - 0.3, cz, 7.0, 7.0, 1.0, 1.0, 22.0))
    parts.append(_pyramid_triangles(cx, ground + 21.7, cz, 1.4, 1.4, 2.5, sides=4))
    for sx in (-1, 1):
        parts.append(_box_triangles(cx + sx * 1.7, ground + 15.0, cz, 0.8, 4.0, 2.5))
    return _merge_parts(parts)


def _landmark_griffith(cx: float, cz: float, ground: float) -> tuple:
    """Cream base + central domed drum + two side wings."""
    parts: list[tuple] = []
    parts.append(_box_triangles(cx, ground - 0.3, cz, 7.0, 2.0, 5.0))
    parts.append(_cylinder_triangles(cx, ground + 1.7, cz, 2.2, 1.6, sides=12))
    parts.append(_pyramid_triangles(cx, ground + 3.3, cz, 4.4, 4.4, 1.8, sides=8))
    for sx in (-1, 1):
        parts.append(_box_triangles(cx + sx * 4.4, ground - 0.3, cz, 2.5, 1.5, 3.0))
    return _merge_parts(parts)


LANDMARK_BUILDERS = {
    "golden-gate": _landmark_golden_gate,
    "hollywood-sign": _landmark_hollywood_sign,
    "transamerica": _landmark_transamerica,
    "griffith": _landmark_griffith,
}

# Bounding boxes + GLB material colors for the landmark data entries.
LANDMARK_BOUNDS: dict[str, dict] = {
    "golden-gate": {"width": 5.0, "depth": 26.0, "height": 14.0, "color": "#c0362c"},
    "hollywood-sign": {"width": 21.0, "depth": 1.0, "height": 2.4, "color": "#f2f2ec"},
    "transamerica": {"width": 7.0, "depth": 7.0, "height": 24.2, "color": "#d9d9d9"},
    "griffith": {"width": 11.0, "depth": 5.0, "height": 5.1, "color": "#e8e0cc"},
}


def build_glb() -> tuple[bytes, dict]:
    """Build the GLB bytes and the geometry facts the data JSON needs."""
    nx, nz = 192, 220
    xs = [X_MIN + (X_MAX - X_MIN) * i / (nx - 1) for i in range(nx)]
    zs = [Z_MIN + (Z_MAX - Z_MIN) * j / (nz - 1) for j in range(nz)]

    # Terrain grid: positions, normals (central differences), vertex colors.
    heights = [[0.0] * nx for _ in range(nz)]
    for j, z in enumerate(zs):
        for i, x in enumerate(xs):
            lat, lon = unproject(x, z)
            heights[j][i] = height_at(lat, lon)

    positions: list[float] = []
    normals: list[float] = []
    colors: list[int] = []
    for j, z in enumerate(zs):
        for i, x in enumerate(xs):
            lat, lon = unproject(x, z)
            h = heights[j][i]
            positions.extend([x, h, z])
            hx0 = heights[j][max(0, i - 1)]
            hx1 = heights[j][min(nx - 1, i + 1)]
            hz0 = heights[max(0, j - 1)][i]
            hz1 = heights[min(nz - 1, j + 1)][i]
            dx = (X_MAX - X_MIN) / (nx - 1)
            dz = (Z_MAX - Z_MIN) / (nz - 1)
            nxv = -(hx1 - hx0) / (2 * dx)
            nzv = -(hz1 - hz0) / (2 * dz)
            inv = 1.0 / math.sqrt(nxv * nxv + 1.0 + nzv * nzv)
            normals.extend([nxv * inv, inv, nzv * inv])
            r, g, b = color_at(lat, lon, h)
            colors.extend([round(r * 255), round(g * 255), round(b * 255), 255])

    indices: list[int] = []
    for j in range(nz - 1):
        for i in range(nx - 1):
            a = j * nx + i
            b = a + 1
            c = a + nx
            d = c + 1
            indices.extend([a, c, b, b, c, d])

    # City blocks + plaza discs, grouped by district for shared materials.
    place_xy: dict[str, tuple[float, float, float]] = {}
    for pid, (district, lat, lon) in PLACE_GEO.items():
        x, z = project(lat, lon)
        place_xy[pid] = (x, height_at(lat, lon), z)

    boxes_by_district: dict[str, list[dict]] = {}
    all_buildings: list[dict] = []
    for pid, (district, lat, lon) in PLACE_GEO.items():
        x, y, z = place_xy[pid]
        boxes = city_boxes(pid, x, z, y, DISTRICTS[district]["color"])
        boxes_by_district.setdefault(district, []).extend(boxes)
        all_buildings.extend(boxes)

    # Assemble buffers: one (positions, normals, colors|none, indices) per mesh.
    meshes: list[dict] = []
    buffer_chunks: list[bytes] = []
    buffer_views: list[dict] = []
    accessors: list[dict] = []

    def add_accessor(data: bytes, component_type: int, count: int,
                     type_: str, min_v=None, max_v=None) -> int:
        offset = sum(len(c) for c in buffer_chunks)
        if offset % 4:
            pad = 4 - offset % 4
            buffer_chunks.append(b"\x00" * pad)
            offset += pad
        buffer_chunks.append(data)
        view_index = len(buffer_views)
        buffer_views.append({
            "buffer": 0, "byteOffset": offset, "byteLength": len(data),
        })
        acc_index = len(accessors)
        acc: dict = {"bufferView": view_index, "componentType": component_type,
                     "count": count, "type": type_}
        if min_v is not None:
            acc["min"] = min_v
        if max_v is not None:
            acc["max"] = max_v
        accessors.append(acc)
        return acc_index

    def add_mesh(name: str, pos, nrm, col, idx) -> dict:
        pos_bytes = struct.pack(f"<{len(pos)}f", *pos)
        nrm_bytes = struct.pack(f"<{len(nrm)}f", *nrm)
        # Uint16 indices whenever the vertex count allows (halves index size).
        if max(idx) < 65536:
            idx_bytes = struct.pack(f"<{len(idx)}H", *idx)
            idx_type = 5123
        else:
            idx_bytes = struct.pack(f"<{len(idx)}I", *idx)
            idx_type = 5125
        pos_acc = add_accessor(pos_bytes, 5126, len(pos) // 3, "VEC3",
                               [min(pos[0::3]), min(pos[1::3]), min(pos[2::3])],
                               [max(pos[0::3]), max(pos[1::3]), max(pos[2::3])])
        nrm_acc = add_accessor(nrm_bytes, 5126, len(nrm) // 3, "VEC3")
        attrs: dict = {"POSITION": pos_acc, "NORMAL": nrm_acc}
        if col is not None:
            col_bytes = bytes(col)
            col_acc = add_accessor(col_bytes, 5121, len(col) // 4, "VEC4")
            attrs["COLOR_0"] = col_acc
        idx_acc = add_accessor(idx_bytes, idx_type, len(idx), "SCALAR")
        mesh_index = len(meshes)
        meshes.append({"name": name, "primitives": [{
            "attributes": attrs, "indices": idx_acc, "mode": 4,
        }]})
        return mesh_index

    terrain_mesh = add_mesh("california-terrain", positions, normals, colors, indices)

    # Boxes: one mesh per district, with per-box vertex colors so cities are
    # not flat monochrome blobs (the material below is white; color comes
    # from the vertices and matches the data-JSON building colors).
    box_mesh_by_district: dict[str, int] = {}
    for district, boxes in sorted(boxes_by_district.items()):
        if not boxes:
            continue
        pos: list[float] = []
        nrm: list[float] = []
        col: list[int] = []
        idx: list[int] = []
        for box in boxes:
            lat, lon = unproject(box["x"], box["z"])
            ground = height_at(lat, lon)
            bp, bn, bi = _box_triangles(box["x"], ground - 0.3, box["z"],
                                        box["width"], box["height"], box["depth"])
            base = len(pos) // 3
            pos.extend(bp)
            nrm.extend(bn)
            idx.extend(v + base for v in bi)
            hexcolor = box["color"].lstrip("#")
            r, g, b = (int(hexcolor[i:i + 2], 16) for i in (0, 2, 4))
            col.extend([r, g, b, 255] * (len(bp) // 3))
        box_mesh_by_district[district] = add_mesh(
            f"california-city-{district}", pos, nrm, col, idx)

    # Landmark structures: one mesh each, flat material color.
    landmark_mesh: dict[str, int] = {}
    landmark_facts: list[dict] = []
    for spec in LANDMARKS:
        lid = spec["id"]
        x, z = project(spec["lat"], spec["lon"])
        ground = height_at(spec["lat"], spec["lon"])
        lp, ln, li = LANDMARK_BUILDERS[lid](x, z, ground)
        landmark_mesh[lid] = add_mesh(f"california-landmark-{lid}", lp, ln, None, li)
        bounds = LANDMARK_BOUNDS[lid]
        landmark_facts.append({
            "id": f"building:{spec['place']}:{lid}",
            "name": spec["name"], "place": spec["place"],
            "x": round(x, 2), "z": round(z, 2),
            "width": bounds["width"], "depth": bounds["depth"],
            "height": bounds["height"], "color": bounds["color"],
            "landmarkId": lid, "desc": spec["desc"],
        })

    # Plaza discs: one vertex-colored mesh, a flat ring per place.
    plaza_pos: list[float] = []
    plaza_nrm: list[float] = []
    plaza_col: list[int] = []
    plaza_idx: list[int] = []
    for pid, (district, lat, lon) in PLACE_GEO.items():
        x, y, z = place_xy[pid]
        color = DISTRICTS[district]["color"]
        cr, cg, cb = (color >> 16) & 255, (color >> 8) & 255, color & 255
        center = len(plaza_pos) // 3
        plaza_pos.extend([x, y + 0.25, z])
        plaza_nrm.extend([0.0, 1.0, 0.0])
        plaza_col.extend([min(255, cr + 40), min(255, cg + 40), min(255, cb + 40), 255])
        segments = 24
        for k in range(segments):
            ang = 2 * math.pi * k / segments
            px = x + 7.0 * math.cos(ang)
            pz = z + 7.0 * math.sin(ang)
            plat, plon = unproject(px, pz)
            py = height_at(plat, plon) + 0.25
            plaza_pos.extend([px, py, pz])
            plaza_nrm.extend([0.0, 1.0, 0.0])
            plaza_col.extend([cr, cg, cb, 255])
            plaza_idx.extend([center, center + 1 + k,
                              center + 1 + (k + 1) % segments])
    plaza_mesh = add_mesh("california-plazas", plaza_pos, plaza_nrm,
                          plaza_col, plaza_idx)

    # Materials: 0 = terrain (vertex colors), 1 = plazas (vertex colors),
    # 2 = city boxes (white base; color comes from per-box vertex colors),
    # 3.. = one flat material per landmark structure.
    materials = [
        {"name": "california-terrain",
         "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1],
                                  "metallicFactor": 0.0, "roughnessFactor": 0.95}},
        {"name": "california-plaza",
         "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1],
                                  "metallicFactor": 0.0, "roughnessFactor": 0.9}},
        {"name": "california-city",
         "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1],
                                  "metallicFactor": 0.1, "roughnessFactor": 0.8}},
    ]
    landmark_material_index: dict[str, int] = {}
    for spec in LANDMARKS:
        lid = spec["id"]
        hexcolor = LANDMARK_BOUNDS[lid]["color"].lstrip("#")
        r, g, b = (int(hexcolor[i:i + 2], 16) / 255 for i in (0, 2, 4))
        landmark_material_index[lid] = len(materials)
        materials.append({
            "name": f"california-landmark-{lid}",
            "pbrMetallicRoughness": {
                "baseColorFactor": [r, g, b, 1.0],
                "metallicFactor": 0.1, "roughnessFactor": 0.6},
        })

    meshes[terrain_mesh]["primitives"][0]["material"] = 0
    meshes[plaza_mesh]["primitives"][0]["material"] = 1
    for district, mesh_index in box_mesh_by_district.items():
        meshes[mesh_index]["primitives"][0]["material"] = 2
    for lid, mesh_index in landmark_mesh.items():
        meshes[mesh_index]["primitives"][0]["material"] = landmark_material_index[lid]

    nodes = [{"mesh": terrain_mesh, "name": "california-terrain"}]
    for district, mesh_index in sorted(box_mesh_by_district.items()):
        nodes.append({"mesh": mesh_index, "name": f"california-city-{district}"})
    nodes.append({"mesh": plaza_mesh, "name": "california-plazas"})
    for spec in LANDMARKS:
        lid = spec["id"]
        nodes.append({"mesh": landmark_mesh[lid], "name": f"california-landmark-{lid}"})

    gltf = {
        "asset": {"version": "2.0",
                  "generator": "scripts/build_california_sandbox_glb.py",
                  "copyright": "Procedurally generated; see scripts/build_california_sandbox_glb.py"},
        "scene": 0,
        "scenes": [{"nodes": list(range(len(nodes)))}],
        "nodes": nodes,
        "meshes": meshes,
        "materials": materials,
        "accessors": accessors,
        "bufferViews": buffer_views,
        "buffers": [{"byteLength": sum(len(c) for c in buffer_chunks)}],
    }
    json_bytes = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    bin_bytes = b"".join(buffer_chunks)
    bin_bytes += b"\x00" * ((4 - len(bin_bytes) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    header = struct.pack("<III", 0x46546C67, 2, total)
    glb = (header + struct.pack("<II", len(json_bytes), 0x4E4F534A) + json_bytes
           + struct.pack("<II", len(bin_bytes), 0x004E4942) + bin_bytes)

    facts = {
        "place_xy": {pid: (round(x, 2), round(y, 2), round(z, 2))
                     for pid, (x, y, z) in place_xy.items()},
        "buildings": all_buildings,
        "landmarks": landmark_facts,
        "terrain_vertices": len(positions) // 3,
        "terrain_triangles": len(indices) // 3,
        "mesh_count": len(meshes),
        "node_count": len(nodes),
    }
    return glb, facts


# ---------------------------------------------------------------------------
# Data JSON (mirrors the Tokyo data file schema, plus "routes" + "projection")
# ---------------------------------------------------------------------------

def build_data(facts: dict) -> dict:
    districts = []
    for did, spec in DISTRICTS.items():
        (lon0, lon1), (lat0, lat1) = spec["lon"], spec["lat"]
        x0, _ = project(lat0, lon0)
        x1, _ = project(lat0, lon1)
        _, z0 = project(lat1, lon0)
        _, z1 = project(lat0, lon0)
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        districts.append({
            "id": did, "name": spec["name"], "shortName": spec["shortName"],
            "description": spec["description"],
            "x": round(cx, 2), "z": round(cz, 2),
            "minX": round(min(x0, x1), 2), "maxX": round(max(x0, x1), 2),
            "minZ": round(min(z0, z1), 2), "maxZ": round(max(z0, z1), 2),
            "color": spec["color"],
        })

    landmarks = []
    for pid, (district, lat, lon) in PLACE_GEO.items():
        name, subtitle, desc = PLACE_TEXT[pid]
        x, _, z = facts["place_xy"][pid]
        landmarks.append({
            "id": pid, "name": name, "subtitle": subtitle, "district": district,
            "x": x, "z": z, "desc": desc, "services": PLACE_SERVICES[pid],
        })

    # Local street rects around the Bay Area cluster + LA/Sacramento grids.
    roads = []
    for cx, cz, w, d, kind in [
        (-126.0, -19.0, 60, 6, "road"), (-126.0, -8.0, 60, 6, "road"),
        (-118.0, -19.0, 6, 46, "road"), (-108.0, -19.0, 6, 46, "walk"),
        (84.0, 229.0, 52, 6, "road"), (84.0, 240.0, 52, 6, "walk"),
        (-100.0, -100.0, 44, 6, "road"),
    ]:
        roads.append({"x": cx, "z": cz, "width": w, "depth": d, "kind": kind})

    routes = []
    for leg in LEGS:
        a = facts["place_xy"][leg["from"]]
        b = facts["place_xy"][leg["to"]]
        steps = max(2, round(math.hypot(b[0] - a[0], b[2] - a[2]) / 20.0))
        points = []
        for s in range(steps + 1):
            t = s / steps
            x = a[0] + (b[0] - a[0]) * t
            z = a[2] + (b[2] - a[2]) * t
            points.append({"x": round(x, 2), "z": round(z, 2)})
        routes.append({
            "id": f"route:{leg['from']}:{leg['to']}",
            "from": leg["from"], "to": leg["to"],
            "method": leg["method"], "minutes": leg["minutes"], "fare": leg["fare"],
            "points": points,
        })

    mountains = []
    for m in MOUNTAINS:
        x, z = project(m["lat"], m["lon"])
        mountains.append({"id": m["id"], "name": m["name"],
                          "x": round(x, 2), "z": round(z, 2),
                          "radius": m["radius"], "height": m["height"]})

    # Landmark structures as named buildings (kind "landmark"), attributed
    # to their nearest place so the data tests' place checks still hold.
    buildings = list(facts["buildings"])
    for fact in facts["landmarks"]:
        buildings.append({
            "id": fact["id"], "name": fact["name"],
            "x": fact["x"], "z": fact["z"],
            "width": fact["width"], "depth": fact["depth"],
            "height": fact["height"], "floors": 1,
            "color": fact["color"], "roofType": "landmark", "roomId": "",
            "kind": "landmark", "landmarkId": fact["landmarkId"],
            "desc": fact["desc"],
        })

    return {
        "title": "加州 · 全州立体沙盘数据集",
        "exportedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "currentClock": "17:30",
        "projection": {
            "type": "equirectangular",
            "lonCenter": LON0, "latCenter": LAT0,
            "unitsPerDegreeLat": round(K_LAT, 3),
            "unitsPerDegreeLon": round(K_LON, 3),
            "note": "x = (lon - lonCenter) * unitsPerDegreeLon, "
                    "z = (latCenter - lat) * unitsPerDegreeLat; "
                    "x east, z south, y up; 1 unit is about 2.2 km.",
        },
        "districts": districts,
        "landmarks": landmarks,
        "buildings": buildings,
        "roads": roads,
        "routes": routes,
        "mountains": mountains,
        "characters": [],
    }


def main() -> None:
    glb, facts = build_glb()
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    OUT_GLB.write_bytes(glb)
    data = build_data(facts)
    OUT_DATA.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8")
    import hashlib as _hashlib
    sha = _hashlib.sha256(glb).hexdigest()
    print(f"GLB: {OUT_GLB} ({len(glb)} bytes, sha256 {sha})")
    print(f"DATA: {OUT_DATA} ({len(data['districts'])} districts, "
          f"{len(data['landmarks'])} landmarks, {len(data['buildings'])} buildings "
          f"({len(facts['landmarks'])} landmark structures), "
          f"{len(data['routes'])} routes, {len(data['mountains'])} mountains)")
    print(f"terrain: {facts['terrain_vertices']} vertices, "
          f"{facts['terrain_triangles']} triangles, "
          f"{facts['mesh_count']} meshes, {facts['node_count']} nodes")


if __name__ == "__main__":
    main()
