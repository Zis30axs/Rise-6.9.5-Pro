# 城市沙盘前端源码（Gemini 视觉润色专用）

这是《未读之城》城市沙盘的**只读提取快照**，源自私有仓库 `Zis30axs/Rise-6.9.5-Pro` 的 `lite@a51d86dfe63f44c28aefac38a0e26509e4dd5ec3`，日期 2026-10-27。本分支只存放城市总览及五个城区详细沙盘的前端源码与直接关联的样式、地图坐标、人物头像包装。不包含世界地图、游戏剧情、短信、手机 UI、3D 自由漫游、构建流程或原角色卡资产包。

## 文件与用途

- `src/frontend/CampusMapScene.vue`：城市总览／分城区详细沙盘的可见 UI，城区按钮、地点/人物标记、事件引线。
- `src/frontend/LocalMapGeometry.vue`：SVG 2.5D 地形、道路、建筑屋顶／立面、窗线、阴影。
- `src/frontend/campus-map-layout.ts`：建筑数据、斜投影矩阵、比例、标签布局、地图地点投影。
- `src/frontend/map-districts.ts`：城区 ID、名称、边界、目的地与城区定位。
- `src/frontend/scene-layout.ts`：共用街区、道路与地标坐标（**仅地图相关依赖**）。
- `src/frontend/scene-movement.ts`：被地图布局引用的类型定义（保留原文件以免猜测类型）。
- `src/frontend/campus-map.css`：2.5D 沙盘、建筑与标记样式。
- `src/frontend/world-map.css`：原地图外框、缩放／旋转工具条、移动端布局的共用样式；包含少量其他地图层的选择器，不必改它们。
- `src/frontend/MapCharacterAvatar.vue`、`map-character-avatar.ts`：地图上人物头像显示及资源解析。
- `assets/map-avatars/soyo.webp`：一张本地地图头像资源。

## 原项目的集成位置（不包含在本包）

宿主 `src/frontend/WorldMap.vue` 同时管理城市、城区、世界三类图层；这里只提取城市和城区沙盘，不把世界图层带入：
- 城市总览：`<CampusMapScene scope="city" ... @select="enterDistrict" />`。
- 区域详情：`<CampusMapScene :scope="detailDistrict ?? 'campus'" ... @travel="travelTo" />`。
- 关键事件：`select`（城区进入）、`travel`（地点前往）、`event`（道路事件）、`scale`（比例）。
- 原宿主负责滚轮／捏合缩放、平移、旋转、顶部层级切换、左上返回城市、镜头恢复，**不在本源码包里重新实现**。

## 给 Gemini 的修改要求

目标是润色沙盘的视觉表现，而不是重写业务逻辑。可以优化建筑造型与立面层次、色彩、道路铺装、地图光影、区域标签、角色／地点标记、移动端密度与地图外框样式。请保留 Vue 3 + TypeScript + SVG 2.5D 技术栈，原有组件 props/emits、数据 ID、选择器 `data-map-*`、坐标归属与地图事件接口；不能把静态的视觉润色变成真实地点移动／存档写入。

- 城市默认总览，五个片区可点击进入详细沙盘，返回按钮恢复总览视图。
- 不删除地点、人物位置、道路事件引线，标记及可点击目标保留最小触控尺寸，兼容 1440×900、1280×800、390×844 和 320×568。
- 保持离线工作，不接入 CDN、远程地图、外部定位、额外图像服务；不得把工程备注、测试文案或代理提示写进玩家可见界面。
- 请按文件返回修改后的完整代码或清晰补丁，并说明与原宿主的接线是否需要改动。暂不修改游戏业务层，也不要运行 GitHub Actions/CI。

## 限制

**本包是源码提取，不是可独立运行的 demo。** 原组件仍引用角色卡中的 `runtime/campus-interiors`、`runtime/transit`、`runtime/model`、`runtime/dual-protagonists`、`frontend/types` 及部分立绘素材模块。它们没有随包复制，避免无关业务与数 MB 艺术资产混入。需要运行时请在原项目的 `lite` 分支中替换相应前端文件进行验证；不要将本提取包直接当作完整应用执行。当前操作未运行构建、测试或 CI。
