# 魔裁运行时美术派生

由脚本从 PR #16 的本地 ZIP 源包生成，源包仍是权威交接物。

- `emma/`：9 张艾玛表情，逐字节复制自 `assets/majo-emma/packs/` 的无损 WebP（1024×1536）。
- `characters/<personId>/`：原六名半主要角色各有 3 张（`neutral/happy/shy`），仍用 `anime-seg` 抠图、2× 放大为透明 WebP（1024×2048）。
- `characters/majo-margo/`：宝生玛格 768×1024 AVIF。平静、开心、害羞在目录根，生气、惊讶在 `extras/`。对话按情绪选用对应原画；难过、思考、严肃、安心使用本人平静立绘。这些文件原样登记进 `manifest.json`，不经 anime-seg 重编码。
- `characters/majo-yuki/`：月代雪新增 3 张 512×1024 透明 PNG（`neutral/happy/thinking`）。直接在原始白底 JPEG 三联图上使用连通背景洪泛、保留最大人物连通区域、轻微边缘去白处理；剔除相邻姿态跨格碎片，不重新绘画。缺失情绪回退本人平静。
- `characters/majo-nanoka/`、`characters/majo-arisa/` 与 `characters/majo-milia/casual/`：2026-10-30 用户提供的黑底三联常服。用 rembg isnet-anime 抠图，只在模型不确信时清除与边缘相连的近黑背景。溯源 PNG 在 `sources/`，原 JPEG 在 `assets/majo-cast/sources/20261030/`。每套三张为平静、开心、思考。游戏表情里 smile 用开心，troubled 与 annoyed 用思考，surprised 与 sad 用平静。米莉亚这套是当前默认；早先 anime-seg 的 `neutral/happy/shy` 仍留在 `characters/majo-milia/`。
- `characters/majo-meruru/`：2026-10-31 用户提供的冰上梅露露白底五表情。只清除与画面边缘相连的近白背景，头纱、白袍、白袜和白皮鞋留在轮廓内且完全不透明。运行时六张 WebP：平静与开心都是闭眼笑，害羞、惊讶、生气、难过各一张。原 JPEG 在 `assets/majo-cast/sources/20261031/`，溯源 PNG 在 `sources/`。
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
