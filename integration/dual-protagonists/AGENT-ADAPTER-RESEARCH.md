# Agent 可复用性调查与适配边界（2026-10-20）

> 本文仅为架构核验；尚未安装 ST 插件、调用用户本机 TT Agent、启动真实子任务或通过 TauriTavern/iPhone 验收。本研究承接 PR #4 父代理路由、按需子代理原则，不覆盖另一个 Work 的世界书和素材。

## 确认结果

1. **TT Agent 是宿主原生系统，不是可以直接复制到 ST 的前端扩展。** TT Rust 后端实现模型工具循环和子任务，公开前端入口为 `window.__TAURITAVERN__.api.agent`。用户之前提供的 TT 开发版基线 `Darkatse/TauriTavern@223be954afa7b60c8637a44a43319524a185ea11` 已包含该前端 Agent API；是否能在本机当前构建实际运行，仍需实机检验。
2. TT 官方允许第三方扩展调用 `startRunFromLegacyGenerate` 或 `startRunWithPromptSnapshot`、订阅执行事件、通过 `readWorkspaceFile` 读取输出、使用 `cancel` 取消。**后台 presentation** 可在无聊天提交的情况下 `workspace.finish`，适合另一个主角的离屏活动。参见 https://tauritavern.github.io/agent/extension-authors 和 https://tauritavern.github.io/en/api/agent.html 。
3. TT `agent.delegate`/`agent.await`/`task.return` 已有父子委派；其子任务不是第二个独立聊天楼层。TT 用户 Profile 可独立选模型和预设。参见 https://tauritavern.github.io/agent/subagents.html 。
4. **尚无已验证的 TT Agent → 本卡状态动作直写 API**；TT 公共 Agent 工具集的 extension-tool bridge 在已核对文档中不是稳定接口。因此**不能**由子代理自行修改 `unread_city` 存档或 Appie Pay，也不该让模型直接操作手机。必须输出严格 JSON/受约束事件，在本卡 TS 世界状态引擎完成权限校验和幂等提交。
5. 原有 `createTavernBridge.generate()` 通过 Tavern-Helper 或卡内独立 API 发起剧情生成，不会因为 TT 面板打开 Agent Mode 就自动走 TT 原生 Agent。直接替换普通生成有 chat commit 重复与 prompt 兼容风险；不能将 TT 原生运行结果未经核对当成 `GeneratedStory`。
6. 普通 ST 可安装**其他**第三方 Agent 扩展，但不能直接安装 TT Rust Agent。已找到 https://github.com/nialyn-mid/polyceph ：支持多步骤、并行任务、工具调用，主要通过拦截 ST 原生发送/滑动触发。其 `js/engine.js` 虽导出 `runPipeline`，**未验证官方稳定对外调用契约**；不直接让角色卡 import 插件私有模块并将其作为默认依赖。
7. ST 现有卡内 `story-api.ts` 和 `bridge.ts` 已有非 Agent 生成与取消能力；**保留作为不支持原生 Agent 的兜底**，不新增一个完整常驻 Harness。

## 推荐最小实现

```text
玩家行动 -> 世界规则初步计算 -> 父代理检查是否有交集
  有交集 -> 现有单次父叙事生成 -> 校验并提交
  无交集且是固定日常 -> TypeScript 确定性规则 -> 校验并提交
  无交集且需要自主选择 ->
      TT: 使用 TT 原生 background Agent Profile（可在内部委派子 Agent）
      ST: 优先原有独立/酒馆助手单次结构化生成；有明确稳定接口时再选配 ST 插件
    -> 返回离屏活动提案 -> 统一事件账本 -> 当前视角叙事
```

在 TT 平台从 `window.__TAURITAVERN__?.api?.agent` **能力检测**，不要通过 UA 或仅靠是否存在 Agent 按钮判断。等待宿主 `ready` 后才启用 API；失败时保留已有进度，并显式提示当前模式，不隐式重复扣费或换模型。

对后台 Agent，优先使用**受限知识快照**而不是整个聊天：独立主角的角色知识、具体时间窗、世界版本、已经完成的日程和可执行行动目录。禁用或限制能读取完整原生聊天/世界书的工具，否则另一主角可能得知不该知道的秘密。TT 文档更推荐 `startRunFromLegacyGenerate` 用于普通扩展，但此处存在知识隔离要求，是否能使用定制 `startRunWithPromptSnapshot` / Profile prompt broker **必须先做最小兼容试验**，不能猜测 payload 格式。

`background` 任务写入 `output/offscreen.json`（或经实测受控路径），完成后调用 `workspace.finish`；扩展 `readWorkspaceFile({runId,path})` 读取并校验 schema、角色身份、事件 ID、时间窗和状态版本。所有动作由游戏状态引擎一次提交，只有成功后同步两台手机。任务超时/取消/切换主角/聊天切换时拒绝过期结果。

## 优先验证的场景

- [ ] 在用户已用过的 TT dev 构建中读取 `api.agent`，确认 background Profile 可以完成而不新增原生聊天消息。
- [ ] 使用受限 Profile / 受控 `promptSnapshot` 生成结构化 JSON，经 `readWorkspaceFile` 成功读出、验证并保存，前后无秘密泄漏。
- [ ] 父代理有交集时不产生子任务；另一主角固定日程由 TS 结算，不产生 LLM 调用。
- [ ] 模拟切主角、取消、迟到、重放同一 eventId，确保没有重复手机通知/付款/活动。
- [ ] 普通 SillyTavern 没有 TT Agent 时仍可正常运行（降级采用现有单模型桥）；ST 插件只有在程序接口得到独立验证后才考虑接入。
- [ ] 桌面 1440×900/1280×800、手机 390×844/320×568 验证；物理 TauriTavern/iPhone 单独验证。
- [ ] 最终 Tauri 专用角色卡 PNG 仍严格小于 50,000,000 字节；TT Agent 本身是宿主功能，不打包进 PNG，也不打包额外 Agent 框架。

## 待决定事项

普通 ST 上使用相同完整父子 Agent 行为是否属于硬性要求？如果是，需要先选择一个具备**稳定脚本 API、返回结构化结果且不抢写原生聊天**的 ST 扩展，或在现有桥上仅实现最少必要的单次离屏生成。不要为了追求形式上的多 Agent 放弃现有单张卡通用性。
