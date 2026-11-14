# 北京市沙盘接入说明

本包覆盖北京中心城区以及颐和园、圆明园附近，包含 33 处可选地点、48 段双向示意连接、5 条推荐行程。独立演示从故宫博物院开始，可点选地点、预览路线和试走行程。地图道路、交通时间与建筑比例采用演示尺度。

| 文件 | 用途 |
| --- | --- |
| `unread-city-beijing-sandbox.glb` | glTF 2.0 二进制模型，顶点颜色，无贴图与外链资源。单个合批网格、33 个命名地点节点。 |
| `beijing-atlas.json` | 地点 ID、中文文案、坐标、分类、双向连接、行程与地理资料。模型及个人位置标记使用同一坐标系。 |
| `source/` | 模型、地点与离线演示的生成源码。 |
| `preview/` | 老城胡同、方庄居民区的近景、夜景与同机位前后对照，另有各主要地标渲染。 |

## 模型与地点坐标

- Y 向上，X 正向向东，Z 正向向南。本地原点使用近似经纬度 `[116.4, 39.931]`，约 100 米对应一个地面单位。地标和地形进行了垂直夸张。
- 每个 `places[]` 条目的 `[x, y, z]` 与 `modelNode` 的平移相同，节点 `extras.locationId` 指向稳定的 `beijing-*` ID。Y 是标签锚点高度。角色脚点应使用地面或经确认的入口坐标。
- `bounds` 是平移和地图投影边界，单位沿用 GLB。地图自带地形底座。缩放模型时，用相同变换处理锚点与 `routes[].points`。
- `routes[].points` 是自 `from` 至 `to` 的 `[x, z]` 折线。反向时倒序读取。分钟数是演示用估算，角色卡正式线路的耗时、票价与限制由运行时给出。
- `places[].aliases` 是地点的可选搜索别名。`focusAreas[]` 用地点 ID 组成区域镜头，区域分组与各地标沿用同一地点目录。可选的 `view` 指定近景镜头中心 `x, z`、弧度 `yaw, tilt`、以及相对总览的 `zoom`。
- `beijing-cctv-headquarters` 在国贸，`beijing-central-tv-tower` 位于玉渊潭西侧，这两个地点各有独立锚点和行程连接。
- `beijing-olympic` 表示奥林匹克公园公共步道，`beijing-bird-nest` 和 `beijing-water-cube` 分别表示各场馆外的到达点。地标动作可进一步绑定角色卡的营业时间或场所准入。

## 胡同与住宅

- `beijing-nanluoguxiang` 对应南锣鼓巷公共街道，`beijing-fangzhuang` 对应方庄街区总览。两个地点均提供近景入口。院落和楼栋以地区建筑类型为参考，布局、数量及楼层是演示设计。
- 沙盘用多组正房、厢房、院心与门楼表现胡同，住宅组团由砖楼、板楼和塔楼围绕林荫步道与共享绿地组成。主要模型仍为单个合批网格，保持与既有加载器兼容。

## 日间与夜景

演示的「夜景」控制光照、投影和灯带。GLB 中自定义顶点属性 `_GLOW` 为每顶点的灯光强度，范围为 0–1。常规 GLB 查看器可按顶点颜色渲染白天模型。角色卡如需夜景，可在宿主渲染层读取该属性并从既有游戏时钟派生时段。地点、路线与时钟的权威状态仍由角色卡管理。

## 接入《未读之城》

