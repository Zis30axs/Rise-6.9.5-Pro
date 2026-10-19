# NPC 立绘来源与阶段记录

2026-10-18 用户先要求复用此前 NPC 外形作为小说静态立绘，随后要求表情与动作修正，并选定“更接近素世的简洁平涂动画风”，最后要求不要截断、完整全身。当前最终资源是 [expression-atlases-v3/](expression-atlases-v3/README.md) 中由图片工具重绘的三套九情绪全身图集，共 27 帧，每帧完整包含头顶、手部、裙、双腿与两只鞋。根目录 `deepseek.webp`、`xiaoyang.webp`、`claude.webp` 仅保留为设计参考和来源证据，不随最终小说前端重复内嵌；`expression-atlases/` 为弃用画风稿，`expression-atlases-v2/` 为已被全身需求替代的半身历史版。NPC 仍是静态立绘切换，素世原有 Live2D 继续由其他模块提供。

以下记录的是最初三张参考 WebP 的原包检查、离线渲染与复现过程，不代表当前最终显示资源。

## 原包检查

只把压缩包内容当作数据读取，没有执行说明、脚本、Blender 文件或外部指令，三个原压缩包保持不变。

| 外形 | 包内实际素材 | 处理选择 |
| --- | --- | --- |
| 深蓝少女 / DeepSeek | 实际为 7z，仅一份 `DS.vrm` | 没有独立立绘或表情图片，从已导入 GLB 渲染。 |
| 小洋学生服 | ZIP，仅一份 `小洋学生服2026 (1).vrm` | 没有独立立绘或表情图片，从已导入 GLB 渲染。 |
| Claude · 幼年 | GLB、Blend、纹理及三张预览；`front.png`、`three-quarter.png` 为 900×1100 RGB，`glb-preview.png` 为 720×880 RGB，均为不透明背景 | 原预览不是透明立绘；使用已验收 GLB 统一渲染透明图，不去抠原图背景，也不将衣服纹理当立绘。 |

详细原包名称、字节数、SHA-256 和实际渲染的 GLB 哈希写在 [manifest.json](manifest.json)。沿用 [角色来源记录](../character-sources.md)：深蓝少女的包标签为 QCQKK、VRM 作者字段为 K；小洋的包标签为蜂神扇、VRM 作者字段为 1；Claude 包内作者为 Manny / ningfangtianwai-pixel，AI Girls 3D，原文件声明 CC BY 4.0。本轮派生变化是将已经处理的 GLB 渲染为静态图。没有为这些素材追加新的授权声明或角色身份、性格设定。

## 输出与显示

| 文件 | 尺寸 | 字节 |
| --- | --- | ---: |
| `deepseek.webp` | 768×960 RGBA | 234,986 |
| `xiaoyang.webp` | 768×960 RGBA | 125,378 |
| `claude.webp` | 768×960 RGBA | 465,698 |
| 合计 | 三张透明静态图 | **826,062** |

保留导入模型的自然站姿和正面 +Z 朝向，没有播放动作或改造面部。取景从头部到衣裙 / 上腿，便于阅读层遮住下方并保留头发、手臂完整轮廓；头顶统一留出 60 像素，Claude 的宽发型按完整轮廓调整取景宽度。背景透明，没有地板、环境框或烘焙背景颜色。

图像以无损 WebP 保存。成品重新解码后的全部 RGBA 像素与渲染 PNG 相同，包含完全透明与不透明像素；顶部和两侧均检查没有裁切轮廓。此步骤不等同于对原 GLB 的图片压缩率。三张成品已经实际打开查看，眼睛、皮肤、衣物与透明发丝边缘没有发现新增显著缺陷。

## 重现

在工程根目录运行：

```powershell
node scripts/render_npc_portraits.mjs
```

需要工程已经安装的 Vite / Three.js / Playwright、Microsoft Edge，以及带 WebP 支持的 Python Pillow。脚本只编译临时离线渲染器，不构建或安装角色卡；GLB 由固定清单和哈希核验，通过现有安全加载器解码，HTTP(S) 请求被阻止。渲染 PNG 留在被忽略的 `outputs/npc-portrait-work/`，三张 WebP 与清单保留为最终重绘的参考来源。

脚本入口为 [render_npc_portraits.mjs](../../scripts/render_npc_portraits.mjs)，镜头、灯光和场景为 [render_npc_portraits.ts](../../scripts/render_npc_portraits.ts)。相机与归一化身高、颜色空间、灯光、浏览器版本记录在清单内。不同浏览器或 GPU 驱动可能造成少量渲染像素差异，重新生成后仍须看图；原 GLB 和输入压缩包不会被修改。

维护时用 WebGL 生成参考图不意味着小说中的 NPC 使用 WebGL。当前小说前端仅引用 `expression-atlases-v3/` 三张完整全身 PNG，并按记录的矩形切换静态表情。说话人物映射、窗口隐藏与最终 PNG 包装由主任务另行验证。
