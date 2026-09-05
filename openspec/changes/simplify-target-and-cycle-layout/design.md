## Context

The existing model uses a $300T asset pool, 20M BTC supply, and a 15–20x capitalization impact assumption. These remain explicit assumptions, not reported global totals or a forecast.

## Decisions

Only allocation percentage is exposed, defaulting to 1.5%. Target price is 300T × allocation / 20M; current share uses the main dashboard's valid quote. Funding remains the positive capitalization gap divided by the impact range. At an $80,000 quote, 1.5% implies $225,000 and $145B–$193.33B of net inflow. Missing/expired quotes clear funding; targets already reached require no positive inflow.

The summary is one desktop row and a naturally wrapped strip on narrow screens. Fixed assumptions are disclosed under a native details element, without a reference external link. PSIP is removed; halving is the fifth cycle card. On mobile the first MVRV card spans the row, allowing halving to share the last row with Puell. Retained IDs, data requests, scoring logic and weekly markers remain intact.

## Validation

Pure arithmetic and invalid-input tests; exactly one input at 1.5%; keyboard/input updates; no new requests; stale quote behavior; six responsive widths; desktop and mobile halving row alignment. The earlier sentiment card regression remains covered.
