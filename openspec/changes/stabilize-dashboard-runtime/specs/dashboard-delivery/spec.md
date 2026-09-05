## ADDED Requirements

### Requirement: Deployment remains a static Pages application
The application SHALL run as same-origin static files without a build step, a production dependency, a new backend or a Worker deployment.

#### Scenario: Local static preview
- **WHEN** the project is served by an ordinary HTTP static server
- **THEN** modules load and dashboard interactions work with no bundler or server application.

### Requirement: Weekly automation contract is preserved
The two auto-update constants SHALL remain exactly once in index.html with the original regex-compatible markers.

#### Scenario: Weekly replacement dry run
- **WHEN** the weekly script's existing replacement regexes are applied in memory
- **THEN** both replacements match exactly once and the controller consumes the resulting constants without running or modifying the auto-push script.

### Requirement: Delivery is reproducibly verified
The change SHALL include runtime/adapter regression tests, browser baseline and post-change evidence, and a self-contained handoff with rollback and known limitations.

#### Scenario: Verification from a clean local checkout
- **WHEN** the documented local checks are run
- **THEN** tests and source checks pass, and the report distinguishes controlled scenarios from external-network observations.

### Requirement: Existing user work is preserved
The implementation SHALL preserve the original uncommitted Worker and handover files and require explicit authorization before remote publishing.

#### Scenario: Local delivery completes
- **WHEN** the refactor is committed in the isolated worktree
- **THEN** original file hashes are unchanged and neither git push nor wrangler deploy has run.
