# 未读之城 Agent Edition

这是只在本地开发时使用的入口。它打开真实的 Lite 前端，让开发 Agent 自己写玩家发言，也自己写上游回复原文，再把原文送进角色卡现有的解析、变量更新、事件、存档和渲染流程。

这里不会新建语言模型接口，也不会直接改写存档来假装回复已经处理。

## 启动

在仓库根目录执行，不要使用会触发远程构建的命令：

```bash
npx playwright test --config agent-edition/playwright.config.ts
```

这条命令会在 `127.0.0.1:5191` 启动 Vite，并打开开发页面。首次编译前端可能需要一两分钟。

只打开页面、不跑整组剧本时：

```bash
npx vite --host 127.0.0.1 --port 5191 --strictPort
```

浏览器访问：

```text
http://127.0.0.1:5191/agent-edition/agent.html?run=local&presentation=novel
```

`run` 只接受小写英文、数字和连字符。它会把长期记忆放进单独的 IndexedDB：`unread-city-agent-<run>`。玩家正式记忆库 `unread-city-memory-v1` 不会被这个入口打开。聊天变量只留在本次页面内存里，编号一律以 `agent-` 开头，不会写入酒馆里的真实聊天。

`presentation=novel` 会把这次浏览器里的阅读方式记为纯小说。不要在存有正式进度的日常浏览器配置里打开这个页面。

如果私人手机构建产物还不存在，测试会在 `src/frontend/generated/` 放一个仅用于启动的占位模块。已有正式构建时不会覆盖。占位模块不能代替真实手机应用。

## 一轮怎么跑

开发页面加载后，父页面提供 `window.__unreadCityAgent`。Playwright 脚本使用 `agent-edition/session.ts` 里的 `AgentSession`。

1. 扮演玩家：在真实输入框写入行动并按下「继续故事」，或点击游戏里原有的按钮。
2. 等待游戏通过酒馆助手的 `generate` 或 `generateRaw` 发出请求。这一步只会停住，不会访问模型。
3. 扮演上游模型：按当前提示里的人物知情范围和标签协议写原文。
4. 调用 `injectReply(rawText)`。原文进入 `createTavernBridge` 现有的解析、`commitStoryTurn`、存档和界面更新。
5. 读取 `summary()`、界面文本和截图，对照时间、金钱、精力、关系、地点和剧情。

玩家发言：

```javascript
await window.__unreadCityAgent.playerSay('我去枫庭律师事务所。');
```

注入上游原文：

```javascript
await window.__unreadCityAgent.injectReply(`<story>早班车穿过城区。樱羽艾玛推开枫庭律师事务所的门。
|樱羽艾玛|认真|我来登记。</story>
<phone_messages>[]</phone_messages>
<world_actions>[{"type":"travel","locationId":"legal-office"}]</world_actions>`);
```

Playwright 里对应的封装是 `agent.play(玩家发言, 上游原文)`。它会在主回复之后，继续处理游戏真正发出的后续请求，例如主动短信。主动短信仍由开发 Agent 按该子任务的协议作答；示例剧本在没有新话题时返回静默。

查看结果：

```javascript
await window.__unreadCityAgent.summary();
await window.__unreadCityAgent.readState();
await window.__unreadCityAgent.pending();
await window.__unreadCityAgent.logs();
```

`pending()` 里的 `userInput` 和 `system` 就是游戏刚刚组装给上游的原文。委托编号、预设标题和人物编号都要从这里读取，不能凭记忆编造。

## 场景、存档和重放

正式游玩必须经过真实按钮、真实输入和 `injectReply`。下面的方法只用于准备或恢复测试现场：

```javascript
await window.__unreadCityAgent.initScene({
  openingMajorId: 'computer-science',
  protagonist: 'emma',
  majorId: 'law',
  locationId: 'legal-office',
  clock: { day: 3, hour: 10, minute: 0 },
  relationships: [{ npcId: 'majo-sherry', delta: 1, reason: '测试场景初始化时的见面' }],
});
await window.__unreadCityAgent.saveScenario('emma-ready');
await window.__unreadCityAgent.restoreScenario('emma-ready');
await window.__unreadCityAgent.newGame();
```

`initScene` 调用现有的 `createInitialState`、`reduceState` 和 `applyStoryActions`，然后重新进入界面。时间只能用真实的等待行动向前推进，不能直接改时钟而留下对不上的后台记录。它不会绕过回复校验。

场景快照写在另一个库 `unread-city-agent-scenarios-v1`。`newGame` 只新建 `agent-` 内存存档。

`AgentSession.replay(steps)` 按记录重新执行点击、玩家发言和当时的上游原文。

## 已运行的示例

`agent-edition/emma-play.spec.ts` 会选择素世的专业、切换到艾玛、为艾玛选择法学，然后连续处理拒绝的错误回复、睡眠跨日、前往律师事务所、职业登记、今日委托、与橘雪莉交谈、手机消息、地图、自习和学习、便利店购买并食用。运行记录写到 `agent-edition/records/emma-play.json`。

`agent-edition/gaps.spec.ts` 覆盖手机内部操作、主动短信和自由庭审。手机源码不在本仓库。脚本会按 `integration/embedded-phone-source/manifest.json` 的提交 `24295193aa1adff606edcd4e63c8b07923533f2b` 克隆公开仓库 `Zis30axs/ST-iPhonie`，应用同目录补丁，再构建。产物写到被忽略的 `src/frontend/generated/`。记录在 `records/phone-contacts.json`、`records/autonomous-sms.json` 和 `records/courtroom.json`。

如果本地还没有手机产物，`node agent-edition/prepare-phone.mjs` 会先准备源码再构建。已有正式产物时不会覆盖。占位模块不能代替真实手机。不合协议的原文应被整轮拒绝。
