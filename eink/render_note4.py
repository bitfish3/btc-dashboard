#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render the two-number fuckbtc card for the ZECTRIX NOTE4.

The panel is physically 1-bit.  A 16-level grayscale source is sent through
the cloud API's dither path so the display can reproduce perceived tonal
steps.  The canvas intentionally contains only two readouts: BTC price and
AHR999.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from render_potato import fetch_live


W_DEFAULT, H_DEFAULT = 400, 300
SCALE_DEFAULT = 3
GRAY_LEVELS_DEFAULT = 16
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
    draw.rounded_rectangle(
        (x, y, x + w, y + h),
        radius=8 * scale,
        fill=fill,
        outline=112,
        width=max(1, scale),
    )
    label_font = font(13 * scale, bold=True)
    value_font = font(47 * scale, bold=True)
    draw.text((x + 14 * scale, y + 13 * scale), label, font=label_font, fill=38)
    draw.text(
        (x + w - 15 * scale - _text_width(draw, value, value_font), y + 18 * scale),
        value,
        font=value_font,
        fill=8,
    )


def _quantize_gray(image: Image.Image, levels: int) -> Image.Image:
    if levels < 2 or levels > 256:
        raise ValueError("levels must be between 2 and 256")
    step = 255 / (levels - 1)
    return image.point(lambda value: int(round(value / step) * step))


def build_frame(width: int, height: int, live: dict, scale: int = SCALE_DEFAULT) -> Image.Image:
    """Build a large, quiet two-readout frame for the cloud ditherer."""
    paper = 255
    image = Image.new("L", (width, height), paper)
    draw = ImageDraw.Draw(image)
    margin = 18 * scale
    card_width = width - 2 * margin
    card_height = 92 * scale

    # No title, timestamp, gauge, legend, source, or secondary indicators:
    # the two cards are the complete information surface.
    _draw_readout(
        draw,
        margin,
        24 * scale,
        card_width,
        card_height,
        "比特币价格",
        f"${int(live['price']):,}",
        scale,
        243,
    )
    ahr = live.get("ahr999")
    ahr_text = "--" if ahr is None else f"{float(ahr):.2f}"
    _draw_readout(
        draw,
        margin,
        151 * scale,
        card_width,
        card_height,
        "AHR999 定投指数",
        ahr_text,
        scale,
        224,
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
    gray = _quantize_gray(ImageOps.grayscale(img), levels)
    out_path = Path(out).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gray.save(out_path, format="PNG", optimize=True)
    ahr = live.get("ahr999")
    ahr_text = "--" if ahr is None else f"{float(ahr):.2f}"
    print(
        f"[note4-eink] price=${int(live['price']):,} ahr999={ahr_text} "
        f"-> {out_path} ({width}x{height}, {levels}-level grayscale source)"
    )
    return float(live["price"]), ahr_text


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
