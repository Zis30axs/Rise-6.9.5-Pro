"""Derive the selected embedded backgrounds from the unchanged user ZIP.

Only fixed image entries are decoded. Package metadata and scripts are never run.
Requires Pillow with WebP support; does not install dependencies or fetch files.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import zipfile

from PIL import Image, features

ARCHIVE_SHA256 = "1074f8ea89a22be0a4f7404b0437167d3c23e9f455bfc18559a0ce163f63fb0b"
DEFAULT_ARCHIVE = Path("C:/Users/Administrator/Downloads/soyo_2026-03-07_2026-03-07.zip")
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "backgrounds"
SELECTED = {
    "street-day": "白天街道", "street-dusk": "黄昏街道", "street-night": "夜晚街道",
    "park-day": "白天公园", "park-dusk": "黄昏公园", "park-night": "夜晚公园",
    "commercial-day": "白天商业街", "commercial-dusk": "黄昏商业街", "commercial-night": "夜晚商业街",
    "classroom-day": "白天教室", "classroom-dusk": "黄昏教室", "classroom-night": "夜晚教室",
    "bedroom-day": "白天卧室",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def prepare(archive_path: Path) -> dict:
    if not features.check("webp"):
        raise RuntimeError("Pillow was built without WebP support")
    if archive_path.stat().st_size > 30_000_000:
        raise ValueError("Unexpected archive size")
    archive_data = archive_path.read_bytes()
    if sha256(archive_data) != ARCHIVE_SHA256:
        raise ValueError("The archive does not match the inspected user-provided ZIP")
    output = OUTPUT.resolve()
    if not output.is_relative_to(ROOT.resolve()):
        raise ValueError("Output must stay inside the workspace")
    output.mkdir(parents=True, exist_ok=True)
    rows = []
    with zipfile.ZipFile(io.BytesIO(archive_data)) as archive:
        entries = archive.infolist()
        names = [entry.filename for entry in entries]
        if len(entries) > 100 or len(names) != len(set(names)) or sum(entry.file_size for entry in entries) > 30_000_000:
            raise ValueError("Unexpected archive contents")
        for entry in entries:
            path = PurePosixPath(entry.filename.replace("\\", "/"))
            if path.is_absolute() or ".." in path.parts or ":" in str(path) or "\x00" in str(path):
                raise ValueError("Unsafe archive path")
            if (entry.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("Archive links are not supported")
        for identifier, source_name in SELECTED.items():
            name = f"backgrounds/{source_name}.png"
            if archive.getinfo(name).file_size > 4_000_000:
                raise ValueError("Unexpected source image size")
            source = archive.read(name)
            with Image.open(io.BytesIO(source)) as original:
                if original.width * original.height > 8_000_000:
                    raise ValueError("Unexpected source image dimensions")
                source_format, source_size = original.format, list(original.size)
                image = original.convert("RGB")
            image.thumbnail((1280, 960), Image.Resampling.LANCZOS)
            encoded = io.BytesIO()
            image.save(encoded, format="WEBP", quality=84, method=6)
            data = encoded.getvalue()
            target = (output / f"{identifier}.webp").resolve()
            if not target.is_relative_to(output):
                raise ValueError("Image output escaped the asset directory")
            with Image.open(io.BytesIO(data)) as decoded:
                decoded.load()
                if decoded.format != "WEBP" or decoded.size != image.size:
                    raise ValueError("Encoded image verification failed")
            target.write_bytes(data)
            rows.append({
                "id": identifier, "file": target.name, "sourceEntry": name,
                "sourceBytes": len(source), "sourceSha256": sha256(source),
                "sourceFormat": source_format, "sourceSize": source_size,
                "bytes": len(data), "sha256": sha256(data), "size": list(image.size),
            })
    report = {
        "archive": archive_path.name, "archiveBytes": len(archive_data), "archiveSha256": ARCHIVE_SHA256,
        "selectedSourceBytes": sum(row["sourceBytes"] for row in rows),
        "outputBytes": sum(row["bytes"] for row in rows),
        "encoding": {"format": "WebP", "quality": 84, "method": 6, "maxSize": [1280, 960]},
        "images": rows,
    }
    (output / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", nargs="?", type=Path, default=DEFAULT_ARCHIVE)
    result = prepare(parser.parse_args().archive)
    print(json.dumps({key: value for key, value in result.items() if key != "images"}, ensure_ascii=True, indent=2))
