# NPC 平涂动画风表情立绘（最终 v2）

2026-10-18，用户选择“更接近素世的简洁平涂动画风”。本目录是当前小说模式使用的 NPC 静态表情资源：三位原有 NPC 外形各九种固定表情和轻手势，共 27 帧。切换显示静态立绘，不播放动作动画，不新增 NPC Live2D 或运行时 3D；素世现有 Live2D 继续由原模块提供。

## 设计与来源

三套图均使用内置 `image_gen.imagegen` 重新绘制。共同风格参考是 `outputs/novel-live2d-happy.png` 中素世角色的线条、自然二维五官和简洁平涂，截图内界面与背景不作为画面内容。根目录的三张 WebP 只提供发型、发色、服装和辨识特征，不沿用原模型的拓扑、塑料材质或三维光照；未把弃用 v1 图集作为最终画风参考。

| 图集 | 沿用的原模型外形 | 完整提示词、参考文件和生成记录 |
| --- | --- | --- |
| `deepseek.png` | 蓝发、鱼鳍耳、白色头饰与蓝白女仆服 | [deepseek.generation.json](deepseek.generation.json) |
| `xiaoyang.png` | 白蓝头发、侧高马尾、黑色学生制服与灰格纹 | [xiaoyang.generation.json](xiaoyang.generation.json) |
| `claude.png` | 原包实际提供的幼年 Claude，橙发、向日葵头饰与白棕服装 | [claude.generation.json](claude.generation.json) |

原素材与署名沿用[角色来源记录](../../character-sources.md)：DeepSeek 包标签 QCQKK、VRM 作者字段 K；小洋包标签蜂神扇、VRM 作者字段 1；Claude 原包署名 Manny / ningfangtianwai-pixel、AI Girls 3D，并声明 CC BY 4.0。原包、GLB 和参考 WebP 保留。此次变化为以原外形设计重新绘制二维表情，并非原包附带的表情图片或动作片段；没有据此更改 NPC 的姓名、身份、关系或剧情设定，也没有追加新的授权声明。

## 文件与取景

| 文件 | 实际尺寸 | 字节 |
| --- | --- | ---: |
| `deepseek.png` | 1122 × 1402 RGBA | 1,799,861 |
| `xiaoyang.png` | 1122 × 1402 RGBA | 1,716,019 |
| `claude.png` | 1122 × 1402 RGBA | 1,923,249 |
| 合计 | 3 张透明 PNG，27 帧 | **5,439,129** |

每个 PNG 保持所选图片工具输出的原始字节，SHA-256 已与生成目录原文件核对；未用程序修脸、绘图、去背景、改 alpha、裁图、缩放或重新编码。程序只读取尺寸、透明度和哈希，以及选择原图中的显示矩形。图集排布并非数学三等分，必须使用 [manifest.json](manifest.json) 中的 `frames`；前端 `novel-npc-atlases.ts` 使用相同矩形，通过 SVG `viewBox` 显示原始像素。

九帧顺序固定为：`neutral` 平静、`happy` 开心、`sad` 难过、`angry` 生气、`surprised` 惊讶、`shy` 害羞、`thinking` 思考、`serious` 严肃、`relieved` 安心。同一角色保持固定取景尺寸；DeepSeek 另逐帧对齐头顶，其头到腰的取景会有意截去下垂手臂和衣裙下部。

已核查 27 个显示矩形与生产源码、生成记录一致。以 alpha ≥ 20 检查，所有帧的顶部与左右边界均无可见像素，每帧只有一个主体，没有裁头或带入相邻人物；小洋和 Claude 的下边界也留空。DeepSeek 前六帧下边界为上述有意的腰部裁切。小洋严肃帧有一处 18 像素的小分离轮廓片段，位于自身轮廓范围内，不是邻格人物。详细检查保存在 `outputs/npc-portrait-work/atlas-v2-rect-audit.json`。透明预览中的极低 alpha 彩色碎点不能当作不透明背景，实际浏览器合成另行检查。

## 打包范围

小说 NPC 最终只静态内嵌本目录三张 PNG。根目录三张 WebP 是设计参考与来源记录，不再重复内嵌；`expression-atlases/` 是用户已否定画风的弃用阶段稿，也不进入最终前端。上述判断来自当前前端静态引用；最终 IIFE、角色卡 PNG 和本地安装的一致性由交付审计单独核对，不能把本资源检查写成手机真机验收。
