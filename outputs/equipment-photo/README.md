# CRYCHIC 背包合照修复

2026-11-08：损坏的 WebP 已替换为同一场景的可用方形自拍版本，浏览器解码尺寸为 384×384。原图不是无损恢复，素材来源与处理见 `assets/equipment/README.md`。

- `release/unread-city-lite-tauri.png`：约 20.4 MB 的压缩角色卡。
- `release/unread-city-lite.png`：普通角色卡。
- `release/unread-city-lite-assets.zip`：配套本地素材，233 项资源与上一版相同；新合照直接内嵌脚本。
- `photo-1440.png`、`photo-1280.png`、`photo-390.png`、`photo-320.png`：真实发布脚本的背包截图。
- `fallback-*.png`：故意给浏览器传入不可解码图片后的回退效果。
- `verification.json`：本轮检查与边界；`release/photo-packaging-verification.json` 核对 PNG、脚本、图片和 ZIP。

9 项图片/背包回归、定向类型检查、生产构建、四尺寸浏览器检查通过。扩大装备测试为 43/45 通过，两项后台日程测试触发国策时钟不一致，未改动其逻辑；不能声称完整测试集通过。

这是新生成的卡包，未覆盖本机已安装角色卡或聊天记录。没有运行 Agent Edition、CI、真实模型、真实酒馆或 TauriTavern 真机验证。
