# 城市沙盘独立预览

此入口直接渲染 `src/frontend/WorldMap.vue` 及其真实 `CitySandboxScene.vue`、`AtlasMapScene.vue`，与角色卡同源。它不挂载完整 Shell、酒馆宿主、手机、剧情生成或真实玩家存档。页面刷新后重新创建一份内存世界，初始地点为南门、游戏时间为 17:30。

## 启动和构建

从仓库根目录直接执行 Vite，避免 `npm run build` / `dev` / `check` 所关联的发行卡、手机、素材和验证 hooks：

```bash
node node_modules/vite/bin/vite.js --config vite.city-preview.config.ts --host 127.0.0.1 --port 5193
node node_modules/vite/bin/vite.js build --config vite.city-preview.config.ts
node node_modules/vue-tsc/bin/vue-tsc.js -p tsconfig.city-preview.json --noEmit
```

开发地址为 `http://127.0.0.1:5193/`，静态输出为 `dist/city-sandbox/`。整个目录可以作为静态网站发布，保留 `index.html` 与 `assets/` 的相对位置；不得只上传 HTML。

独立类型配置继承根目录的严格 TypeScript 选项，只把本预览入口与离线 ZIP 声明作为根文件。Vue 类型检查会沿真实导入关系覆盖 `WorldMap.vue`、`CitySandboxScene.vue`、运行时和地图依赖；不会把无关的完整 Shell、手机或 Live2D 入口一并纳入。

## 运行边界

- 初始状态来自 `createInitialState()`，只为此展示把初始时钟设为 17:30。之后地图出行调用现有 `reduceState(..., { type: 'novel_travel' })`；现行代码中没有独立的 `applyNovelTravel` 导出。运行时内部的 `planNovelTravel` 保留实际路线、时长、车费、精力、室内与开放条件结算。
- 浏览、平移、旋转、缩放和进入城区仅是地图展示状态。实际旅行由现有地图目的地按钮触发。不开启真实时钟、模型任务或剧情自测试。
- `ShellModel` 仅存在于当前页面内存。所有宿主、手机和生成控制均未挂载；未读取或写入 LocalStorage、IndexedDB、酒馆聊天变量或其他玩家数据。
- 地图 CSS 直接引用现有 `world-map.css`、`campus-map.css`、`atlas-scene.css`，本目录样式只负责独立页面外壳。
- `vite.city-preview.config.ts` 复用现有离线 ZIP 加载插件。仅在此网站构建中把图片和头像转换成同源静态资源 URL；GLB 与 ZIP 仍按现有离线资源安全边界保留 Base64。角色卡原始 `vite.config.ts`、资源字节及发布流程未改。
- GLB、地图地理数据、角色图册和第三方依赖分块输出，避免把整个网页打成单个巨型 JavaScript 文件。真实的 GLB 渲染失败时，实际组件自身的几何回退保持可用；预览不强制 `previewOnly`。

## 依赖与检查

使用项目现有 Vue、Vite、Three、d3-geo 和本地地图/头像/图册资源，无新增依赖。检查应覆盖 1440×900、1280×800、390×844、320×568 的首屏、地图交互、城区进入与返回、目的地旅行和溢出；浏览器视口验证不代表真实酒馆或 TauriTavern 真机验证。此入口不运行 CI、Agent Edition 或真实剧情模型。

### 2026-11-08 定向检查记录

- 独立 `vue-tsc -p tsconfig.city-preview.json --noEmit` 通过，退出码 0。导入图包含实际 `WorldMap.vue`、`CitySandboxScene.vue`、`AtlasMapScene.vue`、城市光影与 Canvas 模块及 `src/runtime/model.ts`；不包含完整 `src/frontend/App.vue`、`phone-runtime.ts` 或 `SoyoLive2D.vue`。
- 在 Vue SSR 上下文中运行本预览真实 `App.vue` 的 `dispatch` 和现有 reducer：南门前往图书馆成功；随后请求不存在的目的地正确返回失败，提示“不存在的地图目的地。”，序列化世界状态保持不变，`busy` 释放，旧的“已抵达”播报已清空。这里只验证操作逻辑，不冒充浏览器交互或真机验收。
- 核对当前 `dist/city-sandbox` 构建：139 张外部图片均与仓库 `assets/` 中的素材逐字节一致，没有空文件；其中 111 张位图均可解码，28 张 SVG 的 XML 格式有效。`character-art` 分块里的 36 张内嵌 WebP 与 `generated/downtown-art.ts` 原文逐张逐字节一致，均可解码。没有替换占位图。
- 内嵌城市 GLB 为 6,232,488 字节，与源模型一致，SHA-256 为 `12151a8faa994e1740abbd18f67d37a8aa315e8ce60b6b8d03aff0b22f387afb`。这项检查证明打包字节一致，不代表浏览器使用了 WebGL 而非组件自己的 Canvas 回退。
- 保留原始 `character-art` Base64 分块。原图回退校验只接受内嵌数据或 Blob URL；因此没有把该分块直接改成图片 URL，也没有改动原图校验、生成素材源或资源加载边界。
