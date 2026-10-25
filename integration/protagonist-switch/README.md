# 渐进切换与城市沙盘（2026-10-25）

## 玩家操作

切换主角时，镜头升起 1.2 秒、沿城市移动 1.6 秒，再下降 1.2 秒。3D 模式先抬升实际相机，小说模式先缩小背景并淡出立绘，两种模式共用城市几何过渡。室内位置按建筑入口衔接。点击“跳过”或按 Esc 完成切换；系统偏好减少动态效果时，使用 150ms 淡入淡出。动画中可以“恢复酒馆”。

地图默认显示城市。点击校园、杂司谷、池袋、目白台或神田川，进入对应城区的详细沙盘；左上角“← 返回城市”恢复进入前的缩放、朝向和平移。地图范围入口是城市、所在区域、世界。城区详情属于城市内部层级，城市与详情内缩放都保持当前层级。

地图浏览不保存或推进游戏状态。各地点沿用现有出行规则；3D 远郊和室内仍通过已有步行、入口和公交机制出行。

## 状态与清理

- `protagonist-switch.ts` 管理临时切换租约，预览目标状态；开始时取消旧生成，横移结束后保存主角一次。手机重新绑定复用此次保存。
- `switch-camera.ts` 只修改展示相机，保留玩家眼位、朝向和存档位置；`LocalMapGeometry.vue` 与沙盘共用几何。
- `ProtagonistSwitchOverlay.vue` 管理阶段、背景预加载、目标场景准备和清理；目标未就绪时最多等待 1.5 秒。
- 切换期间屏蔽场景输入、发送、交互和手机写操作。保存失败保留原主角并恢复输入。退出、切聊天、隐藏页面或卸载释放临时资源；旧生成结果不能写回。
- `map-districts.ts` 统一五个城区的边界、房间归属和目的地；房间地图锚点使用入口。

## 本地验证

类型检查、生产构建、17 项当前 Vitest 通过，其中 10 项覆盖切换租约、相机恢复与城区归属。浏览器定向运行共 23 个不同场景通过：14 项切换/沙盘、8 项既有立绘/看手机 CG、1 项实际 Lite ZIP 安装。既有历史测试删除保持用户工作区状态，本记录不代表被删除的历史完整套件已重跑。

四尺寸均检查小说切换、五城区、左上角返回、列表滚动、按钮点击、无横向溢出与 3D 室内往返：1440×900、1280×800、390×844、320×568。短屏沙盘内容通过窗口滚动访问。截图与记录见 `outputs/switch-map-qa/`、`outputs/switch-map-verification.json`。

使用无窗口 Playwright Chromium 和受控 Tavern/Helper。DSH 浏览器工具不可用；没有真实模型调用、远程 CI、本机酒馆部署或 TauriTavern 真机验收。

复现（PowerShell；本机 Python 与 Chromium 需已安装）：

```powershell
$env:PATH = 'C:\Users\Administrator\AppData\Local\Programs\Python\Python312;' + $env:PATH
$env:PLAYWRIGHT_BROWSERS_PATH = 'C:\Users\Administrator\.cache\ms-playwright'
npm.cmd run build
npx.cmd vitest run
npx.cmd playwright test tests/e2e/protagonist-switch-map.spec.ts tests/e2e/protagonist-standing-portrait.spec.ts tests/e2e/protagonist-phone-pose.spec.ts --workers=1
npx.cmd playwright test tests/e2e/switch-map-package.spec.ts --workers=1
```

## 交付

目录 `outputs/switch-map-20261025/`：普通 Lite 卡 25,424,659 字节、Tauri 导入版 9,536,468 字节、素材 ZIP 44,395,404 字节。仍需酒馆助手安装与授权；首次导入后安装配套 ZIP，刷新页面。单个助手脚本内保留手机，封面沿用用户确认的红黄三人海报。

`packaging-audit.json` 记录卡内脚本一致性、102 件 ZIP 资源的大小与哈希、看手机 CG、封面图像块以及 Tauri 压缩元数据的无损还原。`package.py` 为本次封装核验脚本，重新交付时使用新的输出目录。
