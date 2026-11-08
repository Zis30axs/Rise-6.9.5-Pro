"""Check the delivered cards, tested bundle and supplied airport images."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from build_card import IMMERSIVE_SCRIPT_ID
from build_tauri_import_card import compress_card_metadata
from card_codec import extract_card

OUTPUT = Path(__file__).resolve().parent
RELEASE = OUTPUT / "release"


def digest(data):
    return hashlib.sha256(data).hexdigest()


script = (RELEASE / "immersive-shell-lite.js").read_bytes()
assert script == (OUTPUT / "build/immersive-shell-lite.js").read_bytes()
archive = (RELEASE / "unread-city-lite-assets.zip").read_bytes()
assert archive == (OUTPUT / "build/unread-city-lite-assets.zip").read_bytes()
canonical = (RELEASE / "unread-city-lite.png").read_bytes()
card = extract_card(canonical)
own = [row for row in card["data"]["extensions"]["tavern_helper"]["scripts"] if row["id"] == IMMERSIVE_SCRIPT_ID]
# build_card.read_frontend_bundle uses read_text's universal newline conversion.
assert len(own) == 1 and own[0]["content"] == (RELEASE / "immersive-shell-lite.js").read_text(encoding="utf-8")
compressed, metadata_report = compress_card_metadata(canonical)
assert compressed == (RELEASE / "unread-city-lite-tauri.png").read_bytes()
provenance = json.loads((ROOT / "assets/backgrounds/haneda-airport-source.json").read_text(encoding="utf-8"))
with zipfile.ZipFile(RELEASE / "unread-city-lite-assets.zip") as package:
    manifest = json.loads(package.read("manifest.json"))
    for phase, row in provenance["images"].items():
        derived = row["derived"]
        entries = [entry for entry in manifest["assets"] if entry["sha256"] == derived["sha256"]]
        assert len(entries) == 1 and entries[0]["mime"] == "image/webp"
        binary = package.read(entries[0]["path"])
        assert binary == (ROOT / derived["file"]).read_bytes()
        assert digest(binary) == derived["sha256"] and len(binary) == derived["bytes"]

files = {}
for name in ["immersive-shell-lite.js", "unread-city-lite.png", "unread-city-lite-tauri.png", "unread-city-lite-assets.zip"]:
    data = (RELEASE / name).read_bytes()
    files[name] = {"bytes": len(data), "sha256": digest(data)}
report = {
    "startedOn": "2026-11-08", "completedOn": "2026-11-09", "timezone": "Asia/Shanghai",
    "status": "airport-backgrounds-verified-locally-not-installed",
    "selection": provenance["selection"],
    "images": {"count": 3, "size": [1672, 941], "lossless": True,
               "pixelIdentical": True, "totalBytes": sum(row["derived"]["bytes"] for row in provenance["images"].values())},
    "checks": {
        "backgroundAndAirportUnitTests": {"files": 6, "passed": 17, "failed": 0},
        "extendedRun": {"files": 7, "passed": 22, "failed": 1, "report": "vitest-results.json"},
        "noJapaneseText": {"passed": 1, "report": "no-japanese-results.json"},
        "typecheck": {"command": "node node_modules/vue-tsc/bin/vue-tsc.js --noEmit", "exitCode": 0},
        "productionBuild": {"exitCode": 0, "directory": "build"},
        "browser": {"report": "playwright-results.json", "passed": 4, "failed": 0,
                    "viewports": [[1440, 900], [1280, 800], [390, 844], [320, 568]],
                    "phasesPerViewport": ["day", "dusk", "night"], "screenshotsReviewed": 12,
                    "actualLoadedImageDigestsMatch": True, "horizontalOverflow": False,
                    "gameClockUnchanged": True, "generationCount": 0},
        "releaseMatchesTestedBundleAndZip": True, "cardContainsTestedScript": True,
        "cardScriptNormalization": "Only the existing build_card universal newline conversion; all other text is identical.",
        "airportImagesInOfflineZip": True, "tauriMetadataVerification": metadata_report,
    },
    "unrelatedFailure": {
        "test": "tests/fengjin-clinic.test.ts:149",
        "error": "国策时钟与权威时间不同步",
        "baseline": "The same test fails with HEAD:src/frontend/novel-backgrounds.ts loaded instead of the changed selector. Clinic test, model, protagonist-world and strategy-world files match HEAD.",
        "baselineReport": "clinic-baseline-results.json",
        "testFixtureFinding": "setTestClock updates backgroundLife.cursor but does not update the strategy cursor.",
        "fixedInThisTask": False,
    },
    "scope": {"agentEditionRun": False, "ciRun": False, "realModelTested": False,
              "fullTavernTested": False, "physicalTauriTavernTested": False,
              "installed": False, "committed": False, "pushed": False},
    "visualLimit": "At 320x568 the existing top controls overlap part of the portrait. Background fitting is correct; portrait layout was not changed.",
    "artifacts": files,
}
(OUTPUT / "verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": report["status"], "artifacts": files}, indent=2))
