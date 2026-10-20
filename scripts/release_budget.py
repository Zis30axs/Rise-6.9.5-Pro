"""Strict decimal-50-MB release gate; this module performs no file writes."""
from __future__ import annotations

from card_codec import CardError

TAURI_RELEASE_LIMIT_BYTES = 50_000_000


def check_tauri_release_size(size: int) -> dict:
    """Check the COMPLETE encoded PNG, not the script or compressed metadata."""
    if type(size) is not int or size <= 0:
        raise CardError("Tauri 发行文件大小必须是正整数字节数")
    if size >= TAURI_RELEASE_LIMIT_BYTES:
        raise CardError(
            f"Tauri 专用 PNG 为 {size:,} 字节；发行要求严格小于 "
            f"{TAURI_RELEASE_LIMIT_BYTES:,} 字节（十进制 50 MB）。未写入新产物。"
        )
    return {
        "releaseLimitBytesExclusive": TAURI_RELEASE_LIMIT_BYTES,
        "releaseSizePassed": True,
        "remainingBytesBeforeLimit": TAURI_RELEASE_LIMIT_BYTES - size,
    }
