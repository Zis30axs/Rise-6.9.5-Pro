# 全球与省级地图数据

核对日期：2026-10-17。`src/frontend/atlas-data.json` 是内嵌于前端及 PNG 的离线数据，不在玩家打开地图时访问任何地图服务。旧 `map-data.json` 仍提供已沿用的中国与浙江几何。

## 数据来源与许可

- 全球外框：Natural Earth **1:10m Admin 0 Countries**，原始 258 个国家、属地及特殊制图区域。官方说明：<https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/>。
- 全球一级区划：Natural Earth **1:10m Admin 1 States, Provinces**，原始 4596 个要素。官方说明：<https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-1-states-provinces/>。这里使用全球 10m 集合，不使用只有美国、加拿大等局部内容的 50m/110m ADM1 集合。
- Natural Earth 许可：官方 [Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/) 将其矢量与栅格数据置于公有领域，允许修改及电子分发。中文名称随原始数据取得；缺少中文名时保留来源中的英文或本地名称。
- 原始 GeoJSON 来自 Natural Earth 作者维护的 `nvkelso/natural-earth-vector` 仓库，固定提交 `ca96624a56bd078437bca8184e78163e5039ad19`：
  - <https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_0_countries.geojson>
  - <https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_10m_admin_1_states_provinces.geojson>
- 中国 34 个省级区域与浙江 11 个地级区域沿用工程既有 DataV.GeoAtlas 几何、名称和六位 ID，未重新赋予授权。下载地址与提供方权利说明见 [map-sources.md](map-sources.md)。仅这部分保留既有来源的许可边界，不将其称为 Natural Earth 或公有领域。
- 中国完整外框改用 DataV <https://geo.datav.aliyun.com/areas_v3/bound/100000.json>，含台湾与南海诸岛的 277 个面片。辅助断续线取自 <https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json> 中 `adchar = "JD" / adcode = "100000_JD"` 的无名要素；名称为空不代表应该丢弃。它是 10 个狭长面的 MultiPolygon，包含南海九段及台湾东侧一段，不是国家或省份。

## 本次生成的覆盖

| 项目 | 数量 |
| --- | ---: |
| 国家、属地及特殊制图区域 | 227 |
| 一级区划（含中国 34 省级区域） | 4555 |
| 至少有一个一级区域要素的地图条目 | 223 |
| 没有一级区划数据的地图条目 | 4 |
| 只有一个一级区域要素的地图条目 | 28 |
| 浙江地级区域 | 11 |
| 架空苏联下的一级区划 | 452 |
| 辅助断续线要素 / 段数 | 1 / 10 |
| 已检查环方向与球面面积的面片 | 12956 |

227 不是现实世界主权国家数量。源集合包含属地、军事基地和争议制图区域；合并说明如下，南极洲不作为可选国家。无 ADM1 数据的 4 个条目是 `BJN` 巴霍努埃沃浅滩、`BRT` 比尔泰维勒、`SER` 塞拉尼拉浅滩和 `SPI` 南巴塔哥尼亚冰原。没有数据时应明确显示未收录区划，不生成虚构“省”。只有一个要素也不表示该地区存在有意义的内部分区。

## ID、合并与架空改编

