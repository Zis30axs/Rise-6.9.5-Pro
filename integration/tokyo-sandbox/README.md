# 东京三维城市沙盘增量（2026-10-31）

## 数据与展示

- 用户提供离线 GLB（6,232,488 字节，SHA-256：`12151a8faa994e1740abbd18f67d37a8aa315e8ce60b6b8d03aff0b22f387afb`）与对应 JSON。
- JSON 作为 **展示资源** 存于 `assets/models/unread-city-tokyo-sandbox-data.json`：8 城区、23 地标、34 建筑、44 道路、44 人物描述。为符合项目中文文本规范，只将两处招牌的假名改为中文，其他记录保留。
- `CitySandboxScene.vue` 接入 `WorldMap.vue` 的**城市总览**。需要 WebGL；新 JSON 的城区和建筑用于绘制离线微缩城市。若 GLB 已本地安装，优先以 `GLTFLoader` 显示原始三维模型；若未安装或无法解码，采用 JSON 生成的轻量三维城市；若 WebGL 不可用，则回退旧版 SVG。
- 所有 GLB 图像与 buffer 都在本文件内。加载器拒绝带外部 URI 的纹理与 buffer，禁止远程模型请求。
- 原用户文件 GLB 因当前连接只支持文本形式的仓库写入，**暂未放进本开发分支**。已配备独立离线 ZIP；将其中 `assets/models/unread-city-tokyo-sandbox.glb` 放入仓库同名路径即可自动成为构建可选资源。请勿为了导入素材触发远程 CI。
- 新增 `market-district` 仅在总览中展示为地名说明，暂不作为可点击旅行目的地；该地需要单独完成区划、公交、室内入口及结算才能启用。

## 有意不改动的游戏权威状态

- 现存七城区、室内地图、公交、玩家位置、NPC 在场及旧存档仍由 `scene-layout.ts`、`map-districts.ts`、`world-presence.ts` 与运行时状态管理。用户提供的新沙盘坐标系与当前游戏存档坐标系不同，因此**不得直接覆盖权威坐标**。
- JSON 中地标服务（31 项）、44 人物昼夜默认坐标、`currentClock` 仅为资料，不直接送入 LLM 或游戏 MVU，避免假消费、假工资、假出场或重复服务。
- JSON 中 `courthouse`、`bank`、`market`、`tsukinomori` 等地标尚未与现有运行时地点一一注册。开放前不得伪装为可执行旅行。
- 地图城市/城区层级、四主角各自存档、GTA 式切换、人物头像接近与好感门槛、原本的室内入口及电话通知继续使用原结构。

## 验证与限制

- 已用本地脚本检查原始 GLB 头、版本、长度、chunk 与无外部 URI 依赖。元数据 ID 检查：城区与地标唯一、44 位人物的昼夜位置均引用现有地标。
- 新增 `tests/tokyo-sandbox-data.test.ts` 作为后续回归断言，**本次未实际运行 Vitest / Vue 类型检查 / 真实浏览器 / 酒馆 / Tauri 真机**。
- 仍需有原始 GLB 的分支构建验证、手机 GPU 性能评估、市场区可操作化与 3D 室内/细节联动验收。
- 禁止主动执行 GitHub Actions/CI；所有本分支提交包含 `[skip ci]`。
