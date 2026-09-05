## ADDED Requirements

### Requirement: Allocation scenarios map consistently to valuation
The module SHALL calculate target capitalization and BTC price from an explicitly labelled asset-pool and supply assumption, and SHALL offer 1%, 1.5%, 2%, 2.5%, 3% and 5% allocation scenarios.

#### Scenario: Allocation unit conversion
- **WHEN** the asset pool is $300T and supply is 20M BTC
- **THEN** the 1% level shows $3T capitalization and $150,000 per BTC.

### Requirement: Funding calculations distinguish cash from capitalization
The module SHALL derive funding estimates using a positive configurable capitalization multiplier and time range, with transparent equations and assumption labels.

#### Scenario: Reference funding arithmetic
- **WHEN** current price is $80,000, target is $170,000, supply is 20M BTC, multiplier is 15–20 and horizon is 2–3 years
- **THEN** the capitalization gap is $1.8T, cumulative funding is $90–120B, annual funding is $30–60B and monthly funding is $2.5–5B.

#### Scenario: Stress multiplier
- **WHEN** the user applies the 5x stress preset to the same target
- **THEN** cumulative funding becomes $360B and other user inputs remain unchanged.

#### Scenario: Target already reached
- **WHEN** a scenario target capitalization is at or below current capitalization
- **THEN** positive funding required is zero and the module explicitly marks the target as reached.

### Requirement: Missing or invalid inputs cannot corrupt the dashboard
The module SHALL reject invalid or overflowing parameters locally, and SHALL not infer funding from a missing or stale current quote.

#### Scenario: Missing current quote
- **WHEN** current price is unavailable or expired
- **THEN** independent target valuations remain visible but current capitalization, capitalization gap and funding estimates are unavailable rather than calculated from zero.

#### Scenario: Invalid parameter input
- **WHEN** supply is zero, a range is reversed, a value is non-finite, or derived arithmetic overflows
- **THEN** a labelled validation message appears with no NaN/Infinity and no failure in the main dashboard's quote task.

### Requirement: Controls are responsive and accessible
The module SHALL use labelled keyboard-operable controls, preserve the existing mobile layout, and update calculations without introducing network requests.

#### Scenario: User changes a model parameter
- **WHEN** a valid target or asset-pool input changes
- **THEN** the displayed target and funding results update together within 100ms on the controlled test environment.

#### Scenario: Static and runtime compatibility
- **WHEN** the dashboard loads with the new module, or the module's DOM is absent in an older HTML document
- **THEN** other dashboard sections initialize normally, existing weekly markers remain intact and the module starts no data-fetching timers.