- 普通国家尽量使用 ISO A3，例如 `CHN`、`USA`、`JPN`、`FRA`、`GBR`、`SSD`、`PSE`。Natural Earth 源 ID `SDS`、`PSX` 等先映射为 ISO 标识，确保国家和一级区划引用一致。
- 按用户已确认的架空设定，将 `RUS UKR BLR MDA EST LVA LTU GEO ARM AZE KAZ UZB TKM KGZ TJK` 合并为 `SUN`，名称为“苏维埃社会主义共和国联盟”。十五者不重复作为国家显示；452 个一级区划归属 `SUN`，同时保留 `sourceCountryId` 供来源追踪。不据此增加历史、制度或剧情设定。
- 同一 ISO 国家在来源中拆开的微小区域合并入该国：`FRA + CLP`、`BRA + BRI`、`AUS + IOA + CSI + ATC`；`KAZ + KAB` 并入 `SUN`。`metadata.mergedSourceCountryIds` 保存完整对应关系。
- 中国一级区域继续使用现有 34 省级区域集合，世界外框与断续线采用 DataV 中国图源。本项目按用户指定的地图呈现，将 Natural Earth 源 `CHN / TWN / HKG / MAC / PGA / SCR` 归入 `CHN`；`TWN`、`HKG`、`MAC`、`PGA`、`SCR` 均不作为独立国家条目，也不进入国家搜索列表。来源ID只保留在 `metadata.mergedSourceCountryIds.CHN` 供溯源，不是可选择国家别名。
- 台湾仅作为 `id = "710000", name = "台湾省", countryId = "CHN"` 的省级区域存在。构建断言台北与高雄坐标均位于 `CHN` 外框内，同时拒绝独立的台湾国家条目。
- 无标准 ISO 标识的源制图区域保留 `ESB KAS WSB SPI BRT BJN SER`。这些是来源制图标识，不是新增的现实国家声明。`KAS` 明确显示为“克什米尔争议地区（锡亚琴冰川）”，不直接归并为印度或巴基斯坦。
- 中国地图调整属于本项目选用的数据呈现；来源中不同边界表达仍在构建脚本与元数据保留记录，不扩展为现实主权争议的结论。
- 中国省级 ID 保持 `330000` 等，浙江地级 ID 保持 `330100` 等，`chinaCities.properties.parentId = "330000"`。

## 用户指定的中方地图呈现与已核对来源

本项目按用户明确要求，优先采用中方表达并保留架空 `SUN`。以下归并同时修改国家几何、一级区划父级和可搜索国家集合；原始 ID 仅用于溯源：

