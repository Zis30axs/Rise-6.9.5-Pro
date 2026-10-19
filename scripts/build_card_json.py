#!/usr/bin/env python3
"""Write an importable Character Card V2 JSON from the same sources as the PNG."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from build_card import ROOT, assemble_card
from card_codec import assert_card


def main() -> None:
    parser = argparse.ArgumentParser(description="构建 Unread City 的可导入 V2 JSON 角色卡")
    parser.add_argument("--frontend", type=Path, help="将 npm run build 生成的单文件 IIFE 脚本嵌入 extensions")
    parser.add_argument("--output", type=Path, default=ROOT / "dist/unread-city.json")
    args = parser.parse_args()
    try:
        card = assemble_card(frontend_path=args.frontend)
        assert_card(card)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
    except (OSError, ValueError, KeyError, UnicodeError) as exc:
        parser.error(f"构建失败：{exc}")
    print(f"已构建：{args.output} ({args.output.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
