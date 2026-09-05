# 合约核验 · 2026-09-05

已查询 Polymarket 与 Kalshi 一手公开接口。以下是本次扫描覆盖结论，不保证未来不会上市新合约。

| 年份 | $100k | $150k | $200k | $250k |
| --- | --- | --- | --- | --- |
| 2027 | 已验证，Yes 84% | 已验证，Yes 18% | 未找到 | 未找到 |
| 2028 | 未找到 | 未找到 | 未找到 | 未找到 |

2027 价格来自各自二元合约的 Yes 下标；前端百分比 = `Yes price × 100`。这些是合约开市至美东 2027 年末的触价概率，不是年底收盘价、当年独立最高价或目标价预测。

- [Polymarket $100k 市场 3748067](https://gamma-api.polymarket.com/markets/3748067)：`will-bitcoin-hit-100k-by-december-31-2027`；本次成交量约 $929.37。
- [Polymarket $150k 市场 3747578](https://gamma-api.polymarket.com/markets/3747578)：`will-bitcoin-hit-150k-by-december-31-2027`；本次成交量约 $9,729.42。
- 两者 individual endDate 均为 `2028-01-01T05:00:00Z`，属于 2027 年末口径。不能因为 UTC 日期写 2028 而归到 2028 看板。
- [Polymarket Bitcoin tag active/open 扫描入口](https://gamma-api.polymarket.com/markets?tag_id=235&active=true&closed=false&limit=100&offset=0)：分页至结束，共 782 条。2028 命中的是减半相关市场，未找到价格/高点合约；2027 年末只找到上面两档。
- [Kalshi KXBTCMAXY 事件列表](https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=KXBTCMAXY)：只有 2024/2025/2026，没有 2027/2028 年度最高价事件。
- [Kalshi open events 扫描入口](https://api.elections.kalshi.com/trade-api/v2/events?status=open&limit=200)：分页至 cursor 耗尽，共 14,024 条、26 条 BTC 命中，没有 2027/2028 高点价格合约。

原始扫描 JSON 与详尽只读核验报告保留在本次本地 QA 证据中。上线系统只轮询已核验白名单，不在每次访问时执行大规模市场搜索。后续新合约需要先核对标题、ID、独立截止和结算口径，再更新年份白名单。
