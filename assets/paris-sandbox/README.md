# 巴黎与戴高乐机场

巴黎设有六个市区地点和两个机场地点。世界地图上的巴黎入口允许随时参观两座沙盘。实际出行只能从角色目前所在地点出发，由小说模式的既有旅行结算处理日元余额、经过时间和存档位置。

从南门交通站到羽田，乘航班到戴高乐一号航站楼，再搭 CDGVAL 到 Roissypôle 换乘站。乘 RER B 并步行至巴黎圣母院后，即可沿地图游览市区。各段均支持原路折返。票价和耗时是游戏参数。

- 市区展品登记在 `places.json`，机场展品在 `airport.json`。每个展品对应模型上的 `poi_<id>` 节点。市区地点在存档中以 `paris-` 为前缀。
- 旅行路线、费用和当地时钟在 `src/runtime/paris.ts`。叙事使用同一份地点和行程数据。东京和巴黎共用存档时钟，巴黎的当地时刻由 `Europe/Paris` 换算。
- 两个 `*.glb.gz.bin` 都随主离线素材包分发。`stills/` 提供沙盘预览，`backdrops/` 提供小说模式的八张场景背景。
- 城市模型由 `scripts/build_paris_sandbox.py` 生成（Python、NumPy、Pillow 和 GDAL）。用 Blender 后台执行 `scripts/build_paris_airport.py` 重建机场，再执行 `scripts/render_paris_backdrops.py` 重建场景背景。已提交的模型可以直接用于常规打包。
