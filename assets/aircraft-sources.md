# 空中飞机模型

`models/ambient-aircraft.glb` 是用户提供的 `russian_su-30sm_45_blue.glb` 的远空低细节派生资产，随前端内嵌到同一助手脚本和角色卡 PNG。原始文件不复制进仓库，运行时不下载模型、解码器或贴图。

## 原文件内置署名

- 作品：**Russian Su-30SM "45 Blue"**。
- 作者：[42manako](https://sketchfab.com/42manako)。
- 来源：[Sketchfab 模型页面](https://sketchfab.com/3d-models/russian-su-30sm-45-blue-8dc883ebe3c84da3834f10aae5d58386)。
- 原 GLB 声明许可：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。
- 本派生文件保留原作者、作品名、来源与许可字段，并在 `asset.extras.modifications` 声明修改。以上来源和许可信息取自用户文件的内置元数据。
- 原模型外形是苏-30SM 军机，并非真实客机模型；这里按用户指定的飞机素材用作远空环境表现，世界状态中的客机事件不构成机型考证。

## 压缩方式与规格

原文件为 76,936,560 字节、827,960 个三角形、75 个 mesh / primitive、39 张内嵌贴图。离线处理合并同材质、焊接位置与 UV 相同的顶点，使用 `meshoptimizer@1.1.1` 对位置和 UV 误差共同约束减面，再将主机身漫反射图缩至 256px、其余漫反射图缩至 128px JPEG。移除法线、高光与光泽贴图，旧 specular-glossiness 材质转为普通 metallic-roughness 材质。

派生模型为 **491,048 字节（约 0.49 MB）**，9,430 个三角形、11,420 个顶点、1 个 mesh / 20 个 primitive、13 张内嵌 JPEG。减小约 **99.36%**；它用于天空远景，近看会缺失细部与清晰标记，不作为近景展示资产。

- 普通、自包含的 glTF 2.0 二进制 GLB，无 Draco、meshopt、量化等扩展，无外链 URI，无骨骼或动画；运行时不需要解码器。
- 已烘焙源根节点变换，**Y 轴向上、机头朝 +Z、翼展沿 X**，保持原始米制比例。以飞行方向计算 Y 轴旋转即可。模型包围盒约为 **14.81 × 5.68 × 21.28 米（X / Y / Z）**，中心未重置；Z 范围为 -8.25 至 +13.03 米。
- 详细体积、三角形数、误差与 SHA-256 由生成工具写入 [`models/ambient-aircraft.stats.json`](models/ambient-aircraft.stats.json)，以该文件为准。

## 复现与验证

安装项目依赖，并准备带 Pillow 的 Python 后执行：

```powershell
node scripts/prepare_aircraft_model.mjs '原始 GLB 的完整路径'
```

工具只接受本次原始文件的 SHA-256 `1737bd65c51cee3eeba0c5b47643f67d6fd907dec7a12b33b151cf6eb8781bcb`。通过参数数组调用 Python，不执行源文件内容、不读取源文件外链；临时图片只放在项目 `outputs/.aircraft-lod-*`，处理完成后清理。输出超过 500,000 字节时拒绝覆盖已有资产。Python 可执行文件可用 `PYTHON` 环境变量指定；JPEG 字节可能随 Pillow/libjpeg 版本变化。

2026-10-17 在 Pillow 11.3.0 / libjpeg 8.0 环境重新生成，产物 SHA-256 与首次生成逐字一致：`44fa8f71214748e2c8dad215f15f8a0e6a6baff0b882c64126427a4cc388547b`；处理后再次核对，下载目录的原文件 SHA-256 未变。

资产结构回归可执行 `npx vitest run tests/aircraft-asset.test.ts`，4 项测试覆盖包体预算、自包含 JPEG 与无 decoder 扩展、缓冲及索引范围、顶点/法线/UV、实际包围盒、统计和 SHA-256 一致性，以及原始署名保留。

2026-10-17 已使用 Edge 中的 Three.js `GLTFLoader` 实际加载，检查透视与俯视图的机身、双尾翼、翼面及涂装，未出现加载或页面异常；预览为 `outputs/aircraft-lod-preview.png` 与 `outputs/aircraft-lod-top.png`。该验证仅针对本机资产加载；目标手机 TauriTavern 仍需真机检查。
