#!/usr/bin/env python3
"""BTC 价位哨兵 — 盯结构价值抄底带（$50-52k 首批 / $40-50k 加码 / 深锚）。

数据源：Binance 现货（moomoo OpenAPI 无 BTC 现货 feed，故走 Binance，与结构价值决策同源）。
告警：统一 Discord webhook + Pushover high priority。异常驱动——只在跨越价位时报，不报常态。
迟滞：每档触发一次；价格回到档位 +3% 以上才重新武装（避免抖动刷屏）。
决策来源：~/A/F/invest/structural-value-btc-抄底-20260606/（终裁「通过-好决策」）。
状态：~/.btc_sentinel_state.json
"""
from __future__ import annotations
import json
import os
import sys
import urllib.request
from pathlib import Path

STATE_PATH = Path.home() / ".btc_sentinel_state.json"
REARM_BUFFER = 0.03  # 回到档位 +3% 才重新武装

# (阈值USD, 档位key, 优先级, 消息) — 由高到低，价格 <= 阈值 触发
LEVELS: list[tuple[float, str, int, str]] = [
    (55000, "approach", 0,
     "⚪ 接近第一批带：BTC 跌破 $55k（市场赔率 P=81% 已兑现）。准备弹药（短债→待换），暂不动手。"),
    (52000, "batch1_top", 1,
     "🟢 第一批带触及：BTC ≤ $52k！realized $50.8k + 2022底VWAP $51.5k 双锚收敛带。启动首批主力——禁杠杆、仓位封顶（$15-20k 归零下限定）。"),
    (50000, "batch1_floor", 1,
     "🟢 第一批带下沿：BTC ≤ $50k！全体持有成本锚位。首批主力区，分批不一次打光（最脆支柱=realized 失真，第一批带可能整体偏低）。"),
    (40000, "deep_anchor", 1,
     "🟢🟢 加码深锚：BTC ≤ $40k！balancedPrice $39.8k 链上深锚。仓位上限内加码。先核结构有没有从折扣滑向贬值（LTH 持续亏本交出/成本线下移=停手）。"),
    (33000, "extreme", 1,
     "🔴 极端地板：BTC ≤ $33k！2017 全周期 VWAP，临近归零下限 $15-20k。仓位封顶检查——禁被迫平仓。"),
]


def fetch_btc_price() -> float:
    """Binance 现货 BTCUSDT 最新价。失败抛异常。"""
    url = "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
    req = urllib.request.Request(url, headers={"User-Agent": "btc-sentinel/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
        return float(data["price"])
    except Exception as e:
        raise RuntimeError(f"Binance 取价失败: {e}") from e


def load_state() -> dict:
    if STATE_PATH.exists():
        try:
            return json.loads(STATE_PATH.read_text())
        except Exception:
            return {}
    return {}


def save_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2))


def post_discord(content: str) -> None:
    webhook = os.environ.get("DISCORD_WEBHOOK_URL", "").strip()
    if not webhook:
        print("[warn] DISCORD_WEBHOOK_URL 未设置，跳过 Discord", file=sys.stderr)
        return
    body = json.dumps({"content": content, "username": "BTC 抄底哨兵"}).encode()
    req = urllib.request.Request(
        webhook, data=body,
        headers={"Content-Type": "application/json", "User-Agent": "btc-sentinel/1.0"},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:
        print(f"[warn] Discord 推送失败: {e}", file=sys.stderr)


def post_pushover(message: str, title: str, priority: int) -> None:
    user = os.environ.get("PUSHOVER_USER_KEY", "").strip()
    token = os.environ.get("PUSHOVER_APP_TOKEN", "").strip()
    if not (user and token):
        print("[warn] PUSHOVER 凭证未设置，跳过 Pushover", file=sys.stderr)
        return
    payload = {
        "token": token, "user": user, "message": message, "title": title,
        "priority": str(priority),
    }
    if priority >= 1:
        payload.update({"sound": "siren"})
    import urllib.parse
    body = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(
        "https://api.pushover.net/1/messages.json", data=body,
        headers={"User-Agent": "btc-sentinel/1.0"}, method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:
        print(f"[warn] Pushover 推送失败: {e}", file=sys.stderr)


def main() -> int:
    dry = "--dry-run" in sys.argv
    try:
        price = fetch_btc_price()
    except RuntimeError as e:
        print(str(e), file=sys.stderr)
        return 1

    state = load_state()
    fired: dict = state.get("fired", {})
    new_fired = dict(fired)
    triggered = []

    for thresh, key, prio, msg in LEVELS:
        armed = not fired.get(key, False)
        if price <= thresh and armed:
            triggered.append((thresh, key, prio, msg))
            new_fired[key] = True
        elif price > thresh * (1 + REARM_BUFFER) and fired.get(key, False):
            # 价格回到档位 +3% 以上 → 重新武装
            new_fired[key] = False

    for thresh, key, prio, msg in triggered:
        full = f"{msg}\n现价 ${price:,.0f} · 阈值 ${thresh:,.0f} · 决策 O3（结构价值终裁·通过-好决策）"
        if dry:
            print(f"[DRY] would alert [{key}/p{prio}]: {full}")
        else:
            post_discord(full)
            if prio >= 1:
                post_pushover(
                    f"{msg}\n现价 ${price:,.0f}", title="BTC 抄底哨兵", priority=prio)
            print(f"[ALERT] {key} @ ${price:,.0f}", flush=True)

    state["fired"] = new_fired
    state["last_price"] = price
    if not dry:
        save_state(state)

    armed_levels = [k for _, k, _, _ in LEVELS if not new_fired.get(k, False)]
    print(f"BTC ${price:,.0f} | 触发 {len(triggered)} | 武装中: {armed_levels}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
