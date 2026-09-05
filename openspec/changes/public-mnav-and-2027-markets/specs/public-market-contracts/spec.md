## ADDED Requirements

### Requirement: Public mNAV responses conceal internal sources
Public mNAV responses and the MSTR page SHALL show business values and dates without reader/provider chains, source URLs, or mNAV definition/formula fields.

#### Scenario: Public response
- **WHEN** an internal response includes reader/source diagnostics and official mNAV
- **THEN** the public API preserves mNAV and its date and omits internal diagnostics on both supported routes.

#### Scenario: Homepage mNAV API timeout
- **WHEN** the mNAV API is slow, fails, or lacks official MSTR data, and the already fetched MSTR snapshot has valid official mNAV
- **THEN** the homepage renders that official value with its disclosure date without adding a network request or waiting for the API deadline.
- **AND** BMNR continues independently; an equally or more recently dated official API value takes precedence when it arrives.
- **AND** missing issuance data does not suppress official mNAV; legacy EV/Basic ratios cannot substitute for official mNAV.

#### Scenario: Snapshot fallback expires
- **WHEN** the snapshot or its official data date is more than seven days old or in the future, or its local fetch cache exceeds thirty minutes without a successful refresh
- **THEN** the snapshot cannot supply the headline; restoring it from storage never renews its original cache timestamp.

### Requirement: Historical and capital data survive refreshes
The publisher SHALL retain complete historical weekly rows and compute supported capital metrics with explicit, consistent denominators.

#### Scenario: MSTR public refresh
- **WHEN** ten historical rows and current verified issuer data are available
- **THEN** all ten rows remain, STRC runway uses reserve/STRC dividends, global runway uses reserve/annual interest-and-dividend need, and USD Assets coverage is separate.

### Requirement: 2027 predictions preserve contract meaning and freshness
The API SHALL validate individual-market horizons and output only normalized 2027-end touch probabilities, with bounded timeouts and cache ages.

#### Scenario: Verified 2027 markets
- **WHEN** both verified markets are active with valid Yes prices and the expected settlement date
- **THEN** the target section shows both thresholds and probabilities as touch-by-2027 data, independently of allocation funding estimates.

#### Scenario: Upstream failure
- **WHEN** a source or body times out
- **THEN** valid partial data or explicitly stale last-good data may be served within its one-day limit; absent usable data returns unavailable without invented probabilities.
