## ADDED Requirements

### Requirement: Metrics accept semantically valid inputs
Adapters SHALL validate finite numbers and required structures. Historical averages SHALL require 200 valid candles. Unknown PSIP semantics SHALL NOT be interpreted as percentages.

#### Scenario: Invalid or short historical series
- **WHEN** a provider returns null, non-finite, non-positive close values or fewer than 200 candles
- **THEN** that source is rejected and cannot corrupt existing values or win a race.

#### Scenario: Legacy PSIP field lacks an explicit contract
- **WHEN** the existing Worker returns an unverified PSIP field
- **THEN** the page shows no fabricated percentage and excludes it from the composite score.

### Requirement: Independent sources render independently
Price SHALL render without hashrate, and STRC flywheel and issuance SHALL retain and display their independent successful values.

#### Scenario: Price succeeds while hashrate hangs
- **WHEN** a controlled price response arrives in 50ms while hashrate remains pending
- **THEN** price becomes visible within 1s and other usable data is not blocked.

#### Scenario: STRC issuance fails
- **WHEN** flywheel data succeeds while issuance fails or remains pending
- **THEN** flywheel data is displayed immediately and previous issuance data is preserved with its own state.

### Requirement: Derived values follow validated dependencies
ahr999, price ratios, VWAP ratios, MSTR mNAV and the cycle composite SHALL recalculate when valid dependencies change. Missing prices SHALL NOT be replaced by fabricated defaults.

#### Scenario: Quote arrives after other data
- **WHEN** candle or MSTR data arrives before a valid BTC quote
- **THEN** independent data is retained and derived values render once a valid quote arrives, without polling waits or zero-valued calculations.

#### Scenario: Insufficient cycle evidence
- **WHEN** valid evidence covers less than 60% of the model weight or fewer than three components
- **THEN** the composite displays data insufficiency and the available coverage instead of a definite cycle score/verdict.

### Requirement: Cached data is usable without a network round trip
All supported validated card caches SHALL render during module initialization, with cache age and no expired inputs in derived computations.

#### Scenario: Warm load with slow network
- **WHEN** valid caches exist for MVRV-Z, SOPR and Puell and network responses are delayed
- **THEN** all three values appear from cache before the first network result.
