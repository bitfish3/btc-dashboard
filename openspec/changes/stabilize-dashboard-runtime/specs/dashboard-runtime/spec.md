## ADDED Requirements

### Requirement: Requests have a complete lifetime budget
The runtime SHALL bound fetch and body decoding within the configured timeout and reject HTTP errors or malformed JSON.

#### Scenario: Body stalls after headers
- **WHEN** fetch resolves headers but the JSON body never completes
- **THEN** the request rejects within its timeout budget and can be retried.

#### Scenario: Invalid winner or slow competing source
- **WHEN** one racing source returns invalid data and another returns a valid result
- **THEN** only the valid result wins and outstanding requests are aborted.

### Requirement: Valid last-good values survive storage and source failures
The store SHALL validate cached and new values, preserve timestamps on failure, reject future timestamps, and continue through storage exceptions using memory.

#### Scenario: Storage fails or contains corrupt values
- **WHEN** localStorage throws or contains malformed or invalid records
- **THEN** application initialization continues and valid network values remain available in memory.

#### Scenario: A refresh fails
- **WHEN** a previously populated metric fails to refresh
- **THEN** the existing valid value remains with its original fetch/source timestamp and its cached/stale status is visible.

### Requirement: Refresh tasks do not overlap and follow visibility
The scheduler SHALL prevent concurrent executions of the same task, periodically refresh every dynamic metric, back off failures, and start no network tasks while inactive.

#### Scenario: Refresh takes longer than interval
- **WHEN** a task is still running at its next interval or a manual refresh is requested
- **THEN** no duplicate execution of that task starts.

#### Scenario: Tab is hidden then restored
- **WHEN** the page becomes hidden/offline and later active again
- **THEN** no new requests start while inactive and only due tasks refresh on return.

### Requirement: Users can observe data availability
Each dynamic data area SHALL distinguish initial loading, available, cached/stale and unavailable states, without displaying fetch time as source freshness.

#### Scenario: All sources fail without cache
- **WHEN** a metric exhausts its request budget without valid data
- **THEN** its area leaves indefinite loading and shows an unavailable state while other areas remain usable.
