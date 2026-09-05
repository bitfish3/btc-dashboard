## Decisions

Provider diagnostics stay inside collectors and caches. HTTP serialization uses a public projection; Pages snapshots convert field provenance into date-only freshness metadata so cached fields retain their original clocks. No query parameter can enable internal diagnostics.

2027 data comes from the individual markets `will-bitcoin-hit-100k-by-december-31-2027` and `will-bitcoin-hit-150k-by-december-31-2027`. Their market end time is 2028-01-01 05:00 UTC, corresponding to the end of 2027 in US Eastern time. Event-level dates are not used. The outcome is a touch by that deadline from the contract's starting window, not a year-end close. Yes-index, question, status, date and numeric ranges must validate.

Prediction data uses a separate KV key, ten-minute freshness and a one-day maximum fallback. Requests and response bodies share a five-second deadline; failures preserve original times and cannot block the 2026 dashboard. The main dashboard uses its existing scheduler and keeps this read-only row separate from its one editable allocation input.

MSTR capital values are parsed from issuer disclosures. BTC Supply uses the issuer's total-supply-cap basis, replacing the stale 19.92M circulation label. Global runway's main numerator remains USD Reserve; the reported annual interest/dividend amount is preferred over a partial preferred-series sum. STRE's published USD notional is already currency-converted and must not be multiplied by FX again or presented as actual EUR share count.

Historical weekly rows are preserved and deduplicated by period/as-of, with older populated fields retained when a new parser lacks those fields. Missing data may not be replaced by zero or a hardcoded current financial value.
