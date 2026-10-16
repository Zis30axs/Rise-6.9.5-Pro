#!/usr/bin/env python3
"""Validate editable sources without needing a cover PNG."""
from build_card import assemble_card

card = assemble_card()
print(f"校验成功：{card['data']['name']}，世界书条目 {len(card['data'].get('character_book', {}).get('entries', []))} 条")
