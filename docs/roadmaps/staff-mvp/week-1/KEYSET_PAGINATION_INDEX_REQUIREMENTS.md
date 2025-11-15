# Keyset Pagination - Index Requirements

## Overview

For optimal performance of keyset pagination in `FindStaffProfilesAsync`, we need composite indexes that match our query patterns.

## Required Indexes

### 1. Base Query Index (Already Exists via Primary Key)
```sql
-- Covered by primary key on profiles.id
-- And existing index on scope (if it exists)
-- Base WHERE clause: WHERE scope = 'Staff' AND id IS NOT NULL
```

### 2. Name Sort Index ⚠️ **REQUIRED**
```sql
CREATE INDEX idx_profiles_staff_name_id
ON profiles (scope, name, id)
WHERE scope = 0;  -- 0 = Staff enum value

-- Supports queries:
-- WHERE scope = 'Staff' AND name > 'cursorName' ORDER BY name, id
-- WHERE scope = 'Staff' AND (name > 'X' OR (name = 'X' AND id > 'Y')) ORDER BY name DESC, id DESC
```

**Rationale:**
- Covers the filter on `scope`
- Covers the keyset filter on `name` and `id`
- Covers the ordering on `name` and `id`
- Partial index (WHERE clause) keeps index size small

### 3. CreatedAt Sort Index ⚠️ **REQUIRED**
```sql
CREATE INDEX idx_profiles_staff_createdat_id
ON profiles (scope, created_at, id)
WHERE scope = 0;

-- Supports queries:
-- WHERE scope = 'Staff' AND created_at > 'cursor' ORDER BY created_at, id
-- WHERE scope = 'Staff' AND (created_at > 'X' OR (created_at = 'X' AND id > 'Y')) ORDER BY created_at DESC, id DESC
```

**Rationale:**
- Covers filtering and ordering for created_at sorts
- UUIDv7 ids are time-ordered, so this is very efficient

### 4. UserAccountCount Sort Index ⚠️ **CONDITIONAL**

This is **trickier** because `user_account_count` is a computed value from a relationship.

**Option A: Functional Index (PostgreSQL 11+)**
```sql
-- This requires a function or subquery
-- May not be efficiently usable by the query optimizer
-- Test before deploying!
```

**Option B: Add Computed Column (Recommended if performance issues arise)**
```sql
-- Add column to profiles table
ALTER TABLE profiles ADD COLUMN user_account_count INTEGER DEFAULT 0;

-- Create trigger to maintain it
CREATE OR REPLACE FUNCTION update_profile_user_account_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE profiles
    SET user_account_count = (
        SELECT COUNT(*)
        FROM user_account_profiles
        WHERE profile_id = NEW.profile_id
    )
    WHERE id = NEW.profile_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_profile_user_account_count
AFTER INSERT OR DELETE ON user_account_profiles
FOR EACH ROW
EXECUTE FUNCTION update_profile_user_account_count();

-- Then create index
CREATE INDEX idx_profiles_staff_usercount_id
ON profiles (scope, user_account_count, id)
WHERE scope = 0;
```

**Recommendation for Now:**
- **Start without this index** - Staff profiles are small scale
- **Monitor query performance** - Watch for slow queries
- **Add computed column + index only if needed** - Based on actual performance metrics

### 5. Id Sort Index (Already Covered)
```sql
-- Primary key on id already provides optimal performance
-- No additional index needed for sorting by id only
```

## Migration Script

```sql
-- Migration: Add keyset pagination indexes for staff profiles
-- Date: 2025-01-15
-- Related: FindStaffProfilesAsync keyset pagination

-- Index for sorting by Name
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_staff_name_id
ON profiles (scope, name, id)
WHERE scope = 0;

-- Index for sorting by CreatedAt
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_staff_createdat_id
ON profiles (scope, created_at, id)
WHERE scope = 0;

-- Note: UserAccountCount sort deliberately excluded for now
-- Will be added as materialized column if performance metrics indicate need

-- Verify indexes
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'profiles'
AND indexname LIKE 'idx_profiles_staff%';
```

## Query Plan Verification

After creating indexes, verify they're being used:

```sql
-- Test Name sort query plan
EXPLAIN ANALYZE
SELECT id, name, description
FROM profiles
WHERE scope = 0
  AND id IS NOT NULL
  AND (name > 'TestName' OR (name = 'TestName' AND id > '00000000-0000-0000-0000-000000000000'))
ORDER BY name ASC, id ASC
LIMIT 11;

-- Expected: Index Scan using idx_profiles_staff_name_id

-- Test CreatedAt sort query plan
EXPLAIN ANALYZE
SELECT id, name, created_at
FROM profiles
WHERE scope = 0
  AND id IS NOT NULL
  AND (created_at > '2024-01-01' OR (created_at = '2024-01-01' AND id > '00000000-0000-0000-0000-000000000000'))
ORDER BY created_at ASC, id ASC
LIMIT 11;

-- Expected: Index Scan using idx_profiles_staff_createdat_id
```

## Index Size Estimation

For staff profiles (estimated ~100 records):

- **idx_profiles_staff_name_id**: ~8KB (negligible)
- **idx_profiles_staff_createdat_id**: ~8KB (negligible)

Even with 10,000 staff profiles (unlikely):
- Each index: ~80KB
- Total additional storage: ~160KB

**Conclusion:** Index overhead is minimal, performance benefit is significant.

## Production Deployment Checklist

- [ ] Run migration to create indexes (use `CONCURRENTLY` to avoid table locks)
- [ ] Verify indexes exist: `\di idx_profiles_staff*` in psql
- [ ] Test query plans with `EXPLAIN ANALYZE`
- [ ] Monitor slow query logs for first week
- [ ] Set up alerts for queries taking >100ms on profiles table
- [ ] Document index purpose in database schema documentation

## Future Considerations

If staff profiles grow beyond 1,000 records or query performance degrades:

1. **Add UserAccountCount computed column** (see Option B above)
2. **Consider connection pooling** if concurrent pagination requests spike
3. **Add query result caching** for frequently accessed pages
4. **Review and optimize N+1 queries** in UserAccountCount calculation

---

*Last Updated: 2025-01-15*
*Status: Ready for Production*
*Performance Target: <50ms per query*
