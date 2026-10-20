# 祥子与市中心素材集成

PR #6，分支 `recovery/downtown-sakiko-20261020`。从交接 `4159b0a` 继续，保留 `6e8d114` 的运行时接线。PR #4 双主角仍独立 Draft，不合并。

18 张 image2.5sun 正式素材已落盘并审核，manifest 为 `approved`：两套服装各六张透明全身立绘，丰川家外景昼/昏/夜、会客厅和市中心昼/夜。原图、运行 WebP、来源、完整提示词和逐项视觉检查一起保存，见 [素材说明](../../assets/downtown-art/README.md)。QA 联系图只作检查证据，没有当作独立立绘来源。

构建器把实际图片编码到同一助手脚本，地点、时刻、说话人和表情决定运行选图。进入丰川家切室内服/会客厅，离开切回常服/外景。用户最新要求人物放大，透明立绘可继续延伸到阅读及输入面板后方，脸部保留在正文上方；不再要求整个人物避开正文。

## 构建与核验

```powershell
python scripts/prepare_downtown_art.py --check
python scripts/check_downtown_art_status.py
node --experimental-strip-types --test tests/sakiko-art-policy.node.mjs
python -m unittest discover -s tests -p 'test*.py' -v
npm run art:build
npm run phone:build
npx vitest run --maxWorkers=1
npm run card:art
python scripts/audit_downtown_release.py
npx playwright test tests/e2e/downtown-art.spec.ts --workers=1 --reporter=line
```

依赖来源：锁文件中的 npm 依赖及 Pillow；相邻 `ST-iPhonie` 使用基线 `24295193` 加 `integration/embedded-phone-source/local-changes.patch`，本轮没有修改手机源码。`card:art` 包含类型检查、生产构建、通用卡、Tauri 无损压缩及 18 张图片字节核验。包装脚本拒绝覆盖已有 Tauri 输出，重建时先将旧候选和 verification 文件另存，保留旧产物。

`pending` 或缺失/未审核/损坏素材必须阻止发布；`approved` 必须检查真实尺寸、alpha、锚点、哈希和 18 个实际图像字节。`Object.freeze<DowntownArtPack>` 保留生成对象的字面量类型，修复真实 approved 分支的类型检查。

## 交付与验收边界

最终候选 Tauri PNG **42,712,038 字节**，严格小于 50,000,000；SHA-256 `5e3b70fd92ce0b5b002ebf33ab0aa527b3092ecc4bdfb4648b739d4d719d8378`。通用卡 76,992,717 字节，保存在本地 `dist/unread-city.png`。Tauri 交付路径为 `outputs/未读之城-祥子与市中心素材版-Tauri.png`。

精确封装审计见 `outputs/downtown-art-packaging-audit.json`：同一固定 ID 脚本一份且与最终 IIFE 逐字节一致，解压后全部 PNG 块等于通用卡，封面不变；120 个原有内嵌资源仍在，手机完整 runtime 一份，12 个本地源补丁文件与保存记录一致。18 图实际卡内校验见 `outputs/downtown-art-release.json`。

四视口的独立结果和截图位于 `outputs/downtown-art-qa/`，综合结果在 `outputs/downtown-art-verification.json`。检查使用最终生产 IIFE、真实内嵌手机和受控剧情回复，不调用真实剧情模型或读取/修改用户真实存档。DSH 专用工具未开放，本轮使用无窗口 Playwright Chromium，不能写作 DSH 或物理手机验收。新卡的 iPhone/TauriTavern 导入与性能仍待真机确认，不能套用旧 35.2 MB 卡的历史反馈。
