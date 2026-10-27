# 随机主动短信（2026-10-26）

本轮基于最新 `lite@800ac01`（已包含 `73ae94f` 之后的主动短信初版），补全隔离生成、知识边界及生命周期安全。玩家自由推进游戏时间后，角色可以自动发送一条私人短信，无需点击确认。普通 NPC 和主角的**回复仍由玩家手动请求**，不恢复自动回复。

## 调度与生成

- 只随成功保存的游戏时间推进检查，至少间隔 90 游戏分钟；每次 25% 概率抽取一个联系人，再由该角色决定发送或 `text:null` 静默。停留在原时间、打开手机、重绘界面不会增加检查机会。
- 07:00–22:30 之间允许检查，每收件主角每天最多 2 条主动来信；同一会话最近 360 游戏分钟内有任何短信时避让，等待玩家手动回复的会话始终避让。候选按稳定人物 ID 去重，单次只问一人，不轮询整个通讯录。
- 冷却、抽签后的待处理任务和成功历史保存在同一聊天的可选 `autonomousSms` 字段；旧存档无需迁移。未命中和静默也保留下一检查时间；重载不重抽，长时间睡眠不补发过去的窗口。
- 任务的预约时间、上下文时间与消息时间必须是同一游戏分钟。玩家推进时间或切主角后清理旧任务；游戏日期仍由权威存档推导，与现实日期无关。

运行时没有已验证、可供本卡直接调用的 subagent 契约。仓库已有的 [TT Agent 调查](../dual-protagonists/AGENT-ADAPTER-RESEARCH.md) 仍将宿主 Agent 标记为待实机验证，开发助手的子代理不参与游戏运行。

因此使用隔离的单次生成：酒馆模式检测 Tavern-Helper `generateRaw`，只提供显式 system/user 提示，排除预设内置提示、世界书、作者注释和原生聊天历史。缺少隔离接口时跳过本次主动任务，普通剧情与手动回复保留。已有自定义 API 模式继续使用用户配置的接口，但不带全知叙事预设；不会新增服务或失败后切换模型。

接口依据：[Tavern-Helper generate.d.ts](https://github.com/N0VI028/JS-Slash-Runner/blob/main/@types/function/generate.d.ts)，本次核对的文件 blob SHA 为 `269aa475c1a31d554ee47625fb58454a1c9cdf3d`。`generate` 即使 `max_chat_history:0` 仍会继承预设和世界书，不能作为本功能的隐私隔离通道。

## 权限与提交

NPC 仅得到本人的设定、原型日程、双方实际对白和对应私聊。四主角发件人读取本人的权威位置、日程、后台活动及有明确来源的交流记录；不注入原始全知剧情、普通日记、周报、收件人的私人评价或第三人的私聊。对发件人尚未读到的主角短信不注入正文。艾玛与玲奈子的旧居民联系人身份映射到其主角状态，不能沿用静态 NPC 日程冒充本人。

模型只能返回绑定任务 ID 的一条文本或静默，不能修改状态。程序提交前再次检查待回复会话、近期短信、规范化重复文本、容量和消息 ID；普通剧情产生的旧短信也参与去重与冷却。不为腾空间删除未读消息；容量不足时完整放弃投递，不留下部分清理的收件箱。

收件箱、规范会话、未读通知及调度历史一起保存，成功后才通知真实手机同步；事件 ID 保证同步重试幂等。保存失败保留本次完成结果，只重试本地写入，避免每 1.2 秒重复模型请求。单次主动任务最多等待 120 秒，超时只取消自己的请求，不影响后续主线生成。切聊天、退出、隐藏页面、主线抢占及过期请求的迟到结果不会提交。前端轮询只消费已保存任务，不按现实时间制造新发信机会。

主动来信不产生回复链，不替玩家发言，也不处理乐队同意。待确认乐队邀请会被会话避让规则拦截，邀请状态、乐队名册与演出预约继续由现有明确同意流程管理。

## 本地验证

定向测试：

```sh
npx vitest run --maxWorkers=2 tests/autonomous-sms.test.ts tests/autonomous-sms-boundaries.test.ts tests/autonomous-sms-bridge.test.ts tests/autonomous-sms-lifecycle.test.ts tests/classic-manual-sms.test.ts tests/livehouse-persistence.test.ts tests/livehouse-lifecycle.test.ts tests/third-protagonist.test.ts tests/omniscient-continuity.test.ts tests/phone-game-clock.test.ts tests/mandatory-story-tag-prompt.test.ts tests/mandatory-character-speech-prompt.test.ts
```

覆盖游戏时钟与随机限流、四主角隐私、隔离传输、旧身份映射、去重、容量、保存失败、重载、切聊天、在途时间推进、主线抢占和手动回复/乐队邀请回归。构建依赖的相邻手机源码按 [固定基线与补丁](../embedded-phone-source/README.md) 复现；测试使用受控模型响应，不调用真实模型，不运行 GitHub Actions 或远程 CI。实际验证结果以本轮报告为准；桌面浏览器模拟不等于 TauriTavern/iPhone 真机验收。

本轮结果：12 个定向文件共 **170 项通过**，全库 `vue-tsc --noEmit` 和 Vite 生产构建通过。真实内嵌手机的受控浏览器场景覆盖 1440×900、1280×800、390×844、320×568，各保留未读入口、短信会话和手动回信截图，确认自动调用一次、刷新不重复、发送后不自动答复且点击回复后才生成，无横向溢出或页面错误。详见 [综合报告](../../outputs/autonomous-sms-verification.json) 和 [浏览器复现记录](../../outputs/autonomous-sms/browser-verification.json)。未打包或替换发行卡。2026-10-27 用户授权通过 PR #51 合入 `lite`；合并前保留并适配该 PR 的安全测试，同时补测自定义 Responses 路由。运行源码与本轮类型检查、生产构建和浏览器验收的版本逐字节一致。

合并前追加回归：13 个定向文件共 **187 项通过**，包含保留的 PR 安全测试及 Chat Completions／Responses 双路由检查。源码无需重新构建，三份运行文件的 SHA-256 与原验收记录完全一致。
