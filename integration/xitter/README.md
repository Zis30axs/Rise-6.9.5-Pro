# Xitter 初版

沿用 ST-iPhonie 原论坛的 AppStore、刷新入口、发帖、评论和回复流程。主页和关注接在原应用中，内部应用键仍为 `forum`；未新建论坛、朋友圈、联系人或邮件投递系统。

## 身份与存档

`src/runtime/network-identities.ts` 是固定账号的唯一来源，覆盖当前全部世界书 `extensions.personId` 和两位原有主角，并登记新闻/机构、固定杂谈和三支乐队。昵称、用户名、邮箱、头像键均由程序决定；切主角和切聊天不会重造世界书人物身份。

随机网友与随机发帖继续保留。模型可写一个新路人网名，程序以该网名生成稳定账号 ID、用户名、虚构邮箱与默认头像，通过既有 `phone_app` 事务保存到共享 `protagonists.internet.guests`。重复昵称复用同一身份。关注图保存于同一字段的 `follows`，不会改写联系人关系、私人经历或游戏时钟。

新帖子和评论将账号 ID 写进既有作者字段；新帖子使用同一世界聊天内共享的网络空间。历史帖子原文保留，真实姓名、世界书人物简称和旧网名映射到固定账号；一般话题关键词不作为身份别名。旧数据仅记为 `me`、没有作者归属证据时显示独立“旧账号”，不冒认当前主角；旧主角私有空间内的帖子仍在原视角可见。历史路人主页由同一身份函数确定，关注时才登记。

账号头像/昵称可打开主页；邮箱只作为主页资料展示。关注数和粉丝数来自真实保存的关注关系，不随机补造。CRYCHIC 可查看、可关注，固定休眠；生成解析、写入及热搜各有守卫，不提供激活路径。

## 刷新与知识范围

打开、切页、看主页与关注均不发起模型请求。一次手动刷新仍只调用原有一次生成，统一处理所有账号类别，允许零新帖。用户发帖、评论后的原有回复机制保留。

刷新走专用只读 `WorldPhoneApi.network()`：只给固定公开资料、权威游戏日期/天气和现有纪年表已到发布时间的事件；不传私人短信、正文、日记、家庭生活、记忆摘要或完整世界书。读取纪年表不消费主剧情回执。机构/乐队新帖必须附已提供的公开依据 ID；模型仍负责文本是否忠实于依据，程序不能证明任意自然语言陈述的真实性。没有公开依据的事件不得编造为新闻。初版未将私人邀约、乐队内部邀请或尚未公开的场地预约自动发布到网络。

## 构建与验证

手机源码维护于 `D:\.study\ST-iPhonie`；本目录补丁仅记录本次跨仓库改动，内嵌文件由 `scripts/build_embedded_phone.mjs` 生成，不手改生成包。头像与壁纸来源见 `assets/network/README.md`。

本地手机源码已应用本轮补丁；不要重复应用。需要在本轮开始前的源码副本上重现时，按 `phone.patch` → `phone-fixes.patch` → `phone-legacy.patch` → `phone-correctness.patch` 顺序应用。补丁基线包含用户原有未提交改动，不能假定适用于上游干净版本。

本地定向命令：

```text
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
node node_modules/vitest/vitest.mjs run tests/network-identities.test.ts tests/xitter.test.js tests/phone-device-settings.test.ts tests/phone-game-clock.test.ts tests/no-japanese.test.ts
node scripts/build_xitter_preview.mjs
node node_modules/@playwright/test/cli.js test --config playwright.xitter.config.ts
```

浏览器测试使用真实手机 UI、原解析器、AppStore IndexedDB 和世界保存动作，生成端以固定测试回复代替，不使用 Agent Edition、不调用真实模型。覆盖 1440×900、1280×800、390×844、320×568。独立预览不是主小说界面或完整酒馆验收；生产内嵌构建与 Lite 资源检查单列记录。未运行远程 CI，未部署到本机酒馆，未完成 TauriTavern 真机验证。

本轮结果见 `outputs/xitter-qa/verification.json`，素材完整性与 PNG 元数据检查见 `outputs/xitter-release/verification.json`。交付普通 Lite PNG、Tauri 压缩元数据 PNG 和同一素材 ZIP；Lite 仍需按现有流程导入本地素材包，并安装、授权酒馆助手。独立预览 `outputs/xitter-qa/index.html` 仅使用演示帖子和隔离的测试存储。