| 源 ID | 地图归属 | 中方官方来源 |
| --- | --- | --- |
| `KOS`（兼容 `XKX`） | `SRB` 塞尔维亚 | [2026-05-25 中塞联合声明](https://www.fmprc.gov.cn/web/zyxw/202605/t20260525_11917435.shtml)，表述科索沃和梅托希亚为塞尔维亚南部省份并重申尊重其领土完整。 |
| `SOL` | `SOM` 索马里 | [2026-01-12 中索外长共同新闻公报](https://www.fmprc.gov.cn/wjbzhd/202601/t20260112_11811361.shtml)，明确索马里兰属于索马里。 |
| `CYN / CNM` | `CYP` 塞浦路斯 | [2022-08-05 中国驻塞浦路斯使馆谈话](https://www.fmprc.gov.cn/ziliao_674904/zt_674979/dnzt_674981/qtzt/gytwwtdlc/zwgzs/202208/t20220805_10734887.shtml)，明确北塞属于塞浦路斯；联合国缓冲区也不另列国家。 |
| `USG` | `CUB` 古巴 | [2024-01-25 中国驻古巴大使谈话](https://www.fmprc.gov.cn/web/gjhdq_676201/gj_676203/bmz_679954/1206_680302/1206x2_680322/202401/t20240125_11232992.shtml)，将关塔那摩基地表述为古巴领土遭占用。 |

参考依据还有自然资源部 [《公开地图内容表示规范》（2023，外交部公开副本）](https://www.mfa.gov.cn/web/wjb_673085/zzjg_673183/bjhysws_674671/bhflfg/dtdmxgfl/202303/P020230313585504979937.pdf) 及 [标准地图服务系统](https://bzdt.tianditu.gov.cn/)。规范明确台湾和港澳的省级表达、南海与东海有关线段、克什米尔争议地区表达等。上述文件和已查官方说明记录在 `metadata.officialPresentation`。

未取得足够依据的归属不自行认定。Natural Earth 的 `ADM0_A3_CN` 仅是该数据项目的视角属性，不能代替中国官方标准地图核验；例如不能据此把锡亚琴直接归并为印度。本次落实明确归并和中国完整呈现，不宣称全球每条边界已完成官方规范逐项认证。克什米尔相关最终归属参照 [外交部立场说明](https://www.fmprc.gov.cn/fyrbt_673021/jzhsl_673025/202001/t20200117_5418524.shtml) 保留争议地区表达。

为防止 DataV 中国外框与 Natural Earth 邻国面发生重叠，构建时将全部外国国家与一级区划减去完整 `CHN` 范围，并保留差集交点的计算精度，避免舍入后又跨回边界。本次处理了 12 个国家和 65 个一级区划；受影响的 77 个原面变为 98 个面，没有删除完整国家、区划或未参与裁剪的微小岛屿。变更 ID、面数与处理量写入 `metadata.chinaOverlapClipping`。台北、高雄和藏南验证点均只命中中国国家/省级区域，普里什蒂纳验证点只命中塞尔维亚及归入塞尔维亚的区划。

## 精度与使用范围

所有面片和小岛都保留，微型国家（包括梵蒂冈、摩纳哥、瑙鲁、图瓦卢等）不会因较小面积被过滤。全球视图时它们可能小于屏幕一个像素，界面应同时提供名称搜索、列表或可点标记。

为兼顾单张 PNG 和手机内存，构建时对国家使用 0.03°、一级区划使用 0.02° 的最大简化容差；小环按自身跨度自动降低容差。一般坐标保留三位小数，舍入造成退化的微小环保留六位或原精度。辅助断续线保留源坐标的八位精度，境界差集保留计算所得交点精度，不凭空绘制经纬度。保留所有 Polygon/MultiPolygon 面片，统一为 d3-geo 所需的环方向，并验证每个面片球面面积有限、大于零且小于半球。生成文件约 6.75 MB，浏览时不需要再下载这些数据。

这是一套经过概括的游戏地图，不是实时行政区登记或测绘成果。细小相邻边界可能出现亚像素缝隙，源数据也可能落后于现实行政变化。仅浙江含本项目沿用的地级轮廓，其他省份与各国并未因此获得城市、道路、真实旅行或剧情内容；地图的轻微起伏和地标模型属于界面展示，不能声称来自高程测绘。

## 再生成与数据契约

在工程根目录运行，缓存目录可放在当前工作线程的 `work/atlas-source`：

```text
node scripts/prepare_atlas_data.mjs <原始文件缓存目录> --download
```

`--download` 仅从脚本写死的 HTTPS 官方地址更新 Natural Earth 的 `countries.json / subdivisions.json` 和 DataV 的 `china-full.json / china-outline.json`。离线重建时省略该参数。输入只读；输出固定为本工程 `src/frontend/atlas-data.json`。`polygon-clipping` 在构建时合并外框，不进入前端运行时。生成结果记录原始内容 SHA-256、固定来源提交、覆盖数、缺失条目、ID 映射和简化参数；构建会拒绝悬空国家引用、重复 ID、缺失的既有中国省份、缺失的断续线、独立台湾条目、退化面片或错误环方向。

```text
countries: FeatureCollection<{ id, name }>
subdivisions: FeatureCollection<{ id, name, countryId, sourceCountryId? }>
chinaCities: FeatureCollection<{ id, name, countryId, parentId }>
chinaMaritimeLines: FeatureCollection<MultiPolygon, { id, name, countryId, kind, sourceId }>
metadata: 来源、覆盖统计、合并记录、无数据列表、精度与限制
```

`chinaMaritimeLines` 的字段名表示地图辅助线集合，但其源几何实际为狭长 `MultiPolygon`：渲染时应作为不可选的线形辅助符号填色/描边，不挤出为地块或放入国家、区划菜单。中国视野应将它与中国外框一并纳入拟合范围，以保留最南端的符号。

本次数据检查：4794 个要素、12956 个面片全部通过有限坐标/有效球面面积检查；省级引用无悬空项，国家与一级区划 ID 无重复，中国 34 省和浙江 11 市完整保留，国家集合无独立台湾、科索沃、索马里兰或北塞条目，中国外框包含台北/高雄检查点，10 段辅助线完整，`SUN` 下的来源国家覆盖全部十五个加盟共和国。此检查只证明数据构建与结构，不替代界面、手势或酒馆实机验收。
