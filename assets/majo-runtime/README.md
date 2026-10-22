# 魔裁运行时美术派生

由脚本从 PR #16 的本地 ZIP 源包生成，源包仍是权威交接物。

- `emma/`：9 张艾玛表情，逐字节复制自 `assets/majo-emma/packs/` 的无损 WebP（1024×1536）。
- `characters/<personId>/`：6 名半主要角色 × 3 格（`neutral/happy/shy`）。每格先用 `skytnt/anime-seg`（Apache-2.0）抠图，再以预乘 alpha 的 LANCZOS 放大 2× 到 1024×2048，保存为带透明通道的 WebP。第三格的“害羞”是用户确认身份后的初版画面判定。
- `interiors/`、`districts/`：6 张住宅室内与 3 张街区原图的运行时 WebP（质量 82），源 JPEG 保留在 ZIP 中。
- `manifest.json`：每项的字节数、SHA-256、尺寸、来源包与来源 SHA-256；普通构建的 `--check` 逐字节校验，不需要模型。
- `character-cutouts.json`：抠图模型 URL/SHA-256/许可证、放大倍数和每张输出；`character-sheet-assignments.json`：用户确认的身份映射。

重新生成：

```bash
# 只在需要重新抠图时：
python -m pip install onnxruntime
python scripts/prepare_majo_character_cutouts.py --model /path/to/isnetis.onnx
# 普通构建/校验：
python scripts/prepare_majo_visual_assets.py
python scripts/prepare_majo_visual_assets.py --check
```

未确认身份的素材、缺失的九表情/透明立绘和专属场景美术不会在本目录中被伪造。
