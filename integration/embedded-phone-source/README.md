# 内嵌手机源码复现补丁

这里保存《未读之城》当前构建使用的 ST-iPhonie 本地源码差异，随**私有主工程**维护。它不是向手机仓库公开发布或推送的授权，也不包含手机账户、API 配置、聊天记录或用户存储。

- 手机上游：<https://github.com/Zis30axs/ST-iPhonie>
- 必需基线：`24295193aa1adff606edcd4e63c8b07923533f2b`
- 补丁：`local-changes.patch`，由 `git diff --binary --full-index` 导出；仅包含既有的 12 个源码、测试及说明文件改动。
- 校验：`manifest.json` 记录补丁 SHA-256、每个文件的修改前后 SHA-256、Git blob ID 以及导出时工作区的原始字节 SHA-256。

这些改动保留手机按槽位等比例显示、透明外围，以及当前剧情联系人姓名、立绘和简介的编辑/保存接线。源码仍在相邻手机仓维护；本目录是固定基线的复现补丁，不是第二套手工维护的手机源码。

## 在相邻手机仓复现

以下命令从本主工程根目录运行，假设相邻目录为 `../ST-iPhonie`。先确认手机仓的 `git status --porcelain` 无输出；已有改动时应另备干净副本，不使用强制切换或重置覆盖它们。

```powershell
git -C ../ST-iPhonie status --porcelain
git -C ../ST-iPhonie switch --detach 24295193aa1adff606edcd4e63c8b07923533f2b
git -C ../ST-iPhonie rev-parse HEAD

$phoneSourcePatch = (Resolve-Path ./integration/embedded-phone-source/local-changes.patch).Path
git -C ../ST-iPhonie apply --check $phoneSourcePatch
git -C ../ST-iPhonie apply $phoneSourcePatch
git -C ../ST-iPhonie status --short

npm run phone:build
```

`rev-parse` 必须返回上面的完整基线。`apply --check` 通过后再执行下一条；应用后应恰有 manifest 列出的 12 个工作区改动。不要对已应用的副本重复应用，也不要把该命令替换成提交或推送。后续主工程构建仍按根目录 README 执行；手机生成包继续受原白名单限制，不带私人数据。

## 字节与验证边界

原手机工作区启用了 `core.autocrlf=true`，现有文件包含 LF 或 CRLF。补丁遵循 Git 的文本规范化：`beforeSha256` / `afterSha256` 对应 Git 规范化后的 LF 字节；`workingTreeSha256` 对应导出时未经修改的磁盘字节。因此，另一台设备的换行不同不表示源码丢失，可同时使用 manifest 的 `beforeGitBlob` / `afterGitBlob` 核对 Git 内容身份。

导出时已在两个独立临时 Git 目录分别以 `core.autocrlf=false` 和 `true` 复现：从基线复制这 12 个文件，执行 `git apply --check` 和 `git apply`，逐文件核对规范化字节及 Git blob ID，并重新导出相同 diff。两种模式均与当前手机源码一致，手机仓的 HEAD、工作区状态及原始文件字节保持不变。

本次仅验证现有改动的可复现保存，没有重跑手机测试，也没有新增手机真机或模型调用验收。此前功能验收以主工程已有记录为准；构建元数据中的时间戳和工具版本不属于源码字节复现承诺。
