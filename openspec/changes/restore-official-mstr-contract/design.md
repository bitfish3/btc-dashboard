## Context

The Worker provides `mstr.official_mnav`, `official_mnav_as_of`, and structured `source_as_of`. Treasury and live quote data have separate source clocks. The old locally derived ratio remains useful as a comparison but cannot stand in for the issuer's current definition.

## Goals / Non-Goals

Show the reported value even when current BTC or share inputs are absent; preserve the meaning and source dates of all displayed ratios. No new market data requests, dependencies, or hosting changes are required for this adapter.

## Decisions

Only explicitly named official fields qualify. Generic `mnav` is ambiguous. Preserve the provenance object verbatim and use the official value's own date for its headline. Reuse the normalized validator for persisted MSTR input. Legacy derived caches keep their original timestamp and an explicit non-official label.

## Risks / Trade-offs

Unavailable sources remain unavailable; a price cannot manufacture a missing official valuation. The producer's Pages fallback preserves its actual snapshot/source age, and the UI discloses the reported date. Production validation must include CF egress behavior, since local Strategy requests may succeed while CF receives 403/429.
