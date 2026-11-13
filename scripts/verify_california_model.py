#!/usr/bin/env python3
"""Fail the standard local build if its canonical offline California GLB is unavailable.

The file is the user-uploaded model committed at
assets/california-sandbox/sandbox.glb as a versioned project source, never
fetched from a CDN or CI artifact. There is no generator for it: if the file
is missing or its bytes changed, restore the uploaded model. This check only
verifies the committed file.
"""
from __future__ import annotations

import hashlib
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL_RELATIVE = Path("assets/california-sandbox/sandbox.glb")
EXPECTED_SHA256 = "24eb0ab6cb69735614de7db4d3166e12320be43950fa8d013583afe00b66e5eb"
MAX_MODEL_BYTES = 10_000_000


def read_model(source: Path) -> bytes:
    data = source.read_bytes()
    if len(data) < 20 or len(data) > MAX_MODEL_BYTES or data[:4] != b"glTF":
        raise ValueError("不是有效的加州沙盘 GLB。")
    version, total, length, tag = struct.unpack_from("<IIII", data, 4)
    if version != 2 or total != len(data) or tag != 0x4E4F534A or length > len(data) - 20:
        raise ValueError("GLB 头或 JSON 数据块无效。")
    metadata = json.loads(data[20:20 + length])
    for kind in ("buffers", "images"):
        if any("uri" in entry for entry in metadata.get(kind, [])):
            raise ValueError("沙盘模型不允许携带外部纹理或 buffer 地址。")
    return data


def main() -> int:
    model = ROOT / MODEL_RELATIVE
    if not model.is_file():
        print(
            f"加州沙盘源模型未入库：{MODEL_RELATIVE}。"
            "请恢复用户上传的模型文件并提交；"
            "正常 Lite 构建不得依赖临时文件路径或网络下载。",
            file=sys.stderr,
        )
        return 1
    try:
        data = read_model(model)
    except (OSError, ValueError, KeyError) as exc:
        print(f"加州沙盘 GLB 校验失败：{exc}", file=sys.stderr)
        return 1
    sha = hashlib.sha256(data).hexdigest()
    if sha != EXPECTED_SHA256:
        print(
            f"加州沙盘 GLB 与登记不一致：文件 {sha}，登记 {EXPECTED_SHA256}。"
            "请确认提交的是用户上传的原始模型文件。",
            file=sys.stderr,
        )
        return 1
    print(f"加州沙盘源模型已校验：{MODEL_RELATIVE} ({len(data):,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
