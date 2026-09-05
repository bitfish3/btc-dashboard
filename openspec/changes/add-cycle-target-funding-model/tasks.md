## 1. Model

- [x] 1.1 Implement pure allocation/target/funding calculations with finite-input and range validation.
- [x] 1.2 Test reference arithmetic, stress multiplier, reached targets, unavailable quotes, invalid inputs and overflow.

## 2. Dashboard

- [x] 2.1 Add the target section, labelled controls, presets and allocation table using existing design conventions.
- [x] 2.2 Connect valid price updates and expiry to the module without extra data requests or timers; preserve weekly contracts.
- [x] 2.3 Verify keyboard controls, mobile layout, input response and isolation from other dashboard sections in a browser.

## 3. Delivery

- [x] 3.1 Run existing and new checks, verify OpenSpec scenarios and record assumptions/evidence in handoff.
- [x] 3.2 Commit the verified change and publish through the existing Pages pipeline, then read back production results.

Published as f290a67; Pages deployment 02be8f06-5984-4679-b2d3-24f730683422. Both production domains passed real-browser quote/input checks with no page errors. Module files match local hashes; HTML differences are existing Cloudflare analytics/challenge injections.
