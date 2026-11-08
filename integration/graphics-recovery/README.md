# 沙盘与 Live2D 恢复（2026-11-08）

地图操作栏增加「刷新沙盘」，小说顶部的「↻」按钮可刷新立绘及当前打开的沙盘。刷新保留地图范围、朝向和缩放；只重建显示资源，不经过世界行动、存档或内容生成入口。

## 已定位与修复

- 沙盘初始化失败及 WebGL 上下文丢失后，组件进入可重试状态，刷新使用新画布与渲染器。
- 删除后台沙盘预热和常驻解码模型/GPU 缓存。保留原本地字节缓存；关闭地图、转入其他地图层或隐藏页面时释放资源。重开需要重新载入本地模型，原生 DPR 保留，环境动画上限为 30 fps。
- 沙盘几何体、材质、纹理、实例对象及战机独立特效由所属视图负责释放。修复战机特效仅被移出场景却未释放，以及缓存材质目录积累运行时条目的问题。
- Live2D 不再为不可见的初始视图加载；关闭/遮盖视图或隐藏页面时释放。短暂切到其他说话人可保留 15 秒，期间暂停动画。加载期间关闭后，迟到的结果会清理，不重新挂回界面。
- Lite 原先借用同一纹理 Blob URL，Pixi 按 URL 缓存纹理，单人/双人立绘释放纹理时可能互相影响。现在两份立绘各自持有本地纹理 URL；释放实例不会撤销已安装素材的 URL。
- 渲染器创建失败会释放素材租约。无法取消的本地 Live2D 解码等待结束后清理，避免先撤销 URL 使解码中途失败。
- 地图操作可换行，手机顶部日期与操作按钮分行，刷新画面按钮触控区至少 44×44。

## 回归方式

使用 `diagnose` 与 `code-security` 的诊断/资源所有权检查方法；最初的沙盘失败恢复、隐藏 Live2D 初始化和战机资源释放用例均先观察到失败。Lite 双实例纹理隔离用例也先观察到失败。

```text
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
node node_modules/vitest/vitest.mjs run tests/graphics-recovery.test.ts tests/live2d-soyo-assets.test.ts tests/live2d-soyo-runtime.test.ts tests/tokyo-sandbox-camera.test.ts tests/tokyo-sandbox-resolution.test.ts tests/network-identities.test.ts tests/xitter.test.js tests/novel-invitation-portraits.test.ts tests/novel-standing-speaker.test.ts
node node_modules/vite/bin/vite.js build --outDir outputs/graphics-recovery/build
python scripts/build_graphics_recovery_release.py
node node_modules/@playwright/test/cli.js test --config playwright.graphics.config.ts
```

组件测试使用实际 Vue/Three 场景树与模拟渲染器；浏览器测试使用生产 Lite IIFE、本地 ZIP、真实 WebGL 和项目已有浏览器演示宿主。通过 `WEBGL_lose_context` 分别模拟沙盘和 Live2D 故障，再点击实际恢复按钮；重复刷新、关闭地图回到立绘，检查相机不变、页面错误、远程/API 请求、时钟、布局溢出和顶部重叠。浏览器演示的进度在内存中，localStorage 和时钟检查不等于真实酒馆存档写入审计。

结果、截图、测试与产物哈希见 `outputs/graphics-recovery/verification.json`。产物独立存于 `outputs/graphics-recovery/release/`，未覆盖 Xitter 交付目录、未部署或推送。验证记录中的提交状态对应当时的验证阶段；用户随后要求将本次修复正式提交到当前 `lite` 分支。`outputs/graphics-recovery/debug/` 仅保留迁移前源码和一次性编辑脚本，脚本不得重复执行。

2026-11-08 最终结果：类型检查通过；9 个测试文件共 45 项通过；生产构建通过；233 个 ZIP 素材的字节长度、SHA-256、来源构建及产物哈希全部校验通过。Headless Edge/Chromium 的 1440×900、1280×800、390×844、320×568 四项恢复流程通过，无页面异常、额外远程/API 请求、横向溢出或顶部重叠；沙盘每项连续局部刷新三次，并额外验证顶部刷新入口。桌面与手机截图已复核。

## 验证边界

这次验证了图形故障恢复和明确的资源清理缺陷，未复现用户原始整页崩溃，不能确认原崩溃必为内存溢出，也不能保证设备显存不足时总能重建成功。未运行 CI、GitHub Actions、Agent Edition、真实模型请求或 TauriTavern 真机验收。登记的 7 个 worktree 目录及 Git 入口存在，不代表已经逐文件证明误删前后的内容完全一致。
