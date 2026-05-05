# Code Review Request: Bulk Seed Feature Implementation

## Purpose

You are requested to perform a thorough code review of the bulk seed feature implementation. This feature generates large test datasets (~500 tenants, ~8,000 users, ~2,700 projects) for development and testing purposes, specifically to support pagination, search, and UI performance testing scenarios.

## Context

- **Branch**: `feature/bulk-seed-for-testing`
- **Target Branch**: `main`
- **Type of Review**: Feature implementation review (pre-merge)

## Scope

### Files to Review

```
apps/api/Program.cs                           # CLI delegation pattern
apps/api/Src/Lib/Seeding/BulkSeeder.cs       # Core seeding logic
apps/api/Src/Lib/Seeding/BulkSeedCli.cs       # CLI entry point
apps/api/Src/Lib/Seeding/BulkSeedConstants.cs # Configuration
apps/api/Src/Lib/Seeding/BulkSeedDataGenerator.cs # Test data generation
Makefile                                      # Build targets (lines 221-227)
Directory.Packages.props                      # Bogus package addition
```

### What This Feature Does

1. **Bulk Seed**: Generates realistic test data using Bogus library
   - 500 tenants (90% active, 10% soft-deleted)
   - 8,000 users (200 power users, 1,400 cross-tenant, 6,400 single-tenant)
   - ~12,600 user accounts (junction table)
   - ~2,700 projects (3-10 per tenant)

2. **Bulk Reset**: Cleans up all bulk-generated data using prefix matching

3. **Commands**:
   ```bash
   make seed-bulk        # Generate test data
   make seed-bulk-reset # Clean up test data
   ```

## Review Criteria

### 1. Functional Correctness

- [ ] Verify batch processing logic handles transactions correctly
- [ ] Confirm foreign key dependencies are respected (tenants → users → accounts → projects)
- [ ] Validate soft-delete handling for entities
- [ ] Check that reset properly cleans ALL related data in correct order

### 2. Architecture & Design

- [ ] Assess the `BulkSeedCli.TryRun(args)` pattern for CLI routing
- [ ] Evaluate separation of concerns: Cli ↔ Seeder ↔ Generator ↔ Constants
- [ ] Consider if the feature could conflict with existing seeding infrastructure
- [ ] Review naming conventions and namespace usage

### 3. Performance & Resource Management

- [ ] Evaluate batch size (500) appropriateness
- [ ] Verify `ChangeTracker.Clear()` prevents memory leaks
- [ ] Check for potential N+1 queries or inefficient patterns
- [ ] Assess transaction scope per batch

### 4. Security

- [ ] Audit raw SQL DELETE queries for injection vulnerabilities
- [ ] Verify hardcoded prefixes in SQL are safe
- [ ] Consider if test-only features expose any risks
- [ ] Review connection string handling

### 5. Code Quality

- [ ] Check for code duplication between seed/reset paths
- [ ] Verify constant values are properly extracted
- [ ] Review error handling and edge cases
- [ ] Assess logging and user feedback (progress output)

### 6. Maintainability

- [ ] Consider if configuration values should be env vars vs hardcoded
- [ ] Evaluate if batch size should be configurable
- [ ] Review comments and documentation clarity
- [ ] Check for magic numbers that should be constants

### 7. Edge Cases & Error Handling

- [ ] What happens when run twice without reset?
- [ ] What happens on empty database?
- [ ] What happens on partial failure mid-batch?
- [ ] How are unique constraint violations handled?

## Test Commands

Run these to verify the implementation:

```bash
# Clean build
make build-api

# Test reset (should show clean output)
make seed-bulk-reset

# Test seed (should show progress)
make seed-bulk

# Check data in database
# docker exec -it publyapp-db-1 psql -U postgres -d publyapp
# SELECT COUNT(*) FROM tenants WHERE code LIKE 'bulk-%';
# SELECT COUNT(*) FROM users WHERE email LIKE '%@bulk.example.com';
```

## Specific Questions for Reviewer

1. **Architecture**: Is the `TryRun` pattern appropriate for this use case, or would you recommend a different approach?

2. **Security**: The raw SQL DELETE queries use string interpolation with hardcoded prefixes. While these are test-only, is there any risk we should address?

3. **Performance**: Should the batch size (currently 500) be configurable via environment variable?

4. **Data Integrity**: Is the current reset-first approach acceptable, or should we implement upsert/skip logic?

5. **Completeness**: Are there any entities missing from the bulk generation that should be added for comprehensive testing?

## Deliverables

Please provide:

1. **Overall Assessment**: Approve / Approve with Suggestions / Request Changes
2. **Detailed Findings**: Specific issues found (if any)
3. **Recommendations**: Suggested improvements
4. **Questions**: Any clarifications needed
5. **Best Practices**: Any additional observations

---

*Review requested by: Development Team*
*Date: 2026-02-27*
