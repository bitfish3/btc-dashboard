#!/usr/bin/env python3
"""每周预计算 BTC 全周期 VWAP 成本锚 (币安现货 + Coinbase 现货 + IBIT ETF 合成).

写 ~/P/btc-dashboard/vwap.json 并 git commit+push → CF 自动部署.
单 IP 顺序抓 Coinbase 避限流 (CF worker 共享 IP 会被 429 → 覆盖不足 → 数值错).
合成 VWAP = Σ(三源成交额 USD) / Σ(三源 BTC/BTC等价量).
由 launchd 每周触发, 前端只读这个 json + 算实时倍数, 不再客户端多源拼装(避免刷新跳变).
经 Codex 独立交叉验证, 三锚点误差 <0.5%.
"""
import urllib.request, json, datetime, time, subprocess, sys, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # ~/P/btc-dashboard


def get(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def dtms(y, m, d):
    return int(datetime.datetime(y, m, d, tzinfo=datetime.timezone.utc).timestamp() * 1000)


def dts(y, m, d):
    return dtms(y, m, d) // 1000


ANCHORS_MS = {"2017": 0, "2022": dtms(2022, 11, 21), "halv": dtms(2024, 4, 20)}
ANCHORS_S = {"2017": 0, "2022": dts(2022, 11, 21), "halv": dts(2024, 4, 20)}


def binance_sums():
    """周线: idx5=base量(BTC), idx7=quoteAssetVolume(USDT≈USD=Σ价*量)."""
    k = get("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1w&limit=1000")
    acc = {a: [0.0, 0.0] for a in ANCHORS_MS}
    for c in k:
        for a, anchor in ANCHORS_MS.items():
            if c[0] >= anchor:
                acc[a][0] += float(c[7])
                acc[a][1] += float(c[5])
    return acc


def coinbase_sums():
    """BTC-USD 日线分页(300/页), 顺序+重试避 429; 典型价(H+L+C)/3 × 量."""
    G, per = 86400, 300
    start, now = dts(2017, 8, 14), int(time.time())
    seen = {}
    cur = now
    while cur > start:
        s = cur - per * G
        for _ in range(3):
            try:
                d = get(f"https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity={G}&start={s}&end={cur}")
                if isinstance(d, list):
                    for c in d:
                        if isinstance(c, list) and len(c) >= 6:
                            seen[c[0]] = c
                    break
            except Exception:
                time.sleep(1.0)
        cur = s
        time.sleep(0.2)
    if len(seen) < 3000:
        raise RuntimeError(f"Coinbase 覆盖不足: {len(seen)} 天 (疑似限流), 放弃以免污染")
    acc = {a: [0.0, 0.0] for a in ANCHORS_S}
    for c in seen.values():
        tp = (c[2] + c[1] + c[4]) / 3
        v = c[5]
        for a, anchor in ANCHORS_S.items():
            if c[0] >= anchor:
                acc[a][0] += tp * v
                acc[a][1] += v
    return acc, len(seen)


def ibit_parts(btc):
    """IBIT 日线: 全历史(2017/2022锚) + 减半起(halv锚). BTC等价量 = 股数 × (IBIT价/BTC价)."""
    d = get("https://query1.finance.yahoo.com/v8/finance/chart/IBIT?interval=1d&range=3y")
    r = d["chart"]["result"][0]
    ts, q = r["timestamp"], r["indicators"]["quote"][0]
    ipx = r["meta"]["regularMarketPrice"]
    s = ipx / btc  # BTC per IBIT share

    def parts(anchor_s):
        usd = sh = 0.0
        for i in range(len(ts)):
            H, L, C, V = q["high"][i], q["low"][i], q["close"][i], q["volume"][i]
            if None in (H, L, C, V) or not V or ts[i] < anchor_s:
                continue
            usd += ((H + L + C) / 3) * V
            sh += V
        return usd, sh * s  # USD 成交额, BTC等价量

    allp = parts(0)
    halvp = parts(dts(2024, 4, 20))
    return {"2017": allp, "2022": allp, "halv": halvp}, ipx, s


def main():
    btc = float(get("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT")["lastPrice"])
    bn = binance_sums()
    cb, cb_days = coinbase_sums()
    ib, ipx, s = ibit_parts(btc)
    a = {}
    for k in ("2017", "2022", "halv"):
        num = bn[k][0] + cb[k][0] + ib[k][0]
        den = bn[k][1] + cb[k][1] + ib[k][1]
        a[k] = int(round(num / den))

    # 直接把数值写进 index.html 的 VWAP_VALUES 常量行 (网页只显示存好的值, 不计算)
    index = ROOT / "index.html"
    html = index.read_text()
    new_line = ("    const VWAP_VALUES = { "
                f"'2017': {a['2017']}, '2022': {a['2022']}, 'halv': {a['halv']} "
                "}; // @vwap-auto")
    html2, n = re.subn(r"    const VWAP_VALUES = \{[^}]*\}; // @vwap-auto", new_line, html)
    if n != 1:
        sys.exit(f"ERROR: VWAP_VALUES 锚行未匹配 (n={n}), 放弃")
    print(f"computed {a} | cb_days {cb_days} | btc {round(btc)} | ibit {ipx}")
    if html2 == html:
        print("no change")
        return
    index.write_text(html2)

    # 删掉旧的 vwap.json (已改为内置常量)
    if (ROOT / "vwap.json").exists():
        subprocess.run(["git", "-C", str(ROOT), "rm", "-q", "vwap.json"], check=False)
    subprocess.run(["git", "-C", str(ROOT), "add", "index.html"], check=True)
    r = subprocess.run(
        ["git", "-C", str(ROOT), "commit", "-m", f"chore(vwap): 每周刷新数值 {a}"],
        capture_output=True, text=True,
    )
    if r.returncode == 0:
        subprocess.run(["git", "-C", str(ROOT), "push", "origin", "main"], check=True)
        print("committed + pushed")
    else:
        print("commit skipped:", (r.stdout or r.stderr).strip()[:200])


if __name__ == "__main__":
    main()
