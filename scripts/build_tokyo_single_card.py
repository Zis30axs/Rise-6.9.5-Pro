#!/usr/bin/env python3
"""Embed the supplied offline Tokyo GLB in the existing SillyTavern character-card PNG.

This only runs local build commands. It does NOT start GitHub Actions/CI or Agent Edition.
Other Lite external assets are not silently changed by this script.
"""
from __future__ import annotations

import argparse
import base64
import json
import shutil
import struct
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_RELATIVE = Path("assets/models/unread-city-tokyo-sandbox.glb")
# Historical content id used by the runtime cache. Release builds do not reject a GLB when this differs.
EXPECTED_SHA256 = "12151a8faa994e1740abbd18f67d37a8aa315e8ce60b6b8d03aff0b22f387afb"
MAX_MODEL_BYTES = 10_000_000


def read_model(source: Path) -> bytes:
    if source.suffix.lower() == ".zip":
        with zipfile.ZipFile(source) as pack:
            info = pack.getinfo(MODEL_RELATIVE.as_posix())
            if info.file_size > MAX_MODEL_BYTES:
                raise ValueError("沙盘资源过大。")
            data = pack.read(info)
    else:
        data = source.read_bytes()

    if len(data) < 20 or len(data) > MAX_MODEL_BYTES or data[:4] != b"glTF":
        raise ValueError("不是有效的东京沙盘 GLB。")
    version, total, length, tag = struct.unpack_from("<IIII", data, 4)
    if version != 2 or total != len(data) or tag != 0x4E4F534A or length > len(data) - 20:
        raise ValueError("GLB 头或 JSON 数据块无效。")
    metadata = json.loads(data[20:20 + length])
    for kind in ("buffers", "images"):
        if any("uri" in entry for entry in metadata.get(kind, [])):
            raise ValueError("沙盘模型不允许携带外部纹理或 buffer 地址。")
    return data


def build(source: Path, output: Path, install_only: bool) -> None:
    data = read_model(source)
    target = ROOT / MODEL_RELATIVE
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.is_file() or target.read_bytes() != data:
        target.write_bytes(data)
    print(f"已安装离线 GLB：{MODEL_RELATIVE} ({len(data):,} bytes)")
    if install_only:
        print("已停止于素材安装阶段，未执行构建。")
        return

    npm = shutil.which("npm.cmd" if sys.platform == "win32" else "npm")
    if npm is None:
        raise RuntimeError("本地找不到 npm，请先安装项目要求的 Node.js/npm。")
    print("开始本地构建前端（保留项目原有的手机、角色素材构建流程）……")
    subprocess.run([npm, "run", "build"], cwd=ROOT, check=True)

    bundle_path = ROOT / "dist/immersive-shell.js"
    if not bundle_path.is_file():
        raise RuntimeError("前端构建完成后没有生成 dist/immersive-shell.js。")
    bundle = bundle_path.read_text(encoding="utf-8")
    # Vite's ?inline asset import should contain this exact Base64 GLB prefix.
    prefix = base64.b64encode(data[:48]).decode("ascii")
    if prefix not in bundle:
        raise RuntimeError("模型没有内嵌到前端脚本；禁止导出缺少 GLB 的角色卡。")
    if "UNREAD_CITY_IMMERSIVE_BUNDLE" not in bundle[:512]:
        raise RuntimeError("前端产物不是正确的角色卡 IIFE 构建。")

    output = output if output.is_absolute() else ROOT / output
    print("正在把完整前端脚本写入单张角色卡 PNG……")
    subprocess.run(
        [
            sys.executable, str(ROOT / "scripts/build_card.py"),
            "--frontend", str(bundle_path),
            "--output", str(output),
        ],
        cwd=ROOT,
        check=True,
    )
    if not output.is_file():
        raise RuntimeError("未生成角色卡 PNG。")
    print(f"东京沙盘已包含在此 PNG：{output} ({output.stat().st_size:,} bytes)")
    print("提示：这消除了东京沙盘 GLB 的外置依赖，不改变原 Lite 中其他外置素材的安装要求。")


def main() -> int:
    parser = argparse.ArgumentParser(description="把东京 GLB 直接打入单张角色卡 PNG，不启用远程 CI。")
    parser.add_argument("asset", type=Path, help="原始 .glb 文件，或包含 assets/models/unread-city-tokyo-sandbox.glb 的资源 ZIP")
    parser.add_argument("--output", type=Path, default=Path("dist/unread-city-tokyo-embedded.png"), help="输出 PNG 路径")
    parser.add_argument("--install-only", action="store_true", help="只安装 GLB 到仓库，不执行本地构建")
    args = parser.parse_args()
    try:
        build(args.asset.resolve(), args.output, args.install_only)
        return 0
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, subprocess.CalledProcessError, RuntimeError) as error:
        print(f"东京沙盘一体化失败：{error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
