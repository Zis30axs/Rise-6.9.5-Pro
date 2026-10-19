把角色卡封面放到此目录，默认文件名为 `cover.png`。必须是正常 PNG 文件。构建脚本仅负责嵌入角色卡元数据，不会自动绘制立绘。

`models/ambient-aircraft.glb` 为用户飞机的远空压缩派生模型，来源、署名、许可和离线复现见 [`aircraft-sources.md`](aircraft-sources.md)。原始 77 MB 文件不随仓库或 PNG 复制。

道路车辆GLB：`models/ground-btr82a.glb`、`ground-zbd04a.glb`、`ground-t84.glb`，用户提供源素材的离线压缩派生。署名、文件内声明许可（含BTR非商业限制）与复现记录见[ground-vehicle-sources.md](ground-vehicle-sources.md)；本轮未联网核验元数据授权，未公开发布。

人物GLB：`characters/soyo.glb` 用作主角，`deepseek.glb`、`xiaoyang.glb`、`claude.glb` 用作场景 NPC 外形。原压缩包保留在用户下载目录，仅转换后的模型和贴图随卡内嵌。来源与压缩统计见 [character-sources.md](character-sources.md) 和 `characters/manifest.json`。

NPC静态立绘：`npc-portraits/` 根目录三张透明WebP为原模型的设计参考。按用户确认的“更接近素世的简洁平涂动画风”和后续“完整全身、不截断”要求，图片工具重绘三套九情绪全身图集，最终仅 [expression-atlases-v3](npc-portraits/expression-atlases-v3/README.md) 的三张PNG内嵌同一脚本与角色卡。源图中头顶、手部、裙、双腿和两只鞋均完整；NPC采用静态图切换，没有新增NPC Live2D或运行时3D。提示词、原始输出、参考和哈希均有记录，PNG未经程序画脸、补腿或修图。v1画风稿与v2半身历史版保留，不重复入包。
