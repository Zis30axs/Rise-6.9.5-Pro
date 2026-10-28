# 未读之城 · 长期记忆 Sidecar（开发分支）

> 状态：源码已提交到独立分支，但尚未执行完整仓库 TypeScript、Vitest、浏览器、TauriTavern 或真实模型联调，不能视为可发布或已验收功能。
>
> 分支：**feat/long-term-memory-sidecar-20261028**，基于 lite 的 61c9ff058c6d4432da9d002c67e8e7b3565779e6。
>
> 不运行远程 CI / GitHub Actions，不擅自合并或发布。

## 架构

长期记忆是可关闭的并联模块。MVU、小说结算、手机、地图、法律职业和原有七日全知总结继续独立运行。记忆库损坏或 API 欠费不应阻断游戏。

- 通过现有 bridge.save 成功后的只读快照差异登记新历史。原始剧情、用户输入、日志、已读短信、跨主角发信及七日总结均有来源 ID。
- 独立 IndexedDB：unread-city-memory-v1。每个 ST 聊天按真实头像与聊天 ID 分区，四主角共享世界史料，但不共享个人知情权限。
- 已保存小说楼数默认每 20 楼整理一次；重大剧情关键词仅触发提前整理候选，不直接确认事实或更改 MVU。
- 输出事件包括人物、物品、地点、重要程度、来源、时间、知情者、事实等级。按事件建立实体与事件关联表。
- 中文关键词 BM25 + 实体检索 + 可选 Embedding 语义检索，通过排序融合返回少量历史。
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
- 本地来源拆分，原始历史在归档前不交给辅助 LLM 改写，自动整理任务具备稳定 ID。
- API 使用量优先采用供应商返回的 usage，否则按本地估算标记。
- 设置中目前为本聊天**累计**费用预算，并不是月度预算，也不是绝对硬扣费限额。
- 两套存储无法提供跨 ST 变量与 IndexedDB 的原子提交。页面关闭早于 IndexedDB 写入时，仍可能丢失尚未成功归档的来源。重进聊天仅能恢复当前状态仍保留的最新 story、journal 与短信。
- API 已完成请求但回复尚未写入 IndexedDB 时，仍可能产生无法去重的供应商费用。
- 用户回到早期存档后，本地被丢弃的未来归档会被清理；重要回档前请先导出备份。

## 仍需要补足或验收

1. 未执行 TypeScript/Vitest，已提交的测试文件不能当作测试通过。
2. 需要为聊天变量与 IndexedDB 增加最小且有上限的可靠提交 outbox，避免非常快的关闭/重载造成归档窗口丢失。
3. 独特物品当前所有权仍是 MVU 未来扩展，不由长期记忆接管。
4. 旁白中的心理活动与未公开秘密采取保守的 narratorOnly 权限。个人日志和明确已读消息能直接授予本人知情；细化人物“亲历/听闻”仍需真实剧情验证。
5. 回档策略按楼数和游戏时间识别未来，不足以识别**相同时间与楼数但不同来源签名**的分叉快照，需要后续增加时间线签名。
6. 需要真机检查 iPhone/TauriTavern 的 IndexedDB 配额、文件下载、CORS 和外部服务接口兼容性。
7. 预算估算与供应商实际收费可能存在误差，不能对玩家宣称金融级绝对硬限额。
8. 多窗口并发、任务崩溃恢复、原生 Tools/标签的不同模型行为，以及手机状态页布局还需要端到端实测。

## 本地验收命令（不调用 CI）

在拥有完整仓库和原有本地依赖的开发机上运行：

~~~sh
./node_modules/.bin/vue-tsc --noEmit
./node_modules/.bin/vitest run tests/long-term-memory-pure.test.ts tests/long-term-memory-tools.test.ts
~~~

还需执行已有 bridge、story-api、weekly-memory、lifecycle、other-side、protagonist-world 相关回归。不要运行 GitHub Actions，或为了验证而创建可能触发远程工作流的 PR。

**交付状态：已提交到独立分支、可继续修复，不代表已完成验收，也不应现在直接合并 lite。**