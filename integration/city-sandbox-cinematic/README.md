# 未读之城 · 山海都会

## 城市重建与角色卡接入

本版按用户允许大改地形、街区、高架和轻轨的要求，重建山海都会，并将它接入角色卡的真实地图、人物位置和旅行流程。

### 城市景观

- 起伏山脊、分层岩壁、海湾、弯曲河道、沙滩和确定性森林。
- 123 栋建筑，以及退台金融塔、八角玻璃塔、双塔空中花园、圆环观景塔和滨水艺术中心。
- 双塔悬索桥、引桥、桥墩、曲线匝道；高架轻轨环线、三座车站和三组四节列车。
- 码头、游艇、水上巴士和动态道路车流。
- 日落、日光、蓝调和夜景四种光照；拖动旋转、缩放、地标飞入、自动漫游、图层和风景导出。

### 正式游戏接线

`src/frontend/metropolis/` 是角色卡与独立 Site 共用的实现。`terrain.ts` 和 `urban.ts` 构建地形、建筑及交通；`renderer.ts` 使用 Canvas 透视投影与面排序绘制城市，完整浏览器效果不依赖 WebGL。

`WorldMap.vue` 默认打开新沙盘。`game-map.ts` 从既有 `ShellModel` 读取游戏时钟、地点、联系人、世界人物和旅行规则，将八个原城区及 49 个本地目的地映射到新地形。五个国际目的地保留真实旅行入口，不伪造本地坐标。室内地点映射到已有入口；映射仅用于显示，不迁移或回写存档坐标。

`MetropolisGamePanel.vue` 显示真实当前位置、已允许显示的人物、地点搜索、城区筛选、营业状态、原始出行报价和确认操作。人物显示沿用旧地图的在场、距离和联系人权限规则。

确认出行由 `WorldMap.vue` 调用原有 `runInteraction`，按当前模式发送 `novel_travel` 或 `travel`。忙碌、切换主角、重复点击、阻断报价和失败返回均受保护。浏览地点、调整相机和选择光照不推进游戏时间。方向连线只是方向示意，原旅行规则仍决定实际耗时、费用和精力。

日照默认跟随游戏时钟，“随此刻”可恢复跟随；手动光照只改变景观。地点选中状态按主角与当前位置的原始值监听，忙碌状态刷新不会意外清空当前行程。

“世界地图”打开 `WorldMapJourney.vue` 的地理层。`geographicOnly` 下不挂载旧城市沙盘，放大时将深度限制在区域层，并保留等效残余缩放；“城市”直接返回新沙盘。原有国际旅行与公交入口保留。

`CityStage.vue` 根据画布所属文档的窗口调度 RAF、ResizeObserver、可见性和 DPR，兼容脚本运行在隐藏 helper iframe、界面实际位于宿主 ShadowRoot 的结构。主角、人物、目的地和方向线单独投影。

所有地图样式通过 `shell.css` 进入 ShadowRoot。独立地图窗口占用可用视口，手机默认收起行程抽屉；`shell-viewport.css` 的地图专属覆盖消除旧窗口限高，打开地图时隐藏会遮挡地图按钮的外层工具栏。真实地图不再标为“演示内容”。

### Site 预览

`preview/city-sandbox` 直接加载同一份 `MetropolisApp`。角色卡专用面板由 `WorldMap` 通过 slot 传入，因此独立景观预览不导入完整角色卡运行时、人物图像或旧 GLB，不读取聊天与存档，也不请求剧情模型。

现有 Site：<https://unread-city-cinematic-x26.ztz99a-7398.chatgpt.site>。访问范围保持原有仅拥有者设置。本轮角色卡接线以交付 PNG 为准；Site 继续展示共享城市景观。

### 构建和交付

沿用仓库既有完整构建和 Lite 离线资源流程：

```sh
npm run build
python scripts/build_tauri_import_card.py --source dist/unread-city-lite.png --output dist/unread-city-lite-tauri.png
```

完整世界书、封面和手机代码保留。手机使用固定基线与 `integration/embedded-phone-source/local-changes.patch`，并按 `integration/xitter/README.md` 应用全部四层 Xitter 补丁。Tauri 变体只无损压缩 PNG 元数据，不删除功能或改变封面。

| 文件 | 字节数 | SHA-256 |
| --- | ---: | --- |
| unread-city-lite-tauri.png | 20,427,037 | d0a71e9e843140a987964dfd1e070a2c363e46bc21536486eccd4ede27fba946 |
| unread-city-lite.png | 41,677,667 | 264590e7b39a7f3f219faf7fa5bce7a022756d23ff67b96313ed8da7d622f4eb |
| unread-city-lite-assets.zip | 91,601,570 | eacdf5ed2130fb760087567c7107cb2b0581ae6031f450190f03277cf09ddf87 |

首次进入后使用卡内“安装 Lite 素材 ZIP”，安装本轮 ZIP 并刷新酒馆页面。两种 PNG 使用同一配套资源。

### 验证与边界

完整类型检查、真实内嵌手机构建、804 模块生产构建及 Lite 后处理通过。两张 PNG 解码后的角色卡内容相同，封面和其他 PNG 块一致，卡内目标 Helper 脚本唯一且与 Lite IIFE 相同。233 个 ZIP 资源的大小、SHA-256、格式和来源构建全部核验通过。

地图适配测试覆盖 54 个目的地、真实报价、只读性、人物隐私和模式差异；组件测试覆盖选址与光照不改状态、旅行结算、防重复与失败反馈、地理地图往返。旧地图测试保留在实际承载原逻辑的 `WorldMapJourney.vue` 上。

受控浏览器使用真实 Full IIFE，在隐藏 helper iframe 加可见宿主 ShadowRoot 的结构中打开城市。实际执行 `gate → library`：显示报价 15 分钟、精力 −3.36；选择原事件询问的“否，正常进行”后，时间从 17:20 变为 17:35，精力从 80 变为 76.64，余额保持 6560，正常发出 `mapTravelled` 并关闭地图。模型生成次数为 0。桌面与手机尺寸下检查了地图和行程抽屉。

受控宿主主动阻止了两条本地预览热更新 WebSocket；这不是地图异常，也不据此声称整个宿主零错误。最后一次 Lite ZIP 文件选择操作遇到浏览器工具超时，不能把 ZIP 静态完整性校验记作实际浏览器安装通过。

工具超时后临时开发环境重置。交付 PNG、ZIP 和旅行记录已保留；从 PNG 提取的 Lite IIFE SHA-256 为 `de33b073cc9c02c9b8a5961ad2e6931837cd55b47a2b0b39108f26c3f6d34304`，从 ZIP 逆替换还原的 Full IIFE SHA-256 为 `9602c93edd0038afa968a622454bc85ebcb39d9e80836fcd8cce1c64e1b9dc18`，均与最终构建完全一致。源码根据已提交基线、保留补丁和最终脚本恢复；样式取回实际交付声明，恢复后的源码另做类型与定向回归检查。

尚未在 iPhone/TauriTavern 原生设备上导入或测量性能。Canvas 面排序在极近的相交曲面上仍可能存在细小遮挡误差。本轮未运行远程 CI、Agent Edition 或真实剧情模型；源码保存在原功能分支与 PR #84，提交带 `[skip ci]`，未合并 lite。
