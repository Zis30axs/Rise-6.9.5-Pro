# 未读之城 Lite · 本地资源外挂预发行

版本：lite-v0.1.0-rc1；与 PR #6 已合并主线同步，但不包含 Draft 中的 PR #4 双主角。本分支不覆盖 main 和 42.7 MB 完整卡。

## 发布物

- unread-city-lite-tauri.png：可导入 TauriTavern 的轻量 Character Card V2 PNG。角色设定、完整世界书、剧情逻辑、内嵌手机运行时保留。
- unread-city-lite-assets.zip：离线本地资源包，只包含图片、模型、Live2D 等数据，不包含需安装的插件或需要执行的脚本。
- lite-verification.json：SHA-256、体积、移出资源数及世界书校验。

轻量卡在 ZIP 尚未安装时不启动游戏前端，而是保留原生角色聊天界面。首次在该卡聊天中执行角色脚本，右上角会显示“📦 安装 Lite 素材 ZIP”。点按钮从 iPhone“文件”中选取配套 ZIP，校验并缓存完成后刷新页面重新进入角色；同源环境后续从 IndexedDB 按 SHA-256 恢复素材 Blob URL，不访问素材服务器。

如果按钮未出现，检查 Tavern-Helper / 酒馆助手是否允许执行角色脚本。ZIP 不是角色卡，不要用酒馆“导入角色卡”按钮导入。

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
- 用户聊天、已有存档、完整卡、main、PR #4 不作更改。游戏原有模型调用流程不被扩展为在线素材下载。