#!/usr/bin/env python3
"""Read V2 data back out of the finished PNG as a sanity check."""
import argparse
from pathlib import Path
from card_codec import CardError, extract_card

parser = argparse.ArgumentParser(description="查看 PNG 携带的角色卡元数据")
parser.add_argument("png", type=Path)
args = parser.parse_args()
try:
    card = extract_card(args.png.read_bytes())
except (OSError, CardError) as exc:
    parser.error(str(exc))
data = card["data"]
print(f"名称：{data['name']}")
print(f"格式：{card['spec']} / {card['spec_version']}")
print(f"版本：{data.get('character_version', 'unknown')}")
print(f"世界书条目：{len(data.get('character_book', {}).get('entries', []))}")
