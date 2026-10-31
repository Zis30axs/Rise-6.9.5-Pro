#!/usr/bin/env python3
"""Build the regular Lite PNG + its ONE matching offline asset ZIP.

No extra GLB input is needed: the canonical source lives at assets/models/.
The first build produces the Lite card + ZIP; this command also produces the
optional Tauri import PNG and validates the final offline package.
No network downloads, CI, or GitHub Actions.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

from build_tokyo_single_card import read_model, ROOT, MODEL_RELATIVE, EXPECTED_SHA256


def run(*args: str) -> None:
    subprocess.run(list(args), cwd=ROOT, check=True)


def ensure_tokyo_model(source: Path | None = None) -> None:
    destination = ROOT / MODEL_RELATIVE
    if source is not None:
        binary = read_model(source)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.is_file() or destination.read_bytes() != binary:
            destination.write_bytes(binary)
        print(f"一次性导入东京沙盘 GLB：{MODEL_RELATIVE} ({len(binary):,} bytes)")
    # The normal workflow never reads a manual path or fetches an asset.
    if not destination.is_file():
        raise ValueError(
            f"缺少仓库固定源模型 {MODEL_RELATIVE}。"
            "请一次性添加并 git add/commit 此 GLB；后续构建无需再提供文件。"
        )
    read_model(destination)


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
    print(f"已核实：东京 GLB 位于原 Lite ZIP 的 assets/{EXPECTED_SHA256}")


def build(source: Path | None = None, install_only: bool = False, skip_tauri: bool = False) -> None:
    ensure_tokyo_model(source)
    if install_only:
        print("已核实仓库固定源模型；未执行构建。")
        return
    npm = shutil.which("npm.cmd" if sys.platform == "win32" else "npm")
    if not npm:
        raise RuntimeError("无法找到本地 Node/npm")

    # package.json prebuild verifies the canonical model; postbuild creates
    # the ONE Lite ZIP and canonical PNG automatically, even on plain npm build.
    run(npm, "run", "build")
    check_zip()

    if not skip_tauri:
        dist = ROOT / "dist"
        dist.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(prefix="tokyo-tauri-", suffix=".png", dir=dist, delete=True) as f:
            temporary = Path(f.name)
        run(sys.executable, "scripts/build_tauri_import_card.py",
            "--source", "dist/unread-city-lite.png", "--output", str(temporary))
        # Generated Tauri artifacts are replaced only AFTER successful conversion.
        temporary.replace(dist / "unread-city-lite-tauri.png")
        temporary.with_suffix(".verification.json").replace(dist / "unread-city-lite-tauri.verification.json")
        run(sys.executable, "scripts/verify_lite_release.py")

    print("Lite 角色卡：dist/unread-city-lite.png")
    print("Lite 离线资源 ZIP：dist/unread-city-lite-assets.zip")
    if not skip_tauri:
        print("Tauri 导入卡：dist/unread-city-lite-tauri.png")
    print("后续构建自动使用仓库内的同一份东京 GLB，不再要求手动指定模型文件。")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("asset", type=Path, nargs="?", default=None,
        help="仅首次导入时可选：原始东京 GLB 或离线素材 ZIP。正常构建不填。")
    parser.add_argument("--install-only", action="store_true",
        help="仅一次性导入/校验原始 GLB，不构建")
    parser.add_argument("--skip-tauri", action="store_true",
        help="只构建普通 Lite PNG 与原资源 ZIP")
    args = parser.parse_args()
    try:
        build(args.asset.resolve() if args.asset else None, args.install_only, args.skip_tauri)
        return 0
    except (OSError, RuntimeError, ValueError, KeyError, zipfile.BadZipFile,
            subprocess.CalledProcessError) as error:
        print("Lite 离线沙盘构建失败：" + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
