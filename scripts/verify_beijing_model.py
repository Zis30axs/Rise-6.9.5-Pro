#!/usr/bin/env python3
"""Validate the committed, offline Beijing GLB source before production build."""
from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / 'assets/beijing-sandbox/sandbox.glb'
ATLAS = ROOT / 'assets/beijing-sandbox/sandbox.json'
SHA256 = 'fc03c2a90e26e48dde2adf4c9f53135c365618497bd4b722db14404b5ab6d66d'
BYTES = 19_601_140


def verify() -> None:
    data = MODEL.read_bytes()
    if len(data) != BYTES or hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError('北京沙盘模型缺失或内容不符合本次上传包。')
    if data[:4] != b'glTF':
        raise ValueError('北京沙盘 GLB 文件头无效。')
    version, total, json_bytes, tag = struct.unpack_from('<IIII', data, 4)
    if version != 2 or total != len(data) or tag != 0x4E4F534A:
        raise ValueError('北京 GLB 版本、长度或 JSON 数据块无效。')
    gltf = json.loads(data[20:20 + json_bytes])
    for kind in ('buffers', 'images'):
        if any('uri' in item for item in gltf.get(kind, [])):
            raise ValueError('北京模型不能包含外部资源依赖。')
    atlas = json.loads(ATLAS.read_text('utf-8'))
    ids = [p['id'] for p in atlas['places']]
    anchors = [node.get('extras', {}).get('locationId') for node in gltf.get('nodes', [])
               if node.get('extras', {}).get('locationId')]
    if set(anchors) != set(ids) or len(anchors) != len(ids):
        raise ValueError('GLB 命名地点与地图 JSON 的 ID 不一致。')
    if len(ids) != 33 or len(set(ids)) != 33 or len(atlas['routes']) != 48:
        raise ValueError('北京地点、路线数量或 ID 唯一性与交接包不符。')
    if any(r['from'] not in ids or r['to'] not in ids or r['from'] == r['to'] for r in atlas['routes']):
        raise ValueError('北京路线存在无效目的地或自环。')
    print(f'北京沙盘 GLB、33 个地点与 48 条双向路线已验证（{len(data):,} bytes）。')


if __name__ == '__main__':
    verify()
