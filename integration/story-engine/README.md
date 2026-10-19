# 未读之城：独立叙事引擎与关键标签输出

本目录记录 `feature/story-tags-independent-api` 的实现范围；不包含任何 API Key、私人聊天或真实模型输出。

## 用法

在游戏内打开 **状态 → 独立叙事引擎**，可选择：

- **使用酒馆当前模型**：保留 Tavern-Helper `generate` 的既有路径，遵守原生成 ID 和聊天生命周期。酒馆端仍需 Chat Completion。
- **独立 API / 独立预设**：选择 OpenAI Chat Completions 或 Responses 兼容格式，填写 Base URL、模型 ID、可选独立风格预设和 API Key，再点“保存设置”。请求由角色卡直接发出，不调用 Tavern-Helper 的模型生成，也不会修改酒馆的全局模型或主预设。切换前可点“测试 API”，此操作会消耗一次请求。

默认继续使用酒馆模型；不自动回退。独立模型报错、CORS 阻断、接口超时或返回异常时，不修改任何世界状态、消息或剧情。

## 模型输出

优先推荐多标签文本：

```text
<story>
你站在宿舍衣柜前，听见管道里的水声。
</story>
<phone_messages>[{"npcId":"lin","text":"图书馆快闭馆了。"}]</phone_messages>
<world_actions>[{"type":"rest","kind":"wait","minutes":10}]</world_actions>
```

- `story` 必填，支持原生换行；`phone_messages` 省略时默认为 `[]`。
- `world_actions` 和 `world_events` 可选；这些块必须是合法 JSON 数组，使用原有白名单与事务校验。
- 同名标签重复、标签嵌套/残缺、未知联系人、伪造的状态补丁和无效动作一律拒绝，不提交半轮状态。
- 旧版完整 JSON 及完整围栏 JSON 依旧接受；外围解释不会成为世界行动。
- 模型输出中的 `|charac|emot|says|` 对白行只在 `<story>` 内使用，原有立绘渲染机制不变。

## 配置与保密边界

- 角色卡不存储 API Key；地址、模型、预设只写到**当前浏览器的 localStorage**，密钥放到同源 **sessionStorage**，关闭该会话后可能需要重新输入。
- 自定义 API 会收到本轮玩家输入、相关世界状态与必要的近期剧情；选择自己信任的接口服务商。
- 在同一 SillyTavern 来源运行的其他脚本理论上可读取浏览器存储，因此 sessionStorage 不是隔离密码库，也不是用于抵抗恶意扩展的安全边界。
- 仅接受 HTTPS，或本机 localhost HTTP（手机上的 localhost 指手机本机）。浏览器/TauriTavern 需允许访问目标服务并满足 CORS；不注入永久代理凭据，不绕过设备系统权限。
- 这个功能只在用户自行重新构建和导入的新 PNG 中存在；旧 PNG 不会自动更新。

## 回归检查

`tests/story-output-compat.test.ts` 涵盖标签/JSON兼容、非法动作拒绝、API设置持久化边界、Chat/Responses两种响应及取消时不影响酒馆原生生成。

待在具备 `ST-iPhonie` 相邻源码及完整依赖的机器上执行：
`npm test`、`npm run check`、`npm run build`、`npm run card`，并按照 `DeepSeek.md` 检查 1440×900、1280×800、390×844、320×568 四个视口，最后由用户在 TauriTavern 真机导入新卡检查独立 API。**本分支尚未声称已通过这些验收。**
