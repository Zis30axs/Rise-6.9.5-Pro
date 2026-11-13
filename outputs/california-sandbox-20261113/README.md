# 加州旅行沙盘接入验收

2026-11-13，基于 `feat/lite-california-statewide-sandbox-20261109`。

## 已完成的本地验证

- `npx vue-tsc --noEmit`：全仓类型检查未通过；`LocationServices.vue:136–137` 两处既有模板类型错误，以及缺少 `generated/embedded-phone` 仍阻断检查。原分支 `model.ts` 礼物领取分支漏写结束语句和闭合括号，本次以两行修复恢复解析。
- `npx vitest run tests/california-pro200.test.ts tests/california-sandbox.test.ts tests/no-japanese.test.ts`：17 项通过，覆盖真实运行时旅行费用、领取、交易、剧情礼物、原始 GLB 完整性、组件旅行事件、忙碌状态与地点同步。
- `node scripts/verify_california_sandbox.mjs`：独立构建组件生产 IIFE，在 Shadow DOM 中验证 Shell 内嵌样式及模型。检查 1440×900、1280×800、390×844、320×568 的首屏、滚动、地图控制、地点预览、旅行事件、到达状态、观景退出及销毁；截图按尺寸命名，结构化结果见 `verification.json`。
- 浏览器验证 WebGL 丢失后的 Canvas 降级及恢复，截图 `canvas-fallback.png`。data URL 与本地 Blob URL 两种加载、未知地点标记及重复销毁结果见 `renderer-check.json`。
- `packaging.json`：组件产物内恰好包含一份原始模型，字节哈希匹配；现有 Lite 外置资源提取规则识别该模型，没有另行输出外部 GLB。

浏览器检查使用系统 Chromium 的软件 WebGL；验收脚本的测试宿主接收组件 `travel` 事件并回写位置，**不代表运行了完整游戏存档、酒馆助手、手机或真实模型**。运行时结算由上述单元测试另行覆盖。

## 构建与设备边界

东京原始模型校验通过。完整应用执行 `npx vite build` 时，770 个模块完成转换，最终因缺少 `src/frontend/generated/embedded-phone` 失败。该文件需要仓库既有流程从独立 `ST-iPhonie` 源码生成；当前工作区没有该源码，本次没有以占位手机绕过正式打包，也没有生成或发布新版角色卡。

未运行远程 CI、GitHub Actions 或 Agent Edition，未做 TauriTavern 真机验收。
