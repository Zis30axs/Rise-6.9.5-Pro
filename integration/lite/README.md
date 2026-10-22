# 未读之城 Lite · 本地资源外挂预发行

版本：lite-v0.2.0-emma（角色卡版本 2026.10.22.2）。构建源为 Lite 提交 `1f42504`；已包含 PR #18 的魔裁视觉接入、樱羽艾玛第三主角、PR #17 的受控 NPC 联系与 PR #15 的双向短信。该预发行不会覆盖完整版或旧 Lite 附件。

## 发布物

- unread-city-lite-tauri.png：可导入 TauriTavern 的轻量 Character Card V2 PNG。角色设定、完整世界书、剧情逻辑、内嵌手机运行时保留。
- unread-city-lite-assets.zip：离线本地资源包，只包含图片、模型、Live2D 等数据，不包含需安装的插件或需要执行的脚本。
- lite-verification.json：SHA-256、体积、移出资源数及世界书校验。

轻量卡在 ZIP 尚未安装时不启动游戏前端，而是保留原生角色聊天界面。首次在该卡聊天中执行角色脚本，右上角会显示“📦 安装 Lite 素材 ZIP”。点按钮从 iPhone“文件”中选取配套 ZIP，校验并缓存完成后刷新页面重新进入角色；同源环境后续从 IndexedDB 按 SHA-256 恢复素材 Blob URL，不访问素材服务器。

如果按钮未出现，检查 Tavern-Helper / 酒馆助手是否允许执行角色脚本。ZIP 不是角色卡，不要用酒馆“导入角色卡”按钮导入。

## PR #4 已包含的核心功能（不代表全部需求完成）

- 素世／祥子双主角切换：保留各自的位置、背包、手机、剧情与学业状态，共享游戏世界时钟；旧存档首次启用时升级到 `1.12.0`。
- 独立手机身份、设备 ID、手机使用数据与 Appie Pay 虚拟账户：按整数分记账，连接现有消费/收入；祥子初始 1200 元是游戏设定。
- 内嵌手机应用：Appie Pay、购物、外卖、个人日历、跨主角消息、查手机（含访问权限与审计记录）。购物／外卖确认、扣款、配送、收货、取消与退款由权威世界状态处理。
- 切换主角时隔离手机会话与迟到请求，避免旧视图继续写入新主角状态。

## 发行包来源与核验

- 对应 Actions：[`39456210800`](https://github.com/Zis30axs/Rise-6.9.5-Pro/actions/runs/39456210800)，head SHA 与发布标签同为 `4a4e970e0738492110f961e6c78db41ce91232e9`；CI 结果 `success`，Vitest 47 个测试文件、495 个测试通过。
- 已独立提取 CI 构建的 `unread-city-lite-tauri.png` 中 `zTXt/chara` 角色元数据，确认内嵌脚本含 `switch_protagonist`、`phone_app`、Appie Pay 以及 `worldshop`、`worlddelivery`、`worldcalendar`、`worldmessages`、`worldpeek`。
- Release 的 PNG 与对应 CI Artifact SHA-256 一致：`070500fcf9877c352cba2c274cbe534e07d100becd60429e8c739e4b1f044b9c`（6,967,426 字节）。离线 ZIP SHA-256：`66d5e341fcc776fd36d4bd64b96bc8a02d655672680492c15a53300d8966cf78`（30,691,827 字节）。59 项外置素材，包含 PR #6 的 18 张已批准图片。
- 上述为发行字节、脚本与构建层面的核验，**不是 TauriTavern/iPhone 真机交互验收**。

## 本地构建（需完整依赖和固定 ST-iPhonie 基线）

    python scripts/build_downtown_art.py --require-ready
    npm run phone:build
    npm run build
    python scripts/build_lite_release.py
    python scripts/build_lite_card.py
    python scripts/build_tauri_import_card.py --source dist/unread-city-lite.png --output dist/unread-city-lite-tauri.png
    python scripts/verify_lite_release.py

检查严格要求 Lite PNG 小于 25,000,000 字节，PR #6 的 18 张已批准图片全数外置，ZIP 每个资源核对 SHA-256，世界书中仍包含丰川祥子。失败则不得发布。

GitHub Actions 的 .github/workflows/lite-prerelease.yml 在 push lite 分支时自动构建和校验，通过后以预发行发布 PNG、ZIP 和验证报告，原版 42.7MB PNG 不被覆盖。

## 已知边界

- 预发行并非 iPhone 真机验收：IndexedDB 配额、文件选择权限、WebKit Blob URL 资源解析需要手机确认。
- ZIP 使用不压缩的 STORE 格式，避免额外解压库和一次性展开压缩 ZIP 的内存峰值。
- 只把静态资源文本移出 IIFE 并在导入后替换成 Blob URL，不执行 ZIP 内容；Lite 分支已适配人物/车辆/飞机 GLB 与素世 Live2D 的本地 Blob URL 读取。仍须在 iPhone 上验证实际渲染。
- PR #4 尚未完成全部视觉与模拟需求：双主角手机只有不同配色，银行卡使用 CSS，应用仍是通用占位图标；祥子没有独立 3D 主角模型。后台自主日程、LLM 手机补充、完整知情边界、全部旧笔记／相册设备分区等仍待后续实现。
- 本次仅纠正 RC2 的发布说明，不修改已发布的 PNG、ZIP、校验文件、标签或已有存档。游戏原有模型调用流程不被扩展为在线素材下载。

## RC2 修复：丰川家会客厅 / 祥子立绘

main 和 lite 原本使用相同的 toyokawa_living_room.webp（相同 Git Blob SHA 和清单 SHA-256），但 RC1 外挂 ZIP 加载后将素材地址变成 blob: URL，旧的运行时 PNG/WebP 校验只接受 data: URL，导致会客厅错误回退到默认 bedroom-day 背景，且祥子立绘也受影响。RC2 仅在 Lite 分支接受 SHA-verified ZIP 安装后恢复的本地 Blob 图片地址，保留不受信任 URL 拦截和素材字段校验。新增对应回归测试。RC1 保持可下载，用于回退或对比。
