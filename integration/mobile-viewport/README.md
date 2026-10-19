# 手机恢复按钮与底部裁切修复（2026-10-19，待整卡验收）

本分支只修布局，不包含独立 API 分支的功能，也不修改世界状态、聊天、人物或资源素材。此前聊天中的生成效果图不是代码修复或交付卡。

## 代码

`src/frontend/shell-viewport.ts` 在 Shell 挂载后取得布局租约，`main.ts` 在退出、切聊天及启动失败时释放。使用可视视口高度约束容器，对宿主 html/body 的平移型 fixed 包含块偏移进行补偿；监听 VisualViewport resize/scroll 和工具栏实际高度变化。不修改原生宿主布局，不访问游戏状态。

手机端独立“恢复酒馆”按钮移到顶部右侧，并给标题和切换聊天预留实测宽度；隐藏重复的 Vue 退出按钮，紧急恢复仍在 Vue 外。桌面保留右下恢复入口。CSS 布局使用实际导航栏高度 + 安全区 + 间距共同决定阅读区底边；输入框保留多行高度，长回执与错误信息可滚动。短可视区域紧凑显示输入区，视口恢复后自动恢复普通布局。

## 已实际执行

- 独立 TypeScript 模块 strict 检查通过。
- Chromium 144：13 组真实浏览器 DOM/CSS 受控测试通过，包含 1440×900、1280×800、390×844、320×568 的小说/场景布局、缩小可视区域、34px 底部安全区、59px 宿主平移，以及模拟键盘收缩与视口偏移。
- 检查输入/发送/恢复的矩形不重叠、输入未被阅读框裁切、六个导航按钮完全可见且可点击、全文布局、退出后原生输入可用；四尺寸截图已检查。
- 2 项 bootstrap 受控桩测试通过：正常退出释放布局租约，布局绑定失败时退出已挂载 Shell。
- 测试所用基础 `shell.css` 和 `novel-mode.css` 与基线 Git blob 逐字相同，分别为 `dd76202a67ec9e89706ea784cabf03b004a55eb1`、`1aa4b0e255a68d30bb530e5f76ea53b11a989ab4`。

记录见 `outputs/mobile-viewport-verification.json`。这些检查是布局夹具，不是完整 Vue/Three.js/手机应用，不等同于 TauriTavern 真机通过。

## 重跑

已有项目 TypeScript、Python playwright 和 Chromium 后：

```sh
python scripts/verify_shell_viewport.py --chromium /path/to/chromium
node scripts/verify_shell_bootstrap.cjs
```

## 合并前仍需完成

完整项目依赖、类型检查、单元与 E2E、内嵌手机联调、重建 PNG 及 iPhone TauriTavern 实测。当前隔离环境未取得完整构建依赖，没有生成或更新用户已导入的 PNG。

特别注意旧 E2E 的位置假设：`tests/e2e/shell.spec.ts` 中“390px 嵌入手机保留 Shell 的退出与导航空间”直接选择原 Vue 退出按钮；地图场景另要求恢复按钮位于窗口下方。顶部独立恢复替代重复按钮后，这两处需改为选择 `[data-unread-city-rescue]` 并判断窗口/控件不重叠，而不是继续要求旧的上下位置。本轮未将整个既有 E2E 套件标为通过；PR 保持 Draft。
