## Context

The existing model uses a $300T asset pool, 20M BTC supply, and a 15–20x capitalization impact assumption. These remain explicit assumptions, not reported global totals or a forecast.

## Decisions

Only allocation percentage is exposed. Target price is 300T × allocation / 20M; current share uses the main dashboard's valid quote. Funding remains the positive capitalization gap divided by the impact range. At an $80,000 quote, 2% implies $300,000 and $220B–$293.33B of net inflow. Missing/expired quotes clear funding; targets already reached require no positive inflow.

The summary is one desktop row and a naturally wrapped strip on narrow screens. Fixed assumptions are disclosed under a native details element. Halving moves from the anchor grid to the sixth cycle card, filling the former odd final card on mobile. Existing IDs, data requests, scoring logic and weekly markers remain intact.

## Validation

Pure arithmetic and invalid-input tests; exactly one input at 2%; keyboard/input updates; no new requests; stale quote behavior; six responsive widths; desktop and mobile halving row alignment. The earlier sentiment card regression remains covered.
