# 地面车辆素材与离线压缩

三份 GLB 均由用户提供。下列作者、来源网址和许可文字直接摘自各源文件的 `asset.extras`，未联网核验；原文件保留在用户下载目录，仓库仅保存转换后的派生模型。BTR 原文件声明的许可包含非商业限制，转换不会改变该许可。

| 模型 | 原文件 | 作者元数据 | 许可元数据 | 派生文件 |
| --- | --- | --- | --- | --- |
| BTR-82A | `btr-82a.glb` | `42manako (https://sketchfab.com/42manako)` | `CC-BY-NC-4.0 (http://creativecommons.org/licenses/by-nc/4.0/)` | `models/ground-btr82a.glb` |
| Chinese ZBD-04A | `chinese_zbd-04a.glb` | `42manako (https://sketchfab.com/42manako)` | `CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)` | `models/ground-zbd04a.glb` |
| T-84 OPLOT(LOW POLY) | `t-84_oplotlow_poly.glb` | `lm9241221 (https://sketchfab.com/lm9241221)` | `CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)` | `models/ground-t84.glb` |

源文件声明的页面：

- BTR-82A：<https://sketchfab.com/3d-models/btr-82a-5c10df6da4154042a481fe89fd688fdb>
- Chinese ZBD-04A：<https://sketchfab.com/3d-models/chinese-zbd-04a-673ca87305e34fc6afd3f790010ccded>
- T-84 OPLOT(LOW POLY)：<https://sketchfab.com/3d-models/t-84-oplotlow-poly-98c26e7d386c466e982ec81e89d42b06>

三个派生 GLB 的 `asset.extras` 均完整保留原有 `author`、`license`、`source`、`title`，另加入源 SHA-256、修改说明、坐标轴和地面约定。素材是用户指定的装甲车辆外形；游戏中 BTR/ZBD 的通勤用途属于玩法设定。

## 修改内容

- 完整遍历源场景节点，烘焙每级矩阵、平移、旋转与缩放，法线按对应法线矩阵转换；负行列式时修正三角形绕序。
- 所有车辆统一为米制、Y 向上、车头朝 +Z，最终模型的水平包围盒中心为 `x=z=0`，最低点为 `y=0`。无需运行时再次猜测源模型轴向。
- BTR 在源场景朝向基础上旋转 180°；ZBD 保持场景朝向，并按总长约 7.2 米统一缩放；T-84 剔除独立的 22 三角形展示地板，再按车宽约 3.6 米等比例缩放。炮管、天线仍属于模型包围盒，未将它们拉伸到车体尺寸。
- 按材质合并，保留 UV 接缝进行顶点焊接；使用已安装的 meshoptimizer 1.1.1 做离线简化，不对整个材质执行空几何删除。保留源代表顶点法线。
- BTR/ZBD 基础色贴图缩至最长边 256，T-84 缩至 512。无透明像素时保存质量 76 JPEG；含透明像素时保存带透明度的 128 色 PNG。保留原基础色系数、混合/遮罩规则，删除法线、金属和高光贴图，转换为普通金属粗糙度材质。
- 输出为普通 GLB 2.0，所有贴图与几何内嵌；没有外部 URI、Draco、Meshopt 运行时压缩或额外解码器。离线简化使用 meshoptimizer，不代表运行时需要它。

| 派生模型 | 源大小 | 派生大小 | 源三角形 | 派生三角形 | 包围盒：宽 × 高 × 长（米） |
| --- | ---: | ---: | ---: | ---: | --- |
| BTR-82A | 3,037,740 | 308,176 | 17,867 | 8,047 | 2.912 × 2.874 × 7.689 |
| ZBD-04A | 21,315,312 | 549,456 | 186,945 | 8,196 | 3.247 × 3.897 × 7.184 |
| T-84 | 8,416,000 | 510,188 | 12,381 | 8,009 | 3.600 × 3.056 × 8.405 |

总大小从 32,769,052 降至 **1,367,820 字节**。尺寸用于程序化场景展示，并非车辆测绘数据；高包括仍保留的车顶物件。

## 输入与输出校验

| 模型 | 输入 SHA-256 | 输出 SHA-256 |
| --- | --- | --- |
| BTR-82A | `95da1339c5148e15e181a5d61885d421f601975a5471842adca900901f4dffa7` | `256ec00ee1f81726f62e7280e4429a7fea6b598176b31fcd900b9369946eb7e7` |
| ZBD-04A | `1e22f9f290879de7c3d1ab8d923f106984fd57fa1c62ea54bfea1a047d43ecde` | `83751e8feaf3e66de4b9f0ed1ce4fdb8ab3e46a82e6cf62544111caf034e67dc` |
| T-84 | `e3eac5a881b0c9fa83bc799a5e7a4c2b9ab479cffb98c7a8ed4272e8a9f43177` | `b3b315cf924b8e79a526e0a00d545f03c9ee453ee2f28aec5952235bf7b9b5a5` |

## 复现

需要仓库已安装的 Three.js、meshoptimizer，以及本机 Python + Pillow；不新增或下载依赖。

```powershell
node scripts/prepare_ground_vehicle_models.mjs C:/Users/Administrator/Downloads
npx vitest run tests/ground-vehicle-assets.test.ts
```

转换器只读取固定的三个文件名，并先核对上述源哈希。GLB 的网址、名称、元数据和未知字段均视为待处理数据；不执行文件内容，不跟随外部 URI。纹理转换使用无 shell 的参数数组；临时文件仅写入工程 `outputs` 下生成的独立目录，结束后删除该目录。完整统计另输出至 `outputs/ground-vehicle-asset-statistics.json`。
