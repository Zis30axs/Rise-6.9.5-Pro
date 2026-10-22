# 樱羽艾玛便服九表情

人物 ID：`majo-emma`。一套日常便服：浅粉针织开衫、白色上衣、深色百褶裙、白袜和棕色玛丽珍鞋；保留白粉短发、交叉发夹及樱花贝雷帽。

九张独立全身立绘均为 1024×1536，含透明通道。开心为大笑并露小虎牙；生气为鼓脸奶凶。其余为平静、难过、惊讶、害羞、思考、严肃、安心。统一服装与站姿，表情通过面部变化区分。

## 文件

- `manifest.json`：九种表情的逻辑路径、SHA-256、尺寸、所在 ZIP 和原始生成 PNG 的摘要。
- `generation-prompts.json`：内置图像生成工具的提示词及后续表情修订。
- `packs/`：三个完整的本地 ZIP STORE 增量包，每包三张无损 WebP。图片按 `assets/<sha256>` 保存；各包内附 `manifest.json`。取出对应条目后可按总清单的 `file` 恢复文件名。无需联网加载。

| 情绪 | 文件逻辑路径 |
| --- | --- |
| 平静 | `expressions/neutral.webp` |
| 开心 | `expressions/happy.webp` |
| 难过 | `expressions/sad.webp` |
| 生气 | `expressions/angry.webp` |
| 惊讶 | `expressions/surprised.webp` |
| 害羞 | `expressions/shy.webp` |
| 思考 | `expressions/thinking.webp` |
| 严肃 | `expressions/serious.webp` |
| 安心 | `expressions/relieved.webp` |

## 范围

2026-10-22 按用户要求直接提交 `lite`，只交付静态差分素材，未接入运行时。没有实现第三主角账户或改动游戏逻辑；保留 PR #16 的交接文件与素材。没有运行类型检查、构建、Vitest 或浏览器测试，也没有修改发行标签。本包不是现行发行资源包的完整替代品。

角色外观参考：[官方角色姿态图](https://x.com/13witch_Trials/status/1808103909019603229)、[官方站点](https://manosaba.com/)。服装与本批表情为按用户要求制作的同人素材，参考资料未作为远程运行依赖。

