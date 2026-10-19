# NPC 全身平涂立绘（最终 v3）

用户在选定“更接近素世的简洁平涂动画风”后，进一步要求立绘不要截断、最好完整全身。本目录保留该画风，将三位原有 NPC 的九种情绪重新绘制为完整从头顶到双脚的静态图集，共 27 帧。每帧源图本身就有完整头发、双手、裙摆、双腿和两只鞋，不靠 CSS 补身体，也不再使用腰部裁切。

## 来源与生成

所有图集由内置 `image_gen.imagegen` 生成。已确认的 v2 图集仅作为平涂画风、面部表情和上身设计参考；原模型全身截图仅作为裙、腿、袜、鞋等下身设计参考，不沿用三维材质和光照。原 NPC 外形身份沿用，不改变剧情姓名或关系。仍是九张固定表情与轻手势的切换，不是动作动画，不新增 NPC Live2D 或运行时三维角色；素世的现有 Live2D 不受影响。

| 文件 | 字节 | 设计参考和完整提示词 |
| --- | ---: | --- |
| `deepseek.png` | 2,024,454 | [deepseek.generation.json](deepseek.generation.json) |
| `xiaoyang.png` | 1,696,263 | [xiaoyang.generation.json](xiaoyang.generation.json) |
| `claude.png` | 2,496,161 | [claude.generation.json](claude.generation.json) |
| 合计 | **6,216,878** | 三张 1024 × 1536 RGBA 图集，27 帧 |

DeepSeek 保留蓝发鱼鳍耳、原女仆裙、白袜和深蓝鞋；Claude 使用原包实际提供的幼年外形，保留橙发、花饰、长裙及浅色系带靴。小洋原模型为赤足；本轮全身学生服插画补充简洁黑色平底鞋，仍为裸腿，不虚称该鞋来自原模型。各提示词、角色与画风参考、原始图片工具输出路径、实际尺寸和 SHA-256 均写在对应生成记录。

原素材作者与原文件声明沿用[角色来源记录](../../character-sources.md)：DeepSeek 包标签 QCQKK / VRM 字段 K，小洋包标签蜂神扇 / VRM 字段 1，Claude 包内署名 Manny / ningfangtianwai-pixel、AI Girls 3D、CC BY 4.0。本次是依据外形设计重绘的二维派生图，不是原包附带的表情图，也不追加新的授权声明。原压缩包、模型、参考图与历史交付均保留。

## 完整性与显示

PNG 与选定图片工具原输出逐字一致，未用程序裁图、补腿、画表情、去背景、修改 alpha、缩放或重新编码。程序只核对原始字节与参考文件哈希，并记录显示矩形；图片工具不是可保证逐像素复现的确定性渲染器，维护时应保留已验收原输出。

不要把整图按数学三等分。显示时使用 [manifest.json](manifest.json) 中的实际 `frames`，这些坐标与 `src/frontend/novel-npc-atlases.ts` 和生成记录一致；Claude 原始排布各行的高度略有不同，分别用 520、512、504 像素的取景高度，完整保留头发和靴底。每个矩形都在原图内，无需裁断任何部位。

九种情绪依次为平静、开心、难过、生气、惊讶、害羞、思考、严肃、安心，对应 `neutral/happy/sad/angry/surprised/shy/thinking/serious/relieved`。已实际查看三套全部人物；以 alpha ≥ 20 检查，27 个显示矩形的四条边均无可见像素，每帧只有一个主体，没有切头、切鞋或带入邻格。详细结果见 `outputs/npc-portrait-work/atlas-v3-rect-audit.json`。

部分完全透明像素的 RGB 仍含彩色渐变，图片工具预览可能把它显示出来；其 alpha 为 0，实际正常合成没有背景，不应因此用程序抠图或改 alpha。最终界面需用完整包含的显示方式为人物预留空间，不能让小说正文遮断腿脚；界面与手机尺寸验证另行记录。

## 当前打包范围

2026-10-19 远程加载优化后，当前 NPC 小说立绘引用本目录 `lossless/` 中三张无损 WebP 派生图，原始全身 PNG 保留。总大小由 6,216,878 字节减到 4,153,420 字节；尺寸、全部 RGBA 像素（包括完全透明区域的 RGB）与原 PNG 逐字相同，27 个取景矩形保持。来源及派生哈希见 [无损清单](lossless/manifest.json)，可用 `python scripts/prepare_lossless_runtime_images.py --check` 重新解码校验。

NPC 素材根目录三张 WebP 为初始设计参考；`expression-atlases/` 是画风弃用稿，`expression-atlases-v2/` 是已验收但被全身需求替代的半身历史版。它们均保留在工作区，不重复内嵌最终角色卡。既有 3D 模型继续用于原有漫游场景，和这里的静态全身图用途不同。

资源本身的核对不等同于最终 IIFE、交付卡、已安装联调卡一致性或手机真机验收；最终打包和独立审计记录另列。
