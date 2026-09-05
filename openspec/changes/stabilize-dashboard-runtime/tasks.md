## 1. Baseline and isolation

- [ ] 1.1 Complete qa-only production baseline with reproduced issues, screenshots, score and limitations.
- [x] 1.2 Back up existing working tree and create isolated codex/stable-fast-dashboard branch; record original hashes.

## 2. Runtime foundation

- [ ] 2.1 Implement fully bounded JSON requests and cancellable validated source racing, with regression tests.
- [ ] 2.2 Implement validated memory-backed persistent cache with timestamp handling and storage-failure tests.
- [ ] 2.3 Implement non-overlapping visibility-aware task scheduling and bounded failure backoff, with deterministic tests.

## 3. Data and presentation

- [ ] 3.1 Extract data-source adapters with validated schemas, full candle counts and independent STRC sources.
- [ ] 3.2 Extract dashboard controller, preserve weekly constants, and replace scattered timers with task registry.
- [ ] 3.3 Restore all valid caches and add visible per-area loading/cache/stale/unavailable state.
- [ ] 3.4 Recompute derived metrics on validated dependency changes; remove fabricated fallback values and apply evidence coverage gate.
- [ ] 3.5 Resolve reproduced UI/accessibility issues within scope and verify responsive layout and slider performance.

## 4. Verification and delivery

- [ ] 4.1 Provide reproducible test/source-check scripts and weekly regex contract check; run all required checks.
- [ ] 4.2 Perform controlled browser failure/recovery tests and live-source local regression; record performance boundaries and evidence.
- [ ] 4.3 Verify all OpenSpec requirements/scenarios and deliver self-contained handoff with release/rollback instructions.
- [ ] 4.4 Verify original hashes unchanged and create local atomic commits; present completed result for publishing authorization.
