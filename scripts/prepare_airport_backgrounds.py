"""Copy the supplied airport art and derive pixel-identical local WebP backgrounds."""
from __future__ import annotations

import hashlib
import io
import json
from pathlib import Path

from PIL import Image, __version__ as pillow_version

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "backgrounds"
SELECTED = {
    "day": "0D62FF4C-7CE9-49CE-8A8D-8EB59546E058.png",
    "dusk": "ABE9996E-CBC6-4BBF-B8B9-CB30CE4109FE.png",
    "night": "09853CA7-0109-4B94-AB00-939E54242FEB.png",
}


def details(path: Path, data: bytes, size: tuple[int, int]) -> dict:
    return {
        "file": path.relative_to(ROOT).as_posix(), "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(), "size": list(size),
    }


def prepare() -> dict:
    source_dir = OUTPUT / "sources" / "haneda-airport"
    source_dir.mkdir(parents=True, exist_ok=True)
    rows = {}
    for phase, filename in SELECTED.items():
        supplied = ROOT / "素材" / "机场" / filename
        original = source_dir / filename
        # The checked-in copy keeps the conversion reproducible without the drop folder.
        data = (supplied if supplied.is_file() else original).read_bytes()
        with Image.open(io.BytesIO(data)) as source:
            if source.format != "PNG" or source.size != (1672, 941) or source.mode != "RGB":
                raise ValueError(f"Unexpected airport image: {filename}")
            source.load()
            pixels = source.tobytes()
            encoded = io.BytesIO()
            source.save(encoded, format="WEBP", lossless=True, method=6, exact=True)
        derived = encoded.getvalue()
        with Image.open(io.BytesIO(derived)) as decoded:
            if decoded.size != (1672, 941) or decoded.convert("RGB").tobytes() != pixels:
                raise ValueError(f"Lossless image verification failed: {phase}")
        target = OUTPUT / f"haneda-airport-{phase}.webp"
        original.write_bytes(data)
        target.write_bytes(derived)
        rows[phase] = {
            "suppliedFile": supplied.relative_to(ROOT).as_posix(),
            "source": details(original, data, (1672, 941)),
            "derived": details(target, derived, (1672, 941)),
            "pixelIdentical": True,
        }
    report = {
        "locationId": "haneda-airport", "kind": "user-provided-images",
        "encoding": {"format": "WebP", "lossless": True, "method": 6, "exact": True,
                     "resize": False, "crop": False, "pillowVersion": pillow_version},
        "selection": {"day": "06:00-16:59", "dusk": "17:00-18:59", "night": "19:00-05:59"},
        "images": rows,
    }
    (OUTPUT / "haneda-airport-source.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    print(json.dumps(prepare(), ensure_ascii=True, indent=2))
