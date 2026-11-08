# Xitter 本地素材

原作手机设定图来自用户提供的 `素材/MyGO_AveMujica_头像壁纸合集/`。以已整理的中文文件名明确映射到稳定人物 ID，不使用该目录仍保留旧文件名的 `index.csv` 推测顺序。原始素材不修改。

- `avatars/`：十张 Chat Icon，以及从已有 `assets/map-avatars/` 中按原有裁切坐标转换的其他人物头像。
- `lockscreens/`：十张 Smartphone Lock Screen，独立保存，不作为头像。当前仅替换素世、祥子的手机壁纸，其余主角主题保持既有选择。
- `manifest.json`：用途、personId、原始路径、原始与派生 SHA-256、尺寸和字节数。
- SVG：手工绘制的 Xitter 图标、字标、机构/杂谈/乐队头像与固定默认头像；乐队 SVG 为本项目的本地替代图案，不冒充官方品牌素材。

`scripts/prepare_network_art.py` 用 Pillow 处理图像，不调用生图工具。十张聊天头像向内裁去 3.5% 的印刷圆形白边，再用超采样圆形蒙版重建透明边缘；不对内部白色像素抠图，保留熊猫、花瓣与默认轮廓。锁屏 JPG 解码后保存为无损 WebP，不改变原有纵横比。

`scripts/network_visual_assets.mjs` 校验哈希并按白名单内嵌资源。缺图始终回退同一默认头像，不借用其他人物图片。截图与处理前后对照见 `outputs/xitter-qa/`。
