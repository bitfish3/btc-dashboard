#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render and publish page 2, with content-change deduplication."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

from render_agent_hud import render
from push_note4 import push_image, resolve_device_id


DEFAULT_STATE = Path.home() / ".cache" / "fuckbtc" / "agent-hud-signature.json"
PAGE_ID = "2"


def _signature(usage: dict) -> str:
    # Timestamps and source labels are intentionally omitted: a new status-line
    # tick with identical numbers should not cause another e-ink refresh.
    stable = {}
    for key, value in sorted(usage.items()):
        if not isinstance(value, dict):
            continue
        stable[key] = {
            field: value.get(field)
            for field in (
                "model",
                "context_percent",
                "context_window",
                "input_tokens",
                "output_tokens",
                "total_tokens",
                "last_input_tokens",
                "last_output_tokens",
                "last_total_tokens",
                "cached_input_tokens",
                "quotas",
                "stale",
            )
        }
    encoded = json.dumps(stable, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _load_state(path: Path) -> str | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return value.get("signature") if isinstance(value, dict) else None


def _save_state(path: Path, signature: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"signature": signature}, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--device-id", default=os.environ.get("ZECTRIX_DEVICE_ID"))
    parser.add_argument("--out", default="/tmp/fuckbtc-note4-agent-hud.png")
    parser.add_argument("--state", default=str(DEFAULT_STATE))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--watch-cycle", action="store_true", help="return 75 so vibe watch re-arms after this cycle")
    args = parser.parse_args()

    usage = render(args.out)
    signature = _signature(usage)
    state_path = Path(args.state).expanduser()
    if not args.dry_run and _load_state(state_path) == signature:
        print("[note4-hud] unchanged; skip page=2 push")
        return 75 if args.watch_cycle else 0
    if args.dry_run:
        print(f"[note4-hud] dry-run page=2 signature={signature[:12]}")
        return 0

    api_key = os.environ.get("ZECTRIX_API_KEY", "").strip()
    if not api_key:
        message = "缺少 ZECTRIX_API_KEY；请通过 Avibe Vault 注入，不要写入脚本或 plist"
        print(f"[note4-hud] {message}", file=sys.stderr)
        return 75 if args.watch_cycle else 2
    try:
        device_id = resolve_device_id(api_key, args.device_id)
        payload = push_image(api_key, device_id, Path(args.out), PAGE_ID)
    except Exception as exc:
        print(f"[note4-hud] push failed: {exc}", file=sys.stderr)
        return 75 if args.watch_cycle else 1
    _save_state(state_path, signature)
    data = payload.get("data") or {}
    print(f"[note4-hud] pushed page={data.get('pageId', PAGE_ID)} signature={signature[:12]}")
    return 75 if args.watch_cycle else 0


if __name__ == "__main__":
    raise SystemExit(main())
