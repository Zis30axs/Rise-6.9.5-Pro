# CRYCHIC 合照素材

`crychic-photo.webp` 用于背包里的 `crychic-photo` 珍藏。

2026-11-08 修复：原提交 `8c1be14` 的文件只有 7,745 字节，RIFF 头声明 10,176 字节，浏览器报 `EncodingError`。补零解码会产生下半部色块，不能作为完整照片使用。仓库和历史副本均未找到完整原文件。

现改用同一排练室自拍画面的可用版本，下载的 JPEG 保存在 `sources/crychic-photo.jpg`。此版本为方形裁切，色调和原缩略图不同；水平翻转以保持旧图素世在右侧的排列，再缩至 384×384、WebP quality=85 / method=6。不是原损坏文件的无损恢复，也未生成新的人物画面。缩略图小于 Lite 的 30,000 字节拆包阈值，继续内嵌脚本。

来源：`https://i1.sndcdn.com/artworks-FytKP3SDDZkPGW5j-Cx6D0A-original.jpg`，获取日期 2026-11-08。画面属于 BanG Dream 动画素材；第三方托管不代表获得额外授权，沿用项目私用素材范围。

运行时通过既有本地 `?inline` 导入，不访问来源网站。`tests/store-product-image.test.ts` 检查 RIFF 长度及分块边界；真实图片解码与背包显示另由本地浏览器验证。共用图片组件在加载失败时显示已有占位布局，合照使用相片图形，不修改装备、数量、经验或存档。
