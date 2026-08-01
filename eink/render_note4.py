#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render the fuckbtc cycle pendulum for the ZECTRIX NOTE4 display.

NOTE4 is a 400x300 black-and-white e-ink panel.  The cloud API can dither a
grayscale source, so this renderer deliberately keeps a small tonal palette
instead of crushing the frame to a hard black/white threshold locally.
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
FONT_PATHS = (
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Medium.ttc",
)


def font(size: int):
    for path in FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _text_width(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont) -> float:
    return draw.textlength(text, font=fnt)


def _center_text(draw: ImageDraw.ImageDraw, xy: tuple[float, float], text: str, fnt, fill=0) -> None:
    x, y = xy
    draw.text((x - _text_width(draw, text, fnt) / 2, y), text, font=fnt, fill=fill)


def _short_verdict(zone: str) -> str:
    return {
        "深熊·投降": "历史大底信号区 · 重仓/加速定投",
        "低估·累积": "悲观累积区 · 链上低估 · 定投友好",
        "中性·均衡": "估值中性 · 顺势持有 · 不追高不砍底",
        "过热·乐观": "乐观过热 · 分批减仓 · 收紧止盈",
        "泡沫·狂热": "历史顶部区间 · 主动出货",
    }.get(zone, "周期数据已更新")


def _draw_card(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    h: int,
    label: str,
    value: int,
    scale: int,
) -> None:
    # Keep fills light enough for black text, while encoding the indicator
    # intensity without adding another visual element to the small canvas.
    shade = 246 - round(max(0, min(100, value)) * 0.34)
    draw.rounded_rectangle(
        (x, y, x + w, y + h),
        radius=2 * scale,
        fill=shade,
        outline=112,
        width=max(1, scale),
    )
    label_font = font(8 * scale)
    value_font = font(14 * scale)
    draw.text((x + 5 * scale, y + 3 * scale), label, font=label_font, fill=24)
    value_text = str(value)
    draw.text(
        (x + w - 5 * scale - _text_width(draw, value_text, value_font), y + 1 * scale),
        value_text,
        font=value_font,
        fill=12,
    )


