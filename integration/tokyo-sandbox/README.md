# 东京 3D 沙盘：固定资源与 Lite 自动构建

## 最终发行架构

- **仓库源文件（需要一次性提交）**：`assets/models/unread-city-tokyo-sandbox.glb`
- **离线资源 ZIP**（包含本 GLB 与全部外置资源）：`dist/unread-city-lite-assets.zip`
- **普通 Lite 卡**：`dist/unread-city-lite.png`
- **Tauri 专用卡**：`dist/unread-city-lite-tauri.png`
- 不联网，不使用外部 CDN。沙盘模型与其他大体积素材一同打入主 Lite ZIP，沿用同一套 STORE 清单与 IndexedDB 缓存机制。
- 登记：`integration/tokyo-sandbox/pack.json`。城市总览与主角切换里的 `CitySandboxScene` 使用这份模型。
- Su-30SM「45 Blue」继续采用仓库已有的压缩版 `assets/models/ambient-aircraft.glb`，飞机与其他载具控制逻辑不改。

## 首次安装源模型（只做一次）

源 GLB 大小必须是 **6,232,488 bytes**，SHA-256 必须是
`12151a8faa994e1740abbd18f67d37a8aa315e8ce60b6b8d03aff0b22f387afb`。

将它放在 `assets/models/unread-city-tokyo-sandbox.glb` 并 **提交到 Git 历史**。
原始离线素材包中的同路径 GLB 可以直接解压使用。
`git add assets/models/unread-city-tokyo-sandbox.glb` 后提交，这样其他克隆与后续构建都能得到完整资源。

不想手动复制时仍保留一次性导入方法：

```powershell
py scripts/build_tokyo_lite.py unread-city-tokyo-sandbox-offline-asset-pack.zip --install-only
git add assets/models/unread-city-tokyo-sandbox.glb
git commit -m "assets: add canonical offline Tokyo GLB [skip ci]"
```

源文件与其他模型一样作为普通 Git 对象提交，当前仓库没有为 GLB 启用 Git LFS。
源文件未纳入 Git 之前，构建会明确失败，而不是发布只有简化沙盘的卡。

## 后续所有常规构建：不再提供素材路径

```powershell
npm run build
```

会自动执行：

1. `prebuild` 确认仓库中的固定 GLB 存在且结构有效。发布构建不因 SHA-256 不一致而失败；
2. `npm run check` 与 `vite build` 构建原有全量脚本，Vite 静态导入本地 GLB；
3. `postbuild` 自动执行 `scripts/build_lite_release.py`，从脚本里提取大体积素材（包含东京 GLB），统一写入 `unread-city-lite-assets.zip`，再生成 `unread-city-lite.png`；
4. ZIP 使用未压缩 STORE、`manifest.json` 和 `assets/<SHA-256>`。校验器确认主 ZIP 包含该 GLB 的长度和 MIME。不需要验证 SHA-256；文件名里的哈希仍是安装器的内容寻址键。
5. 角色脚本启动后，首次点击“📦 安装 Lite 素材 ZIP”安装此包并刷新即可加载全部素材与东京 3D 沙盘模型。

需要同时生成 Tauri 卡并完整校验时，只用：

```powershell
npm run lite:build
```

该命令不再要求输入 GLB 路径，运行后会生成并校验普通 PNG、Tauri PNG 和主离线 ZIP；后续重建可直接覆盖已生成的 Tauri 专用产物。

## 玩法边界

新模型覆盖城市总览、七片既有城区细节与主角切换过渡。
现有自由漫游碰撞/室内物理不是同一套地图系统，不能误认为本轮自动替换。
新市场区、法庭、银行、月之森高中等的叙事地点和交互需由运行时另外注册、校验；GLB 展示数据不会直接变成 MVU 服务或支付逻辑。

本地预构建需要 Node/npm、ST-iPhonie 与项目现有美术输入；不运行 GitHub Actions/CI。
