"""Pure-stdlib Character Card V2 JSON <-> PNG tEXt(chara) utilities."""
from __future__ import annotations

import base64
import json
import struct
import zlib
from pathlib import Path

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
REMOVED_METADATA_KEYS = {b"chara", b"ccv3"}


class CardError(ValueError):
    """Malformed PNG or card data."""


def read_chunks(data: bytes):
    if not data.startswith(PNG_SIGNATURE):
        raise CardError("输入文件不是 PNG")
    offset = len(PNG_SIGNATURE)
    seen_iend = False
    while offset < len(data):
        if offset + 12 > len(data):
            raise CardError("PNG 块长度不完整")
        length = struct.unpack_from(">I", data, offset)[0]
        end = offset + 12 + length
        if end > len(data):
            raise CardError("PNG 块内容不完整")
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        stored_crc = struct.unpack_from(">I", data, end - 4)[0]
        expected_crc = zlib.crc32(kind + payload) & 0xFFFFFFFF
        if stored_crc != expected_crc:
            raise CardError(f"PNG 块 CRC 错误: {kind!r}")
        yield kind, payload
        offset = end
        if kind == b"IEND":
            seen_iend = True
            break
    if not seen_iend:
        raise CardError("PNG 缺少 IEND 块")
    if offset != len(data):
        raise CardError("PNG IEND 后有额外字节")


def write_chunk(kind: bytes, payload: bytes) -> bytes:
    if len(kind) != 4:
        raise CardError("PNG 块类型必须为 4 字节")
    return (struct.pack(">I", len(payload)) + kind + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF))


def encode_card(image_bytes: bytes, card: dict) -> bytes:
    assert_card(card)
    card_json = json.dumps(card, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    chunk = write_chunk(b"tEXt", b"chara\x00" + base64.b64encode(card_json))
    output = bytearray(PNG_SIGNATURE)
    seen_ihdr = False
    for kind, payload in read_chunks(image_bytes):
        if kind == b"IHDR":
            seen_ihdr = True
        if kind in {b"tEXt", b"zTXt", b"iTXt"} and payload.split(b"\x00", 1)[0] in REMOVED_METADATA_KEYS:
            continue  # Replace previously embedded cards rather than duplicating.
        if kind == b"IEND":
            if not seen_ihdr:
                raise CardError("PNG 缺少 IHDR 块")
            output.extend(chunk)
        output.extend(write_chunk(kind, payload))
    return bytes(output)


def extract_card(image_bytes: bytes) -> dict:
    candidates = []
    for kind, payload in read_chunks(image_bytes):
        if kind != b"tEXt" or b"\x00" not in payload:
            continue
        key, value = payload.split(b"\x00", 1)
        if key == b"chara":
            candidates.append(value)
    if len(candidates) != 1:
        raise CardError(f"预期恰有一个 PNG chara 元数据块，实际有 {len(candidates)} 个")
    try:
        card = json.loads(base64.b64decode(candidates[0], validate=True).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CardError("角色卡数据不能正确解码") from exc
    assert_card(card)
    return card


def assert_card(card: dict):
    if not isinstance(card, dict) or card.get("spec") != "chara_card_v2" or card.get("spec_version") != "2.0":
        raise CardError("角色卡必须使用 chara_card_v2 / 2.0")
    data = card.get("data")
    if not isinstance(data, dict):
        raise CardError("角色卡缺少 data 对象")
    for field in ("name", "description", "personality", "scenario", "first_mes", "mes_example"):
        if not isinstance(data.get(field), str):
            raise CardError(f"角色卡缺少字符串字段：{field}")
    if not isinstance(data.get("extensions", {}), dict):
        raise CardError("extensions 必须是 JSON 对象")
    book = data.get("character_book")
    if book is not None:
        if not isinstance(book, dict) or not isinstance(book.get("entries"), list):
            raise CardError("character_book 必须拥有 entries 数组")
        for i, entry in enumerate(book["entries"]):
            if (not isinstance(entry, dict) or not isinstance(entry.get("keys"), list)
                or not isinstance(entry.get("content"), str)
                or not isinstance(entry.get("enabled"), bool)
                or not isinstance(entry.get("insertion_order"), int)
                or not isinstance(entry.get("extensions"), dict)):
                raise CardError(f"世界书条目 #{i} 结构错误")
