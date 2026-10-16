#!/usr/bin/env python3
"""Build an importable SillyTavern character-card PNG from editable sources."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from card_codec import CardError, assert_card, encode_card

ROOT = Path(__file__).resolve().parents[1]


def assemble_card(root: Path = ROOT) -> dict:
    card = json.loads((root / "src/card.json").read_text(encoding="utf-8"))
    data = card["data"]
    entries = []
    books = sorted((root / "src/worldbook").glob("*.json"))
    for path in books:
        book = json.loads(path.read_text(encoding="utf-8"))
        for entry in book.get("entries", []):
            row = {**entry}
            row.setdefault("extensions", {})
            row.setdefault("enabled", True)
            row.setdefault("keys", [])
            row["insertion_order"] = len(entries)
            entries.append(row)
    if entries:
        data["character_book"] = {
            "name": "未读之城：世界书",
            "description": "由 src/worldbook 自动合并。",
            "recursive_scanning": False,
            "extensions": {},
            "entries": entries,
        }
    assert_card(card)
    return card


def main():
    parser = argparse.ArgumentParser(description="构建 Unread City 的 SillyTavern V2 PNG")
    parser.add_argument("--image", type=Path, default=ROOT / "assets/cover.png")
    parser.add_argument("--output", type=Path, default=ROOT / "dist/unread-city.png")
    args = parser.parse_args()
    if not args.image.is_file():
        parser.error(f"没有找到封面：{args.image}。请把有效 PNG 放到 assets/cover.png 或指定 --image。")
    try:
        output = encode_card(args.image.read_bytes(), assemble_card())
    except (CardError, ValueError, KeyError, json.JSONDecodeError) as exc:
        parser.error(f"构建失败：{exc}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(output)
    print(f"已构建：{args.output} ({len(output)} bytes)")


if __name__ == "__main__":
    main()
