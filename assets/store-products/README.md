# 便利店商品插画

本目录保存 12 件固定货架商品的独立透明 PNG。每件商品由内置 `image_gen.imagegen` 单独生成，共 12 次独立调用；没有用图集切片或程序绘制代替商品图片。

图片用于《未读之城》的便利店货架与随身背包。风格方向为日系生活游戏的简洁二维道具插画：清楚轮廓、概括色块、轻微俯视的三分之四构图。每张只含一个完整包装单元，不包含人物、手、价格或额外散落物。香烟图片仅表现封闭烟盒。

## 文件与来源

所有原始 PNG 都是工具返回原图的逐字节副本，继续保留，不改色、裁切或缩放。原生生成文件保留在 Codex `generated_images` 目录，完整绝对路径和来源 SHA-256 见 [manifest.json](manifest.json)。

2026-10-19 远程加载优化后，运行时使用本目录 `lossless/` 中的无损 WebP 派生图，仍内嵌同一脚本和 PNG，不依赖外部资源。12 张图片由 12,311,139 字节减到 7,631,090 字节；尺寸和全部 RGBA 像素（包括完全透明区域的 RGB）逐字相同。来源与派生哈希见 [无损清单](lossless/manifest.json)，可用 `python scripts/prepare_lossless_runtime_images.py --check` 重新解码校验；去掉 `--check` 可复现生成。

完整的 12 个最终提示词见 [generation-prompts.json](generation-prompts.json) 的 `products` 数组，以商品 `id` 查找 `prompt` 字段。该文件保存了每次调用的完整实际提示词、商品名称、短品牌、包装构成与颜色要求；没有省略共享提示段落。调用均使用 `transparent_background: true`，没有引用外部图片或改用 CLI/API。

| 商品 ID | 商品 / 品牌 | 最终图片 | 像素尺寸 | 原图字节数 |
| --- | --- | --- | --- | ---: |
| `meal-basic` | 家常饭团 / 晨巷 | [meal-basic.png](meal-basic.png) | 1254 × 1254 | 1,069,081 |
| `meal-standard` | 鸡肉便当 / 晴盒 | [meal-standard.png](meal-standard.png) | 1254 × 1254 | 1,189,680 |
| `meal-premium` | 鲜蔬双拼饭 / 禾序 | [meal-premium.png](meal-premium.png) | 1254 × 1254 | 1,410,407 |
| `snack-basic` | 脆盐饼干 / 小咔 | [snack-basic.png](snack-basic.png) | 1254 × 1254 | 995,337 |
| `snack-standard` | 可可夹心棒 / 可谷 | [snack-standard.png](snack-standard.png) | 1536 × 1024 | 1,271,920 |
| `snack-premium` | 混合坚果 / 林拾 | [snack-premium.png](snack-premium.png) | 1254 × 1254 | 1,155,374 |
| `drink-basic` | 柠檬汽水 / 泡晴 | [drink-basic.png](drink-basic.png) | 1254 × 1254 | 652,803 |
| `drink-standard` | 原味酸奶 / 白牧 | [drink-standard.png](drink-standard.png) | 1254 × 1254 | 697,925 |
| `drink-premium` | 谷物鲜乳 / 禾沐 | [drink-premium.png](drink-premium.png) | 1254 × 1254 | 752,956 |
| `cigarette-basic` | 灰桥香烟 / 灰桥 | [cigarette-basic.png](cigarette-basic.png) | 1254 × 1254 | 1,012,241 |
| `cigarette-standard` | 夜渡香烟 / 夜渡 | [cigarette-standard.png](cigarette-standard.png) | 1254 × 1254 | 1,000,856 |
| `cigarette-premium` | 青屿香烟 / 青屿 | [cigarette-premium.png](cigarette-premium.png) | 1254 × 1254 | 1,102,559 |

合计 12 张，12,311,139 字节。可可夹心棒的原生输出为横向画幅，其余为方形画幅。界面应保留原始比例并用 `object-fit: contain` 完整展示，不能为了统一比例裁掉包装。

## 检查记录

- 12 次工具返回图片均已逐张查看：每张为一个完整商品，虚构品牌文字与固定货架一致，没有多余价格、人物或分离道具。
- 三款烟盒均为封闭包装，没有烟支、点燃效果、烟雾或吸烟人物。
- 12 张均含 RGBA 透明通道；工具来源与工作区副本的 SHA-256 完全一致。
- 逐边读取所有最外层像素，最大 alpha 为 0–2 / 255，没有显著不透明内容触及外边缘。四角均为透明。
- 可可夹心棒在某些工具预览中会显示透明像素里残留的深色 RGB；对图外多个可疑光晕位置抽样，alpha 均为 0。保留原 PNG，不修改像素。

图片是视觉素材。名称、价格、品质档位、每次使用单位与效果仍以 [固定商品目录](../../src/runtime/convenience-store.ts) 为准，不能从包装画面推断或更改结算规则。
