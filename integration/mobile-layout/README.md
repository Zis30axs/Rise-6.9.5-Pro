# 移动端恢复按钮与底部可视区域修复

基线：`main@dc1b01669a5f269c2a37d8d57e1a7fe2c4cba34b`。

用户截图显示「恢复酒馆」覆盖发送按钮，底部六项工具栏被裁切。检查源码发现：Shell 使用 `100dvh`，独立恢复按钮使用 `innerHeight - 80 - buttonHeight`，小说阅读框另有固定 `bottom:126px`，它们没有共同的可视高度和预留区。浏览器夹具令 CSS 视口为 844px、native/visual viewport 为 780px，可同时复现遮挡和底部裁切。该复现支持上述故障机制，不表示已经在用户 iPhone 上证明唯一根因。

## 修改

- `main.ts` 仅把挂载入口从 `lifecycle` 换为 `responsive-shell`；原有状态、模型、手机和聊天生命周期代码不改。
- `responsive-shell.ts` 在原挂载完成后安装视口控制器；退出、换聊天、挂载故障沿原回调释放控制器及样式。
- `shell-viewport.ts` 读取实际 VisualViewport 尺寸及偏移，以较小的有效视口设置根容器；补偿宿主的 fixed containing block 平移。监听 resize/scroll 并用 ResizeObserver 跟随工具栏尺寸，不轮询、不修改宿主 html/body 布局。
- 移动端恢复按钮保留 Vue 之外的独立实现，但获得工具栏上方单独一行；阅读框、面板共用测量所得的底部预留量，不再盖住输入框和发送按钮。
- `viewport-layout.css` 让导航、阅读框和弹窗使用同一安全区。移动输入框保留两行高度；长正文和提示可滚动。模拟软键盘缩小可视区时优先保留输入与恢复，导航在键盘收起后自动返回，草稿保持。
- 桌面继续使用右侧工具栏及右下角独立恢复入口。没有删除功能、改角色卡封面或写入存档。

## 本次验证与边界

已执行：视口模块独立 TypeScript strict 检查；5 项几何断言；Chromium 实际 DOM/CSS 夹具中的 14 个布局场景及无页面异常检查（共 15 项记录）。布局覆盖 1440×900、1280×800、390×844、320×568，3D/小说阅读布局、安全区、输入和按钮命中、滚动、恢复、宿主平移、模拟键盘变化与弹窗避让。小屏和桌面截图均已检查。

本次浏览器夹具使用从该基线复制的相关原样 Shell/小说 CSS 规则，以及与提交逐字一致的新视口模块和样式；通过 Python Playwright 驱动系统 Chromium。不是完整 Vue/Three.js 构建、不是原生酒馆、不是 DSH 浏览器或 iPhone/TauriTavern 真机验收。详细边界见 `outputs/mobile-layout-verification.json`。

仓库同时附带 Node/Playwright 复现入口，它会直接展开仓库完整 `shell.css` 及其 CSS imports，而不是使用本次隔离环境的规则摘录：

```sh
node tests/mobile-layout.browser.mjs
npm test -- tests/shell-viewport.test.ts
npm run check
npm run build
```

Node 浏览器入口需安装项目依赖与 Playwright Chromium，可用 `CHROMIUM_PATH` 指定现有无界面浏览器。本环境未执行完整 npm 测试/构建（无仓库依赖和相邻手机源码），也没有执行该 Node 入口；实际执行的是上述 Python 浏览器驱动和等价几何断言。后续必须在完整源码环境补跑，再按原流程构建 PNG；Tauri 专用卡继续采用已确认的无损压缩封装。

**本次不更新 `outputs` 中的现有角色卡 PNG，也不替换手机中已导入的卡。** 旧卡需要导入后续重新构建的交付物才会包含修复。回退源码时恢复 `main.ts` 对 `lifecycle` 的导入即可停用此适配层。
