# 地图与身份关系网头像

现有 27 份 `assets/map-avatars/*.svg`，加上保留的 `soyo.webp`，共 28 张独立头像。SVG 采用 256×256 裁剪视窗，原始立绘二进制原样嵌入，不重新编码、不生成角色，不依赖外链。

## 2026-11-07：初华、海铃、若麦

修复基于 Lite `8545a55`。修改前及完成前检查了最新分支，没有发现这三人的后续头像修复。

| 稳定人物 ID | 新头像 | 原图裁剪框（左、上、边长） |
| --- | --- | --- |
| bang-uika | uika.svg | 178、36、450 |
| bang-umiri | umiri.svg | 174、36、450 |
| bang-nyamu | nyamu.svg | 156、36、456 |

原图均为 `assets/downtown-art/characters/<人物>/casual/neutral.webp`（768×1344）。三人的 15 张常服立绘以及素世旧头像与基线逐字节一致。重新运行 `python scripts/build_ave_mujica_headshots.py` 可复现三份 SVG。

`IdentityCardPanel.vue` 复用 `MapCharacterAvatar.vue` 和地图头像解析器，替代原来的错误映射及未知人物使用睦头像的默认值。地图、身份照片、关系网节点与选中详情使用同一资源。稳定的 bang 人物 ID 优先于联系人改名；头像失败后依次回退到本人立绘、姓名缩写。未知人物显示姓名缩写。

## 本地验证

- 6 个定向测试文件、30 项测试通过：三人稳定 ID 和改名、正确素材、两级加载失败、身份切换恢复、未知人物回退、实际关系网与主角身份证回退。
- 头像相关 Vue/TypeScript 类型检查及使用正式离线资源插件的独立组件构建通过。
- Chromium 打包页面在 1440×900、1280×800、390×844、320×568 下通过：图片解码、地图/关系网资源一致、选中详情、加载失败回退、无页面异常、无横向页面溢出、无外部 HTTP 请求。已目视检查头肩裁剪及桌面/手机关系网截图。
- 这不是完整发行包验收；未重新构建 PNG 卡体和 Lite ZIP，未在实际 SillyTavern、iOS WebView 或 Tauri 上测试。完整应用构建所需的本地 `generated/embedded-phone` 未生成。本次不触发远程 CI/Actions，也不运行 Agent Edition。

复现命令：

```sh
python scripts/build_ave_mujica_headshots.py
node_modules/.bin/vitest run tests/identity-avatars.test.ts tests/map-headshots-assets.test.ts tests/identity-card.test.ts tests/uika-art.test.ts tests/umiri-art.test.ts tests/nyamu-art.test.ts
node_modules/.bin/vue-tsc --noEmit -p tsconfig.identity-avatars.json
node_modules/.bin/vite build --config vite.identity-avatars.config.ts
AVATAR_TEST_PACKAGED=1 node_modules/.bin/playwright test --config playwright.identity-avatars.config.ts
```

构建会自动生成独立测试页。没有可用 Playwright 浏览器时，可用 `AVATAR_TEST_BROWSER` 指定本地 Chromium。受限环境使用 `AVATAR_TEST_SINGLE_PROCESS=1` 时，每个尺寸须单独启动测试进程，例如追加 `--grep 320x568 --output test-results/avatar-320`，避免单进程 Chromium 在多测试上下文之间退出。
