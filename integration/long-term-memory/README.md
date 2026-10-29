# 未读之城 · 长期记忆 Sidecar

> 状态：初始版本于 2026-10-28 合入 lite（d8c94713）；归档可靠性修复位于独立修复分支 fix/lite-memory-archive-durability-20261029。浏览器、TauriTavern 与真实模型联调尚未完成，不能视为已验收功能。
>
> 修复基线：lite@d8c94713198acafba6fa9881b08f711711880638。
>
> 不运行远程 CI / GitHub Actions，不擅自合并或发布。

## 架构

长期记忆是可关闭的并联模块。MVU、小说结算、手机、地图、法律职业和原有七日全知总结继续独立运行。记忆库损坏或 API 欠费不应阻断游戏。

- 与现有 bridge.save 同步登记第一层有限 outbox；超出 160 条/约 96KB 时，将溢出来源按页同步写入 localStorage，只有成功写入的页引用才跟随 WorldState 提交。IndexedDB 事务完成后，按确认为准分批清理内联来源及暂存页。正文、用户输入、日志、NPC/主角短信、MVU 背包及联系人亲密度变更和七日总结保留来源 ID；配额拒绝、页缺失及本地持久化失败必须报告风险。
- 独立 IndexedDB：unread-city-memory-v1。每个 ST 聊天按真实头像与聊天 ID 分区，四主角共享世界史料，但不共享个人知情权限。
- 已保存小说楼数默认每 20 楼整理一次；重大剧情关键词仅触发提前整理候选，不直接确认事实或更改 MVU。
- 输出事件包括人物、物品、地点、重要程度、来源、时间和知情者。**成功整理并提交的摘要即正式历史事实来源**，后续模型不重新裁判、不推翻、不编辑；原始记录保留用于精确台词和出处追溯。人物说过某句话是历史，但其发言内容不自动成为客观真相。事件 ID 与来源/事件类别绑定，不与摘要的措辞绑定；相同事件的重新表述不能产生另一条相互竞争的正式记忆。
- 中文关键词 BM25 + 实体检索 + 可选 Embedding 语义检索，通过排序融合返回少量历史。已整理的原始来源仍可通过关键词检索作为原文证据补充，标记 origin=raw；已定稿摘要优先并标记 origin=canonical，不允许原文证据触发模型私自改写正式摘要。
- 常规生成仅查阅本地相关事实。主动深度回忆提供原生 Function Calling（独立 Chat Completions/Responses API）和 XML 标签回退（酒馆当前模型），均为只读操作。
- API Key 放入当前标签页会话存储；不进入仓库、PNG、聊天存档或剧情模型提示词。
- 整理付费响应与消费记录使用同一个 IndexedDB 事务持久化。解析/索引出错后复用已付费响应，避免重复请求。向量也按来源与模型缓存。
- 关闭记忆或切聊天会中止正在执行的辅助整理，并保留待办供重新进入时恢复。
- 回档时根据叙事楼数和游戏时间删除被丢弃未来的来源、事件及关联索引；核对过程中拒绝提供旧档案，不阻断游戏。

## 代码结构

新文件集中于 src/runtime/long-term-memory/：

- types.ts、settings.ts、storage.ts
- source.ts、scheduler.ts、providers.ts、extractor.ts
- retrieval.ts、vector.ts、protocol.ts、index.ts

只有极少数接入点涉及公共文件：src/runtime/bridge.ts、src/frontend/lifecycle.ts、src/frontend/types.ts、src/frontend/WorldPanels.vue、src/frontend/StoryEngineSettings.vue，以及新 LongTermMemorySettings.vue。

没有改写 model.ts、weekly-memory.ts、StoryAction 结算。

## 成本与恢复

- 每 20 楼只是触发时机，不保证一批固定只请求一次；过长上下文会切成多个预算内的小批。
- 本地原文拆分保存；整理模型每批生成正式摘要，允许语义等价改写，不依赖字符串相等判断；每次定稿后不让其他模型反复修正。自动整理任务具备稳定 ID。
- API 使用量优先采用供应商返回的 usage，否则按本地估算标记。
- 设置中目前为本聊天**累计**费用预算，并不是月度预算，也不是绝对硬扣费限额。
- 内联 outbox 与世界状态同次同步提交，超过 160 条或约 96KB 的来源先写入独立、分区的 localStorage 暂存页，再将页 ID 写入同一聊天存档。页面关闭或 IndexedDB 异常时，可依存档中引用的页重播；未经聊天存档确认的孤立页不会被自动提升为剧情事实。部分确认先写新页再替换引用，旧页只在聊天变量替换成功后删除，失败时允许幂等重播。每页保存单调缩紧的回档边界，旧分支被裁剪后不能随着剧情推进再次出现。
- **仍非无损保证**：localStorage 可能受每站点配额、隐私模式、用户清理数据或浏览器驱逐影响。超过可用容量、失去浏览器原点数据、主存档本身未持久化、独立暂存页被清理，仍可能造成无法恢复的来源丢失；警告不代表数据可自动修复。两个存储系统无法提供跨引擎原子事务，短暂的孤立页可以产生，但没有被提交引用时绝不用于恢复。IndexedDB 完成事件代表浏览器事务成功，并非断电级或设备级保证。API 已完成请求但回复尚未写入 IndexedDB 时，仍可能产生无法去重的供应商费用。
- 用户回到早期存档后，本地被丢弃的未来归档会被清理；重要回档前请先导出备份。

## 仍需要补足或验收

1. 未执行 TypeScript/Vitest，已提交的测试文件不能当作测试通过。
2. 已增加双层同步 outbox 和定向测试源码；仍需在有仓库依赖的本地环境执行 Vitest/TypeScript，再验证 Safari/嵌入 WebView 的 quota、页面结束、并发写入及关闭后恢复，不得宣称零丢失。
3. 独特物品当前所有权仍是 MVU 未来扩展，不由长期记忆接管。
4. 旁白中的心理活动与未公开秘密采取保守的 narratorOnly 权限。个人日志和明确已读消息能直接授予本人知情；细化人物“亲历/听闻”仍需真实剧情验证。
5. 同一时间与楼数的部分剧情分叉现按保存的原文 ID 与片段内容比较，但已被裁剪的旧正文无法进行完整分叉证明，仍需验收或额外时间线标识。
6. 需要真机检查 iPhone/TauriTavern 的 IndexedDB 配额、文件下载、CORS 和外部服务接口兼容性。
7. 预算估算与供应商实际收费可能存在误差，不能对玩家宣称金融级绝对硬限额。
8. 多窗口并发、任务崩溃恢复、原生 Tools/标签的不同模型行为，以及手机状态页布局还需要端到端实测。长记忆摘要无法从程序形式上保证每条语义正确；因此整理提示词必须限定为忠实总结，程序只做结构与来源校验，不再自我辩论或进行错误的字面匹配。

## 本地验收命令（不调用 CI）

在拥有完整仓库和原有本地依赖的开发机上运行：

~~~sh
./node_modules/.bin/vue-tsc --noEmit
./node_modules/.bin/vitest run tests/long-term-memory-pure.test.ts tests/long-term-memory-tools.test.ts tests/long-term-memory-durability.test.ts
~~~

还需执行已有 bridge、story-api、weekly-memory、lifecycle、other-side、protagonist-world 相关回归。不要运行 GitHub Actions，或为了验证而创建可能触发远程工作流的 PR。

**修复状态：独立分支待本地验证，不主动创建针对 lite 的 PR，也不触发远程 CI。**