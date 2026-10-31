#!/usr/bin/env python3
"""Build standalone Lite Character Card V2 while preserving main/full source."""
from __future__ import annotations
import hashlib
from pathlib import Path
from build_card import ROOT, IMMERSIVE_SCRIPT_ID, assemble_card
from build_lite_release import TOKYO_SANDBOX_ARCHIVE, TOKYO_SANDBOX_BYTES, TOKYO_SANDBOX_SHA256
from card_codec import encode_card


def build(lite_script: Path, output: Path) -> None:
    card = assemble_card(frontend_path=lite_script)
    data = card['data']
    data['creator_notes'] += ('\n\n【Lite 外挂素材测试版】完整世界书、玩法与内嵌手机代码保留；'
                              '大体积图像与既有模型由配套离线 ZIP 安装。东京沙盘模型在单独的本地素材包中，不并入主素材包。'
                              '第一次进入请点击右上角“安装 Lite 素材 ZIP”，安装完成后刷新。'
                              '若城市沙盘仍是简化外观，再安装“东京沙盘素材”并刷新。'
                              '没有素材时使用缺省图像；不联网；未经 iPhone 真机验收。')
    data['extensions']['unread_city']['immersive'].update({
        'bundle': 'lite-offline-zip-v1', 'requires_external_assets': True,
        'resources': 'local ZIP + IndexedDB; no remote fetch', 'real_import_verified': False,
        'assetPacks': [
            {'id': 'lite-assets', 'archive': 'unread-city-lite-assets.zip', 'required': True},
            {'id': 'tokyo-sandbox', 'archive': TOKYO_SANDBOX_ARCHIVE, 'required': False,
             'sha256': TOKYO_SANDBOX_SHA256, 'bytes': TOKYO_SANDBOX_BYTES},
        ],
    })
    scripts = data['extensions']['tavern_helper']['scripts']
    own = [s for s in scripts if s.get('id') == IMMERSIVE_SCRIPT_ID]
    assert len(own) == 1
    own[0]['info'] = '未读之城 Lite 外挂预发行：完整剧情与手机；美术/模型通过本地 ZIP 安装，首次安装后刷新页面。'
    raw = encode_card((ROOT / 'assets/cover.png').read_bytes(), card)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(raw)
    print(f'Lite canonical PNG: {len(raw)} bytes; SHA256 {hashlib.sha256(raw).hexdigest()}')


if __name__ == '__main__':
    build(ROOT / 'dist/immersive-shell-lite.js', ROOT / 'dist/unread-city-lite.png')
