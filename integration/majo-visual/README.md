# 魔裁视觉素材运行时接入（PR #16 后续）

本增量以 `lite`（已合并 PR #15/#16/#17）为基线，把 PR #16 交接的**可用素材**接入游戏运行时，同时如实保留仍缺失的素材。没有改动 `main`、旧分支、发行标签或 PR #16 的原始交接文件。

## 已完成并接入运行时

### 人物立绘与情绪

- **樱羽艾玛（`majo-emma`）**：九种表情 `neutral / happy / sad / angry / surprised / shy / thinking / serious / relieved` 已从 `assets/majo-emma/packs/` 解出并接入小说模式立绘（`src/frontend/NovelNpcPortrait.vue`）。选择顺序是**先人物身份、再情绪**：只有说话人稳定匹配 `艾玛 / 樱羽艾玛 / 桜羽エマ` 时才使用这套立绘，未知姓名不会借用。
- 情绪仍来自既有 `|角色名|情绪|台词|` 对白协议，经 `src/frontend/novel-npc-emotions.ts` 白名单映射；没有新增协议字段或模型权限。
- 素世继续使用既有 Live2D；祥子继续使用既有差分立绘。本轮没有重绘或替换她们。
- 运行时只登记了艾玛这一套**已完成**的 9 表情。五张 1536×1024 三姿态角色原图身份未确认（`character-source-sheets-20261022.json` 记录为 candidate/unconfirmed），因此**没有**被分配给任何常驻人物，也没有被当作九表情差分。

素材管线：`python scripts/prepare_majo_visual_assets.py` 从两个本地 ZIP 源包逐项校验 SHA-256/字节数，解出 `assets/majo-runtime/emma/*.webp`（无损原样）与 `assets/majo-runtime/interiors|districts/*.webp`（JPEG 源图的运行时 WebP 压缩派生，质量 82，保留源图）。`--check` 可验证已提交派生文件与清单一致。源包仍是权威交接物。

### 住宅、街区与室内

六类住宅原型与六间通用室内（`src/runtime/campus-interiors.ts`、`src/runtime/majo-housing.ts`）：

| 住宅原型 | 室内 ID | 父地点 | 使用素材 | 原型归属 |
| --- | --- | --- | --- | --- |
| 现代开放式公寓 | `emma-yuki-home` | 家与住宅区 | 现代公寓客餐厅 | 艾玛、月代雪 |
| 老式住宅 | `koko-old-house` | 家与住宅区 | 老式住宅客厅 | 泽渡可可 |
| 传统日式宅邸 | `nikaido-house` | 市中心区 | 传统木构庭院室内 | 二阶堂希罗 |
| 合住公寓 | `anan-noa-milia-home` | 十字路口 | 普通合住客餐厅 | 安安、诺亚、米莉亚 |
| 滨水高层 | `majo-highrise-home` | 商业区 | 高层河景客餐厅 | 雪莉、汉娜（游戏原型） |
| 单身公寓 | `majo-studio` | 城市公园 | 单身公寓卧室与厨房 | 通用原型，未分配给具体人物 |

- 室内沿用既有 `enter_interior / leave_interior / interior_walk / interior_interact`，入口都落在既有道路端点 6 米内，可通过地点面板或小说出行进入；没有新增移动、时间或经济规则。
- 小说模式背景：六个室内与三个住宅街区使用恢复原图（`src/frontend/novel-backgrounds.ts`）。六类街区映射到既有地图：家与住宅区（老宅街巷）、商业区（滨水高层）、南门街区（老旧公寓）、市中心（传统市中心，无专属图）、城市公园（湖畔公寓，无专属图）、宿舍院落（学生合住，无专属图）。**仅前三类有恢复的街区原图**；后三类沿用既有背景，不冒充已完成素材。
- 人物住处标记与 `residentPresence` 联动：在住处时 `locationId` 返回真实室内 ID，日程/群聊可用性仍按原作息判断；没有把住宅图自动写成官方设定。

### 二阶堂家

`nikaido-house` 以传统木构庭院室内图为原型，提供：

- 榻榻米和室休息（30 分钟，恢复至多 6 精力）；
- 缘侧看庭院（10 分钟，不结算额外身心效果）；
- 入鞘武士刀刀架观察（0 分钟，明确不拔出、不挥舞、不改动物品）；
- 练剑空间基础练习（45 分钟，精力 −8，精神/压力小幅改善，**不使用真刃**）。

希罗的常服设定为**和服**：`residentOutfit('majo-hiro') === '和服'`，会随 `residentPresence` 进入主叙事与 NPC 短信上下文。**和服立绘与三/九表情差分尚未交付**，因此没有新立绘，黑红和服参考图仍按未确认身份保存。

