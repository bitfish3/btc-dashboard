## Why

Strategy changed its reported mNAV definition on 2026-07-23. The dashboard headline still showed a locally derived EV/BTC ratio, and missing share inputs hid otherwise available official data. The MSTR subsite also had a stale publication pipeline and source parsing errors, addressed in the related producer repairs.

## What Changes

- Accept explicitly named official mNAV and its own reported date independently of BTC spot and shares.
- Preserve per-source provenance and label historical EV/BTC as a comparison.
- Keep BMNR and existing cache expiry behavior independent.

## Capabilities

### New Capabilities
- `official-mstr-contract`: reported MSTR values with explicit provenance and independent fallback semantics.

### Modified Capabilities

None.

## Impact

Static dashboard adapters, MSTR card rendering, cache validation and browser fixtures. Related Worker and MSTR producer sources are maintained in separate local repositories and deployments; no new hosting service is introduced.
