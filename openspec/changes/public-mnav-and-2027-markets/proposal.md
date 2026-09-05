## Why

The user requested a business-only mNAV API, restoration of the historical MSTR flow table and capital/runway metrics, and verified 2027 prediction-market data beside the single allocation target.

## What Changes

- Expose normalized mNAV values and dates at `/api/mnav`, without provider/reader names, source URLs or formula metadata. The legacy endpoint uses the same public projection.
- Preserve the original ten weekly SEC flow records and merge future periods without truncation.
- Restore BTC supply share, issuer-reported net leverage, STRC reserve runway and global reserve runway. USD Assets coverage is a separately labelled supplement.
- Add cached 2027-end touch probabilities for verified $100k and $150k Polymarket contracts; do not infer a terminal price or feed these probabilities into the allocation/funding model.
- Apply the user's final preferences: 1.5% allocation default, no target reference link, no PSIP placeholder.

## Capabilities

### New Capabilities
- `public-market-contracts`: public business projections and explicit prediction-market horizons.

### Modified Capabilities

None. Existing calculations and fixture coverage remain in place.

## Impact

Main dashboard adapters/rendering, existing probability and mNAV Workers, and the public MSTR publisher. No new hosting service, credentials, bindings or cron schedules are introduced.
