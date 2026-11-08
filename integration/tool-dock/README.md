# 可折叠世界面板入口（2026-11-08）

`ToolDock.vue` 复用 `App.vue` 的现有面板列表和 `openWindow`，不新增游戏状态或手机系统。桌面右侧、手机底部默认只展示手机、地图、展开；其他十个入口进入三列菜单，选择功能后收起。保留手机未读角标和当前面板标记，支持按钮收起、点击外部、焦点移出和 Esc。Esc 在宿主关闭手机之前先处理展开菜单。

菜单按实际 Shell 和工具栏位置计算边界，兼容已有拖动布局；空间不足时滚动，点击区域至少 44px。样式由 `shell.css?inline` 导入，随正式 IIFE 进入 ShadowRoot。手机短屏和工具栏移动到顶部时仍可访问最后一项。

## 验证与交付

- `vue-tsc --noEmit`、生产构建、`git diff --check` 通过。
- `node node_modules/@playwright/test/cli.js test --config playwright.tool-dock.config.ts`：12 项通过，包含 1440×900、1280×800、390×844、320×568 四尺寸的菜单、能力、邀约簿检查。菜单使用正式 Lite IIFE 和实际 ZIP；另检查 320×360 短屏、键盘焦点、手机打开时 Esc、未读数与时钟不变。截图和逐视口记录位于 `outputs/tool-dock/`。
- 素材清单与本机已安装 ZIP 的 233 项完全一致，保留原清单指纹和 ZIP，因此现有浏览器缓存继续有效。仅界面代码变化不要求重复安装素材；构建源指纹与被复用的素材包源指纹是分别记录的。
- 已更新 `D:\SillyTavern\data\default-user\characters\未读之城.png` 的自有脚本。以部署时最新 `ccv3` 资料为准保留数据，输出单份 `chara` 避免重复数据块。封面、其他角色字段、资源包和当时 18 份聊天文件均校验保持；原卡备份为 `outputs/tool-dock/installed-card-before.png`，记录为 `outputs/tool-dock/deployment-after.json`。
- 酒馆按文件修改时间读取新卡；用户刷新页面生效。本轮没有强制刷新正在使用的酒馆页面，没有进行 TauriTavern 手机真机验证，没有调用模型、Agent Edition 或 CI。
- 收尾发现上一轮 ST 进程已因 2048 MiB V8 堆上限退出，日志确认 `JavaScript heap out of memory`。已按原启动授权以 3072 MiB 堆上限恢复服务（不是总进程内存上限）；HTTP 200 通过，记录在 `outputs/tool-dock/st-restart.json`。尚未验证长时间游玩内存，不能据此声称分词器或所有内存问题已解决。
