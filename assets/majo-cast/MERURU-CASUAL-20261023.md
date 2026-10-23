# 梅露露常服立绘（三表情）

已确认的三个身份固定为 `majo-meruru`：`neutral`（平常）、`thinking`（疑惑）、`sad`（伤心）。伤心图保留早期无围巾的常服版本，不要将其伪称同一服装的换脸差分。

## 当前状态

仓库中的 `meruru-casual-handoff-20261023.json` 仅为校验清单，**还没有提交 PNG 图片二进制，不代表运行时完成接入**。不要直接把这些不存在的图片作为 Vite 静态导入。

完整离线安装包 `meruru_casual_install_ready_20261023.zip` 已在对话产物中生成，包括六张原始/透明 PNG 的封装 ZIP 和 `scripts/install_majo_meruru.py` 安装脚本。

## 安装到 lite checkout

1. 将离线安装包解压到仓库根目录（含 `scripts/install_majo_meruru.py` 及内层素材 ZIP）。
2. 在该 checkout 中运行：

   `python scripts/install_majo_meruru.py unread-city-majo-meruru-casual-3-expressions-20261023.zip`

3. 安装器将导入三张 RGBA PNG、拷贝原始素材 ZIP、登记角色和表情别名、更新图像清单与回退逻辑。
4. 只执行本地静态验证；不要运行或触发 GitHub Actions/CI。提交信息添加 `[skip ci]`。

## 素材约束

原始立绘保留赛璐璐上色、整束银灰转粉长发、常服/围巾设计；伤心图的服装与另两张有差异。未制作其它情绪时，应只回退到梅露露本人的 `neutral`。
