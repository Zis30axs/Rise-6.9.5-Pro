# 手机设备视觉

最初接续已合并 PR #4 补齐双设备视觉；2026-10-24 在当前 Lite 源码上补齐艾玛手机。沿用设备外观偏好及内嵌构建接线。

| 设备 | 壁纸与卡片 | 默认界面 | 桌面习惯 |
| --- | --- | --- | --- |
| 长崎素世 | 奶油底、鼠尾草绿、花叶与柔和曲线 | 日间 | 消息、日历、相册、备忘录优先 |
| 丰川祥子 | 深蓝、银色谱线、月轮与琴键 | 夜间 | 日历、备忘录、音乐、Appie Pay 优先 |
| 樱羽艾玛 | 黑色主调、樱花粉、蓝色双条纹与夜樱 | 夜间 | 消息、日历、Twiitch、相册优先 |

这些是可修改的游戏视觉默认值，不作为原作中手机型号或使用习惯的考据结论。

## 素材与接入

`assets/phone-visuals/` 包含 82 件原创 SVG：3 张 390×844 壁纸、素世/祥子各 23 个图标、艾玛 24 个图标（额外含 Twiitch），三人各 3 张 360×210 银行卡底图。全部由 `python scripts/build_phone_art.py` 可重复生成；`--check` 逐字核对输出，manifest 记录字节数与 SHA-256，写入固定 UTF-8/LF，跨平台字节一致。字体、余额、持有人和卡片名称均由手机页面绘制，SVG 不依赖字体、网络、图片服务器或生成 API。银行卡是虚构游戏账户。

既有 `scripts/build_embedded_phone.mjs` 通过一个虚拟素材模块接入这些 SVG；只扩展原手机注册表和桌面渲染，仍使用同一个 ST-iPhonie runtime。未复制、推送或另发手机源码。固定手机基线及原复现补丁保持。

“桌面与外观”可选择签名壁纸/纯色、日间/夜间/系统主题、日常/专注排列。控制中心的主题按钮也写入当前设备。布局保留旧快捷栏中的绘图等应用，未排在首页的应用继续留在后续页面。此版本提供排列预设，不新增自由拖拽桌面编辑器。

外观存于 `protagonists.devices[owner].appearance`，设备 ID 来自已有权威账户。字段可选，旧 1.12.0 存档缺字段时读取各自默认值，不自动写入或更改余额。保存遵循原绑定、修订号、原子保存与请求去重；只能修改自己的外观，切主角/切聊天后的迟到请求会被拒绝。已有笔记/相册的底层数据分区限制仍按 PR #4 原说明，不把视觉分离称作全部手机数据已隔离。

## 离线构建与降级

设备 SVG 总计 50,010 字节（艾玛新增 19,103 字节），均留在内嵌手机 UI 内；无需为它们增加 ZIP 安装步骤。另有既有 Twiitch 频道的 13 件素材，总装载 95 件 SVG。Lite 仍按原 `build_lite_release.py` 提取大型静态图片/模型，使用原本地 STORE ZIP + IndexedDB/Blob 加载机制。以后新增大型静态图继续走该链路，不复制手机运行时。

构建阶段缺文件、哈希不符、非静态 SVG 都会失败；运行时某张壁纸不可用时使用设备专属渐变，图标缺失时退回现有 glyph，银行卡缺失时保留纯色底、余额与持有人。运行时降级不会尝试在线下载。Lite ZIP 整体缺失/损坏时继续沿用现有原生聊天与安装/重试流程。

## 验证与发布边界

2026-10-24 本地检查：`npm run build`、`python scripts/build_phone_art.py --check`、`npx vitest run tests/phone-appearance.test.ts tests/third-protagonist.test.ts`（14 项）、`node --test tests/phone-visuals.node.mjs tests/lite-phone-compat.node.mjs`（8 项）和 `npx playwright test tests/e2e/phone-visuals.spec.ts --workers=1`（四视口）通过。检查三人切换、日间选择保留、纯色/专注排列、卡面/图标装载、钱包滚动、可点击和无横向溢出；截图在 `outputs/emma-phone-qa/`。前期测试定位器歧义和动画中间帧测量已修正，最终四场景在同一新生产 bundle 上通过，不累加重跑次数。

艾玛默认夜间，但不迁移已保存的外观选择；样式按当前设备 owner 隔离。原 `emma-soft` 账户主题标识保持。PNG/ZIP 独立交付目录为 `outputs/emma-phone-20261024/`；可用 `python -X utf8 scripts/audit_phone_visuals.py --card <卡路径> --lite --report <新报告路径>` 核验，避免覆盖历史报告。生产浏览器测试加载完整 IIFE 和真实内嵌手机，Lite 产物另外做卡内脚本逐字、单 runtime、SVG 哈希、ZIP 逐项哈希及压缩元数据还原核验。没有部署、公开推送、模型调用或 iPhone/TauriTavern 真机测试。

历史专用 `phone-visuals.yml` 验证 main，并把当时增量临时应用到固定 Lite `4a4e970` 做兼容构建；该记录不代表本轮运行 GitHub CI。

验证包括原创素材复现、缺失资源回退、旧存档、设备偏好保存/切换/重载、失效绑定、真实内嵌手机四视口（1440×900、1280×800、390×844、320×568）、PNG 脚本逐字一致、手机 runtime 一份及 Lite ZIP 逐项 SHA 校验。截图和构建报告在对应 Actions 附件中；通过与否以该次实际运行结果为准。没有进行 iPhone/TauriTavern 物理设备验收。
