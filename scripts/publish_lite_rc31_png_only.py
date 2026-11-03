#!/usr/bin/env python3
"""Locally patch the released Tauri PNG and publish a PNG-only GitHub release.

Requires Python 3.9+, GitHub CLI, and an authorized GH_TOKEN or gh login.
Never invokes GitHub Actions, CI, npm, or a build workflow.
"""
from __future__ import annotations

import base64
import copy
import hashlib
import json
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

REPO = "Zis30axs/Rise-6.9.5-Pro"
SOURCE_TAG = "lite-v0.3.0-rc1"
TARGET_TAG = "lite-v0.3.0-rc3.1"
TARGET_COMMIT = "ee7e4d0e62def8cf500fbcbef1d32f54c32cf66d"
SCRIPT_ID = "9d9bc6da-0c08-4d1f-8d18-451c4de6e295"
FILENAME = "unread-city-lite-v0.3.0-rc3.1-tauri.png"
SIG = b"\x89PNG\r\n\x1a\n"


def run(*args: str) -> subprocess.CompletedProcess[str]:
    print("$", " ".join(args), flush=True)
    return subprocess.run(list(args), text=True, check=True)


def chunks(data: bytes):
    if not data.startswith(SIG):
        raise ValueError("Not a PNG")
    position = len(SIG)
    seen_end = False
    while position < len(data):
        if position + 12 > len(data):
            raise ValueError("Truncated PNG chunk")
        length = struct.unpack_from(">I", data, position)[0]
        end = position + length + 12
        if end > len(data):
            raise ValueError("Truncated PNG payload")
        kind = data[position + 4:position + 8]
        payload = data[position + 8:end - 4]
        crc = struct.unpack_from(">I", data, end - 4)[0]
        if (zlib.crc32(kind + payload) & 0xFFFFFFFF) != crc:
            raise ValueError(f"Bad PNG CRC: {kind!r}")
        yield kind, payload, data[position:end]
        position = end
        if kind == b"IEND":
            seen_end = True
            break
    if not seen_end or position != len(data):
        raise ValueError("Invalid PNG ending")


def make_chunk(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)


def decode_card(data: bytes) -> tuple[dict, int, bytes]:
    options = []
    all_chunks = list(chunks(data))
    for i, (kind, payload, _) in enumerate(all_chunks):
        if kind not in (b"zTXt", b"tEXt") or not payload.startswith(b"chara\0"):
            continue
        if kind == b"zTXt":
            if not payload.startswith(b"chara\0\0"):
                raise ValueError("Unrecognized compressed chara encoding")
            encoded = zlib.decompress(payload[7:])
        else:
            encoded = payload[6:]
        card = json.loads(base64.b64decode(encoded, validate=True).decode("utf-8"))
        options.append((card, i, kind))
    if len(options) != 1:
        raise ValueError(f"Expected one chara chunk, found {len(options)}")
    card, index, kind = options[0]
    if card.get("spec") != "chara_card_v2":
        raise ValueError("Not a V2 character card")
    return card, index, kind


def patch_script(script: str) -> str:
    start = "  button.addEventListener('click', async () => {\n"
    end = "  input.addEventListener('change', async () => {\n"
    init_start = "async function __uc_lite_init__() {\n"
    init_end = "  __ucPackButton(__UC_CORE_PACK__, installed);\n"
    fetch_call = "fetch('/unread-city-lite-assets.zip')"
    if any(script.count(s) != 1 for s in (start, end, init_start, init_end)):
        raise ValueError("Source RC layout differs; refusing to modify an unknown script")
    if script.count(fetch_call) != 2:
        raise ValueError("Expected exactly two automatic ZIP fetches")
    a = script.index(start)
    b = script.index(end, a)
    click_block = script[a:b]
    if click_block.count(fetch_call) != 1 or "input.click();" not in click_block:
        raise ValueError("Unexpected click handler")
    script = script[:a] + "  button.addEventListener('click', () => input.click());\n" + script[b:]
    a = script.index(init_start)
    b = script.index(init_end, a)
    init_block = script[a:b]
    if init_block.count(fetch_call) != 1 or "await __ucPackHydrate(__UC_CORE_PACK__)" not in init_block:
        raise ValueError("Unexpected initialization routine")
    script = script[:a] + (
        "async function __uc_lite_init__() {\n"
        "  const installed = await __ucPackHydrate(__UC_CORE_PACK__);\n"
    ) + script[b:]
    if fetch_call in script or "  button.addEventListener('click', () => input.click());" not in script:
        raise ValueError("Post-patch check failed")
    return script


