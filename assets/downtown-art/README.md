# 祥子与市中心正式运行素材

2026-10-20，按用户指定的 image2.5sun（接口模型 `gpt-image-2.5-sunburst`）生成。使用用户明确授权的 imagegen CLI/API 备用方式。密钥、接口配置和私人数据不随素材保存。

- `sources/`：18 张独立生成/编辑的原始 PNG，保留原文件，不从概念展示板裁切。常服与室内服分别以中性原图制作五种表情差分；宅邸昏/夜及市中心夜景使用对应白天原图编辑以保留建筑和机位。
- `sources/mutsumi-uniform-*.png`：2026-10-29 用户提供的若叶睦月之森制服透明底全身原图六张，表情为 neutral、neutral-aside、neutral-aside-2、smile、shy、surprised。字节原样保留，未重编码。
- `characters/sakiko/{casual,home}/`：两套衣服各六表情，768×1344 RGBA 透明全身 WebP，足部锚点统一为 `[384,1280]`。表情是 neutral、smile、troubled、surprised、annoyed、sad。
- `characters/mutsumi/uniform/`：同一画布与足部锚点的六张运行 WebP。游戏表情仍用 neutral、smile、troubled、surprised、annoyed、sad；没有对应原图时，troubled 用 shy，annoyed 用 neutral-aside，sad 用 neutral-aside-2。
- `sources/anon-uniform-*.png`：2026-10-30 用户提供的千早爱音羽丘制服透明底全身原图六张，表情为 shy、smile、confident、wave、surprised、cheerful。字节原样保留，未重编码。
- `characters/anon/uniform/`：同一画布与足部锚点的六张运行 WebP。游戏表情仍用那六个名字；neutral 用 smile，smile 用 cheerful，troubled 与 sad 用 shy，annoyed 用 confident，surprised 用 surprised。wave 保留为挥手姿势，不顶替这六个表情。
- `sources/taki-uniform-*.png`：2026-10-30 用户提供的椎名立希花咲川制服全身原图四张，白底已去除后保存为透明 PNG。姿势为 neutral（单手叉腰侧目）、crossed（抱臂）、drumsticks（叉腰浅笑、手持鼓棒）、embarrassed（双手贴脸、脸红）。
- `characters/taki/uniform/`：同一画布与足部锚点的四张运行 WebP。游戏表情仍用那六个名字；neutral 用 neutral，smile 用 drumsticks，annoyed 用 crossed，troubled、sad 与 surprised 用 embarrassed。
- `backgrounds/`：丰川家昼/昏/夜、会客厅、市中心昼/夜，1536×864。

提示词保存在 `integration/downtown-art/prompts/`；`backgrounds-sunburst.jsonl` 是最终背景生成批次。其余文本是各次生成/编辑的完整提示词，`backgrounds.jsonl` 为早期草稿批次。最终 18 张原图的尺寸、大小、SHA-256 和模型在 `sources.json`；实际运行文件清单在 `manifest.json`，逐项视觉审核在 `visual-review.json`。这些文件均位于 `integration/downtown-art/`。

`python scripts/prepare_downtown_art.py` 从原图派生运行 WebP：立绘 alpha 做 3×3 median，清除 alpha≤24 的散点，等比缩放/对齐后无损编码；背景等比裁切到 16:9，以 WebP quality 90 编码。这里的“无损”仅指处理后立绘的 WebP 编码，不宣称处理过程与原 PNG 像素相同。`--check` 重新派生并逐字节比较，不自动批准审核。

运行素材合计 **9,553,556 字节**（含若叶睦与千早爱音制服各六张，以及椎名立希制服四张）。原 PNG 仅用于溯源和再编辑，不进入游戏包。祥子 12 张、若叶睦 6 张、千早爱音 6 张与椎名立希 4 张立绘头、手、鞋完整，画面中允许下半身被正文/输入面板遮挡；用户要求放大人物，不以“全身素材”为由缩成小人。

祥子与家族和解是本卡后日谈/AU，不是官方剧情声明。生成画面不提供票价、功能状态、大小或其他游戏设定；规则以程序和世界书为准。素材不是官方授权插画。
