"""Copy inspected Cubism 2 model data into stable local assets without running it."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "live2d-soyo"
ARCHIVE_SHA256 = "905691e33007dd75e3d877d35b05f853d3c8f519ee3ad9efd8da421c9055cd88"
DEFAULT_ARCHIVE = Path("C:/Users/Administrator/Downloads/素世.zip")


def prepare(source: Path) -> dict:
    if source.stat().st_size > 2_000_000:
        raise ValueError("Unexpected archive size")
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != ARCHIVE_SHA256:
        raise ValueError("Archive differs from inspected source")
    output = OUTPUT.resolve()
    if not output.is_relative_to(ROOT.resolve()):
        raise ValueError("Output must stay inside workspace")
    output.mkdir(parents=True, exist_ok=True)
    records = []
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        names = [item.filename for item in entries]
        if len(names) != 85 or len(set(names)) != len(names) or sum(item.file_size for item in entries) > 3_000_000:
            raise ValueError("Unexpected archive contents")
        for item in entries:
            name = PurePosixPath(item.filename.replace("\\", "/"))
            if name.is_absolute() or ".." in name.parts or ":" in str(name) or "\x00" in str(name):
                raise ValueError("Unsafe archive path")
            if (item.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError("Symlinks are not model data")
        original = json.loads(archive.read("model0.json"))

        def copy(source_name: str, target_name: str, kind: str) -> str:
            data = archive.read(source_name)
            if kind == "model" and not data.startswith(b"moc"):
                raise ValueError("Expected legacy Cubism moc data")
            if kind in ("expression", "physics"):
                definition = json.loads(data)
                expected_type = "Live2D Expression" if kind == "expression" else "Live2D Physics"
                if definition.get("type") != expected_type:
                    raise ValueError(f"Unexpected {kind} JSON")
            if kind == "motion" and not data.startswith(b"# Live2D Animator Motion Data"):
                raise ValueError("Unexpected motion format")
            if kind == "texture":
                with Image.open(io.BytesIO(data)) as image:
                    if image.format != "PNG" or image.size != (1024, 1024):
                        raise ValueError("Unexpected texture")
                    image.verify()
            target = (output / target_name).resolve()
            if not target.is_relative_to(output):
                raise ValueError("Output path escaped asset directory")
            target.write_bytes(data)
            records.append({"file": target_name, "sourceEntry": source_name, "kind": kind, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
            return target_name

        model = {"version": "Sample 1.0.0", "name": "Soyo", "model": copy(original["model"], "model.moc", "model")}
        model["textures"] = [copy(name, f"texture-{index}.png", "texture") for index, name in enumerate(original["textures"])]
        model["motions"] = {}
        motion_index = 0
        for group, motions in original["motions"].items():
            model["motions"][group] = []
            for motion in motions:
                model["motions"][group].append({"file": copy(motion["file"], f"motion-{motion_index:02}.mtn", "motion")})
                motion_index += 1
        model["expressions"] = []
        expression_names = {}
        for index, expression in enumerate(original["expressions"]):
            if expression["file"] == original["physics"]:
                continue
            name = expression["name"]
            expression_names[name] = expression_names.get(name, 0) + 1
            unique_name = name if expression_names[name] == 1 else f"{name}#{expression_names[name]}"
            filename = copy(expression["file"], f"expression-{index:02}.exp.json", "expression")
            model["expressions"].append({"name": unique_name, "file": filename})
        model["physics"] = copy(original["physics"], "physics.physics.json", "physics")
        model_data = (json.dumps(model, ensure_ascii=False, indent=2) + "\n").encode("utf8")
        (output / "model.json").write_bytes(model_data)
        records.append({"file": "model.json", "sourceEntry": "model0.json", "kind": "definition", "bytes": len(model_data), "sha256": hashlib.sha256(model_data).hexdigest(), "sourceBytes": len(archive.read("model0.json")), "sourceSha256": hashlib.sha256(archive.read("model0.json")).hexdigest()})
    manifest = {
        "archive": source.name, "archiveBytes": len(raw), "archiveSha256": ARCHIVE_SHA256,
        "sourceBytes": sum(item.file_size for item in entries), "assetBytes": sum(row["bytes"] for row in records),
        "format": "Cubism 2", "runtimeIncluded": False,
        "motionGroups": len(model["motions"]), "expressions": len(model["expressions"]),
        "changes": ["Stable ASCII local filenames", "Removed source controller and application settings", "Removed physics entry from expression list", "Appended #2 to duplicate expression names"],
        "files": records,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", nargs="?", type=Path, default=DEFAULT_ARCHIVE)
    result = prepare(parser.parse_args().archive)
    print(json.dumps({key: value for key, value in result.items() if key != "files"}, ensure_ascii=True, indent=2))
