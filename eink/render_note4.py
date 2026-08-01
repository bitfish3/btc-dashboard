#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render the fuckbtc cycle pendulum for the ZECTRIX NOTE4 display.

NOTE4 is a 400x300 black-and-white e-ink panel.  The existing potato renderer
targets a taller colour panel, so this module keeps the same data/model but
uses a compact monochrome layout that remains legible at native resolution.
"""

from __future__ import annotations

import argparse
import datetime as dt
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

from render_potato import compute, fetch_live


W_DEFAULT, H_DEFAULT = 400, 300
FONT_PATH = "/System/Library/Fonts/STHeiti Medium.ttc"


def font(size: int, path: str = FONT_PATH):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
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


def _draw_card(draw: ImageDraw.ImageDraw, x: int, y: int, w: int, h: int, label: str, value: int, scale: int) -> None:
    draw.rounded_rectangle((x, y, x + w, y + h), radius=3 * scale, outline=0, width=max(1, scale))
    label_font = font(9 * scale)
    value_font = font(14 * scale)
    draw.text((x + 5 * scale, y + 4 * scale), label, font=label_font, fill=0)
    value_text = str(value)
    draw.text(
        (x + w - 5 * scale - _text_width(draw, value_text, value_font), y + 2 * scale),
        value_text,
        font=value_font,
        fill=0,
    )


def build_frame(width: int, height: int, live: dict, scale: int = 2) -> Image.Image:
    """Build a high-resolution frame, then caller downsamples and thresholds."""
    score, zone, _colour, _verdict, parts = compute(live)
    black, paper = 0, 255
    img = Image.new("L", (width, height), paper)
    draw = ImageDraw.Draw(img)
    margin = 18 * scale

    # Header
    draw.rectangle((margin, 10 * scale, margin + 10 * scale, 20 * scale), fill=black)
    title_font = font(22 * scale)
    draw.text((margin + 16 * scale, 4 * scale), "BTC 周期钟摆", font=title_font, fill=black)
    stamp = dt.datetime.now().strftime("%m-%d %H:%M")
    stamp_font = font(10 * scale)
    draw.text(
        (width - margin - _text_width(draw, stamp, stamp_font), 10 * scale),
        stamp,
        font=stamp_font,
        fill=black,
    )
    draw.line((margin, 29 * scale, width - margin, 29 * scale), fill=black, width=max(1, scale))

    # 0→100 semicircle.  Monochrome keeps the same geometry as the web card;
    # boundary ticks carry the zone information without relying on colour.
    cx, cy, radius = width // 2, 105 * scale, 70 * scale
    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    draw.arc(box, 180, 360, fill=black, width=8 * scale)
    for angle in (180, 216, 252, 288, 324, 360):
        radians = math.radians(angle)
        r0, r1 = radius - 6 * scale, radius + 4 * scale
        draw.line(
            (
                cx + r0 * math.cos(radians),
                cy + r0 * math.sin(radians),
                cx + r1 * math.cos(radians),
                cy + r1 * math.sin(radians),
            ),
            fill=black,
            width=2 * scale,
        )

    needle_angle = math.radians(180 + score * 1.8)
    tip_radius = radius - 3 * scale
    tip = (cx + tip_radius * math.cos(needle_angle), cy + tip_radius * math.sin(needle_angle))
    draw.line((cx, cy, tip[0], tip[1]), fill=black, width=3 * scale)
    hub = 6 * scale
    draw.ellipse((cx - hub, cy - hub, cx + hub, cy + hub), fill=black)

    score_font = font(36 * scale)
    _center_text(draw, (cx, 92 * scale), str(round(score)), score_font)
    zone_font = font(14 * scale)
    _center_text(draw, (cx, 132 * scale), zone, zone_font)
    edge_font = font(9 * scale)
    draw.text((cx - radius - 10 * scale, 160 * scale), "深熊", font=edge_font, fill=black)
    hot = "狂热"
    draw.text((cx + radius - _text_width(draw, hot, edge_font) + 10 * scale, 160 * scale), hot, font=edge_font, fill=black)

    verdict_font = font(11 * scale)
    verdict = _short_verdict(zone)
    _center_text(draw, (cx, 178 * scale), verdict, verdict_font)

    # Seven normalised indicator scores, compact enough for native 400x300.
    indicator_font = font(8 * scale)
    indicator_title = "指标分数（0=深熊 · 100=狂热）"
    draw.text((margin, 198 * scale), indicator_title, font=indicator_font, fill=black)
    card_y, card_h = 208 * scale, 22 * scale
    gap, cols = 4 * scale, 4
    card_w = (width - 2 * margin - gap * (cols - 1)) // cols
    for i, (label, normalised, _weight) in enumerate(parts):
        row, col = divmod(i, cols)
        _draw_card(draw, margin + col * (card_w + gap), card_y + row * (card_h + 4 * scale), card_w, card_h, label, round(normalised), scale)

    # Footer makes the data age explicit; this is useful when the device wakes
    # from a long sleep and retains the last e-ink frame.
    footer_y = 267 * scale
    draw.line((margin, footer_y - 4 * scale, width - margin, footer_y - 4 * scale), fill=black, width=max(1, scale))
    footer_font = font(9 * scale)
    btc = f"BTC ${int(live['price']):,}"
    draw.text((margin, footer_y), btc, font=footer_font, fill=black)
    source = "fuckbtc.com"
    draw.text((width - margin - _text_width(draw, source, footer_font), footer_y), source, font=footer_font, fill=black)
    return img


def render(out: str | Path, width: int = W_DEFAULT, height: int = H_DEFAULT, threshold: int = 180) -> tuple[float, str]:
    if (width, height) != (W_DEFAULT, H_DEFAULT):
        raise ValueError(f"NOTE4 frame must be {W_DEFAULT}x{H_DEFAULT}, got {width}x{height}")
    print("[note4-eink] fetching live on-chain values...")
    live = fetch_live()
    # Supersampling removes jagged Chinese glyph edges before the final hard
    # threshold.  The resulting PNG contains only black and white pixels.
    hi = build_frame(width * 2, height * 2, live, scale=2)
    img = hi.resize((width, height), Image.Resampling.LANCZOS)
    bw = ImageOps.grayscale(img).point(lambda p: 255 if p >= threshold else 0)
    out_path = Path(out).expanduser()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    bw.save(out_path, format="PNG", optimize=True)
    score, zone, *_ = compute(live)
    print(f"[note4-eink] score={score:.1f} zone={zone} -> {out_path} ({width}x{height}, 1-bit)")
    return score, zone


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(Path(__file__).with_name("note4_cycle.png")))
    parser.add_argument("--threshold", type=int, default=180, help="black/white cutoff (0-255)")
    args = parser.parse_args()
    render(args.out, threshold=args.threshold)


if __name__ == "__main__":
    main()
