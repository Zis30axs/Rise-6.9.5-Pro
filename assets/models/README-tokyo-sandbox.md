# 东京沙盘 GLB 固定源文件

`unread-city-tokyo-sandbox.glb` 为 `lite` 固定离线资源，而不是构建时下载的附件。
首次从用户提供的 GLB 一次性放入本目录并提交 Git。
此后的 `npm run build` / `npm run lite:build` 自动校验，并把它打包进配套素材包 `dist/unread-city-lite-assets.zip`。
城市沙盘场景从该素材包加载模型。

- 文件：`assets/models/unread-city-tokyo-sandbox.glb`
- 字节：`6232488`
- SHA-256：`12151a8faa994e1740abbd18f67d37a8aa315e8ce60b6b8d03aff0b22f387afb`

原 `ambient-aircraft.glb` 是独立的 Su-30SM「45 Blue」压缩模型，不因沙盘替换而删除。

未提交源 GLB 时构建必须失败，不能静默产出简化地图冒充新版发行包。
登记见 `integration/tokyo-sandbox/pack.json`。