def patch_png(original: bytes) -> bytes:
    before, index, metadata_type = decode_card(original)
    after = copy.deepcopy(before)
    scripts = after["data"]["extensions"]["tavern_helper"]["scripts"]
    matches = [entry for entry in scripts if isinstance(entry, dict) and entry.get("id") == SCRIPT_ID]
    if len(matches) != 1:
        raise ValueError("Expected exactly one Unread City script")
    old_script = matches[0]["content"]
    matches[0]["content"] = patch_script(old_script)

    # Verify that all character fields except this exact script are unchanged.
    expected = copy.deepcopy(after)
    next(x for x in expected["data"]["extensions"]["tavern_helper"]["scripts"] if x.get("id") == SCRIPT_ID)["content"] = old_script
    if expected != before:
        raise ValueError("Unrelated character fields changed")

    encoded = base64.b64encode(json.dumps(after, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    if metadata_type == b"zTXt":
        replacement = make_chunk(b"zTXt", b"chara\0\0" + zlib.compress(encoded, level=9))
    else:
        replacement = make_chunk(b"tEXt", b"chara\0" + encoded)
    old_chunks = list(chunks(original))
    result = SIG + b"".join(replacement if i == index else row[2] for i, row in enumerate(old_chunks))
    checked, replaced_index, _ = decode_card(result)
    if checked != after or replaced_index != index:
        raise ValueError("Output does not round-trip")
    new_chunks = list(chunks(result))
    if len(new_chunks) != len(old_chunks) or any(
        old[2] != new[2] for i, (old, new) in enumerate(zip(old_chunks, new_chunks)) if i != index
    ):
        raise ValueError("A non-character PNG chunk changed")
    if len(result) >= 25_000_000:
        raise ValueError(f"Patched Tauri PNG exceeds Lite's 25 MB threshold: {len(result)}")
    return result


def main() -> None:
    if shutil.which("gh") is None:
        raise SystemExit("GitHub CLI (gh) not installed. Install it and run: gh auth login")
    destination = Path.cwd() / FILENAME
    if destination.exists():
        raise SystemExit(f"Refusing to overwrite: {destination}")
    run("gh", "auth", "status")
    if subprocess.run(["gh", "release", "view", TARGET_TAG, "--repo", REPO],
                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        raise SystemExit(f"Release {TARGET_TAG} already exists; refusing to overwrite")
    with tempfile.TemporaryDirectory(prefix="lite-rc31-") as td:
        folder = Path(td)
        run("gh", "release", "download", SOURCE_TAG, "--repo", REPO,
            "--pattern", "*-tauri.png", "--dir", str(folder))
        found = list(folder.glob("*-tauri.png"))
        if len(found) != 1:
            raise ValueError(f"Expected one Tauri PNG in {SOURCE_TAG}, found {len(found)}")
        raw = found[0].read_bytes()
        result = patch_png(raw)
        destination.write_bytes(result)
        digest = hashlib.sha256(result).hexdigest()
        print(f"Generated {destination.name}: {len(result):,} bytes, SHA-256 {digest}")
        notes = folder / "release-notes.md"
        notes.write_text(
            "# Lite v0.3.0 RC3.1 - Manual ZIP picker fix\n\n"
            "This release attaches **only the TauriTavern PNG**. It is a targeted patch "
            "of the v0.3.0-rc1 PNG, not a full rebuild of later source changes.\n\n"
            "- Restores the click-to-open native ZIP picker immediately.\n"
            "- Removes both unsolicited automatic asset ZIP fetches.\n"
            "- Preserves the character's other fields, existing offline-asset manifest, "
            "and all other PNG chunks.\n"
            "- If you need to install assets, use the **v0.3.0-rc1 matching asset ZIP** "
            "from that earlier release. It is intentionally not reuploaded here.\n"
            "- Published through a one-time GitHub Actions release job; physical iOS testing remains pending.\n\n"
            f"**Patched PNG SHA-256:** `{digest}`\n"
            f"**Base release:** `{SOURCE_TAG}`; **tracked fix commit:** `{TARGET_COMMIT}`.\n",
            encoding="utf-8",
        )
        run("gh", "release", "create", TARGET_TAG, str(destination),
            "--repo", REPO, "--target", TARGET_COMMIT, "--prerelease",
            "--title", "Unread City Lite v0.3.0 RC3.1 (manual ZIP picker)",
            "--notes-file", str(notes))
        print(f"Published: https://github.com/{REPO}/releases/tag/{TARGET_TAG}")


if __name__ == "__main__":
    try:
        main()
    except (subprocess.CalledProcessError, OSError, ValueError, KeyError, TypeError) as exc:
        raise SystemExit(f"FAILED (release not confirmed): {exc}")