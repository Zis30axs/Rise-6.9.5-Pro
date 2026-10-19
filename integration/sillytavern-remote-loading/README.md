# SillyTavern 远程角色加载补丁

本目录保存 2026-10-19 已部署到本机 SillyTavern 1.18.0 的紧凑传输与跨刷新缓存源码，便于审阅和恢复。它属于 SillyTavern 服务及其浏览器前端，不会随角色卡 PNG 自动安装，也不适用于直接修改 TauriTavern。

## 内容与基线

- `sillytavern-remote-loading.patch`：完整统一补丁，修改两个既有文件并新增六个源码/测试文件。一次应用此补丁即可，不需要另行复制文件。
- `new-files/`：上述六个新增文件的原样副本，仅便于直接阅读；它们已经包含在补丁内。
- `manifest.json`：基线与部署文件的 SHA-256、补丁校验和、备份来源及隔离验证结果。

原始基线来自本机 `D:\SillyTavern\backups\character-transport-20261019` 中的 `public/script.js` 和 `src/endpoints/characters.js`。第二阶段前的 `backups/character-cache-20261019` 记录紧凑传输已部署、持久缓存尚未加入时的中间基线。安装目录没有 `.git`，因此仅确认其 `package.json` 版本为 **1.18.0**，不能将它冒认为某个已知上游提交。应用前必须比对 manifest 中的文件哈希，不能仅凭版本号判断兼容。

补丁及新增副本与当前安装源码逐字节一致。没有收录 `config.yaml`、角色卡、聊天、用户设置、认证信息、依赖目录或浏览器数据。

## 行为

原生前端通过固定协议标记主动协商紧凑返回；未选择该协议的调用方继续收到原响应。完整原始 `json_data` 保持不变，浏览器结合覆盖字段恢复兼容角色对象，包含未知字段及安全处理的特殊属性名。

`/api/characters/get` 的持久缓存使用现有 localforage 和 js-sha256。每次先确认当前认证用户，再按用户 handle 与头像文件名隔离 IndexedDB 原始 JSON。服务器校验最新内容哈希，并始终返回当前运行时字段；内容变更重新下载。存储失败、缓存损坏或丢失、身份查询失败与旧服务器均回退完整请求。每个头像的请求令牌及原列表对象共同阻止切账号、换列表后的迟到响应覆盖当前角色。浏览器写缓存不阻塞角色发布，也不删除用户的其他数据。

首次打开仍需下载完整原始内容；不同浏览器或不同访问地址各有独立缓存。源码更新可能覆盖补丁，升级后需要重新检查兼容性。

## 应用与复原

以下说明供恢复或迁移时使用；打包本目录时未修改或重启正在运行的本机服务。

1. 在准备修改的 SillyTavern 安装上停止服务，另外备份两个既有文件。逐项比对 `manifest.json` 的 `baselineSha256`，并确认六个新增路径尚不存在。哈希不匹配时先审阅差异，不强行应用。
2. 在该 SillyTavern 根目录执行检查，再应用同一完整补丁。Git 的 `apply` 可以用于没有 `.git` 的安装目录：

   ```powershell
   git -c core.autocrlf=false -c core.eol=lf apply --check "<本目录绝对路径>\sillytavern-remote-loading.patch"
   git -c core.autocrlf=false -c core.eol=lf apply "<本目录绝对路径>\sillytavern-remote-loading.patch"
   ```

3. 比对全部八个文件的 `deployedSha256`。确认所用依赖与安装版本相容后重启服务，并刷新浏览器。
4. 回退时先停止服务，确认文件仍是 manifest 记录的部署哈希，再执行 `git -c core.autocrlf=false -c core.eol=lf apply --reverse --check` 和 `git -c core.autocrlf=false -c core.eol=lf apply --reverse`，使用同一个补丁。这会恢复两个既有文件并移除补丁新增的六个文件；若之后已有其他编辑，应恢复自己保留的基线备份并审阅差异，不能强行反向应用。无需清空浏览器存储或用户数据。命令中的两个 Git 配置仅作用于这次执行，用于保留 LF 换行，不更改全局 Git 设置。

本轮另一个独立配置调整仅为 **`performance.lazyLoadCharacters: true`**。它不包含在源码补丁中；需要时只编辑这个既有字段，保留其余配置。回退配置时恢复自己原来的字段值，不用别人的整份配置覆盖。

## 验证记录与复验

历史验证：28 项唯一 Node 测试通过（27 项合成/隔离测试，另 1 项可选真实安装卡检查覆盖 6 张卡）；6 项隔离无界面 Chromium 检查通过。覆盖原始 JSON 及完整对象相等、V1/V2、未知字段、Unicode、特殊属性名、换用户、迟到响应、卡变化、坏缓存、存储不可用及旧协议。浏览器验证在普通 HTTP 测试域名、真实 IndexedDB 与真实 localforage 上进行，`crypto.subtle` 不可用；包含桌面和 390×844 视口。它们不是手机 TauriTavern 真机验收。

打包时没有重复运行功能测试，只在独立临时目录复制两个原始基线文件，完成补丁检查、实际应用、八文件 SHA-256 比对、反向检查及复原比对；见 manifest。

在已安装依赖的 SillyTavern 根目录可复验：

```powershell
node --test tests/character-transport.node-test.mjs tests/character-cache.node-test.mjs
node tests/character-cache.browser-test.mjs
```

浏览器测试使用已安装的 Playwright/Chromium，不自动下载依赖。可用 `ST_CACHE_PLAYWRIGHT_PACKAGE` 指向含 Playwright 的 `package.json`，`ST_CACHE_CHROMIUM` 指向已有 Chromium 可执行文件，`ST_CACHE_BROWSER_OUTPUT` 指向可选证据目录。所有网络请求均被测试拦截，不访问运行中的酒馆或真实用户会话。`ST_TRANSPORT_VERIFY_CHARACTERS` 是可选的真实卡目录，只在明确设置时启用只读检查；默认测试不读取已安装角色卡。
