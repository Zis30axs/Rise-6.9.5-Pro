# 加州沙盘 GLB 程序化源文件

`unread-city-california-sandbox.glb` 为 `lite` 固定离线资源，而不是构建时下载的附件。
与东京沙盘不同，它不是用户提供的模型，而是由仓库内的生成脚本
`scripts/build_california_sandbox_glb.py` 程序化生成：加州全州微缩地形
（内华达山脉、中央谷地、海岸山脉、莫哈韦沙漠、太平洋海岸）、14 个地点的
城市体块与广场，以及 4 座可辨认的地标建筑（金门大桥、好莱坞标志、
泛美金字塔、格里菲斯天文台）。重新运行该脚本即可复现相同的 GLB 字节。

v2（2026-11-13）：地形网格 96×110 → 192×220（42,240 顶点），
中央谷地压平为农田、内华达山脉加脊状噪声、海岸悬崖收窄，
城市体块 60 → 166（含旧金山国际机场跑道），新增 4 座地标网格。
总计 13 个网格、47,893 顶点、86,610 三角形。

此后的 `npm run build` / `npm run lite:build` 自动校验，并把它打包进配套素材包 `dist/unread-city-lite-assets.zip`。
加州沙盘场景从该素材包加载模型。

- 文件：`assets/models/unread-city-california-sandbox.glb`
- 字节：`1866268`
- SHA-256：`bd0e09b93b7edd5db7f0058154054b5fefd3a284580ddd28eb90721dc7cc3330`
- 生成脚本：`scripts/build_california_sandbox_glb.py`
- 数据文件：`assets/models/unread-city-california-sandbox-data.json`（同脚本生成）

未提交源 GLB 时构建必须失败，不能静默产出简化地图冒充新版发行包。
登记见 `integration/california-sandbox/pack.json`。
