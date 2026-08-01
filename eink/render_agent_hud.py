#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render page 2: a clean, native 1-bit Agent HUD for NOTE4."""

from __future__ import annotations

import argparse
import math
import time
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from read_agent_usage import load_all_usage


W_DEFAULT, H_DEFAULT = 400, 300
SCALE_DEFAULT = 3
FONT_REGULAR_PATHS = (
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
)
FONT_BOLD_PATHS = (
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
)


def font(size: int, bold: bool = False):
    for path in FONT_BOLD_PATHS if bold else FONT_REGULAR_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _width(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> float:
    return draw.textlength(text, font=fnt)


def _compact(value: int | float | None) -> str:
    if value is None:
        return "—"
    number = float(value)
    if number >= 1_000_000_000:
        return f"{number / 1_000_000_000:.1f}B"
    if number >= 1_000_000:
        return f"{number / 1_000_000:.1f}M"
    if number >= 1_000:
        return f"{number / 1_000:.1f}K"
    return str(int(number))


def _percent(value: float | int | None) -> str:
    return "—" if value is None else f"{max(0, min(100, float(value))):.0f}%"


def _reset(value: int | float | None, now: float) -> str:
    if value is None:
        return ""
    try:
        stamp = datetime.fromtimestamp(float(value)).strftime("%m-%d %H:%M")
    except (TypeError, ValueError, OSError):
        return ""
    if float(value) <= now:
        return "now"
    return stamp


def _draw_bar(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, value: float | None, scale: int) -> None:
    height = 8 * scale
    draw.rectangle((x, y, x + width, y + height), outline=0, width=max(1, scale))
    if value is not None:
        fill = max(0, min(width - 2 * scale, int((width - 2 * scale) * value / 100)))
        if fill:
            draw.rectangle((x + scale, y + scale, x + scale + fill, y + height - scale), fill=0)


def _draw_quota(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    width: int,
    quota: dict,
    scale: int,
    now: float,
) -> None:
    label = str(quota.get("label") or "QUOTA")
    if label == "PRIMARY":
        minutes = quota.get("window_minutes")
        label = "7D" if minutes and int(minutes) >= 24 * 60 else "5H"
    elif label == "SECONDARY":
        label = "2D"
    used = quota.get("used_percent")
    f_label = font(11 * scale, bold=True)
    f_value = font(12 * scale, bold=True)
    draw.text((x, y), label, font=f_label, fill=0)
    value_text = _percent(used)
    draw.text((x + width - _width(draw, value_text, f_value), y), value_text, font=f_value, fill=0)
    _draw_bar(draw, x, y + 16 * scale, width, used, scale)
    reset = _reset(quota.get("resets_at"), now)
    if reset:
        f_reset = font(9 * scale)
        draw.text((x, y + 29 * scale), f"RST {reset}", font=f_reset, fill=0)


def _draw_card(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    width: int,
    height: int,
    usage: dict,
    scale: int,
    now: float,
) -> None:
    draw.rounded_rectangle((x, y, x + width, y + height), radius=8 * scale, outline=0, width=2 * scale)
    # A solid top rule keeps the two cards legible on a 1-bit panel without
    # resorting to the dotted dithering that made the previous upload muddy.
    draw.rectangle((x + 10 * scale, y + 10 * scale, x + width - 10 * scale, y + 15 * scale), fill=0)
    title = str(usage.get("name") or "AGENT")
    f_title = font(15 * scale, bold=True)
    draw.text((x + 12 * scale, y + 20 * scale), title, font=f_title, fill=0)
    model = str(usage.get("model") or "—")[:20]
    f_model = font(11 * scale, bold=True)
    draw.text((x + 12 * scale, y + 43 * scale), model, font=f_model, fill=0)

    # Context: exact native value when a Claude status-line snapshot provides
    # it. Codex currently exposes the window size but not a direct percentage;
    # showing an em dash is more honest than turning cumulative tokens into a
    # fake context gauge.
    f_label = font(10 * scale, bold=True)
    f_value = font(13 * scale, bold=True)
    ctx_label = "CTX"
    ctx_max = _compact(usage.get("context_window"))
    ctx_pct = _percent(usage.get("context_percent"))
    ctx_text = f"{ctx_pct}/{ctx_max}" if ctx_max != "—" else ctx_pct
    draw.text((x + 12 * scale, y + 67 * scale), ctx_label, font=f_label, fill=0)
    draw.text((x + width - 12 * scale - _width(draw, ctx_text, f_value), y + 64 * scale), ctx_text, font=f_value, fill=0)
    _draw_bar(draw, x + 12 * scale, y + 84 * scale, width - 24 * scale, usage.get("context_percent"), scale)

    total = usage.get("total_tokens")
    if total is None:
        total = usage.get("last_total_tokens")
    f_tokens = font(12 * scale, bold=True)
    draw.text((x + 12 * scale, y + 102 * scale), f"TOK {_compact(total)}", font=f_tokens, fill=0)
    f_io = font(9 * scale)
    io_text = f"IN {_compact(usage.get('input_tokens') or usage.get('last_input_tokens'))}  OUT {_compact(usage.get('output_tokens') or usage.get('last_output_tokens'))}"
    draw.text((x + 12 * scale, y + 121 * scale), io_text, font=f_io, fill=0)

    quotas = usage.get("quotas") or []
    quota_y = y + 143 * scale
    quota_width = (width - 28 * scale) // 2
    if len(quotas) >= 2:
        _draw_quota(draw, x + 12 * scale, quota_y, quota_width, quotas[0], scale, now)
        _draw_quota(draw, x + 16 * scale + quota_width, quota_y, quota_width, quotas[1], scale, now)
    elif quotas:
        _draw_quota(draw, x + 12 * scale, quota_y, width - 24 * scale, quotas[0], scale, now)
    else:
        f_quota = font(10 * scale, bold=True)
        draw.text((x + 12 * scale, quota_y), "QUOTA —", font=f_quota, fill=0)
        draw.rectangle((x + 12 * scale, quota_y + 16 * scale, x + width - 12 * scale, quota_y + 24 * scale), outline=0, width=scale)


def build_frame(width: int, height: int, usage: dict[str, dict], *, now: float | None = None, scale: int = SCALE_DEFAULT) -> Image.Image:
    now = time.time() if now is None else now
    image = Image.new("L", (width, height), 255)
    draw = ImageDraw.Draw(image)
    margin = 14 * scale
    f_header = font(23 * scale, bold=True)
    draw.text((margin, 6 * scale), "AGENT HUD", font=f_header, fill=0)
    stamp = datetime.fromtimestamp(now).strftime("%m-%d %H:%M")
    f_stamp = font(10 * scale, bold=True)
    draw.text((width - margin - _width(draw, stamp, f_stamp), 13 * scale), stamp, font=f_stamp, fill=0)
    draw.line((margin, 37 * scale, width - margin, 37 * scale), fill=0, width=scale)

    gap = 10 * scale
    card_y = 46 * scale
    card_h = 187 * scale
    card_w = (width - 2 * margin - gap) // 2
    _draw_card(draw, margin, card_y, card_w, card_h, usage.get("codex") or _new_empty("CODEX"), scale, now)
    _draw_card(draw, margin + card_w + gap, card_y, card_w, card_h, usage.get("claude") or _new_empty("CLAUDE CODE"), scale, now)

    footer_y = 246 * scale
    draw.line((margin, footer_y, width - margin, footer_y), fill=0, width=scale)
    f_footer = font(10 * scale, bold=True)
    source = "LOCAL · NO PROMPTS"
    draw.text((margin, footer_y + 8 * scale), source, font=f_footer, fill=0)
    statuses = []
    for key in ("codex", "claude"):
        if (usage.get(key) or {}).get("stale"):
            statuses.append(key.upper() + " STALE")
    status = " · ".join(statuses) if statuses else "LIVE"
    draw.text((width - margin - _width(draw, status, f_footer), footer_y + 8 * scale), status, font=f_footer, fill=0)
    return image


def _new_empty(name: str) -> dict:
    return {"name": name, "quotas": [], "stale": True}


def render(out: str | Path, *, now: float | None = None) -> dict[str, dict]:
    now = time.time() if now is None else now
    usage = load_all_usage(now=now)
    hi = build_frame(W_DEFAULT * SCALE_DEFAULT, H_DEFAULT * SCALE_DEFAULT, usage, now=now, scale=SCALE_DEFAULT)
    image = ImageOps.grayscale(hi.resize((W_DEFAULT, H_DEFAULT), Image.Resampling.LANCZOS))
    # Threshold after supersampling: edges are clean, but no intermediate gray
    # survives into the upload, so the cloud cannot manufacture dot patterns.
    image = image.point(lambda value: 0 if value < 160 else 255, mode="L")
    out_path = Path(out).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(out_path, format="PNG", optimize=True)
    return usage


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="/tmp/fuckbtc-note4-agent-hud.png")
    args = parser.parse_args()
    usage = render(args.out)
    for key, value in usage.items():
        print(f"[note4-hud] {key} model={value.get('model') or '—'} tokens={value.get('total_tokens') or value.get('last_total_tokens') or '—'}")
    print(f"[note4-hud] -> {args.out} ({W_DEFAULT}x{H_DEFAULT}, native black/white)")
