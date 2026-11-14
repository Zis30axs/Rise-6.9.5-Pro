# 沙盘、地点与叙事共用在场名单

2026-11-08：沙盘原先显示 35 米内、好感至少 10 的联系人和同地点主角；地点交流列表只显示 7 米内的人；模型场景上下文只取 18 米内最近 8 人。三套筛选导致地图可见的祥子未进入请求，较近随机行人还会挤掉固定居民。

`scene-context.ts` 的 `selectSceneRoster` 与 `world-presence.ts` 的 `worldSceneRoster` 统一筛选和排序。三处仍读取原有 `worldScenePeople`：人物按已保存的个人位置、房间、日程、实际赴约、离场及司法限制出现。常驻人物、可操作主角和已登记联系人优先，室外可见范围为 35 米；未建档随机行人保留在 18 米内，最多 8 人，只限制行人而不截断固定人物。室内保留同房间及原有 18 米范围。好感不再决定一个已经实际在眼前的人是否存在；联系人关系和知情边界仍按当前视角计算。地点中的特殊彩蛋访客沿用原入口，不改奖励规则。

模型请求中的 `scene.nearbyPeople` 与显示名单顺序相同，增加 `kind`、`canTalk` 和 `knownToPlayer`。固定人物优先，随机路人只是补充；不能改写既有人物身份或把看得见等同于已认识、已听见或已查看手机。`canTalk` 使用未四舍五入的实际距离，仍为 7 米；手机权限不变。地图筛选、缩放、隐藏标签与跨城区浏览不推进时间、不保存世界变化、不调用模型。无需迁移旧存档。

沙盘顶部提供人物、行人、地点、路况四类标签开关；已移除仅用于历史演示的人物定位。所有头像、地点、区域和路况标签共用矩形避让，44 像素点击区，保留指向真实位置的引线。短画布用整齐行列，主角及其他可操作主角优先，拥挤标签收起到列表，完整人物名单仍送给模型。浏览其他城区不把原地人物重新投影到新城区。

验证记录见 `outputs/scene-roster/verification.json`。浏览器使用实际发布 Lite 脚本、原有桥接与解析，模拟一次上游回复以截取请求；没有调用真实模型，没有运行 Agent Edition、GitHub Actions 或 CI，也不代表 TauriTavern 真机验证。旧的 `protagonist-presence.spec.ts` 中好感筛选断言已按本次规则更新，本次四尺寸验证入口是 `playwright.scene-roster.config.ts`。

扩展检查发现 `tests/courtroom.test.ts` 有 23 项在时钟校验阶段失败。首个失败通过只读加载已推送基线 `f757396` 的原模块复现，错误同为「国策时钟与权威时间不同步」；夹具直接改了游戏日期却未对齐国策游标。本次不更改法庭规则或存档时钟，也不宣称完整测试集通过。对照配置保存在 `outputs/scene-roster/debug/baseline.config.ts`，不改工作树或索引。

本地命令：

```text
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
node node_modules/vitest/vitest.mjs run tests/scene-roster.test.ts tests/map-label-layout.test.ts tests/protagonist-presence.test.ts tests/affinity-tiers.test.ts tests/natural-interactions.test.ts tests/other-side.test.ts tests/tokyo-sandbox-pins.test.ts tests/social-agenda.test.ts tests/novel-invitation-portraits.test.ts tests/prompt-context-budget.test.ts
node node_modules/@playwright/test/cli.js test --config playwright.scene-roster.config.ts
```
