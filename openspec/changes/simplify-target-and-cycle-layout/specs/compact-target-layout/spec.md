## ADDED Requirements

### Requirement: Allocation is the only editable target input
The target strip SHALL default to 1.5% and show current estimated share, current BTC price, implied target price and positive net inflow using beginner-readable Chinese units. It SHALL retain the model explanation without a reference external link.

#### Scenario: Default target
- **WHEN** current price is $80,000 and the fixed assumptions are $300T, 20M BTC and 15–20x
- **THEN** the strip has one input at 1.5%, target price $225,000 and net inflow $145B–$193.33B.

#### Scenario: Missing or invalid data
- **WHEN** the quote expires or the allocation is invalid
- **THEN** funding is unavailable, no fake zero/NaN is shown, and the rest of the dashboard continues normally.

### Requirement: Cycle indicators share the available rows
The halving card SHALL appear beside the other cycle indicators without changing its data or calculation.

#### Scenario: Desktop layout
- **WHEN** the viewport is 1280px wide
- **THEN** all five cycle cards occupy one row, with no PSIP placeholder card.

#### Scenario: Mobile layout
- **WHEN** the viewport is 375px or 390px wide
- **THEN** halving shares the Puell row, the target strip wraps without page overflow, and sentiment text stays readable above its source status.
