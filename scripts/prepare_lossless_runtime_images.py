"""Build exact-pixel WebP copies of the 15 selected runtime PNGs.

Run ``python scripts/prepare_lossless_runtime_images.py`` to reproduce the
derived files, or add ``--check`` to verify them without writing anything.
Requires Pillow with WebP support. Original PNGs and their provenance manifests
are read-only inputs; no resizing, quantization, color or alpha edits are used.
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path

import PIL
from PIL import Image, features

ROOT = Path(__file__).resolve().parents[1]
ENCODING = {"format": "WEBP", "lossless": True, "quality": 100, "method": 6, "exact": True}
GROUPS = (
    ("assets/store-products", "images", (
        "meal-basic", "meal-standard", "meal-premium",
        "snack-basic", "snack-standard", "snack-premium",
        "drink-basic", "drink-standard", "drink-premium",
        "cigarette-basic", "cigarette-standard", "cigarette-premium",
    )),
    ("assets/npc-portraits/expression-atlases-v3", "portraits", (
        "deepseek", "xiaoyang", "claude",
    )),
)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def workspace_path(relative: str) -> Path:
    path = (ROOT / relative).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError(f"Asset path escaped the workspace: {relative}")
    return path


def verify_pixels(source: Image.Image, encoded: bytes, label: str) -> None:
    # These metadata-free WebPs contain one VP8L lossless image chunk.
    if encoded[:4] != b"RIFF" or encoded[8:16] != b"WEBPVP8L":
        raise ValueError(f"Expected a lossless WebP: {label}")
    with Image.open(io.BytesIO(encoded)) as decoded:
        if decoded.format != "WEBP" or decoded.size != source.size:
            raise ValueError(f"Image dimensions changed: {label}")
        # Include RGB underneath alpha=0: visible-only comparisons are insufficient.
        if decoded.convert("RGBA").tobytes() != source.tobytes():
            raise ValueError(f"RGBA bytes changed: {label}")


def prepare(check_only: bool = False) -> dict:
    if not features.check("webp"):
        raise RuntimeError("Pillow was built without WebP support")
    reports = []
    for directory, provenance_key, identifiers in GROUPS:
        provenance = json.loads(workspace_path(f"{directory}/manifest.json").read_text(encoding="utf8"))
        originals = {row["id"]: row for row in provenance[provenance_key]}
        output = workspace_path(f"{directory}/lossless")
        manifest_path = workspace_path(f"{directory}/lossless/manifest.json")
        recorded = json.loads(manifest_path.read_text(encoding="utf8")) if check_only else None
        if recorded is not None and recorded["encoding"] != ENCODING:
            raise ValueError(f"Unexpected encoding declaration: {directory}")
        rows, payloads = [], []
        for identifier in identifiers:
            source = workspace_path(f"{directory}/{identifier}.png")
            target = workspace_path(f"{directory}/lossless/{identifier}.webp")
            original = source.read_bytes()
            expected = originals[identifier]
            if len(original) != expected["bytes"] or sha256(original) != expected["sha256"]:
                raise ValueError(f"Source PNG differs from its original provenance: {identifier}")
            with Image.open(io.BytesIO(original)) as opened:
                if opened.format != "PNG" or opened.mode != "RGBA" or opened.size != (expected["width"], expected["height"]):
                    raise ValueError(f"Unexpected source format or dimensions: {identifier}")
                if opened.info:
                    raise ValueError(f"Review image metadata before converting: {identifier}")
                image = opened.copy()
            if check_only:
                encoded = target.read_bytes()
            else:
                buffer = io.BytesIO()
                image.save(buffer, **ENCODING)
                encoded = buffer.getvalue()
            verify_pixels(image, encoded, identifier)
            if len(encoded) >= len(original):
                raise ValueError(f"Derived image must be smaller than its original: {identifier}")
            rows.append({
                "id": identifier, "source": source.relative_to(ROOT).as_posix(),
                "file": target.name, "sourceBytes": len(original), "bytes": len(encoded),
                "sourceSha256": sha256(original), "sha256": sha256(encoded),
                "width": image.width, "height": image.height, "mode": "RGBA",
                "rgbaSha256": sha256(image.tobytes()), "allRgbaBytesEqual": True,
            })
            payloads.append((target, encoded))
            print(f"{'Checked' if check_only else 'Encoded'} {identifier}: {len(original):,} -> {len(encoded):,} bytes; all RGBA bytes equal", flush=True)
        report = {
            "generator": "scripts/prepare_lossless_runtime_images.py",
            "encoder": {"pillow": PIL.__version__, "libwebp": features.version("webp")},
            "encoding": ENCODING, "sourcePngsPreserved": True,
            "imageCount": len(rows), "sourceBytes": sum(row["sourceBytes"] for row in rows),
            "bytes": sum(row["bytes"] for row in rows), "images": rows,
        }
        if check_only:
            # Decoder versions may vary; source/output hashes and decoded pixels must not.
            if {key: value for key, value in recorded.items() if key != "encoder"} != {key: value for key, value in report.items() if key != "encoder"}:
                raise ValueError(f"Derived manifest is stale or modified: {directory}")
        else:
            output.mkdir(parents=True, exist_ok=True)
            for target, encoded in payloads:
                target.write_bytes(encoded)
            manifest_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        reports.append(report)
    total_source = sum(report["sourceBytes"] for report in reports)
    total_output = sum(report["bytes"] for report in reports)
    return {
        "checkedOnly": check_only, "imageCount": sum(report["imageCount"] for report in reports),
        "sourceBytes": total_source, "bytes": total_output, "savedBytes": total_source - total_output,
        "savedPercent": round(100 * (1 - total_output / total_source), 2),
        "allRgbaBytesEqual": True, "dimensionsAndAlphaPreserved": True,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify checked-in derivatives without rewriting them")
    print(json.dumps(prepare(parser.parse_args().check), indent=2))
