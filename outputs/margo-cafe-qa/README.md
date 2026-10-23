# 玛格咖啡馆浏览器回归

2026-10-23 最终本地结果：**4/4 场景通过，59.7 秒**。本目录只保留最后一轮截图和合成存档；之前调试重跑不累计为额外用例。

实现提交为 `3bd33182b44f2fc86bc5f747f10301f338d0b886`，基于最新 `lite@e2fb8dafde2c674138c61f4cea277c1d560006a0`，包含该基线的玛格三表情素材。测试补充了玛格立绘身份、实际图片加载和室内背景断言。

| 视口 | 结果 | 玛格交流与室内背景 | 合成存档 |
| --- | --- | --- | --- |
| 1440×900 | 通过 | [截图](1440x900-margo-portrait.png) | [JSON](1440x900.json) |
| 1280×800 | 通过 | [截图](1280x800-margo-portrait.png) | [JSON](1280x800.json) |
| 390×844 | 通过 | [截图](390x844-margo-portrait.png) | [JSON](390x844.json) |
| 320×568 | 通过 | [截图](320x568-margo-portrait.png) | [JSON](320x568.json) |

每个场景通过真实界面操作检查：街边咖啡馆营业时间及服务、进入店内、赠礼选择、接受后固定目录物品入包与正文/冷却一起保存、玛格与艾玛的实际在场、与玛格交流、店内喝茶、反复离开重进、刷新恢复和背包显示。固定概率样本为 `0.2`，只控制事件命中，不作为概率分布统计。

进入后的背景身份为 `majo-margo-cafe-room`，复用已有现代开放式室内插图；没有声称新增专属咖啡馆美术。交流后实际显示 `data-majo-portrait="majo-margo"`，图片解码成功、尺寸非零，并等淡入完成才截图。已查看四种尺寸的新立绘及背景；无横向溢出，赠礼、进出、交流和服务按钮可点击，窄屏地点与背包面板可滚动。

其余证据按相同视口前缀保存：`-storefront.png`（门外服务）、`-gift-choice.png`（赠礼选择）、`-inside-people.png`（店内人物与服务）、`-saved-inventory.png`（刷新后的背包）。

复现命令：

```sh
npx playwright test --config playwright.margo.config.ts --workers=1 --reporter=line
```

测试为 Vite 加载的实际源码模块，包含完整 App、lifecycle 和运行时 reducer；Bridge 使用受控本地 `localStorage` 原子保存。浏览器为无窗口 Chromium 154.0.8037.57，未使用 DSH 专用工具。本轮不是生产 IIFE、原生 SillyTavern 页面、真实模型、手机服务或 iPhone/TauriTavern 真机验收；没有运行 GitHub Actions/CI，也没有生成或覆盖历史发行包。
