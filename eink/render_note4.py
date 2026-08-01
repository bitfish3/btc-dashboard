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
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from render_potato import compute, fetch_live


W_DEFAULT, H_DEFAULT = 400, 300
SCALE_DEFAULT = 3
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


def _draw_readout(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    label: str,
    value: str,
    scale: int,
    fill: int,
) -> None:
    draw.rounded_rectangle((x, y, x + w, y + h), radius=8 * scale, fill=fill, outline=0, width=2 * scale)
    # Solid geometry survives NOTE4's 1-bit panel; no gray/dither field.
    draw.rectangle((x + 10 * scale, y + 10 * scale, x + 16 * scale, y + h - 10 * scale), fill=0)
    label_font = font(10 * scale, bold=True)
    value_font = font(26 * scale, bold=True)
    draw.text((x + 26 * scale, y + 8 * scale), label, font=label_font, fill=0)
    draw.text(
        (x + w - 14 * scale - _text_width(draw, value, value_font), y + 15 * scale),
        value,
        font=value_font,
        fill=0,
    )


def _quantize_gray(image: Image.Image, levels: int) -> Image.Image:
    if levels < 2 or levels > 256:
        raise ValueError("levels must be between 2 and 256")
    step = 255 / (levels - 1)
    return image.point(lambda value: int(round(value / step) * step))


def _phase(score: float) -> str:
    if score < 25:
        return "深熊"
    if score < 50:
        return "累积"
    if score < 75:
        return "均衡"
    return "过热"


def build_frame(width: int, height: int, live: dict, scale: int = SCALE_DEFAULT) -> Image.Image:
    """Build a pendulum-first frame for a 1-bit panel."""
    paper = 255
    image = Image.new("L", (width, height), paper)
    draw = ImageDraw.Draw(image)
    margin = 14 * scale
    score, _, _, _, _ = compute(live)

    # Header: the pendulum is the primary object on page 1.
    header_font = font(19 * scale, bold=True)
    draw.text((margin, 5 * scale), "BTC 周期钟摆", font=header_font, fill=0)
    stamp = datetime.now().strftime("%m-%d %H:%M")
    stamp_font = font(10 * scale, bold=True)
    draw.text(
        (width - margin - _text_width(draw, stamp, stamp_font), 11 * scale),
        stamp,
        font=stamp_font,
        fill=0,
    )
    draw.line((margin, 34 * scale, width - margin, 34 * scale), fill=0, width=scale)

    # Four solid stroke-width steps are the grayscale substitute that survives
    # a physically 1-bit panel: light -> heavy, without a dotted dither field.
    cx, cy = width // 2, 145 * scale
    radius = 98 * scale
    bbox = (cx - radius, cy - radius, cx + radius, cy + radius)
    widths = (4 * scale, 8 * scale, 12 * scale, 16 * scale)
    for index, stroke in enumerate(widths):
        draw.arc(bbox, 180 + index * 45, 180 + (index + 1) * 45, fill=0, width=stroke)

    # Needle: score 0 = far left, 100 = far right.
    angle = math.radians(180 + max(0.0, min(100.0, score)) / 100.0 * 180)
    tip_radius = radius - 8 * scale
    tip = (cx + tip_radius * math.cos(angle), cy + tip_radius * math.sin(angle))
    draw.line((cx, cy, tip[0], tip[1]), fill=0, width=5 * scale)
    hub = 6 * scale
    draw.ellipse((cx - hub, cy - hub, cx + hub, cy + hub), fill=0)

    score_text = str(round(score))
    score_font = font(43 * scale, bold=True)
    draw.text(
        (cx - _text_width(draw, score_text, score_font) / 2, cy + 7 * scale),
        score_text,
        font=score_font,
        fill=0,
    )
    phase = _phase(round(score))
    phase_font = font(15 * scale, bold=True)
    draw.text(
        (cx - _text_width(draw, phase, phase_font) / 2, cy + 46 * scale),
        phase,
        font=phase_font,
        fill=0,
    )

    # Four compact labels keep the quadrant semantics explicit without
    # reintroducing the removed indicator grid.
    legend_font = font(9 * scale, bold=True)
    for label, x in zip(("深熊", "累积", "均衡", "过热"), (65, 145, 225, 305)):
        draw.text(
            (x * scale - _text_width(draw, label, legend_font) / 2, 215 * scale),
            label,
            font=legend_font,
            fill=0,
        )

    # Only the two requested readouts remain below the pendulum.
    card_gap = 10 * scale
    card_y = 230 * scale
    card_height = 55 * scale
    card_width = (width - 2 * margin - card_gap) // 2
    _draw_readout(
        draw,
        margin,
        card_y,
        card_width,
        card_height,
        "比特币价格",
        f"${int(live['price']):,}",
        scale,
        paper,
    )
    ahr = live.get("ahr999")
    ahr_text = "--" if ahr is None else f"{float(ahr):.2f}"
    _draw_readout(
        draw,
        margin + card_width + card_gap,
        card_y,
        card_width,
        card_height,
        "AHR999 定投指数",
        ahr_text,
        scale,
        paper,
    )
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
    hi = build_frame(width * SCALE_DEFAULT, height * SCALE_DEFAULT, live, scale=SCALE_DEFAULT)
    img = hi.resize((width, height), Image.Resampling.LANCZOS)
    # Two levels are intentional: any intermediate tone would be converted
    # to a dot pattern by the panel/cloud and recreate the muddy appearance
    # this device is bad at displaying.
    if levels != 2:
        raise ValueError("NOTE4 output must use exactly 2 levels (black/white)")
    gray = _quantize_gray(ImageOps.grayscale(img), levels)
    out_path = Path(out).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gray.save(out_path, format="PNG", optimize=True)
    ahr = live.get("ahr999")
    ahr_text = "--" if ahr is None else f"{float(ahr):.2f}"
    print(
        f"[note4-eink] price=${int(live['price']):,} ahr999={ahr_text} "
        f"-> {out_path} ({width}x{height}, native 1-bit black/white)"
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