1. 在 `lite` 中参考 `src/frontend/CaliforniaSandbox.vue` 的挂载边界。将本模型和地图 JSON 放到独立的北京素材目录，使用现有 `.glb?inline` 或素材加载方案；把地点 ID 和预览选择接到宿主状态。地图渲染可用现有 Three.js GLTFLoader，地点详情和路线折线读取 JSON。HTML 内嵌的离线演示适合单独预览。
2. 在目的地目录注册获准参与旅行的 `beijing-*` ID，参考 `src/runtime/model.ts` 中 `novelDestinations` 和 `planNovelTravel` 的校验。2026-11-14 读取的 `src/runtime/california.ts` 使用 `internationalLeg` 和 `internationalConnections` 查单段连接。北京的市内多段推荐线路可作为计划展示；逐段确认和结算继续使用同一旅行事务。城际入口、返程、正式票价及开放条件在接入时确定。
3. 在 `src/frontend/WorldMap.vue` 的纯小说地图分支挂载北京沙盘。由宿主传入当前主角 `locationId`、允许的路线和忙碌状态。确认前往时发出地点 ID，沿用 `travelTo` 经 `runInteraction` 提交 `novel_travel`，收到保存后的状态再更新当前位置。北京当地时刻从权威游戏时钟派生。
4. 验收首个入口、双向路线、余额与场所限制、返回原地图、四主角独立位置和旧存档。核对 Lite 素材 ZIP 打包是否包含 GLB、离线打开时是否能进入北京列表，并在目标 TauriTavern 设备验证 WebGL、手势及内存。

## 重新生成独立演示

从解压根目录运行 `python3 source/data.py`、`python3 source/model.py`、`python3 source/build.py`。生成器使用 Python 标准库，在 `output/` 生成模型和 HTML。用支持 WebGL 2 和 Compression Streams 的浏览器打开 HTML；无法初始化 3D 时仍可浏览地点与路线。

本轮通过 Blender 导入、OpenGL ES 3.2 几何渲染、GLB 与 HTML 数据一致性校验，以及模拟浏览器环境中的 1089 对路线、三个视口的地标标签、胡同与居民区近景、昼夜切换和静态回退测试。托管环境的浏览器本地文件策略限制了真实网页验收，TauriTavern 真机验收待开展。

## 资料

- [UNESCO 北京中轴线地图](https://whc.unesco.org/en/list/1714/maps/)
- [北京市政府 中轴线沿线景点](https://english.beijing.gov.cn/travellinginbeijing/citytours/202006/t20200608_1918916.html)
- [北京市政府 奥林匹克公园](https://english.beijing.gov.cn/travellinginbeijing/focus/202012/t20201214_2164198.html)
- [OMA 央视总部大楼](https://www.oma.com/projects/cctv-headquarters)
- [KPF 中国尊](https://www.kpf.com/project/citic-tower-china-zun)
- [北京市政府 中央电视塔](https://english.beijing.gov.cn/travellinginbeijing/attractions/202603/t20260320_4562520.html)
- [北京市政府 玉渊潭公园](https://english.beijing.gov.cn/beijinginfo/culture/beijingtownscape/parks/202401/t20240116_3536974.html)
- [北京市政府 颐和园](https://english.beijing.gov.cn/specials/strollthroughbeijing/imperialgardens/202611/t20261109_4938611.html)

- [北京大学 燕园地标](https://www.pku.edu.cn/visit.html)
- [清华大学 大礼堂](https://www.redweb.tsinghua.edu.cn/info/1023/1780.htm)
- [北京市政府 798 艺术区](https://english.beijing.gov.cn/forum/2026citytour/citytourright/202610/t20261002_4889380.html)
- [北京市政府 亮马河](https://english.beijing.gov.cn/travellinginbeijing/attractions/202603/t20260323_4563863.html)
- [Olympedia 国家速滑馆](https://www.olympedia.org/venues/2140)

- [北京市旅游 南锣鼓巷的胡同与四合院](https://english.visitbeijing.com.cn/article/4FYfqejIeRN)
- [北京市政府 什刹海街巷](https://english.beijing.gov.cn/travellinginbeijing/hotroutes/202406/t20240627_3730281.html)
- [Mapcarta 方庄街区](https://mapcarta.com/N8987580503)

《未读之城》参考入口见 [WorldMap.vue](https://github.com/Zis30axs/Rise-6.9.5-Pro/blob/lite/src/frontend/WorldMap.vue)、[CaliforniaSandbox.vue](https://github.com/Zis30axs/Rise-6.9.5-Pro/blob/lite/src/frontend/CaliforniaSandbox.vue) 与 [model.ts](https://github.com/Zis30axs/Rise-6.9.5-Pro/blob/lite/src/runtime/model.ts)。
