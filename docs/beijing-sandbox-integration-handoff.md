# 北京沙盘接入交接（2026-11-14）

本分支从 `lite` 的提交 `ffb1faf8786ef7a7ed5bc321a2fdd8edb11d351e` 创建。

## 本次交付与来源

本次聊天已生成 `beijing-sandbox-repo-patch.zip`，完整压缩包包含以下内容，供后续直接应用到相同基线：

- 原始北京沙盘 `assets/beijing-sandbox/sandbox.glb`（19,601,140 字节，SHA-256: `fc03c2a90e26e48dde2adf4c9f53135c365618497bd4b722db14404b5ab6d66d`）
- `assets/beijing-sandbox/sandbox.json`（33 个地点、48 条双向示意连接、5 个焦点区域，以及独立源码）
- `src/runtime/beijing.ts`：地点列表、行程连接、北京时间派生
- `src/frontend/BeijingSandbox.vue`：3D 沙盘、地点选择、路线预览、WebGL 降级
- `scripts/verify_beijing_model.py`：验证 GLB 原始文件及独立资源约束
- `tests/beijing-sandbox.test.ts`：目录、线路、时区测试
- `apply_beijing.py`：安全、幂等的四文件修改器，扩展原有 `src/runtime/model.ts`、`src/frontend/WorldMap.vue`、`package.json` 和 `scripts/build_lite_release.py`。

## 设计约束

- 项目继续优先维护纯小说模式；北京只作为地图选择和预览入口，不扩展自由漫游/室内 3D。
- 旅行必须走权威 `novel_travel`；不新增独立资金、时间、精力或存档。
- 北京与东京之间暂设一条羽田↔北京站的组合国际航线；北京站以外的地点严格沿地图连接移动，票价只是角色卡内的示意日元数值。
- 北京模型必须被离线提取到正式 Lite 核心 ZIP；不允许生产运行时下载远端 GLB。
- 原版东京与加州线路、GLB、旧存档逻辑不得回退。

## 当前 GitHub 状态和阻塞

这份交接文档已提交到专用分支，**但完整实现尚未提交**。当前 GitHub 连接的写入 API 不能读取本地二进制 ZIP/GLB；如果仅把文本代码推送到分支，会让构建因缺失 GLB 而失败，所以此 PR 保持 Draft，不能直接合并。完整工程补丁在本次 ChatGPT 会话提供下载，模型不可被替换为占位文件。

## 后续合并前验证

```bash
python /path/to/beijing-integration-ready/apply_beijing.py --repo /path/to/repo
python /path/to/beijing-integration-ready/apply_beijing.py --repo /path/to/repo --apply
python scripts/verify_beijing_model.py
npx vue-tsc --noEmit
npx vitest run tests/beijing-sandbox.test.ts
npm run build
```

确认模型已在 `unread-city-lite-assets.zip`、实际浏览器显示和角色旅行事务可用后才能从 Draft 转正式 PR。