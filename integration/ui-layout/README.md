# 《未读之城》沉浸界面自定义布局

隔离分支：`fix/customizable-shell-layout-20261020`，PR #7 → `lite`。开发基线为 `lite@e5bcac3`，后续 Lite 新修复在完成前不得直接覆盖。

## 已实现

- 从 `lifecycle.ts` 真正删除独立「恢复酒馆」按钮及所有事件、定位、生命周期引用；右上角仅保留原有可用「切换聊天」操作（执行现有 `actions.switchChat` 并释放内置手机/原生展示控制）；Esc 和 Tavern-Helper 的恢复入口保持。
- 移动端阅读层默认高度从此前约42%缩至约27%（受185～255px和可用视口上下限约束），顶部显式拉条可以上下拖动，不必先进入编辑模式。
- 右上角「布局」进入布局编辑，「完成」退出；HUD 中的标题、模式切换、底部导航、阅读框、浮动工具窗、场景按钮、通知、小说人物立绘、Live2D 等拥有移动与缩放角标。传统桌面浮窗标题栏拖动同步持久化。
- 在浏览器本机 `localStorage` 保存**仅几何参数**，按 `mobile/desktop × scene/novel` 分离；点击「重置」清除所有自定义几何。不会写 `WorldState`、聊天变量、真实手机存储或角色卡 PNG。
- 统一手机上方安全区；取消额外「恢复酒馆」按钮预留的空白。地图、地点、日程、背包、状态等弹窗为实测底栏和手势区留空，并允许内容独立滚动。手动缩放/移动布局亦按底栏空间约束。

## 验证

- `tests/shell-layout.test.ts`：边界裁剪、顶边缩放、分设备/模式存储、拖动保存与重置。
- `tests/lifecycle.test.ts`：不创建独立恢复按钮；原生 DOM、聊天切换、Esc、卸载状态与保存回滚。
- `tests/e2e/ui-layout.spec.ts` 和 `tests/e2e/shell.spec.ts`：1440×900、1280×800、390×844、320×568；另测短可视屏幕、纯小说移动布局、菜单滚到底、原生恢复。
- `scripts/verify_shell_viewport.py` 与隔离夹具：四视口/安全区/宿主 transformed fixed 布局探针。
- GitHub Actions：`adjustable-hud-pr.yml`，每次提交运行前端类型/生产构建、选定单元与 Chromium E2E，产出 `outputs/ui-layout-qa` 截图。已通过的回归构建：[ea01f4a](https://github.com/Zis30axs/Rise-6.9.5-Pro/actions/runs/39430170058)、[2cc83d2](https://github.com/Zis30axs/Rise-6.9.5-Pro/actions/runs/39430417595)。

## 不包括

- 未覆盖原生 iPhone/TauriTavern UI 测试：Chromium 模拟视口≠真机硬件。
- 未更新用户已导入的 PNG，也未生成当前 PR 对应新 Lite ZIP/PNG 发行文件。
- 不改 Lite 外置 ZIP 加载、完整角色卡素材、剧情世界书与模型协议。
- 最新 Lite Bug 修复尚由其它工作推进；PR #7 继续 Draft，不自动合并，待与修复后的 `lite` 对齐再验收。