### Twiitch 手机素材

- 13 张自包含 SVG 在构建时由 `scripts/phone_visual_assets.mjs` 从 `assets/majo-cast/manifest.json` 读取并校验 SHA-256，作为 `twiitch/*` 接入内嵌手机的美术模块。
- 手机新增 **Twiitch** 应用（`integration/dual-protagonists/phone-apps.js`）：使用恢复的频道封面、猫咪头像、字标、离线卡片、直播边框和四枚反应图形；按游戏时钟显示 `20:00–23:00` 直播/离线状态。
- 应用只读：不开播、不发消息、不调用模型、不修改世界状态；所有素材本地内联，离线可用。
- 应用名与图标由 `integration/dual-protagonists/phone-visuals.js` 与 `scripts/build_embedded_phone.mjs` 的既有补丁点接入，没有修改手机源码仓库。

## 仍未完成 / 缺失素材

- 其余十三名常驻人物（含希罗）**没有确认身份的九表情或三表情差分**；运行时继续使用既有通用立绘。运行时已登记 `majoExpressionPolicy = { main: 9, semiMain: 3 }` 与每个人的目标数量，但未把未确认素材强行分配。
- 祥子现有素材是每套服装 6 表情（平静/微笑/困扰/惊讶/不悦/难过），没有补齐主要角色的 9 表情；素世继续使用 Live2D 的九情绪映射。未用近似表情冒充补齐。
- 五张角色三姿态原图仍是参考图；金发绿裙参考图身份未确认。
- 二阶堂家除通用木构室内图外的专属宅邸图、和室/庭院/刀架/练剑空间的分镜或场景美术未交付；当前是可玩原型，不是完成品美术。
- 六类街区中传统市中心、湖畔公寓、学生合住三类没有恢复的专属街景图。
- 希罗和服立绘、艾玛 3D 模型、练剑动画、Live2D/Twiitch 互动直播均未实现。
- 没有进行 iPhone/TauriTavern 物理设备验收，也没有生成最终发行 PNG/ZIP；本轮只验证源码、生产 IIFE 与受控浏览器场景。

## 离线体积与旧存档

- 素材以 `?inline` 进入生产 IIFE；Lite 构建沿用既有 `build_lite_release.py` 提取为 STORE ZIP + IndexedDB/Blob URL。本轮 Lite 提取后为 **77 个资源、36,336,474 字节 ZIP**（新增 18 张运行时图），IIFE 由约 57 MB 增至约 64.8 MB；最终 Tauri 专用 PNG 的 50 MB 门禁**未在本轮验证**，打包前必须重新检查。
- 存档 schema **没有变化**：没有新增持久化字段。新室内只是既有 `novel_travel/enter_interior` 的目的地；旧存档只有在玩家实际前往时才会写入室内位置，读取不会自动迁移或补算。
- 既有短信、群聊、联系人、手机空间、地图偶遇与人物作息逻辑未改。

## 验证

- `npm run check`（`vue-tsc --noEmit`）通过，`npm run build` 通过（491 模块，IIFE 64,830.31 KB）。
- `npx vitest run`：58 个文件、628 项测试全部通过；含新增 `tests/majo-visual.test.ts` 11 项（素材清单/身份解析/室内几何/二阶堂交互/住宅映射/旧存档）。
- `node --test tests/phone-visuals.node.mjs`：5 项通过（含 67 件手机美术、Twiitch 图标与静态校验）。
- `python scripts/prepare_majo_visual_assets.py --check` 通过，确认 9 张艾玛表情与 9 张场景派生图逐字节匹配清单。
- `python scripts/build_lite_release.py` 通过：77 个外置资源、ZIP 36,336,474 字节。
- 浏览器：`tests/e2e/majo-visual.spec.ts` 在 1440×900、1280×800、390×844、320×568 检查艾玛九表情切换、二阶堂背景真实字节、手机 Twiitch 页面、无横向溢出与存档不变；使用受控 Helper 宿主、真实生产 IIFE 和真实内嵌手机，模型请求为 0。截图与证据写入 `outputs/majo-visual-qa/`。
- `.github/workflows/majo-visual.yml` 在本分支复跑类型检查、构建、定向 Vitest、Node 手机素材检查、Lite ZIP 提取与四视口浏览器场景（Chromium headless）；该工作流在 PR #18 上通过。
- 本地额外回归：`tests/e2e/npc-phone.spec.ts` 4/4 通过，确认新增 Twiitch 应用与住宅/作息改动未破坏现有真实内嵌手机联系人与 NPC 短信路径。
- 这不是原生酒馆页面或手机真机验收；证据范围以实际运行结果为准。
