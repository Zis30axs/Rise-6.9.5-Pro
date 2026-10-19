#!/usr/bin/env python3
"""Make a separate TauriTavern import PNG using lossless zTXt metadata.

The normal tEXt PNG stays the canonical SillyTavern-compatible release. This
converter changes only the container of one existing V2 chara block; it never
rebuilds, edits, or executes the embedded character script.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import zlib
from pathlib import Path

from card_codec import CardError, PNG_SIGNATURE, extract_card, read_chunks, write_chunk


def compress_card_metadata(source: bytes) -> tuple[bytes, dict]:
    # Validate JSON, V2 fields, PNG boundaries and CRCs before converting.
    extract_card(source)
    chunks = list(read_chunks(source))
    metadata = [(kind, payload) for kind, payload in chunks
                if kind in {b"tEXt", b"zTXt", b"iTXt"}
                and payload.split(b"\0", 1)[0].lower() in {b"chara", b"ccv3"}]
    if len(metadata) != 1 or metadata[0][0] != b"tEXt":
        raise CardError("仅接受恰有一个 tEXt chara 块且没有其他角色元数据的 V2 PNG")
    original_payload = metadata[0][1]
    text = original_payload.split(b"\0", 1)[1]
    compressed = zlib.compress(text, level=9)
    # PNG zTXt: keyword, NUL, compression method 0, then zlib stream.
    replacement = b"chara\0\0" + compressed
    output = PNG_SIGNATURE + b"".join(
        write_chunk(b"zTXt", replacement)
        if kind == b"tEXt" and payload == original_payload
        else write_chunk(kind, payload)
        for kind, payload in chunks
    )
    verified = list(read_chunks(output))
    restored = []
    changed = 0
    for kind, payload in verified:
        if kind == b"zTXt" and payload.startswith(b"chara\0\0"):
            restored.append((b"tEXt", b"chara\0" + zlib.decompress(payload[7:])))
            changed += 1
        else:
            restored.append((kind, payload))
    if changed != 1 or restored != chunks:
        raise CardError("压缩后还原校验失败")
    report = {
        "sourceBytes": len(source), "bytes": len(output),
        "sourceSha256": hashlib.sha256(source).hexdigest(),
        "sha256": hashlib.sha256(output).hexdigest(),
        "metadataEncoding": "zTXt/chara/zlib-method-0",
        "metadataTextBytes": len(text), "compressedMetadataBytes": len(compressed),
        "metadataTextSha256": hashlib.sha256(text).hexdigest(),
        "decompressedMetadataByteIdentical": True,
        "allOtherPngChunksByteIdentical": True,
        "embeddedScriptChanged": False,
        "tauriNativeImportTested": False,
        "compatibility": "Tauri-specific import alternative; retain canonical tEXt PNG for SillyTavern.",
    }
    return output, report


def main() -> None:
    parser = argparse.ArgumentParser(description="无损生成 TauriTavern 专用压缩元数据 PNG，保留通用卡")
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.source.resolve() == args.output.resolve():
            raise CardError("输出必须与原通用 PNG 不同")
        output, report = compress_card_metadata(args.source.read_bytes())
        report.update({"source": str(args.source.resolve()), "artifact": str(args.output.resolve())})
        report_path = args.output.with_suffix(".verification.json")
        if args.output.exists() or report_path.exists():
            raise CardError("输出或验收记录已存在；请使用新文件名，避免覆盖")
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("xb") as stream:
            stream.write(output)
        with report_path.open("x", encoding="utf-8") as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
    except (CardError, OSError, ValueError) as exc:
        parser.error(str(exc))
    print(f"{len(output)} bytes; metadata lossless; physical TauriTavern import pending")


if __name__ == "__main__":
    main()
