#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Claude Code status-line adapter for the local page-2 Agent HUD.

Claude Code sends a JSON status object on stdin.  We keep a tiny sanitized
snapshot in ``~/.cache/fuckbtc`` for the renderer and print a compact status
line back to Claude Code.  No credentials, paths, prompts, or tool arguments
are copied to the snapshot.
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Any


DEFAULT_OUTPUT = Path.home() / ".cache" / "fuckbtc" / "claude-usage.json"


def _num(value: Any) -> int | float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    return None


def _epoch(value: Any) -> int | None:
    number = _num(value)
    if number is not None:
        return int(number)
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return int(datetime.fromisoformat(value.strip().replace("Z", "+00:00")).timestamp())
    except ValueError:
        return None


def _model(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    clean = re.sub(r"[^A-Za-z0-9._:-]+", "", value.strip())
    return clean[:28] or None


def _window(value: Any) -> dict[str, int | float | None]:
    if not isinstance(value, dict):
        return {}
    used = value.get("used_percentage")
    if used is None:
        used = value.get("used_percent", value.get("utilization"))
    reset = value.get("resets_at")
    return {
        "used_percent": _num(used),
        "resets_at": _epoch(reset),
    }


def build_snapshot(data: dict[str, Any], now: float | None = None) -> dict[str, Any]:
    now = time.time() if now is None else now
    context = data.get("context_window")
    if not isinstance(context, dict):
        context = {}
    limits = data.get("rate_limits")
    if not isinstance(limits, dict):
        limits = {}
    return {
        "updated_at": now,
        "model": _model((data.get("model") or {}).get("display_name") if isinstance(data.get("model"), dict) else data.get("model")),
        "context": {
            "used_percentage": _num(context.get("used_percentage")),
            "window_size": _num(context.get("context_window_size")),
            "total_input_tokens": _num(context.get("total_input_tokens")),
            "total_output_tokens": _num(context.get("total_output_tokens")),
        },
        "rate_limits": {
            "five_hour": _window(limits.get("five_hour")),
            "seven_day": _window(limits.get("seven_day")),
        },
    }


def write_snapshot(snapshot: dict[str, Any], output: str | Path | None = None) -> Path:
    path = Path(output or os.environ.get("CLAUDE_USAGE_SNAPSHOT", DEFAULT_OUTPUT)).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(snapshot, stream, ensure_ascii=False, separators=(",", ":"))
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
    finally:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
    return path


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return 0
    if not isinstance(data, dict):
        return 0
    snapshot = build_snapshot(data)
    write_snapshot(snapshot)
    model = snapshot.get("model") or "claude"
    pct = snapshot["context"].get("used_percentage")
    ctx = "—" if pct is None else f"{float(pct):.0f}%"
    print(f"AGENT HUD  {model}  ctx {ctx}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
