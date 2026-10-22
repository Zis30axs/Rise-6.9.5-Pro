# 魔裁运行时美术派生

由 `python scripts/prepare_majo_visual_assets.py` 从 PR #16 的本地 ZIP 源包生成，源包仍是权威交接物。

- `emma/`：9 张艾玛表情，逐字节复制自 `assets/majo-emma/packs/` 的无损 WebP。
- `characters/<personId>/`：6 名半主要角色 × 3 格（`neutral/happy/shy`），从 1536×1024 三姿态 JPEG 按 512×1024 裁切后转 WebP（质量 92）。不是透明立绘；第三格的“害羞”是用户确认身份后的初版画面判定。
- `interiors/`、`districts/`：6 张住宅室内与 3 张街区原图的运行时 WebP（质量 82），源 JPEG 保留在 ZIP 中。
- `manifest.json`：每项的字节数、SHA-256、尺寸、来源包与来源 SHA-256；`--check` 逐字节校验。
- `character-sheet-assignments.json`：用户确认的身份映射（希罗/诺亚/米莉亚/安安/橘雪莉/远野汉娜），是人工记录，不由脚本覆盖。

重新生成：

```bash
python scripts/prepare_majo_visual_assets.py
python scripts/prepare_majo_visual_assets.py --check
```

未确认身份的素材、缺失的九表情/透明立绘和专属场景美术不会在本目录中被伪造。
