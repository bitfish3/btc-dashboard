- [x] Add and verify public mNAV response projection and clean page rendering.
- [x] Restore ten-period history and preserve it across public refreshes.
- [x] Restore disclosed capital metrics and correct runway denominators/currency handling.
- [x] Verify 2027 market slugs, individual dates and semantics against the first-party API.
- [x] Implement bounded cached forecast API and the read-only target row.
- [x] Complete release validation and production read-back.

Production verified: main e89fca9 (Pages b94995d3-f8e1-4881-b956-12c23ef01239); MSTR 9498581 (cf3d969d.flywheel-monitor.pages.dev); mNAV Worker 3c06961c-36e0-469b-892a-a658c878dd03; prediction Worker 2bbcd1bd-dc39-48a2-91f8-f62f8dc3bf15. Main: 38 unit tests and 15 browser scenarios. MSTR: 42 tests. mNAV: 27 tests. Prediction service: 33 tests. Both main domains and MSTR public HTML/JSON were read back successfully.

### Homepage mNAV timeout repair

- [x] Reproduce a homepage mNAV request abort while the MSTR snapshot retains official mNAV.
- [x] Reuse the existing snapshot request with independent official/issuance normalization, disclosure dates, and bounded cache age.
- [x] Preserve BMNR independence and prefer equally/newer dated official API data over the snapshot.
- [x] Verify API timeout, partial response, newer official response, missing ATM, future snapshot, cache restore and expiry. Main: 44 unit tests, 20 browser scenarios, six viewport widths, and static checks pass.

Local real-source acceptance: deliberately aborting `/api/mnav` still renders official 1.15x dated 2026-09-04 using the production MSTR snapshot (HTTP 200); mobile viewport has no horizontal overflow. No new external request is added.
