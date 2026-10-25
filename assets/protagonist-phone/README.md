# 主角看手机立绘（protagonist phone pose）

用户于 2026-10-24 提供的四张 CG（原始文件在仓库 `素材/` 目录，属于用户的素材投放区，
不直接参与构建）。`source/` 内是逐字节复制的原始 PNG，上级目录的 `.webp` 是
`prepare_lossless_runtime_images.py` 同参数（`lossless, quality=100, method=6, exact`）
的无损派生，转换时做了逐像素 RGBA 往返校验；来源、尺寸与 SHA-256 记录在
`manifest.json`。

| 运行文件 | 人物与服装 | 对应运行时形象 |
| --- | --- | --- |
| `soyo-phone.webp` | 长崎素世，校服水手服，双手持机 | 素世默认形象 |
| `sakiko-casual-phone.webp` | 丰川祥子，校服深蓝开衫，低头双手回复 | `sakiko_casual` |
| `sakiko-home-phone.webp` | 丰川祥子，居家奶油开衫，单指轻点 | `sakiko_home` |
| `emma-phone.webp` | 樱羽艾玛，浅粉针织开衫，单指轻点 | `majo-emma` 便服（浅粉针织开衫） |

用途：小说视图里打开手机窗口时，站立立绘原本被整体隐藏（`is-muted`）。
现在改为叠加当前主角的"看手机"姿势，关闭手机后恢复原有立绘。
选择逻辑在 `src/frontend/protagonist-phone-art.ts`；祥子按既有
`sakiko-art-policy` 的服装规则（丰川家室内为 home，其余为 casual）选图，
与站立立绘保持一致。
