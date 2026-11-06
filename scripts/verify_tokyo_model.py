#!/usr/bin/env python3
"""Fail the standard local build if its canonical offline Tokyo GLB is unavailable.

The file is a versioned project source, never fetched from a CDN or CI artifact.
"""
from __future__ import annotations

import sys
from build_tokyo_single_card import ROOT, MODEL_RELATIVE, read_model


def main() -> int:
    model = ROOT / MODEL_RELATIVE
    if not model.is_file():
        print(
            f"东京沙盘源模型未入库：{MODEL_RELATIVE}。"
            "请将用户提供的原始 GLB 添加到仓库同名路径并提交；"
            "正常 Lite 构建不得依赖临时文件路径或网络下载。",
            file=sys.stderr,
        )
        return 1
    try:
        data = read_model(model)
    except (OSError, ValueError, KeyError) as exc:
        print(f"东京沙盘 GLB 校验失败：{exc}", file=sys.stderr)
        return 1
    print(f"东京沙盘源模型已校验：{MODEL_RELATIVE} ({len(data):,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
