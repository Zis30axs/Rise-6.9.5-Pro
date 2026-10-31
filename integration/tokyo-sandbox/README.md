# 东京沙盘替换与 Lite ZIP 合并（2026-10-31）

## 当前决定：Lite PNG + 一份本地资源 ZIP

用户要求**移除旧沙盘展示**、由提供的东京 GLB 取代，并让新 GLB 与其他人物/背景素材统一进入现有 `unread-city-lite-assets.zip`。不要切换为“所有资源内嵌一张大 PNG”；先前的 `build_tokyo_single_card.py` 保留作可选实验脚本，不是本次 Lite 发行入口。

- 用户提供的原始 GLB 长度 6,232,488 字节，SHA-256 为 `12151a8faa994e1740abbd18f67d37a8aa315e8ce60b6b8d03aff0b22f387afb`。
- `src/frontend/WorldMap.vue` 城市总览与各城区详情改为**同一个** `CitySandboxScene.vue`，从新模型调整镜头，不再渲染旧 `CampusMapScene` 或其 `LocalMapGeometry`。
- `ProtagonistSwitchOverlay.vue` 的 GTA 风格升空/横移/落地背景也改用东京新模型，旧 `LocalMapGeometry` 不再作为切换沙盘。
- 城市总览提供 7 个现有可进入城区的按钮，新增 `market-district` 暂为展示标注；详细沙盘仍显示已有的地点操作、已知人物头像、游戏当前位置和路段事件。浏览地图不扣时间/精力。
- `src/frontend/tokyo-sandbox-map.ts` **只用于渲染坐标适配**。新资源旧坐标不一致，绝不直接替换存档里的人物位置、旅行逻辑、MVU 或 NPC 调度；所有可执行服务继续由原有运行时校验。原自由行走的街道物理碰撞与室内场景仍是独立系统，本轮没有把它们替换成未经验证的新 GLB 网格。
- 新模型解码失败时使用**新 JSON** 生成简化三维预览，WebGL 不可用时显示无三维地图提示及原地点列表；不会回退显示旧沙盘。

## Lite 资源包

`CitySandboxScene.vue` 使用 `import.meta.glob(..., { eager: true, query: '?inline', import: 'default' })` 将 GLB 作为一个完整静态 Base64 data URL 放入原构建 IIFE；现有 `scripts/build_lite_release.py` 自动把 data URL 提取为 ZIP 的 `assets/<sha256>`，而非额外的 JS 文件。已有 `scripts/lite_asset_loader.js` 负责 ZIP 校验、IndexedDB 缓存与本地 Blob URL，不联网。

此版本的 Lite 构建器及 `scripts/verify_lite_release.py` 都会强制核对上述 GLB SHA-256 与 6,232,488 字节。模型未实际进入 ZIP 时直接报错，禁止生成“看上去成功但没有沙盘”的 Lite 发布物。仍只使用原有一份 Lite 资源 ZIP，并自动包含其他已进入 ZIP 的素材。

## 离线本地打包

当前 GitHub 连接**不能将用户上传的原始二进制 GLB 写入私有仓库**，因此 PR 仅包含源码与 JSON，且无法从远端直接生成完整发行 ZIP。用户提供的原始 ZIP 已保留为本地输入；本地构建命令：

```powershell
py scripts/build_tokyo_lite.py unread-city-tokyo-sandbox-offline-asset-pack.zip
```

脚本校验原始 GLB 哈希，将其放在 `assets/models/unread-city-tokyo-sandbox.glb`，然后使用本机已有 `npm run build`、`build_lite_release.py`、`build_lite_card.py`、Tauri PNG 转换器和现有资源完整性校验。输出三项：`dist/unread-city-lite.png`、`dist/unread-city-lite-tauri.png`、`dist/unread-city-lite-assets.zip`。如果只需安装二进制而不执行构建，可使用 `--install-only`。如需跳过 Tauri 包，可使用 `--skip-tauri`。

构建环境仍要求 Node/npm、原有本地 ST-iPhonie 工程、此前已有的图片及背景构建输入。ZIP 为 STORE、数据-only，禁止远程下载模型或加载器。

## 真实边界

- `assets/models/unread-city-tokyo-sandbox-data.json` 已提交：8 城区、23 地标、34 建筑、44 道路与 44 人物**展示性**资料。为符合工程禁用日文假名约定，两处招牌改为中文。人物昼夜默认位置与数据里的临时服务不能绕开真正的世界状态。
- `market-district`、法院、银行、月之森高中等新增功能入口仍需独立接入地点/公交通勤/服务结算，现阶段仅展示，不伪造玩法。
- 这次修改**没有本地完整仓库、没有重新生成完整 Lite PNG + ZIP，也没有执行 Vue 类型检查、Vitest、浏览器验收、iPhone/TauriTavern 真机测试**。模型解码和移动端性能均待实际确认。
- 用户已禁止主动触发 GitHub Actions/CI，全部提交采用 `[skip ci]`。PR 保持 Draft，未经验证不合并 lite。
