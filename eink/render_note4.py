#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render a calm, readable fuckbtc cycle card for the ZECTRIX NOTE4.

The NOTE4 panel is physically 1-bit.  We therefore send a 12-level grayscale
source to the cloud API and let ``dither=true`` create perceived gray steps on
the display.  The card intentionally shows only the cycle position, BTC price,
and AHR999: the pendulum is the information architecture, not a dashboard dump.
"""

from __future__ import annotations

import argparse
import datetime as dt
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from render_potato import compute, fetch_live


W_DEFAULT, H_DEFAULT = 400, 300
SCALE_DEFAULT = 3
GRAY_LEVELS_DEFAULT = 12
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


def _center_text(draw: ImageDraw.ImageDraw, x: float, y: float, text: str, fnt, fill=0) -> None:
    draw.text((x - _text_width(draw, text, fnt) / 2, y), text, font=fnt, fill=fill)


def _draw_metric_card(
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
    draw.rounded_rectangle(
        (x, y, x + w, y + h),
        radius=5 * scale,
        fill=fill,
        outline=104,
        width=max(1, scale),
    )
    label_font = font(10 * scale, bold=True)
    value_font = font(22 * scale, bold=True)
    draw.text((x + 8 * scale, y + 5 * scale), label, font=label_font, fill=34)
    draw.text(
        (x + w - 8 * scale - _text_width(draw, value, value_font), y + 11 * scale),
        value,
        font=value_font,
        fill=10,
    )


def _quantize_gray(image: Image.Image, levels: int) -> Image.Image:
    if levels < 2 or levels > 256:
        raise ValueError("levels must be between 2 and 256")
    step = 255 / (levels - 1)
    return image.point(lambda value: int(round(value / step) * step))


def build_frame(width: int, height: int, live: dict, scale: int = SCALE_DEFAULT) -> Image.Image:
    """Build a supersampled grayscale frame for the cloud ditherer."""
    score, zone, _colour, _verdict, _parts = compute(live)
    black, paper = 12, 255
    img = Image.new("L", (width, height), paper)
    draw = ImageDraw.Draw(img)
    margin = 18 * scale

    # Header: larger and slightly heavier so it survives the panel's dither.
    draw.rounded_rectangle(
        (margin, 9 * scale, margin + 12 * scale, 21 * scale),
        radius=2 * scale,
        fill=black,
    )
    title_font = font(21 * scale, bold=True)
    draw.text((margin + 18 * scale, 3 * scale), "BTC 周期钟摆", font=title_font, fill=black)
    stamp = dt.datetime.now().strftime("%m-%d %H:%M")
    stamp_font = font(9 * scale, bold=True)
    draw.text(
        (width - margin - _text_width(draw, stamp, stamp_font), 9 * scale),
        stamp,
        font=stamp_font,
        fill=82,
    )
    draw.line((margin, 30 * scale, width - margin, 30 * scale), fill=110, width=max(1, scale))

    # Four semantic quadrants, represented only by grayscale steps.  Light to
    # dark maps from deep bear to overheated, making the arc readable without
    # relying on colour.  The API dithers these tones on the 1-bit panel.
    cx, cy, radius = width // 2, 103 * scale, 71 * scale
    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    quadrant_shades = (224, 172, 116, 52)
    for index, shade in enumerate(quadrant_shades):
        start = 180 + index * 45 + 1.4
        end = 180 + (index + 1) * 45 - 1.4
        draw.arc(box, start, end, fill=shade, width=7 * scale)

    # Five small ticks anchor the four bands without adding another chart.
    for angle in (180, 225, 270, 315, 360):
        radians = math.radians(angle)
        r0, r1 = radius - 5 * scale, radius + 4 * scale
        draw.line(
            (
                cx + r0 * math.cos(radians),
                cy + r0 * math.sin(radians),
                cx + r1 * math.cos(radians),
                cy + r1 * math.sin(radians),
            ),
            fill=92,
            width=max(1, scale),
        )

    needle_angle = math.radians(180 + score * 1.8)
    tip_radius = radius - 2 * scale
    tip = (cx + tip_radius * math.cos(needle_angle), cy + tip_radius * math.sin(needle_angle))
    draw.line((cx, cy, tip[0], tip[1]), fill=black, width=3 * scale)
    hub = 5 * scale
    draw.ellipse((cx - hub, cy - hub, cx + hub, cy + hub), fill=black)

    score_font = font(38 * scale, bold=True)
    _center_text(draw, cx, 82 * scale, str(round(score)), score_font, fill=black)
    zone_font = font(15 * scale, bold=True)
    _center_text(draw, cx, 128 * scale, zone, zone_font, fill=24)

    edge_font = font(8 * scale, bold=True)
    draw.text((cx - radius - 3 * scale, 156 * scale), "深熊", font=edge_font, fill=88)
    hot = "过热"
    draw.text(
        (cx + radius - _text_width(draw, hot, edge_font) + 3 * scale, 156 * scale),
        hot,
        font=edge_font,
        fill=88,
    )

    # A compact legend makes the four gray steps explicit.
    legend = (("深熊", 224), ("累积", 172), ("均衡", 116), ("过热", 52))
    legend_font = font(8 * scale, bold=True)
    legend_y = 179 * scale
    cell_w = (width - 2 * margin) // len(legend)
    for index, (label, shade) in enumerate(legend):
        x = margin + index * cell_w
        draw.rounded_rectangle(
            (x, legend_y + 1 * scale, x + 8 * scale, legend_y + 9 * scale),
            radius=1 * scale,
            fill=shade,
        )
        draw.text((x + 12 * scale, legend_y - 1 * scale), label, font=legend_font, fill=70)

    # Only the two requested readouts remain.
    card_y, card_h = 207 * scale, 46 * scale
    gap = 8 * scale
    card_w = (width - 2 * margin - gap) // 2
    price = f"${int(live['price']):,}"
    ahr = live.get("ahr999")
    ahr_text = "--" if ahr is None else f"{float(ahr):.2f}"
    _draw_metric_card(draw, margin, card_y, card_w, card_h, "BTC 价格", price, scale, 238)
    _draw_metric_card(
        draw,
        margin + card_w + gap,
        card_y,
        card_w,
        card_h,
        "AHR999 定投指数",
        ahr_text,
        scale,
        220,
    )

    # A quiet baseline gives the card an intentional bottom edge without a
    # third piece of information competing with the two readouts.
    draw.line(
        (margin, 270 * scale, width - margin, 270 * scale),
        fill=154,
        width=max(1, scale),
    )
    return img


def render(
    out: str | Path,
    width: int = W_DEFAULT,
    height: int = H_DEFAULT,
    levels: int = GRAY_LEVELS_DEFAULT,
) -> tuple[float, str]:
    if (width, height) != (W_DEFAULT, H_DEFAULT):
        raise ValueError(f"NOTE4 frame must be {W_DEFAULT}x{H_DEFAULT}, got {width}x{height}")
    print("[note4-eink] fetching live on-chain values...")
    live = fetch_live()
    hi = build_frame(width * SCALE_DEFAULT, height * SCALE_DEFAULT, live, scale=SCALE_DEFAULT)
    img = hi.resize((width, height), Image.Resampling.LANCZOS)
    gray = _quantize_gray(ImageOps.grayscale(img), levels)
    out_path = Path(out).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gray.save(out_path, format="PNG", optimize=True)
    score, zone, *_ = compute(live)
    ahr = live.get("ahr999")
    ahr_text = "--" if ahr is None else f"{float(ahr):.2f}"
    print(
        f"[note4-eink] score={score:.1f} zone={zone} ahr999={ahr_text} "
        f"-> {out_path} ({width}x{height}, {levels}-level grayscale source)"
    )
    return score, zone


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(Path(__file__).with_name("note4_cycle.png")))
    parser.add_argument(
        "--levels",
        type=int,
        default=GRAY_LEVELS_DEFAULT,
        help="grayscale source levels before cloud dithering",
    )
    args = parser.parse_args()
    render(args.out, levels=args.levels)


if __name__ == "__main__":
    main()
