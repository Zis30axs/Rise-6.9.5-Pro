# 系统键盘与固定前端

2026-11-10：用户明确要求整个前端固定。系统键盘覆盖页面，正文、输入框、工具栏、立绘、浮层和普通/放大手机保持输入前的尺寸与屏幕位置。键盘可能遮住原本靠下的控件，收起键盘后恢复可见。

## 原因与修复

原 `shell-viewport.ts` 将视觉视口高度缩小直接应用到 Shell，原手机宿主随缩小后的槽位重新缩放。只固定根节点仍不足：直接使用 `dvh` 的放大手机和高度媒体查询中的人物立绘会继续变化。

- 在触摸设备的 Shell 文本输入或原托管手机同源 iframe 文本输入期间，保存输入前的布局尺寸。跟踪视觉原点偏移，抵消 WebView 的原生平移。
- 失焦可能早于键盘收起；确认键盘已占用高度后，保持布局直至高度恢复。真实宽度/方向变化重新建立尺寸，关闭键盘后的高度增长不会永久锁在中间高度。
- 同步固定安全区。所有前端高度断点由稳定高度生成 `data-uc-max-height`，相关样式统一使用 `--uc-viewport-height`。`:where(:host(...))` 保持原高度媒体查询的选择器优先级。
- Shell 使用布局包含，使固定菜单和弹窗也基于固定的 Shell。保留桌面正常缩放、原输入内容及退出时的样式和原生输入恢复。

只修改展示层，不改手机源码、游戏时钟、存档、模型请求或发送规则，不设置全局 viewport 元数据、不禁止用户缩放。

## 本地回归

```powershell
node node_modules/vitest/vitest.mjs run tests/shell-keyboard-viewport.test.ts tests/phone-spatial-scroll.test.ts tests/novel-portrait-size.test.ts tests/novel-invitation-portraits.test.ts tests/no-japanese.test.ts
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
node node_modules/vite/bin/vite.js build
node scripts/check_keyboard_layout.mjs --phone-source D:\.study\ST-iPhonie
```

`check_keyboard_layout.mjs` 在真实无头 Edge 中使用生产 CSS、视口逻辑、原手机 `panel-host.js` 与空间手机渲染。手机内容是隔离夹具。390×844、320×568、844×390、1024×768 四尺寸，各覆盖小说、普通手机、放大手机，以及视觉视口变化和实际 layout viewport 缩小，共 24 场景。检查背景容器、工具栏、输入框、手机缩放、单/双立绘、Live2D 容器和固定浮层的坐标尺寸；同时模拟安全区由 34px 变为 0、失焦与收起、草稿和退出恢复。

`check_packaged_keyboard.mjs` 使用最终 `dist/immersive-shell-lite.js`、配套离线 ZIP 和真实内嵌手机，宿主与初始存档为夹具；在 390×844、320×568、1440×900 检查三种输入场景。先通过原安装入口导入 ZIP，再刷新加载最终脚本。只输入草稿，不发送，阻止外部与模型网络请求。

打包检查中的收起手机使用 DOM 点击：既有可选 Live2D 安装入口在桌面放大手机时会遮住关闭按钮。本轮记录该既有遮挡，不把这一步称为真实指针命中验收，也不扩展修改安装入口。

报告在 `outputs/keyboard-layout/`：`reproduction.json` 保留初始 12 场景中 11 个失败；`viewport-only.json` 保留只固定外层时放大手机仍失败的结果；最终结果见 `browser.json`、`packaged-browser.json`、`unit-tests.json` 与 `verification.json`。截图中的视觉偏移由事件模拟，截图顶部白带不代表真实系统键盘外观。

## 交付与边界

`outputs/keyboard-layout/release/` 保存通用 PNG、Tauri 专用压缩元数据 PNG、Lite 脚本及配套素材 ZIP。卡内脚本与最终构建逐字核对，Tauri PNG 仅无损转换元数据容器。已有可选 Live2D ZIP 沿用原包。

没有运行 GitHub Actions/CI、Agent Edition 或真实模型，没有更新用户正式酒馆、手机源仓库和存档。浏览器结果不是物理 TauriTavern/iPhone 系统键盘或真机导入验收。旧 `verify_lite_release.py` 的单素材包断言与此前加入的可选 Live2D 包不兼容，本轮未改动或宣称通过该完整验证器。
