"""Build the optional data-only Cubism 2 wardrobe, from pinned local Git trees.

No source JavaScript is executed. References are flattened and content-addressed;
all distinct complete costumes are retained. Run with --mygo and --ave checkouts.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PINS = {"mygo": "ff1072895d1ea52ed39271a1ed982d305a9188a6", "ave": "5da138eee99d87854181e78cc75fd9394894b5dc"}
PEOPLE = {"036": "tomori", "037": "anon", "038": "raana", "039": "soyo", "040": "taki",
          "035": "sakiko", "024": "mutsumi", "045": "uika", "046": "umiri", "026": "nyamu"}
NAMES = dict(zip(PEOPLE.values(), ["高松灯", "千早爱音", "要乐奈", "长崎素世", "椎名立希",
                                   "丰川祥子", "若叶睦", "三角初华", "八幡海铃", "祐天寺若麦"]))


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encode(value) -> bytes:
    return (json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")) + "\n").encode()


def prepare(mygo: Path, ave: Path, output: Path):
    payloads = {}
    models = []
    audit = []
    seen = {}
    reviewed = {}
    for row in (ROOT / "integration/live2d-ensemble/appearance-review.txt").read_text(encoding="utf-8").splitlines():
        model_id, label, description, tags = row.split('|')
        reviewed[model_id] = {"label": label, "description": description, "tags": tags.split(',')}
    core = ROOT / "assets/live2d-soyo"
    core_model = json.loads((core / "model.json").read_text(encoding="utf-8"))
    core_signature = [digest((core / name).read_bytes()) for name in [core_model["model"], *core_model["textures"]]]

    def add(data, mime):
        sha = digest(data)
        if sha in payloads and payloads[sha][1] != mime:
            raise ValueError("Conflicting asset MIME")
        payloads[sha] = (data, mime)
        return sha

    for key, repository in [("mygo", mygo.resolve()), ("ave", ave.resolve())]:
        actual = subprocess.check_output(["git", "-C", str(repository), "rev-parse", "HEAD"], text=True).strip()
        if actual != PINS[key]:
            raise ValueError(f"Expected pinned {key} revision {PINS[key]}, got {actual}")
        tree = repository / "assets/model"
        subprocess.run(["git", "-C", str(repository), "diff", "--exit-code", "HEAD", "--", "assets/model"], check=True, stdout=subprocess.DEVNULL)
        # Use Git's unquoted paths for non-ASCII MyGO directory names.
        tracked = set(subprocess.check_output(["git", "-C", str(repository), "ls-tree", "-rz", "--name-only", "HEAD", "assets/model"]).decode("utf-8").split("\0"))
        for folder in sorted(tree.iterdir()):
            if not folder.is_dir():
                continue
            person = PEOPLE.get(folder.name[:3])
            entry = {"repository": key, "directory": folder.name}
            if not person:
                audit.append({**entry, "status": "outside-ten-people"})
                continue
            index = folder / "index.json"
            if not index.is_file():
                audit.append({**entry, "status": "shared-resources-only"})
                continue
            if index.relative_to(repository).as_posix() not in tracked:
                raise ValueError(f"Untracked model index: {index}")
            config = json.loads(index.read_text(encoding="utf-8"))
            files = {}
            references = {}
            unavailable = []

            def source(ref):
                if not isinstance(ref, str) or not ref or "\\" in ref or ":" in ref or "\0" in ref:
                    raise ValueError(f"Invalid reference: {ref}")
                target = (folder / ref).resolve()
                if not target.is_relative_to(tree) or target.relative_to(repository).as_posix() not in tracked:
                    raise ValueError(f"Reference outside pinned source tree: {ref}")
                if target.stat().st_size > 16_000_000:
                    raise ValueError("Oversized model resource")
                return target.read_bytes()

            def resource(ref, kind):
                data = source(ref)
                if kind == "moc" and not data.startswith(b"moc\x0b"):
                    raise ValueError("Not the supported Cubism 2 moc version")
                if kind == "png" and not data.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("Invalid texture")
                if kind.endswith("json"):
                    json.loads(data)
                mime = "image/png" if kind == "png" else "application/json" if kind.endswith("json") else "application/octet-stream"
                sha = add(data, mime)
                name = sha + "." + kind
                files[name] = {"sha256": sha, "bytes": len(data), "mime": mime}
                references[ref] = name
                return name

            try:
                definition = {"model": resource(config["model"], "moc"),
                              "textures": [resource(ref, "png") for ref in config["textures"]],
                              "motions": {}, "expressions": []}
                if not definition["textures"]:
                    raise ValueError("No textures")
                if config.get("physics"):
                    definition["physics"] = resource(config["physics"], "physics.json")
                # Only data required by Cubism is copied, never custom JS/sounds/URLs.
                for group, motions in config.get("motions", {}).items():
                    definition["motions"][group] = [{"file": resource(m["file"], "mtn")} for m in motions]
                for expression in config.get("expressions", []):
                    try:
                        definition['expressions'].append({'name': expression['name'], 'file': resource(expression['file'], 'exp.json')})
                    except (ValueError, OSError) as error:
                        # A dangling optional expression does not invalidate a
                        # distinct moc/texture outfit. Runtime falls back only
                        # to expressions that actually exist for this person.
                        unavailable.append({'expression': expression['name'], 'file': expression['file'], 'reason': str(error)})
                if isinstance(config.get("layout"), dict):
                    definition["layout"] = {k: v for k, v in config["layout"].items() if k in ("center_x", "center_y", "width", "height", "x", "y") and isinstance(v, (int, float))}
            except (KeyError, ValueError, OSError) as error:
                audit.append({**entry, "status": "incomplete", "reason": str(error)})
                continue
            model_id = re.match(r"[A-Za-z0-9_-]+", folder.name).group().rstrip("_")
            signature = [files[name]["sha256"] for name in [definition["model"], *definition["textures"]]]
            fingerprint = person + ":" + ":".join(signature)
            if fingerprint in seen:
                audit.append({**entry, "status": "duplicate-appearance", "sameAs": seen[fingerprint]})
                continue
            seen[fingerprint] = model_id
            metadata = reviewed.get(model_id)
            if not metadata:
                raise ValueError(f"Missing reviewed clothing metadata: {model_id}")
            # This exact moc and reviewed winter uniform are already bundled;
            # the existing optimized textures are intentionally kept unchanged.
            bundled = model_id == '039_school_winter-2023' and signature[0] == core_signature[0]
            definition_sha = None if bundled else add(encode({"definition": definition, "files": files}), "application/json")
            models.append({"id": model_id, "person": person, "label": metadata["label"],
                           "description": metadata.get("description", ""), "tags": metadata["tags"],
                           "definitionSha": definition_sha, "bundledSoyo": bundled})
            audit.append({**entry, "id": model_id, "person": person, "status": "bundled-soyo" if bundled else "included",
                          "references": references, "definitionSha": definition_sha, "unavailableExpressions": unavailable})
    used = set()
    for model in models:
        if model["bundledSoyo"]:
            continue
        used.add(model["definitionSha"])
        spec = json.loads(payloads[model["definitionSha"]][0])
        used.update(row["sha256"] for row in spec["files"].values())
    entries = [{"path": "assets/" + sha, "sha256": sha, "bytes": len(payloads[sha][0]), "mime": payloads[sha][1]} for sha in sorted(used)]
    counts = dict(sorted(Counter(model["person"] for model in models).items()))
    if set(counts) != set(PEOPLE.values()):
        raise ValueError("Pack must cover all ten people")
    manifest = {"schema": "unread-city-live2d-v1", "assets": entries, "models": models}
    manifest_bytes = encode(manifest)
    output.mkdir(parents=True, exist_ok=True)
    archive = output / "unread-city-live2d.zip"
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9, allowZip64=False) as package:
        for name, data in [("manifest.json", manifest_bytes)] + [(row["path"], payloads[row["sha256"]][0]) for row in entries]:
            info = zipfile.ZipInfo(name, (2026, 11, 9, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            package.writestr(info, data, compresslevel=9)
    descriptor = {"sha": digest(manifest_bytes), "entries": len(entries), "manifestBytes": len(manifest_bytes),
                  "maxZipBytes": archive.stat().st_size + 1024, "maxEntryBytes": max(row["bytes"] for row in entries),
                  "unpackedBytes": sum(row["bytes"] for row in entries), "counts": counts}
    (output / "pack.json").write_bytes(encode(descriptor))
    (output / "manifest.json").write_bytes(manifest_bytes)
    report = {"sources": PINS, "counts": counts, "models": len(models), "zipBytes": archive.stat().st_size,
              "zipSha256": digest(archive.read_bytes()), "unpackedBytes": descriptor["unpackedBytes"],
              "readmeClaims": {"mygo": 74, "ave": 46}, "inventory": audit}
    (ROOT / "integration/live2d-ensemble/inventory.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "inventory"}, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mygo", type=Path, required=True)
    parser.add_argument("--ave", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT / "assets/live2d-ensemble")
    args = parser.parse_args()
    prepare(args.mygo, args.ave, args.output)