def build_frame(width: int, height: int, live: dict, scale: int = SCALE_DEFAULT) -> Image.Image:
    """Build a supersampled grayscale frame for the cloud ditherer."""
    score, zone, _colour, _verdict, parts = compute(live)
    black, paper = 18, 255
    img = Image.new("L", (width, height), paper)
    draw = ImageDraw.Draw(img)
    margin = 18 * scale

    # Header
    draw.rounded_rectangle(
        (margin, 10 * scale, margin + 11 * scale, 21 * scale),
        radius=2 * scale,
        fill=black,
    )
    title_font = font(19 * scale)
    draw.text((margin + 17 * scale, 5 * scale), "BTC 周期钟摆", font=title_font, fill=black)
    stamp = dt.datetime.now().strftime("%m-%d %H:%M")
    stamp_font = font(9 * scale)
    draw.text(
        (width - margin - _text_width(draw, stamp, stamp_font), 10 * scale),
        stamp,
        font=stamp_font,
        fill=86,
    )
    draw.line((margin, 30 * scale, width - margin, 30 * scale), fill=118, width=max(1, scale))

    # 0→100 semicircle.  The 12 tonal steps survive as visible dithering on
    # NOTE4 while keeping the direction readable without colour.
    cx, cy, radius = width // 2, 105 * scale, 73 * scale
    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    segments = 12
    for index in range(segments):
        start = 180 + index * 180 / segments + 1.2
        end = 180 + (index + 1) * 180 / segments - 1.2
        shade = round(220 - index * (205 / (segments - 1)))
        draw.arc(box, start, end, fill=shade, width=6 * scale)
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
            fill=104,
            width=max(1, scale),
        )

    needle_angle = math.radians(180 + score * 1.8)
    tip_radius = radius - 3 * scale
    tip = (cx + tip_radius * math.cos(needle_angle), cy + tip_radius * math.sin(needle_angle))
    draw.line((cx, cy, tip[0], tip[1]), fill=18, width=2 * scale)
    hub = 5 * scale
    draw.ellipse((cx - hub, cy - hub, cx + hub, cy + hub), fill=black)

    score_font = font(34 * scale)
    _center_text(draw, (cx, 90 * scale), str(round(score)), score_font, fill=12)
    zone_font = font(13 * scale)
    _center_text(draw, (cx, 132 * scale), zone, zone_font, fill=18)
    edge_font = font(8 * scale)
    draw.text((cx - radius - 3 * scale, 158 * scale), "深熊 0", font=edge_font, fill=90)
    hot = "狂热 100"
    draw.text((cx + radius - _text_width(draw, hot, edge_font) + 3 * scale, 158 * scale), hot, font=edge_font, fill=90)

    verdict_font = font(10 * scale)
    verdict = _short_verdict(zone)
    _center_text(draw, (cx, 177 * scale), verdict, verdict_font, fill=54)

    # Seven normalised indicator scores, compact enough for native 400x300.
    indicator_font = font(8 * scale)
    indicator_title = "指标分数  ·  0 深熊   /   100 狂热"
    draw.text((margin, 196 * scale), indicator_title, font=indicator_font, fill=92)
    card_y, card_h = 206 * scale, 22 * scale
    gap, cols = 4 * scale, 4
    card_w = (width - 2 * margin - gap * (cols - 1)) // cols
    for i, (label, normalised, _weight) in enumerate(parts):
        row, col = divmod(i, cols)
        _draw_card(
            draw,
            margin + col * (card_w + gap),
            card_y + row * (card_h + 4 * scale),
            card_w,
            card_h,
            label,
            round(normalised),
            scale,
        )

    # Footer makes the data age explicit; this is useful when the device wakes
    # from a long sleep and retains the last e-ink frame.
    footer_y = 267 * scale
    draw.line((margin, footer_y - 4 * scale, width - margin, footer_y - 4 * scale), fill=118, width=max(1, scale))
    footer_font = font(8 * scale)
    btc = f"BTC ${int(live['price']):,}"
    draw.text((margin, footer_y), btc, font=footer_font, fill=48)
    source = "fuckbtc.com"
    draw.text((width - margin - _text_width(draw, source, footer_font), footer_y), source, font=footer_font, fill=48)
    return img


def _quantize_gray(image: Image.Image, levels: int) -> Image.Image:
    if levels < 2 or levels > 256:
        raise ValueError("levels must be between 2 and 256")
    step = 255 / (levels - 1)
    return image.point(lambda value: int(round(value / step) * step))


def render(out: str | Path, width: int = W_DEFAULT, height: int = H_DEFAULT, levels: int = GRAY_LEVELS_DEFAULT) -> tuple[float, str]:
    if (width, height) != (W_DEFAULT, H_DEFAULT):
        raise ValueError(f"NOTE4 frame must be {W_DEFAULT}x{H_DEFAULT}, got {width}x{height}")
    print("[note4-eink] fetching live on-chain values...")
    live = fetch_live()
    # Supersampling keeps small Chinese glyphs clean.  Quantise to a controlled
    # palette, then let the cloud API's dither=true turn those tones into the
    # panel's perceived grayscale rather than a harsh local threshold.
    hi = build_frame(width * SCALE_DEFAULT, height * SCALE_DEFAULT, live, scale=SCALE_DEFAULT)
    img = hi.resize((width, height), Image.Resampling.LANCZOS)
    gray = _quantize_gray(ImageOps.grayscale(img), levels)
    out_path = Path(out).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gray.save(out_path, format="PNG", optimize=True)
    score, zone, *_ = compute(live)
    print(f"[note4-eink] score={score:.1f} zone={zone} -> {out_path} ({width}x{height}, {levels}-level grayscale source)")
    return score, zone


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(Path(__file__).with_name("note4_cycle.png")))
    parser.add_argument("--levels", type=int, default=GRAY_LEVELS_DEFAULT, help="grayscale source levels before cloud dithering")
    args = parser.parse_args()
    render(args.out, levels=args.levels)


if __name__ == "__main__":
    main()
