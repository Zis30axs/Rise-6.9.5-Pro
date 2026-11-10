# 未读之城 / Unread City

面向 SillyTavern 的私人、可扩展人生模拟世界工程。源码分模块维护，交付时将基础卡、世界书和沉浸式前端脚本封装成 **一张 Character Card V2 PNG**。

当前源码构建仍需相邻的 `ST-iPhonie` 源仓库。本项目供本人私用，目标包含手机上的 TauriTavern；记录版本便于维护，不设置额外的版本门槛；不建立公开 SDK 或第三方插件生态。

## 文档导航

- [更新日志](docs/CHANGELOG.md)：按日期记录的开发进展（原 README 顶部的倒序日志原文）。
- [历史档案](docs/history/README.md)：已归档的界面说明、历史验收与历史阶段原文。
- [AGENTS.md](AGENTS.md)：工程记忆入口，开工前先读 `DeepSeek.md`、`CODEX.md` 和本文件。
- [CODEX.md](CODEX.md) / [DeepSeek.md](DeepSeek.md)：工程决策与模型协作说明。

## 本地运行

开发需要 Node.js 24、npm 和 Python 3.10+。在项目根目录执行：

```bash
npm install
npm run dev
```

打开开发服务给出的本地地址，使用浏览器演示模式。演示模式可以检查布局、六类面板、状态变化、退出和模拟聊天 A/B 切换；存档只在内存中保留，刷新即清空。它不代表已经连接 SillyTavern 或真实模型。

## 构建单张 PNG

准备有效封面 PNG，默认路径为 `assets/cover.png`，然后执行：

```bash
npm run build
python scripts/build_card.py --frontend dist/immersive-shell.js
python scripts/inspect_card.py dist/unread-city.png
```

也可以使用整合入口：

```bash
npm run card
```

`dist/immersive-shell.js` 是包含 Vue、Three.js、d3-geo、CSS、处理后的地理轮廓及内置 ST-iPhonie 的单文件 IIFE；完整内容写入 `data.extensions.tavern_helper.scripts`，PNG 不需要再托管这个前端文件。`scripts/build_embedded_phone.mjs` 从相邻的私有手机源码仓库 `D:\.study\ST-iPhonie` 读取白名单代码与资源，生成 `src/frontend/generated/embedded-phone.ts`；`npm run dev` 和 `npm run check` 的前置步骤会重新生成默认内嵌包，`npm run build` 随后将它并入同一 IIFE。维护构建需要该手机源码，导入成品 PNG 的设备不需要此目录。

默认构建不携带约 24 MB、304 项的原装音效包，手机中仍可手动导入音效。完整音效包属于高级构建选择，须检查最后产物中的资源；不能假设预先生成的带音效文件会在后续默认构建中保留。手机代码、样式和分词资源随卡携带；私人数据、设置、密钥与聊天存档不进入构建。3D 几何、静态降级图和地理资源也在本地打包。构建器使用固定脚本 ID 更新本项目脚本，保留其他扩展与其他脚本，不修改 `src/card.json`。附带的 P0/P1 使用说明仅追加到构建产物的 `creator_notes`。

自定义封面与输出路径：

```bash
python scripts/build_card.py --frontend dist/immersive-shell.js --image assets/your-art.png --output dist/my-card.png
```

不传 `--frontend` 时保留原有基础卡构建方式，只包含卡片数据和世界书；这类 PNG 不具有沉浸式界面。

需要可直接导入的 V2 JSON 角色卡时：

```bash
python scripts/build_card_json.py --frontend dist/immersive-shell.js --output dist/unread-city.json
```

JSON 与 PNG 使用同一份卡片数据、世界书和前端脚本，`spec = "chara_card_v2"`、`spec_version = "2.0"`；JSON 本身不携带封面图，SillyTavern 导入 JSON 时会使用默认头像。不传 `--frontend` 时只输出基础卡片数据与世界书，不包含沉浸式界面。

## 玩家安装与进入

