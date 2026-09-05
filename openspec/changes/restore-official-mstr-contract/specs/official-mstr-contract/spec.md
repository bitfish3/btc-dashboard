## ADDED Requirements

### Requirement: Official MSTR valuation is independent of local ratio inputs
The dashboard SHALL display explicitly reported official mNAV with its source date without requiring current BTC price or share count.

#### Scenario: Official-only payload
- **WHEN** the API provides official mNAV 1.15 and its reported date but no BTC price or shares
- **THEN** the MSTR headline displays 1.15x and the official date while unsupported local ratios remain unavailable.

### Requirement: Legacy ratios preserve their meaning
The dashboard SHALL label EV/BTC as a non-official comparison and SHALL NOT promote an ambiguous generic mnav field to an official value.

#### Scenario: Legacy cached ratio
- **WHEN** only a valid legacy EV/BTC cache is available
- **THEN** its numeric value and original cache time remain available with a historical non-official label.

### Requirement: Provenance and company isolation remain intact
The dashboard SHALL preserve structured source dates, validate persisted MSTR input consistently, and keep BMNR independent.

#### Scenario: MSTR incomplete but BMNR complete
- **WHEN** MSTR lacks usable official and legacy data and BMNR includes valid ETH inputs
- **THEN** BMNR displays normally and MSTR remains unavailable without fabricated values.
