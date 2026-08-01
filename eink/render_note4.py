#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render the pendulum-first fuckbtc card for the ZECTRIX NOTE4.

The panel is physically 1-bit. This renderer therefore emits an exact
400x300 black/white PNG and leaves dithering disabled at the cloud API. The
canvas intentionally contains the pendulum plus two readouts: BTC price and
AHR999. Four sectors use solid stroke-width steps; cloud dithering is avoided.
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from render_potato import compute, fetch_live


W_DEFAULT, H_DEFAULT = 400, 300
SCALE_DEFAULT = 1
GRAY_LEVELS_DEFAULT = 2
FONT_REGULAR_PATHS = (
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
)
FONT_BOLD_PATHS = (
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


def _text_width(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> float:
    return draw.textlength(text, font=fnt)


def _phase(score: float) -> str:
    if score < 25:
        return "深熊"
    if score < 50:
        return "累积"
    if score < 75:
        return "均衡"
    return "过热"


def build_frame(width: int, height: int, live: dict, scale: int = SCALE_DEFAULT) -> Image.Image:
    """Build a simple poster-like pendulum frame for a 1-bit panel."""
    # Draw directly at the target raster. There is no antialias pass to turn
    # into gray dots later, and no rounded micro-decoration to muddy the page.
    image = Image.new("1", (width, height), 1)
    draw = ImageDraw.Draw(image)
    margin = 16 * scale
    score, _, _, _, _ = compute(live)

    # Header: one title, one divider, nothing that can turn into texture.
    header_font = font(20 * scale, bold=True)
    draw.text((margin, 6 * scale), "BTC 周期钟摆", font=header_font, fill=0)
    draw.line((margin, 33 * scale, width - margin, 33 * scale), fill=0, width=2 * scale)

    # A single thick arc, with the active quadrant made heavier. The four
    # sectors remain readable as geometry rather than fake gray levels.
    cx, cy = width // 2, 132 * scale
    radius = 91 * scale
    bbox = (cx - radius, cy - radius, cx + radius, cy + radius)
    draw.arc(bbox, 180, 360, fill=0, width=8 * scale)
    active = min(3, max(0, int(max(0.0, min(99.999, score)) // 25)))
    start = 180 + active * 45 + 2
    end = 180 + (active + 1) * 45 - 2
    draw.arc(bbox, start, end, fill=0, width=16 * scale)

    # Four clean boundary ticks make the quadrants explicit.
    for degrees in (180, 225, 270, 315, 360):
        angle = math.radians(degrees)
        inner = radius - 12 * scale
        outer = radius + 10 * scale
        draw.line(
            (
                cx + inner * math.cos(angle),
                cy + inner * math.sin(angle),
                cx + outer * math.cos(angle),
                cy + outer * math.sin(angle),
            ),
            fill=0,
            width=3 * scale,
        )

    # Needle: score 0 = far left, 100 = far right.
    angle = math.radians(180 + max(0.0, min(100.0, score)) / 100.0 * 180)
    tip_radius = radius - 8 * scale
    tip = (cx + tip_radius * math.cos(angle), cy + tip_radius * math.sin(angle))
    draw.line((cx, cy, tip[0], tip[1]), fill=0, width=5 * scale)
    hub = 6 * scale
    draw.ellipse((cx - hub, cy - hub, cx + hub, cy + hub), fill=0)

    score_text = str(round(score))
    score_font = font(42 * scale, bold=True)
    draw.text((cx - _text_width(draw, score_text, score_font) / 2, 141 * scale), score_text, font=score_font, fill=0)
    phase = _phase(round(score))
    phase_font = font(14 * scale, bold=True)
    draw.text((cx - _text_width(draw, phase, phase_font) / 2, 185 * scale), phase, font=phase_font, fill=0)

    # The only two readouts: large, borderless, and separated by whitespace.
    draw.line((margin, 220 * scale, width - margin, 220 * scale), fill=0, width=2 * scale)
    label_font = font(10 * scale, bold=True)
    value_font = font(24 * scale, bold=True)
    draw.text((margin, 231 * scale), "BTC", font=label_font, fill=0)
    draw.text((margin, 246 * scale), f"${int(live['price']):,}", font=value_font, fill=0)
    right_x = 215 * scale
    draw.text((right_x, 231 * scale), "AHR999", font=label_font, fill=0)
    ahr = live.get("ahr999")
    ahr_text = "--" if ahr is None else f"{float(ahr):.2f}"
    draw.text((right_x, 246 * scale), ahr_text, font=value_font, fill=0)
    return image


def render(
    out: str | Path,
    width: int = W_DEFAULT,
    height: int = H_DEFAULT,
    levels: int = GRAY_LEVELS_DEFAULT,
) -> tuple[float, str]:
    if (width, height) != (W_DEFAULT, H_DEFAULT):
        raise ValueError(f"NOTE4 frame must be {W_DEFAULT}x{H_DEFAULT}, got {width}x{height}")
    print("[note4-eink] fetching live price and AHR999...")
    live = fetch_live()
    frame = build_frame(width, height, live, scale=SCALE_DEFAULT)
    # The frame is already native 1-bit. Keep this conversion explicit as a
    # guard if a future drawing primitive returns another PIL mode.
    if levels != 2:
        raise ValueError("NOTE4 output must use exactly 2 levels (black/white)")
    gray = frame.convert("1")
    out_path = Path(out).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gray.save(out_path, format="PNG", optimize=True)
    ahr = live.get("ahr999")
    ahr_text = "--" if ahr is None else f"{float(ahr):.2f}"
    print(
        f"[note4-eink] price=${int(live['price']):,} ahr999={ahr_text} "
        f"-> {out_path} ({width}x{height}, PNG mode=1 black/white)"
    )
    return float(live["price"]), ahr_text


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(Path(__file__).with_name("note4_cycle.png")))
    parser.add_argument(
        "--levels",
        type=int,
        default=GRAY_LEVELS_DEFAULT,
        help="kept for compatibility; NOTE4 output is always native 1-bit",
    )
    args = parser.parse_args()
    render(args.out, levels=args.levels)


if __name__ == "__main__":
    main()