1. 在目标酒馆环境准备 [Tavern-Helper（酒馆助手）](https://github.com/N0VI028/JS-Slash-Runner)，确认它能加载角色脚本。ST-iPhonie 已随卡内嵌，无需再单独安装手机扩展。目标手机的实际兼容性仍需导入检查。
2. 将构建好的 `unread-city.png` 作为角色卡导入 SillyTavern，打开该角色的新聊天。
3. 按酒馆助手提示授权、启用角色脚本。本卡脚本的数据字段设置为启用，首次执行仍受助手的授权机制控制；启用后会检查助手与当前单人聊天，满足条件时自动进入。
4. 退出后使用脚本按钮 **“进入未读之城”** 重新打开全屏界面；使用 **“恢复原生界面”** 或界面内退出入口回到原生聊天。
5. 使用模型叙事前，在 SillyTavern 选择 **Chat Completion（聊天补全）** 并连接模型；桥接检查的 `mainApi` 值为 `openai`，它表示酒馆的聊天补全接口类别，不要求模型供应商必须是 OpenAI。

点击常驻金色“手机”按钮，在悬浮窗中打开真实 ST-iPhonie；后台随 Shell 连接，窗口按需展示。已有兼容实例时优先复用，否则启用内置手机。加载失败会显示原因与重试入口；关闭手机窗回到场景，Shell、阅读位置和世界进度保留。人物页可直接打开对应手机会话，金色入口显示当前剧情空间的真实未读数。开场示例 NPC 与示例消息会同步进该聊天的剧情手机空间，示例内容仍不代表正式设定。PNG 使用标准 V2 元数据承载脚本。普通 PNG 查看器和未安装酒馆助手的酒馆不会因此获得脚本执行能力；“单张 PNG”携带本项目界面和手机应用，但不安装酒馆、酒馆助手或配置模型服务。当前支持单人角色聊天；现有编解码器只维护 V2，重新嵌入时会移除旧 `chara` / `ccv3` 元数据。本项目前端打包不从 CDN 加载 Vue 或界面素材。酒馆助手本身的安装、依赖与上游 CDN 路径属于另一层，不能由此宣称整个运行环境可完全离线。

## 当前关键决定

- **可选 Live2D 素材扩展包（2026-11-10，issue #86）**：MyGO + Ave Mujica 十人共 94 套实有服装，以独立可选的 `assets/live2d-ensemble/unread-city-live2d.zip` 交付（54,248,815 字节）。新卡可在原生酒馆页面通过“安装 Live2D 素材 ZIP”安装、停用或移除；不安装时沿用原有立绘。模型只进入可选 ZIP，基础必需 ZIP 的 236 项素材保持不变。小说立绘根据权威游戏环境稳定选择服装；实际装载成功的在场人物才进入独立衣着上下文，不修改世界书或增加模型请求。来源、数量、安装机制、状态隔离、验证与限制详见 [扩展包说明](integration/live2d-ensemble/README.md)。本轮本地定向测试、构建与受控浏览器检查不代表真实酒馆对话或 TauriTavern 真机验收；未运行 CI/Agent Edition。
- **剧情标签与独立 API（2026-10-19）**：推荐模型返回 `<story>`、`<phone_messages>` 标签，按需加 `<world_actions>`、`<world_events>`；正文沿用 `|角色名|情绪|台词|` 标记；旧版纯 JSON 仍兼容。状态面板底部「独立叙事引擎」可切换模型或自定义 OpenAI 风格接口；API 密钥只写当前标签页 `sessionStorage`，同源脚本仍可能读取，请勿向不受信任的脚本或代理提供敏感密钥。
- **TauriTavern 大卡导入（2026-10-19）**：另有 Tauri 导入压缩版 PNG（35.20 MB），仅把角色元数据由 `tEXt` 转为标准 `zTXt` 无损压缩，解压后原文逐字节相同；已在 iPhone 16 / TauriTavern `dev (223be954afa7)` 上验证可正常导入使用。
- **远程加载优化（2026-10-19）**：角色按需加载，首页只下载摘要；缓存命中时只返回 330 字节。角色列表由约 65 MB 降至约 4.5 KB。
- **手机与剧情联动（2026-10-17）**：NPC 用稳定 ID 对应真实手机联系人；剧情空间 ID 为头像文件名与聊天 ID 的 SHA-256；当前范围为剧情收件 + 已读回传；手机 TauriTavern 真机仍需导入检查。
- **日常活动程序结算（2026-10-18）**：整理书桌、温习、自习、浏览书架、长椅休息点击后由程序直接结算并保存，不再自动填入对话或覆盖草稿；床铺三档（短休 15–30 分钟、中休 1–2 小时、长休 7–9 小时）与学习三档（短时 15–30 分钟、中时 1–2 小时、长时 2–4 小时）均在区间内随机确定一次整数分钟。
- **界面与地图（2026-10-17–18）**：3D 漫游 / 纯小说可随时切换；地图为沙盘 → 城市 → 所在区域 → 世界连续缩放；地理数据与地标几何全部内嵌。

## 运行与恢复机制

全屏 Shell 覆盖原生聊天，Tavern-Helper Bridge 负责识别当前聊天、读写状态、调用叙事生成和订阅切换事件。退出会清理挂载与会话监听，恢复原生滚动与焦点。世界权威状态使用聊天变量 `unread_city`，持久化依赖酒馆助手；模型生成结果不直接写入原生聊天楼层。取消会使本次结果失效并尝试按生成 ID 停止请求，但上游生成仍可能继续。

## 验证

```bash
npm run check
npm run test
npm run test:e2e
python scripts/validate_card.py
python -m unittest discover -s tests -v
```

首次运行端到端浏览器检查可能需要安装浏览器：

```bash
npx playwright install chromium
```

也可使用已安装的 Google Chrome。PowerShell 中指定浏览器通道后运行：

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:e2e
```

不设置 `PLAYWRIGHT_CHANNEL` 时，默认使用 Playwright 的 Chromium。

## 目录与维护

```text
src/
  card.json                 # 用户维护的 V2 基础卡；不由前端构建覆盖
  worldbook/*.json          # 构建时合并的世界书
  schemas/                  # 原有内部协议草案
  modules/campus/           # 正式校园机制预留
  runtime/                  # P0/P1 确定性状态转换
  frontend/                 # Vue 3 + TypeScript 界面、Bridge 与生命周期
assets/                     # 封面及本地资源
scripts/
  build_card.py             # 标准库构建；可选嵌入单文件前端
  build_embedded_phone.mjs   # 私有手机源码白名单构建；生成内置运行时
  card_codec.py             # V2 PNG 元数据编解码
  inspect_card.py            # 检查产物摘要
  validate_card.py           # 基础结构校验
tests/                      # 前端、运行时、PNG 打包回归
dist/                       # 可重新生成的本地输出，不作为源码提交
```

源码仓库可以保持私有，但 PNG 中包含可提取的 JavaScript、界面资源、世界书和角色卡数据；压缩打包不能保证源码逻辑保密。密钥、个人环境和聊天存档不进入卡片。ST-iPhonie 当前未发现覆盖整体项目的许可证声明，本次按本人私用维护，不承诺公开再分发授权；已识别的第三方资源许可证随生成说明保留。

格式与依赖参考：[Character Card V2](https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md)、[Tavern-Helper 源码](https://github.com/N0VI028/JS-Slash-Runner)、[SillyTavern 角色设计](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)。

## 本机扩展与工作范围

扩展安装与源码维护分开，清单记录在 [`integration/extensions.json`](integration/extensions.json)。2026-10-17 核对到的本机状态如下，版本仅作维护快照：

| 组件 | 源码 / 来源 | 本机安装 |
| --- | --- | --- |
| 本角色卡与 Shell | `D:\.study\cc` | 构建后以 PNG 导入酒馆 |
| SillyTavern 1.18.0 | [SillyTavern](https://github.com/SillyTavern/SillyTavern) | `D:\SillyTavern` |
| ST-iPhonie 0.7.83-fish-mobile.5 | `D:\.study\ST-iPhonie`；[本人 Fork](https://github.com/Zis30axs/ST-iPhonie) | `D:\SillyTavern\data\default-user\extensions\ST-iPhonie` |
| Tavern-Helper 4.9.1 | [官方仓库](https://github.com/N0VI028/JS-Slash-Runner) | `D:\SillyTavern\public\scripts\extensions\third-party\JS-Slash-Runner` |

ST-iPhonie 纳入本项目的联调与维护范围，手机功能继续在自己的私有仓库维护，选定代码与资源经白名单构建后进入角色卡。
