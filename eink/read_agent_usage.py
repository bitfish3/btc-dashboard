#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read local Codex and Claude Code usage without touching prompts or secrets.

The upstream ``claude-eink-bridge`` reads a Claude HUD plugin snapshot.  This
module keeps the same useful data contract, but uses sources already present
on this Mac:

* Codex rollout JSONL: model, native rate limits, and token usage.
* Claude Code status-line snapshot (preferred), with a transcript tail as a
  deliberately incomplete fallback until the status-line hook has run once.

Only numeric usage, model names, and timestamps leave this module.  Paths,
prompts, tool arguments, credentials, and project names never enter the frame.
"""

from __future__ import annotations

import json
import math
import os
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


DEFAULT_STALE_SECONDS = 90 * 60
DEFAULT_CLAUDE_SNAPSHOT = Path.home() / ".cache" / "fuckbtc" / "claude-usage.json"


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _integer(value: Any) -> int | None:
    number = _number(value)
    return None if number is None else int(number)


def _model(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    # Model identifiers are safe to display, but keep the renderer bounded and
    # prevent an unexpected value from becoming a path/terminal escape.
    clean = re.sub(r"[^A-Za-z0-9._:-]+", "", value.strip())
    return clean[:28] or None


def _epoch(value: Any) -> int | None:
    number = _number(value)
    if number is not None:
        return int(number)
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        return int(datetime.fromisoformat(text).timestamp())
    except ValueError:
        return None


def _window(value: Any) -> dict[str, int | float | None]:
    if not isinstance(value, dict):
        return {"used_percent": None, "resets_at": None, "window_minutes": None}
    used = _number(value.get("used_percent"))
    if used is None:
        used = _number(value.get("used_percentage"))
    if used is None:
        used = _number(value.get("utilization"))
    reset = _epoch(value.get("resets_at"))
    return {
        "used_percent": max(0.0, min(100.0, used)) if used is not None else None,
        "resets_at": reset,
        "window_minutes": _integer(value.get("window_minutes")),
    }


def _token_dict(value: Any) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}
    result: dict[str, int] = {}
    for key in (
        "input_tokens",
        "output_tokens",
        "cached_input_tokens",
        "cache_read_input_tokens",
        "cache_write_input_tokens",
        "cache_creation_input_tokens",
        "reasoning_output_tokens",
        "total_tokens",
    ):
        number = _integer(value.get(key))
        if number is not None and number >= 0:
            result[key] = number
    return result


def _read_jsonl_window(path: Path, max_bytes: int = 2_000_000) -> Iterable[dict[str, Any]]:
    """Read the head and tail of a large JSONL file.

    Rollouts/transcripts can be hundreds of MB.  The usage records we need are
    repeated near the end, while the model metadata is near the beginning, so
    a bounded head+tail read is both fast and sufficient.
    """

    try:
        size = path.stat().st_size
        with path.open("rb") as stream:
            if size <= max_bytes * 2:
                data = stream.read()
            else:
                head = stream.read(max_bytes)
                stream.seek(-max_bytes, os.SEEK_END)
                tail = stream.read(max_bytes)
                data = head + b"\n" + tail
    except (OSError, ValueError):
        return
    for line in data.splitlines():
        try:
            row = json.loads(line.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
        if isinstance(row, dict):
            yield row


def _recent_paths(root: Path, pattern: str, limit: int = 12) -> list[Path]:
    paths: list[tuple[float, Path]] = []
    try:
        candidates = root.rglob(pattern)
    except OSError:
        return []
    for path in candidates:
        try:
            if path.is_file():
                paths.append((path.stat().st_mtime, path))
        except OSError:
            continue
    paths.sort(key=lambda item: item[0], reverse=True)
    return [path for _, path in paths[:limit]]


def _new_usage(name: str) -> dict[str, Any]:
    return {
        "name": name,
        "model": None,
        "context_percent": None,
        "context_window": None,
        "input_tokens": None,
        "output_tokens": None,
        "total_tokens": None,
        "cached_input_tokens": None,
        "last_input_tokens": None,
        "last_output_tokens": None,
        "last_total_tokens": None,
        "quotas": [],
        "updated_at": None,
        "source": "none",
        "stale": True,
    }


def _finish(usage: dict[str, Any], now: float, stale_seconds: int) -> dict[str, Any]:
    updated = _number(usage.get("updated_at"))
    usage["stale"] = updated is None or (now - updated) > stale_seconds
    return usage


def load_codex_usage(
    codex_home: str | Path | None = None,
    *,
    now: float | None = None,
    stale_seconds: int = DEFAULT_STALE_SECONDS,
) -> dict[str, Any]:
    """Return the newest local Codex usage snapshot."""

    now = time.time() if now is None else now
    root = Path(codex_home or os.environ.get("CODEX_HOME", Path.home() / ".codex")).expanduser()
    usage = _new_usage("CODEX")
    session_root = root / "sessions"
    paths = _recent_paths(session_root, "*.jsonl", limit=12)
    for path in paths:
        candidate = _new_usage("CODEX")
        try:
            candidate["updated_at"] = path.stat().st_mtime
        except OSError:
            continue
        for row in _read_jsonl_window(path):
            payload = row.get("payload")
            if not isinstance(payload, dict):
                continue
            if payload.get("model"):
                candidate["model"] = _model(payload.get("model"))
            info = payload.get("info")
            if isinstance(info, dict):
                context_window = _integer(info.get("model_context_window"))
                if context_window:
                    candidate["context_window"] = context_window
                total = _token_dict(info.get("total_token_usage"))
                last = _token_dict(info.get("last_token_usage"))
                if total:
                    candidate["input_tokens"] = total.get("input_tokens")
                    candidate["output_tokens"] = total.get("output_tokens")
                    candidate["total_tokens"] = total.get("total_tokens")
                    candidate["cached_input_tokens"] = total.get("cached_input_tokens")
                if last:
                    candidate["last_input_tokens"] = last.get("input_tokens")
                    candidate["last_output_tokens"] = last.get("output_tokens")
                    candidate["last_total_tokens"] = last.get("total_tokens")
            limits = payload.get("rate_limits")
            if isinstance(limits, dict):
                candidate["quotas"] = []
                for key, label in (("primary", "PRIMARY"), ("secondary", "SECONDARY")):
                    window = _window(limits.get(key))
                    if window["used_percent"] is not None or window["resets_at"] is not None:
                        window["label"] = label
                        candidate["quotas"].append(window)
        if candidate["model"] or candidate["quotas"] or candidate["total_tokens"]:
            candidate["source"] = "codex-rollout"
            usage = candidate
            break
    # Codex currently emits token totals but not a direct context percentage.
    # Do not turn cumulative session tokens into a false context percentage.
    return _finish(usage, now, stale_seconds)


def _snapshot_path(value: str | Path | None) -> Path:
    return Path(value or os.environ.get("CLAUDE_USAGE_SNAPSHOT", DEFAULT_CLAUDE_SNAPSHOT)).expanduser()


def _apply_claude_snapshot(usage: dict[str, Any], snapshot: dict[str, Any], updated: float) -> bool:
    context = snapshot.get("context")
    if not isinstance(context, dict):
        context = snapshot.get("context_window")
    if not isinstance(context, dict):
        context = {}
    usage["model"] = _model(snapshot.get("model"))
    usage["context_percent"] = _number(
        context.get("used_percentage", context.get("used_percent"))
    )
    usage["context_window"] = _integer(
        context.get("context_window_size", context.get("window_size"))
    )
    usage["input_tokens"] = _integer(context.get("total_input_tokens"))
    usage["output_tokens"] = _integer(context.get("total_output_tokens"))
    if usage["input_tokens"] is not None or usage["output_tokens"] is not None:
        usage["total_tokens"] = (usage["input_tokens"] or 0) + (usage["output_tokens"] or 0)
    limits = snapshot.get("rate_limits")
    if isinstance(limits, dict):
        usage["quotas"] = []
        for key, label in (("five_hour", "5H"), ("seven_day", "7D")):
            window = _window(limits.get(key))
            if window["used_percent"] is not None or window["resets_at"] is not None:
                window["label"] = label
                usage["quotas"].append(window)
    usage["updated_at"] = updated
    usage["source"] = "claude-statusline"
    return bool(usage["model"] or usage["total_tokens"] is not None or usage["context_percent"] is not None)


def _load_claude_transcript_fallback(root: Path, usage: dict[str, Any], now: float) -> None:
    for path in _recent_paths(root, "*.jsonl", limit=8):
        try:
            mtime = path.stat().st_mtime
        except OSError:
            continue
        model = None
        last_usage: dict[str, int] = {}
        last_timestamp: float | None = None
        for row in _read_jsonl_window(path, max_bytes=1_000_000):
            timestamp = _epoch(row.get("timestamp"))
            if timestamp:
                last_timestamp = timestamp
            message = row.get("message")
            if not isinstance(message, dict):
                continue
            if message.get("model"):
                model = _model(message.get("model"))
            parsed = _token_dict(message.get("usage"))
            if parsed:
                last_usage = parsed
        if model or last_usage:
            usage["model"] = model
            usage["last_input_tokens"] = last_usage.get("input_tokens")
            usage["last_output_tokens"] = last_usage.get("output_tokens")
            usage["last_total_tokens"] = (last_usage.get("input_tokens") or 0) + (last_usage.get("output_tokens") or 0)
            usage["cached_input_tokens"] = last_usage.get("cache_read_input_tokens")
            usage["updated_at"] = last_timestamp or mtime
            usage["source"] = "claude-transcript-tail"
            return


def load_claude_usage(
    claude_home: str | Path | None = None,
    *,
    snapshot: str | Path | None = None,
    now: float | None = None,
    stale_seconds: int = DEFAULT_STALE_SECONDS,
) -> dict[str, Any]:
    """Return the native Claude status-line snapshot, then a safe fallback."""

    now = time.time() if now is None else now
    root = Path(claude_home or os.environ.get("CLAUDE_CONFIG_DIR", Path.home() / ".claude")).expanduser()
    usage = _new_usage("CLAUDE CODE")
    snapshot_path = _snapshot_path(snapshot)
    try:
        snapshot_data = json.loads(snapshot_path.read_text(encoding="utf-8"))
        snapshot_mtime = snapshot_path.stat().st_mtime
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        snapshot_data = None
        snapshot_mtime = 0.0
    if isinstance(snapshot_data, dict) and _apply_claude_snapshot(usage, snapshot_data, snapshot_mtime):
        return _finish(usage, now, stale_seconds)
    _load_claude_transcript_fallback(root / "projects", usage, now)
    return _finish(usage, now, stale_seconds)


def load_all_usage(*, now: float | None = None) -> dict[str, dict[str, Any]]:
    now = time.time() if now is None else now
    return {
        "codex": load_codex_usage(now=now),
        "claude": load_claude_usage(now=now),
    }


if __name__ == "__main__":
    print(json.dumps(load_all_usage(), ensure_ascii=False, sort_keys=True))
