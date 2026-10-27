# 恢复 NPC 查手机与真实短信双人续写

## 界面

手机 Dock 内的「查手机」恢复 ST-iPhonie 原版 NPC 模拟手机，可查看 NPC 与其他人的私聊、搜索、相册、备忘录、购物车及壁纸；不回滚其他应用。首页新增独立「查主角手机」，保留现有接触距离、锁定、共享与审计规则，读取其他可操作主角的真实游戏存档。

旧手机插件联系人与《未读之城》当前主角的 NPC 联系人合并显示；NPC 尚未成为当前主角的联系人时，不能生成会同步至游戏的双人短信。

## 权威短信和模型生成的边界

NPC 手机里的「当前主角 ↔ 这个 NPC」会话，从角色卡权威存档 protagonists.npcPhone.messages 与当前主角收件箱 messages 中旧剧情 phone_messages 的原始来信合并投影（按消息 ID 去重）：显示真实发送、真实收到、手动回复、主动来信，以及通过本功能生成并提交的内容。隐藏历史旧快照中模型捏造的与主角聊天以及其他三位主角的私人会话；真正的存档短信绝不被重新生成覆盖。即使尚未生成完整模拟手机，只要存在真实往来，就能看这段手机聊天。

明确点击「拿起来看看」或「再看一次」请求模型时，模型使用当前主角的身份、最近已保存的本人剧情与日记、真实游戏短信及 NPC 的已知剧情（不读取其他主角的私人日记），允许扮演当前主角和该 NPC 双方，续写最多三轮新短信（主角发言与 NPC 回复交替，不超过六条、每条 180 字）。存档不记录模型单纯复述的真实历史；拒绝第三方代说、格式不完整、游戏上下文过期或切换主角后的输出。

新生成的每一轮都由 phone_app.peek_chat_append 一次事务写入权威 NPC 消息和当前主角收件箱。会话更新通过现有 world-phone 订阅传播至消息 App、游戏剧情短信上下文、读档和主角切换。使用 requestId 保证重复提交幂等，沿用旧存档的 NpcPhoneState.version=1 消息结构、不另设第二份权威会话。

与其他 NPC 的私聊、搜索记录、备忘录、购物车等仍由原版 LLM 模拟；购物车模拟商品不是实际游戏消费或订单。实际主角钱包、日历、订单只通过独立的权威手机 App 读取。此功能的 LLM 不能直接进行购物、转账或剧情选项操作。

## 修改位置

- scripts/build_embedded_phone.mjs：保留原 peekApp，新增独立 worldpeek，使用私有构建适配器，不直接修改公开 ST-iPhonie 仓库
- integration/dual-protagonists/phone-peek-build.mjs：对当前内嵌手机的 ui/peek.js、core/peek.js、host-apps.js 添加同步行为
- integration/dual-protagonists/phone-peek.js：投影真实短信、剔除伪造主角聊天、续写去重及校验
- src/runtime/npc-phone.ts、src/runtime/protagonist-world.ts：原子保存及命令校验
- tests/npc-peek-projection.test.js、tests/npc-peek-canonical.test.ts：测试投影、权限、持久化与幂等

## 验证范围

已通过内嵌适配器针对 ST-iPhonie main 的三处上游文件唯一替换检查、修改后 JavaScript 语法解析，以及在隔离 JavaScript 引擎内的消息投影、隐藏另一主角私信、旧购物车保留、历史去重、错误序列拒绝等八项逻辑检查。

尚未在完整项目执行 npm run phone:build、npm run check、Vitest 全套、桌面/手机分辨率浏览器用例及 TauriTavern 真机验证；仓库没有在此执行环境本地检出。验证到位前请勿将本 PR 标记为已完成 UI 验收，也不主动发布、部署、合并或跑远程 CI。
