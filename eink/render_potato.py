#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
土豆片 (6色电子墨水) e-ink 出图模板 —— 第一张内容: fuckbtc 周期钟摆。

设计前提:
  * 设备走手机 App 推屏(大概率 BLE), App 敞开 iOS 快捷指令。本脚本只负责
    "生产一张土豆片能吃的图"; 交给 App 的最后一跳由 Shortcut 完成(见 README)。
  * 与传输方式无关、可复用: 换内容只改 build_frame() 即可。
  * 纯 PIL 本地渲染 —— 无浏览器、确定性、可 launchd、6 色调色板精确 = 所见即墨水屏所得。

用法:
  python3 render_potato.py [--out PATH] [--w 480] [--h 800] [--no-quantize]
退出码 0 = 成功; 打印合成读数。
"""
import sys, math, json, argparse, urllib.request
from datetime import datetime, timezone
from PIL import Image, ImageDraw, ImageFont

# ---- CONFIG: 设备真实分辨率待发货坐实, 先用竖版占位 ----
W_DEFAULT, H_DEFAULT = 480, 800
FONT_PATH = "/System/Library/Fonts/STHeiti Medium.ttc"

# ---- Spectra 6 (E6) 近似调色板: 用发暗的真实墨水色, 预览≈上屏效果 ----
K = (28, 28, 28)      # 黑
Wt = (246, 244, 238)  # 纸白(略暖)
R = (168, 52, 45)     # 红(发暗)
Y = (196, 158, 44)    # 黄
B = (52, 74, 140)     # 蓝
G = (58, 120, 82)     # 绿
PALETTE = [K, Wt, R, Y, B, G]

# ---- 周期钟摆模型(与 index.html 的 computeCyclePendulum 一致) ----
def pend_norm(v, pts):
    if v <= pts[0][0]: return pts[0][1]
    for i in range(1, len(pts)):
        if v <= pts[i][0]:
            x0, y0 = pts[i-1]; x1, y1 = pts[i]
            return y0 + (y1 - y0) * (v - x0) / (x1 - x0)
    return pts[-1][1]

def _get(url, timeout=10):
    req = urllib.request.Request(url, headers={"User-Agent": "potato-eink/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


def fetch_ahr999(price):
    """Calculate the AHR999 index using the same formula as fuckbtc.com."""
    closes = []
    last_ts = None
    try:
        klines = _get("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=200")
        closes = [float(k[4]) for k in klines]
        last_ts = int(klines[-1][0])
    except Exception:
        data = _get("https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1D&limit=200")
        rows = data["data"]
        closes = [float(row[4]) for row in reversed(rows)]
        last_ts = int(rows[0][0])
    if not closes or last_ts is None:
        raise ValueError("AHR999 price history is empty")
    dma200 = sum(closes) / len(closes)
    genesis_ms = int(datetime(2009, 1, 3, tzinfo=timezone.utc).timestamp() * 1000)
    coin_days = max(1, (last_ts - genesis_ms) // 86_400_000)
    exp_price = 10 ** (5.84 * math.log10(coin_days) - 17.01)
    return round((price / dma200) * (price / exp_price), 2)

def fetch_live():
    """拉实时链上值; 任一失败回退到最近已知值, 保证永远能出图。"""
    P = "https://looknode-proxy.corms-cushier-0l.workers.dev"
    fb = dict(mvrv=1.22, z=0.38, sopr=1.004, puell=0.80, bp=38873.0,
              price=63750.0, fng=25, psip=46, ahr999=None)  # 回退基线(2026-07-31)
    v = dict(fb)
    def last(url, key):
        try:
            d = _get(url)["data"]; v[key] = round(d[-1]["v"], 4)
        except Exception as e:
            print(f"  [warn] {key} fetch fail -> fallback: {e}", file=sys.stderr)
    last(f"{P}/mCapRealizedRatio", "mvrv")
    last(f"{P}/sopr", "sopr")
    last(f"{P}/puellMultiple", "puell")
    last(f"{P}/balancedPrice", "bp")
    try: v["z"] = round(float(_get("https://btc-cache.corms-cushier-0l.workers.dev/latest")["mvrvz"]), 4)
    except Exception as e: print(f"  [warn] z fallback: {e}", file=sys.stderr)
    try: v["price"] = round(float(_get("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT")["price"]), 0)
    except Exception as e: print(f"  [warn] price fallback: {e}", file=sys.stderr)
    try: v["ahr999"] = fetch_ahr999(v["price"])
    except Exception as e: print(f"  [warn] ahr999 fallback: {e}", file=sys.stderr)
    try:
        d = _get("https://api.alternative.me/fng/?limit=1")["data"][0]; v["fng"] = int(d["value"])
    except Exception as e: print(f"  [warn] fng fallback: {e}", file=sys.stderr)
    return v

def compute(v):
    parts = [
        ("MVRV",   pend_norm(v["mvrv"],  [(0.8,0),(1,20),(2,45),(3.5,80),(4.5,100)]), 0.20),
        ("MVRV-Z", pend_norm(v["z"],     [(-0.5,0),(0,15),(2,40),(5,75),(8,100)]),    0.20),
        ("价/BP",  pend_norm(v["price"]/v["bp"], [(1,5),(1.5,30),(3,65),(5,95)]),      0.15),
        ("Puell",  pend_norm(v["puell"], [(0.4,3),(0.5,12),(1,35),(2,60),(4,85),(6,100)]), 0.15),
        ("SOPR",   pend_norm(v["sopr"],  [(0.96,5),(1,30),(1.03,50),(1.08,75),(1.12,95)]), 0.10),
        ("PSIP",   pend_norm(v["psip"],  [(34,5),(45,25),(55,45),(75,75),(95,100)]),  0.10),
        ("F&G",    max(0, min(100, v["fng"])), 0.10),
    ]
    wsum = sum(p[2] for p in parts)
    score = sum(p[1]*p[2] for p in parts) / wsum
    if   score < 20: zone, col, verdict = "深熊·投降", B, "极度低估 · 历史大底信号区, 重仓/加速定投"
    elif score < 40: zone, col, verdict = "低估·累积", G, "悲观累积区 · 链上低估、情绪恐惧, 定投友好"
    elif score < 60: zone, col, verdict = "中性·均衡", Y, "估值回归中性 · 顺势持有, 不追高不砍底"
    elif score < 80: zone, col, verdict = "过热·乐观", R, "乐观过热 · 分批减仓、收紧止盈纪律"
    else:            zone, col, verdict = "泡沫·狂热", K, "狂热泡沫区 · 历史顶部区间, 主动出货"
    return score, zone, col, verdict, parts

# ---- 绘制 ----
def font(sz, path=FONT_PATH):
    try: return ImageFont.truetype(path, sz)
    except Exception: return ImageFont.load_default()

def wrap(draw, text, fnt, maxw):
    out, line = [], ""
    for ch in text:
        if draw.textlength(line+ch, font=fnt) <= maxw: line += ch
        else: out.append(line); line = ch
    if line: out.append(line)
    return out

def build_frame(W, H, live):
    score, zone, col, verdict, parts = compute(live)
    img = Image.new("RGB", (W, H), Wt)
    d = ImageDraw.Draw(img)
    m = int(W*0.06)

    # Header
    # 标题前放一个绿色小方块作 bullet(STHeiti 无 ₿ 字形会出豆腐块)
    bs = int(W*0.05); by = int(H*0.045)
    d.rounded_rectangle((m, by, m+bs, by+bs), radius=int(bs*0.25), fill=G)
    d.text((m+bs+int(W*0.03), int(H*0.035)), "周期钟摆", font=font(int(W*0.075)), fill=K)
    dt = "链上综合判断"
    f_sub = font(int(W*0.038))
    d.text((W-m-d.textlength(dt, font=f_sub), int(H*0.052)), dt, font=f_sub, fill=(120,118,110))
    hy = int(H*0.115)
    d.line([(m, hy), (W-m, hy)], fill=(200,196,188), width=2)

    # Pendulum dial (top semicircle 180->360)
    cx, cy = W//2, int(H*0.42)
    Rr = int(W*0.36); aw = int(W*0.045)
    zone_cols = [G, G, Y, R, K]  # 冷->热->极端(黑=burnt)
    bbox = (cx-Rr, cy-Rr, cx+Rr, cy+Rr)
    for i, zc in enumerate(zone_cols):
        d.arc(bbox, 180 + i*36, 180 + (i+1)*36, fill=zc, width=aw)
    # needle: score 0->左(180) 50->顶(270) 100->右(360)
    th = math.radians(180 + score/100*180)
    tip = (cx + (Rr-aw//2)*math.cos(th), cy + (Rr-aw//2)*math.sin(th))
    d.line([(cx, cy), tip], fill=K, width=max(3, int(W*0.012)))
    hub = int(W*0.028)
    d.ellipse((cx-hub, cy-hub, cx+hub, cy+hub), fill=K)
    # score big + zone
    f_score = font(int(W*0.15))
    sc = str(round(score))
    d.text((cx - d.textlength(sc, font=f_score)/2, cy + int(H*0.02)), sc, font=f_score, fill=col)
    f_zone = font(int(W*0.072))
    d.text((cx - d.textlength(zone, font=f_zone)/2, cy + int(H*0.115)), zone, font=f_zone, fill=col)
    # scale ends
    f_end = font(int(W*0.033))
    d.text((cx-Rr-int(W*0.01), cy+int(W*0.02)), "投降", font=f_end, fill=(120,118,110))
    rt = "狂热"; d.text((cx+Rr-d.textlength(rt,font=f_end)+int(W*0.01), cy+int(W*0.02)), rt, font=f_end, fill=(120,118,110))

    # verdict
    vy = cy + int(H*0.175)
    f_v = font(int(W*0.044))
    for ln in wrap(d, verdict, f_v, W-2*m):
        d.text((m, vy), ln, font=f_v, fill=K); vy += int(W*0.058)

    # indicator chips grid (7 -> 4 cols x 2 rows)
    gy = int(H*0.66); cols = 4; gw = (W-2*m); cw = gw//cols; chh = int(H*0.058)
    f_lbl = font(int(W*0.033)); f_num = font(int(W*0.052))
    def band(s): return B if s<20 else G if s<40 else Y if s<60 else R if s<80 else K
    for i,(lbl,s,_) in enumerate(parts):
        r,c = divmod(i, cols); x = m + c*cw; y = gy + r*int(chh*1.55)
        d.rounded_rectangle((x, y, x+cw-int(W*0.02), y+chh), radius=int(W*0.02),
                            outline=(205,201,193), width=2)
        d.text((x+int(W*0.02), y+int(chh*0.12)), lbl, font=f_lbl, fill=(120,118,110))
        ns = str(round(s))
        d.text((x+int(W*0.02), y+int(chh*0.42)), ns, font=f_num, fill=band(s))

    # footer
    fy = int(H*0.93)
    d.line([(m, fy-8), (W-m, fy-8)], fill=(200,196,188), width=2)
    f_ft = font(int(W*0.036))
    d.text((m, fy), f"BTC ${int(live['price']):,}", font=f_ft, fill=K)
    ft2 = "fuckbtc.com"; d.text((W-m-d.textlength(ft2,font=f_ft), fy), ft2, font=f_ft, fill=(120,118,110))
    return img, score, zone

def to_eink(img):
    """量化到 6 色调色板(dither=NONE 保文字锐利, 本卡无照片不需抖动)。"""
    pal = Image.new("P", (1,1))
    flat = []
    for c in PALETTE: flat += list(c)
    flat += list(Wt) * ((768-len(flat))//3)  # 未用槽位填纸白, 逼量化只落在6色内
    pal.putpalette(flat)
    return img.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/Users/mac26ai/Downloads/potato_pendulum.png")
    ap.add_argument("--w", type=int, default=W_DEFAULT)
    ap.add_argument("--h", type=int, default=H_DEFAULT)
    ap.add_argument("--no-quantize", action="store_true", help="跳过6色量化(出平滑预览)")
    a = ap.parse_args()
    print("[potato-eink] fetching live on-chain values...")
    live = fetch_live()
    # 超采样2x再缩放 = 抗锯齿更干净
    img, score, zone = build_frame(a.w*2, a.h*2, live)
    img = img.resize((a.w, a.h), Image.LANCZOS)
    if not a.no_quantize:
        img = to_eink(img)
    img.save(a.out)
    print(f"[potato-eink] score={score:.1f} zone={zone}  ->  {a.out}  ({a.w}x{a.h})")

if __name__ == "__main__":
    main()
