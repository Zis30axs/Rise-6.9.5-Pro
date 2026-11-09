# Lite 剧情消息编辑与祥子前史纠偏

## 入口

- 纯小说：当前句下方选择「编辑本条」，定位所属剧情消息。
- 全文回看：每条「你的行动」或「剧情回复」均有「编辑」按钮。
- 点击后在编辑框修改整条原始内容；支持换行、对白标签和 Ctrl+Enter 保存。Esc 或取消关闭，不保存草稿。

## 保存边界

- `src/runtime/story-editor.ts` 使用同一消息 ID + 打开编辑器时的原文进行并发校验，防止旧草稿覆盖已经变动的消息。
- 修改仅针对当前主角 `WorldState.story` 中选中的 `text`，保留原 ID、说话人类型、参与者、已有旁线剧情与回归镜头。
- 直接复用聊天变量 `unread_city` 的 `Bridge.save`，不重新生成模型回复、不执行 `world_actions`、不重复扣费、推进时间或改变其它主角数据。
- 编辑用户行动限制 2000 字，编辑模型正文限制 6000 字，遵从原游戏的校验约束；当前剧情生成、短信生成、后台任务或角色切换期间拒绝写入。
- 不能用正文修改逆转已经产生的世界结算。其它日志、七日摘要、IndexedDB 的长期记忆来源及检索向量也不会自动回写，已经污染的旧记忆需另行纠偏。
- 现阶段只编辑 `text`，不改 `otherSideBeats` / `returnStory`；旧版本存档无需加字段。
- 该编辑作用于《未读之城》独立的故事记录，不是 SillyTavern 原生消息列表。

## 世界书

- `src/worldbook/story-arcs-relationships.json`：明确母亲病逝、CRYCHIC 成立、父亲失势、退出 CRYCHIC 均属初三时期前史。
- `src/worldbook/bang-dream-canon.json`：明确祥子初中就读月之森、高中就读羽丘；清告父女的贫困不能等同丰川家族或集团破产。

## 验证范围

新增 `tests/story-editor.test.ts` 和 `tests/story-editor-ui.test.ts`，覆盖文本局部改动、原状态保留、并发编辑保护、长度限制、旁线数据保留、界面入口与前史事实约束。提交中使用 `[skip ci]`，不启动 GitHub CI / Agent Edition。

本次远端提交只完成源码修改及静态检查，未在酒馆、TauriTavern、手机视口或模型请求中完成实机验收；需要重新构建/安装 Lite 卡脚本后才能在游戏中看到新入口。
