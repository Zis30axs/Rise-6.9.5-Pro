# 加州旅行沙盘素材

2026-11-13 接入用户上传的 `unread-city-california-sandbox.html` 与同名 GLB。

- `sandbox.glb`：上传模型的原始字节，9,322,272 字节；SHA-256 `24eb0ab6cb69735614de7db4d3166e12320be43950fa8d013583afe00b66e5eb`。
- 原 HTML：12,565,501 字节；SHA-256 `e768bc88f4059ef5b556c855320c074dd25980a5cec2913bcbbee99c9b125356`。其中内嵌 GLB 与独立模型逐字节一致，因此不重复提交包含 base64 的 HTML。
- `sandbox.json`：从原 HTML 的 `atlas-data` 提取地形轮廓、坐标、地标及路线几何；移除内嵌 GLB 和演示经济参数、服务、礼物、时间及费用。路线价格、行程时间、地点说明与可达性以 `src/runtime/california.ts` 为准。
- `src/frontend/california-sandbox-renderer.js`：改编原 HTML 的 WebGL/Canvas 地图展示、着色器、投影及手势。视图独立于状态；不运行原演示的领取、交易、奇遇、背包或平行游戏时钟。

`CaliforniaSandbox.vue` 保留既有 props 和 `travel` 事件，由 `WorldMap.vue` 原旅行接口执行结算。地图选点、缩放和观景不修改存档。游戏服务仍从既有地点入口访问。关闭地图时释放观察器、事件、动画帧及 WebGL 资源；无 WebGL 时使用二维海岸与路线降级。

模型通过 Vite `?inline` 参与 IIFE 构建；正式 Lite 构建使用现有 `build_lite_release.py` 将大模型提取进离线 ZIP，运行时读取本地 Blob URL，无外部模型服务。地图样式经 `shell.css` 内嵌进 Shadow DOM，避免独立 Vue CSS 在角色卡中丢失。

封面、手机源码、角色资料、费用规则及存档格式均不在本次修改范围。
