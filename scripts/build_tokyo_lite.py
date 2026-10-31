#!/usr/bin/env python3
"""Build Lite PNG + its ONE matching offline ZIP including the new Tokyo GLB.

No CI/Actions, network downloads, or Agent Edition execution.
The source GLB is staged locally from the user's original offline file/ZIP.
The original global character card source and existing ZIP assets remain intact.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

from build_tokyo_single_card import read_model, ROOT, MODEL_RELATIVE, EXPECTED_SHA256


def run(*args: str) -> None:
    subprocess.run(list(args), cwd=ROOT, check=True)


def ensure_tokyo_model(source: Path) -> None:
    binary = read_model(source)
    destination = ROOT / MODEL_RELATIVE
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.is_file() or destination.read_bytes() != binary:
        destination.write_bytes(binary)
    print(f"已安装东京沙盘源模型：{MODEL_RELATIVE} ({len(binary):,} bytes)")
    # Preserve the curated Chinese runtime data in git. The original ZIP's
    # data JSON is reference material and must not overwrite existing world rules.


def check_zip() -> None:
    archive = ROOT / "dist/unread-city-lite-assets.zip"
    report = json.loads((ROOT / "dist/lite-assets-report.json").read_text("utf-8"))
    if report.get("tokyoSandboxSha256") != EXPECTED_SHA256 or not report.get("tokyoSandboxExternalized"):
        raise ValueError("Lite 构建报告缺少东京沙盘记录")
    with zipfile.ZipFile(archive) as bundle:
        rows = json.loads(bundle.read("manifest.json"))["assets"]
        match = [row for row in rows if row["sha256"] == EXPECTED_SHA256]
        if len(match) != 1 or hashlib.sha256(bundle.read(match[0]["path"])).hexdigest() != EXPECTED_SHA256:
            raise ValueError("Lite ZIP 中的东京沙盘模型缺失或校验失败")
    print(f"已核实：东京 GLB 位于 Lite ZIP 的 assets/{EXPECTED_SHA256}")


def build(source: Path, install_only: bool = False, skip_tauri: bool = False) -> None:
    ensure_tokyo_model(source)
    if install_only:
        print("仅安装模型到源码目录。未调用本地构建或远程 CI。")
        return
    npm = shutil.which("npm.cmd" if sys.platform == "win32" else "npm")
    if not npm:
        raise RuntimeError("无法找到本地 Node/npm")
    run(npm, "run", "build")
    run(sys.executable, "scripts/build_lite_release.py")
    check_zip()
    run(sys.executable, "scripts/build_lite_card.py")
    if not skip_tauri:
        tauri = ROOT / "dist/unread-city-lite-tauri.png"
        report = tauri.with_suffix(".verification.json")
        if tauri.exists() or report.exists():
            raise ValueError("已有同名 Tauri PNG/校验文件。请先移动旧产物再重新构建，避免覆盖。")
        run(sys.executable, "scripts/build_tauri_import_card.py",
            "--source", "dist/unread-city-lite.png", "--output", "dist/unread-city-lite-tauri.png")
        run(sys.executable, "scripts/verify_lite_release.py")
    print("Lite 离线沙盘已纳入原资源 ZIP：dist/unread-city-lite-assets.zip")
    print("角色卡：dist/unread-city-lite.png")
    if not skip_tauri:
        print("Tauri 版角色卡：dist/unread-city-lite-tauri.png")
    print("请配套导入这一版 PNG 和 ZIP；不要搭配旧版资源包。")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("asset", type=Path, help="用户提供的 GLB 或东京沙盘资源 ZIP")
    parser.add_argument("--install-only", action="store_true", help="只验证并复制 GLB，不打包")
    parser.add_argument("--skip-tauri", action="store_true", help="只构建普通 Lite PNG 与 ZIP")
    args = parser.parse_args()
    try:
        build(args.asset.resolve(), args.install_only, args.skip_tauri)
        return 0
    except (OSError, RuntimeError, ValueError, KeyError, zipfile.BadZipFile, subprocess.CalledProcessError) as error:
        print("东京沙盘 Lite 构建失败：" + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
