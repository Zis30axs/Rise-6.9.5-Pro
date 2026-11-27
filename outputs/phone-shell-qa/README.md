# 主角手机外壳精简 · 本地检查（2026-11-27）

**范围：**`integration/dual-protagonists/phone-visuals.{js,css}`、`phone-apps.js`、`scripts/build_phone_art.py`（及生成的 `assets/phone-visuals/**`）、`scripts/build_embedded_phone.mjs`、`integration/stock-trading/terminal.mjs`。ST-iPhonie 源码未改动、未推送。

**方法：**`npm run phone:build` 生成内嵌手机 runtime，把它挂进 lite 本地演示页（计算机专业 → 纯小说，素世手机，真实 `__unreadCityWorldPhone`，SillyTavern 上下文为测试替身）。用 Playwright Chromium 在 1440×900、1280×800、390×844、320×568 四个视口逐个打开：桌面、消息、Appie Pay、日历、购物、东都证券、Twiitch、设置、查手机、外观与记录、角色（经 设置 → 酒馆工具）。

| 检查 | 结果 |
|---|---|
| 页面报错 | 四个视口都没有 |
| 手机内横向溢出 | 都没有 |
| 小于 11px 的文字 | 只有 Twiitch 的 3D 舞台提示「拖动视角 · 比心与挥手」，是原有样式，本次未改 |
| 桌面页数 | 「今天」+ 1 页桌面（原来是 4 页）；快捷栏为 消息 / 音乐 / 查手机 / 设置 |
| 设置 → 酒馆工具 | 12 项都能打开原应用（截图里打开的是「角色」） |
| 证券 K 线 | 390 和 320 下都正常，原来那块放大的粉色“389”已消失 |
| 卡面 / 图标 | 4 位主角 × 3 张卡都有专属徽记；证券、Twiitch、论坛图标齐全（见 `cards-and-icons-all-owners.png`，单独渲染） |

**截图命名：**`g<宽>-home-p0`（今天）、`g<宽>-home-p1`（桌面）、`g<宽>-app-<应用>`。1440 和 1280 两组是手机铺满测试锚点时的效果，不代表 Shell 里的悬浮窗尺寸。

**没有验证的：**
- TauriTavern 真机和手机浏览器；
- 祥子、艾玛、玲奈子三台手机的完整界面（只单独渲染了卡面和图标）；
- lite Shell 正式悬浮窗里的手机（这次是直接挂载的 runtime）；
- 模型调用。
