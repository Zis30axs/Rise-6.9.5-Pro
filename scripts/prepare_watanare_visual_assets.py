"""Convert and verify Watanare character sprites (lossless WebP).

Covers:
- watanare-renako (甘织玲奈子): 9 expressions from 素材/玲奈子.zip (1024x1536)
- watanare-mai (王冢真唯): 3 expressions from 素材/真唯/ (1024x1536)
- watanare-ajisai (濑名紫阳花): 3 expressions from 素材/紫阳花/ (1024x1536)
- watanare-satsuki (琴纱月): 3 expressions from 素材/纱月/ (1024x1536)
- watanare-kaho (小柳香穗): 3 expressions from 素材/猫猫/ (512x1024)
- watanare-haruna (甘织遥奈): 3 expressions from 素材/老妹啊.zip (360x1024)
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import zipfile
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "watanare-runtime"
MANIFEST_PATH = OUT_DIR / "manifest.json"

DEFAULT_MATERIAL_DIR = Path(r"D:\.study\cc\素材")

RENAKO_ZIP_SPECS = [
    ("01_常态.png", "neutral", "renako/neutral.webp", (1024, 1536)),
    ("02_开心.png", "happy", "renako/happy.webp", (1024, 1536)),
    ("03_害羞.png", "shy", "renako/shy.webp", (1024, 1536)),
    ("04_惊讶.png", "surprised", "renako/surprised.webp", (1024, 1536)),
    ("05_慌张.png", "relieved", "renako/relieved.webp", (1024, 1536)),
    ("06_疑惑.png", "thinking", "renako/thinking.webp", (1024, 1536)),
    ("07_生气.png", "angry", "renako/angry.webp", (1024, 1536)),
    ("08_难过.png", "sad", "renako/sad.webp", (1024, 1536)),
    ("09_无语.png", "serious", "renako/serious.webp", (1024, 1536)),
]

HARUNA_ZIP_SPECS = [
    ("haruna_01_smile.png", "neutral", "characters/watanare-haruna/neutral.webp", (360, 1024)),
    ("haruna_02_happy.png", "happy", "characters/watanare-haruna/happy.webp", (360, 1024)),
    ("haruna_03_pout.png", "shy", "characters/watanare-haruna/shy.webp", (360, 1024)),
]

FOLDER_SPECS = [
    ("watanare-mai", "真唯/浅金长发校服少女立绘.png", "neutral", "characters/watanare-mai/neutral.webp", (1024, 1536)),
    ("watanare-mai", "真唯/微笑挥手的金发校服少女.png", "happy", "characters/watanare-mai/happy.webp", (1024, 1536)),
    ("watanare-mai", "真唯/害羞的金发校服少女.png", "shy", "characters/watanare-mai/shy.webp", (1024, 1536)),
    ("watanare-ajisai", "紫阳花/温柔微笑的格纹裙少女.png", "neutral", "characters/watanare-ajisai/neutral.webp", (1024, 1536)),
    ("watanare-ajisai", "紫阳花/挥手微笑的校园少女.png", "happy", "characters/watanare-ajisai/happy.webp", (1024, 1536)),
    ("watanare-ajisai", "紫阳花/害羞少女轻抚脸颊.png", "shy", "characters/watanare-ajisai/shy.webp", (1024, 1536)),
    ("watanare-satsuki", "纱月/微笑的校服少女.png", "neutral", "characters/watanare-satsuki/neutral.webp", (1024, 1536)),
    ("watanare-satsuki", "纱月/校服少女微笑挥手.png", "happy", "characters/watanare-satsuki/happy.webp", (1024, 1536)),
    ("watanare-satsuki", "纱月/害羞少女制服全身立绘.png", "shy", "characters/watanare-satsuki/shy.webp", (1024, 1536)),
    ("watanare-kaho", "猫猫/01_自然微笑.png", "neutral", "characters/watanare-kaho/neutral.webp", (512, 1024)),
    ("watanare-kaho", "猫猫/02_开心招呼.png", "happy", "characters/watanare-kaho/happy.webp", (512, 1024)),
    ("watanare-kaho", "猫猫/03_歪头疑惑.png", "thinking", "characters/watanare-kaho/thinking.webp", (512, 1024)),
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def convert_one(raw_png: bytes, person_id: str, source_name: str, emotion: str, rel_out: str, expected_size: tuple[int, int]) -> dict:
    with Image.open(io.BytesIO(raw_png)) as im:
        rgba = im.convert("RGBA")
        if rgba.size != expected_size:
            raise ValueError(f"{source_name}: expected {expected_size}, got {rgba.size}")
        out_path = OUT_DIR / rel_out
        out_path.parent.mkdir(parents=True, exist_ok=True)
        rgba.save(out_path, format="WEBP", lossless=True, exact=True, quality=100, method=6)
        with Image.open(out_path) as check_im:
            if check_im.convert("RGBA").tobytes() != rgba.tobytes():
                raise ValueError(f"Lossless round-trip mismatch for {rel_out}")
    webp_bytes = out_path.read_bytes()
    return {
        "personId": person_id,
        "emotion": emotion,
        "sourceName": source_name,
        "sourceSha256": sha256_bytes(raw_png),
        "file": rel_out,
        "format": "webp",
        "width": expected_size[0],
        "height": expected_size[1],
        "bytes": len(webp_bytes),
        "sha256": sha256_bytes(webp_bytes),
    }


def build_from_materials(material_dir: Path) -> dict:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    entries = []

    renako_zip = material_dir / "玲奈子.zip"
    with zipfile.ZipFile(renako_zip, "r") as zf:
        for src_name, emotion, rel_out, size in RENAKO_ZIP_SPECS:
            entries.append(convert_one(zf.read(src_name), "watanare-renako", f"玲奈子.zip/{src_name}", emotion, rel_out, size))

    for person_id, rel_src, emotion, rel_out, size in FOLDER_SPECS:
        src_path = material_dir / rel_src
        entries.append(convert_one(src_path.read_bytes(), person_id, rel_src, emotion, rel_out, size))

    haruna_zip = material_dir / "老妹啊.zip"
    with zipfile.ZipFile(haruna_zip, "r") as zf:
        for src_name, emotion, rel_out, size in HARUNA_ZIP_SPECS:
            entries.append(convert_one(zf.read(src_name), "watanare-haruna", f"老妹啊.zip/{src_name}", emotion, rel_out, size))

    manifest = {
        "version": 2,
        "characters": [
            "watanare-renako",
            "watanare-mai",
            "watanare-ajisai",
            "watanare-satsuki",
            "watanare-kaho",
            "watanare-haruna",
        ],
        "assetCount": len(entries),
        "totalBytes": sum(item["bytes"] for item in entries),
        "entries": entries,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def check_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        raise FileNotFoundError(f"Missing manifest: {MANIFEST_PATH}")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    entries = manifest.get("entries", [])
    if len(entries) != 24:
        raise ValueError(f"Expected 24 entries in manifest, got {len(entries)}")
    for row in entries:
        path = OUT_DIR / row["file"]
        if not path.exists():
            raise FileNotFoundError(f"Missing runtime sprite: {path}")
        data = path.read_bytes()
        if len(data) != row["bytes"]:
            raise ValueError(f"Byte length mismatch for {row['file']}: {len(data)} != {row['bytes']}")
        if sha256_bytes(data) != row["sha256"]:
            raise ValueError(f"SHA256 mismatch for {row['file']}")
        with Image.open(path) as im:
            if im.size != (row["width"], row["height"]):
                raise ValueError(f"Size mismatch for {row['file']}: {im.size}")
    return {
        "ready": True,
        "assetCount": len(entries),
        "totalBytes": sum(r["bytes"] for r in entries),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--materials", type=Path, default=DEFAULT_MATERIAL_DIR)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        print(json.dumps(check_manifest(), ensure_ascii=False))
        return
    manifest = build_from_materials(args.materials)
    print(json.dumps({"ready": True, "assetCount": manifest["assetCount"], "totalBytes": manifest["totalBytes"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
