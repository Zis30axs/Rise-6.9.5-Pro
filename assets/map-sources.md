# 地图底图与架空改编

历史底图记录，核对日期：2026-10-17。当前发布改用 `src/frontend/atlas-data.json`，来源、归属处理与完整断续线见 [atlas-sources.md](atlas-sources.md)。`map-data.json` 仅保留国内基础缓存和与新版同步的世界数据；前端不再加载旧的独立世界图。

## 世界国家

- 数据：Natural Earth，1:110m Admin 0 Countries。
- 官方介绍：https://www.naturalearthdata.com/downloads/110m-cultural-vectors/110m-admin-0-countries/
- 官方数据仓库原文件：https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson
- 授权：https://www.naturalearthdata.com/about/terms-of-use/ （公有领域；允许修改和分发）。
- 改编：依据作者明确设定，保留“苏维埃社会主义共和国联盟”。将数据中的十五个前加盟共和国几何求并集，成为一个国家要素 `SUN`，不把内部共和国再显示成独立国家。此改编用于架空世界，不是对现实国界或现存国家的声明，也未建立历史年份、政治制度或剧情设定。
- 微小区域、边界和岛屿受原始110m比例尺限制。南极洲不作为可选出行国家。

## 中国与浙江

- 数据下载：阿里云 DataV.GeoAtlas 公共 GeoJSON。
- 中国省级形状：https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
- 浙江地级形状：https://geo.datav.aliyun.com/areas_v3/bound/330000_full.json
- 提供方区域下钻说明：https://help.aliyun.com/zh/datav/datav-6-0/user-guide/drilldown-choropleth-layer-of-v1-x
- 保留原提供方的数据权利；此处记录来源，不将其宣称为公有领域或自行授予再许可。地图仅作作者本机架空世界原型的示意底图，发布前可替换为已明确授权的同结构底图。

旧处理保留三位坐标和 Polygon/MultiPolygon。新版另行保留完整中国轮廓、南海及台湾东侧断续线，不能再按无名称丢弃辅助要素。校园、沙盘与所在城市是玩法示意布局，不是测绘结果；用户只确认浙江，具体所在城市仍未命名。

## 重新生成

旧三文件生成管线已停用。按 `atlas-sources.md` 准备新版缓存目录；兼容入口也统一调用新版构建与归属校验，并同步旧缓存：

```text
node scripts/prepare_map_data.mjs <新版 atlas 原始文件目录> [--download]
```

`polygon-clipping` 仅供构建底图求并集和裁切，不进入前端运行时。输出固定为本工程的 atlas 与兼容缓存。修改数据后重新检查国家归属、投影、搜索与地图手势，不恢复旧的国家拆分。
