# 单张角色卡中的真实手机来源

2026-10-17，按用户要求将 ST-iPhonie 直接打包到角色卡中的酒馆助手脚本。源代码仍在用户自己的 `D:\.study\ST-iPhonie` 仓库维护，入口是新建 `portable/entry.js`；本仓库的 `scripts/build_embedded_phone.mjs` 读取源文件，生成 `src/frontend/generated/embedded-phone.ts`。不是用原型联系人或演示短信替代手机。

## 打包范围

- 原 `index.js` 的真实手机业务与展示托管接口、其静态导入的浏览器模块。
- 原 `ui/phone.js` 及真实 App 模块、`phone.css`、`skins.css`、主页面与悬浮按钮 CSS。UI 在同源 `srcdoc` iframe 中运行，无须请求安装目录的 HTML/JS/CSS。
- T5 和 Qwen 精确分词表，共 4,348,110 字节。只读取明确的两个文件，不把个人配置装入产物。
- 手机版本来自公开的 `manifest.json`；编译清单记录源文件路径和 SHA-256。
- Fish 原生探测等由真实 UI 静态依赖的客户端模块随包；独立 MCP 实验控制面板、服务端桥接器及其凭据均不打包。

默认不携带 304 个自带 MP3（约 24 MB）。音效库不显示这批不可播放的声音，导入用户自己的音效仍可用。构建环境 `UNREAD_CITY_PHONE_INCLUDE_SOUNDS=1` 可选择完整音效包；只给生成脚本传 `--include-sounds` 后再运行默认构建会恢复省略模式。

## 生命周期和数据

静态 IIFE 在酒馆父页面执行，发布 `window.__unreadCityEmbeddedPhoneRuntime`：`ready` 等待真实 `STiPhoniePanelHost`，`dispose()` 等待可能尚未完成的初始化后，释放自己的 iframe、样式、事件监听和业务资源。已存在的新版 PanelHost 或旧版 `__stIphoniePanelBridge.connect` 会阻止第二套后台启动。

沿用 `stTtsDialogue` 设置、原 `scope` 与原 IndexedDB、`card:` / `group:` 数据分区；卡片不携带消息、密钥、OAuth 凭据或任何酒馆用户目录内容。跨来源、不同 App 或不同设备的数据不会凭同一 PNG 自动出现，迁移使用手机原有备份与手动同步。

专用构建抑制卡片加载、切换与原生消息重绘所触发的自动配图、自动来电/消息、自动声音和后台记忆总结，并停止自动同步排程；不修改共享设置里的原值。手机中明确点击的发送、生成、试听、文件导入与手动同步保留原实现。独立安装插件的源码行为不变。

同时停用原插件在启动时进行的旧系统消息清理与旧“正文也带上”记忆开关迁移，避免仅打开内嵌手机就删除旧手机历史或迁移其标记。用户在手机内明确执行的编辑、删除与设置操作不受影响。

## 仍需宿主提供的能力

酒馆助手执行角色脚本。手机需要同源酒馆的上下文、设置保存、消息渲染、生成与事件接口，以及浏览器 IndexedDB、随机数和音频能力。能力按实际可用情况检查，不增加版本门槛。

部分高级功能继续使用酒馆自身的 `/scripts/personas.js`、`/scripts/extensions/regex/engine.js`、`/scripts/world-info.js`、`/scripts/openai.js`、`/scripts/utils.js`、`/lib/pdf.min.mjs`、文件 API 和生成 API；外部模型、语音、绘图、音乐、MCP 服务仍由用户自行配置与授权。内嵌可消除外部手机插件目录的识别依赖，不能凭此声称所有 TauriTavern 宿主接口都已实机验证。

原扩展清单的 `generate_interceptor` 注册属于酒馆扩展加载器；单独嵌入的脚本不注册该清单。原生请求中历史语音/图片标签的自动清理未作为本次内嵌已验证能力，不能等同于独立扩展全部生命周期钩子已经接入。

## 来源与许可

- 用户 Fork：<https://github.com/Zis30axs/ST-iPhonie>。上游整体尚未声明许可证，本次是用户自己的本地私人维护，不声称拥有公开再分发授权。
- Marked：保留原 `ui/vendor/marked.LICENSE.txt`。
- T5：`google-t5/t5-base`；Qwen：`Qwen/Qwen3.5-0.8B`，按手机仓库 `tokenizers/README.md` 记录的 Apache-2.0 来源与许可。
- 可选音效包：手机仓库 `sounds/README.md` 记录 Freesound CC0 音效与作者。
- 构建会将第三方许可证保存到 `src/frontend/generated/embedded-phone-licenses.txt`，应与私人交付说明一起保留。
