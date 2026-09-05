## ADDED Requirements

### Requirement: Verified year-specific high probabilities
The service SHALL serve only individually verified upward touch contracts for the requested year, with independent cache and concurrency state.

#### Scenario: Correct settlement year
- **WHEN** a 2027 contract has an individual deadline of 2028-01-01 05:00 UTC
- **THEN** it is eligible only for 2027 and cannot populate the 2028 API or page.

#### Scenario: No verified contracts
- **WHEN** a requested supported year has no verified contracts
- **THEN** the API returns an explicit not_listed state and empty markets; the page displays no fabricated prices or zero probabilities.

#### Scenario: Source failure
- **WHEN** the request or response body exceeds five seconds or fails validation
- **THEN** a valid partial result or explicitly stale cache no older than one day is used; cache restoration does not renew fetchedAt.

### Requirement: Main dashboard year comparison
The target section SHALL show independent 2027 and 2028 probability panels using the existing threshold tile style and linking each to its matching probs detail page.

#### Scenario: Four requested thresholds
- **WHEN** either year is displayed
- **THEN** $100k, $150k, $200k and $250k appear in order on both sites; absent quotes display `-- / 暂无报价`, never 0% or an extrapolated probability.

#### Scenario: Mobile and independent updates
- **WHEN** one year is slow or unavailable
- **THEN** the other year and BTC allocation model continue working, and both panels fit a 320-pixel viewport without horizontal overflow.

#### Scenario: Preserve allocation model
- **WHEN** market probabilities change or the user edits the allocation
- **THEN** allocation remains the only input with default 1.5%; probability data never alters target-price or funding arithmetic.

### Requirement: Probability subsite details and semantics
The probs subsite SHALL allow navigation between the 2026 dashboard and 2027/2028 high-probability pages, preserving language and displaying only actual quoted thresholds.

#### Scenario: Sparse threshold set
- **WHEN** only two contracts or incompatible opening windows are available
- **THEN** the page shows individual touch probabilities, volume and timestamps, and does not derive an annual peak, mode or probability density.

#### Scenario: Year and language navigation
- **WHEN** the visitor follows a year link or changes language
- **THEN** the destination identifies the selected year and keeps the same meaning, including the no-contract state.
