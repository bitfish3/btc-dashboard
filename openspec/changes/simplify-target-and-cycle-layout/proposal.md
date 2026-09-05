## Why

The user wants a beginner-readable target line with one input, rather than the initial multi-parameter calculator. The halving card also occupied a row by itself below the valuation anchors.

## What Changes

- The only editable target parameter is BTC's share of global allocatable assets, defaulting to 1.5%.
- Show current estimated share and price, implied target price, and cumulative net inflow in one compact strip. Use Chinese money units and naturally wrap on mobile.
- Keep the fixed model assumptions and equations in a collapsed explanation.
- Remove the unavailable PSIP card. Desktop shows five cycle cards in one row; mobile pairs halving with Puell, with MVRV occupying the first full-width row.
- Remove the target module's reference external link while retaining the model assumptions.

## Capabilities

### New Capabilities
- `compact-target-layout`: a single-input, responsive target summary and grouped cycle indicators.

### Modified Capabilities

None. This user-directed presentation supersedes the initial calculator controls while retaining its pure financial calculations.

## Impact

Static HTML/CSS, the target controller, and targeted browser assertions. No additional network calls or infrastructure changes.
