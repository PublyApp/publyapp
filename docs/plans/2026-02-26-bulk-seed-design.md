# Bulk Seed Design

## Overview

A dedicated bulk seeding system to generate ~500 tenants, ~8,000 users, and ~5,000 projects for testing pagination, search, and UI performance.

## Architecture

### New Files

- `apps/api/Src/Lib/Seeding/BulkSeeder.cs` - Main entry point
- `apps/api/Src/Lib/Seeding/BulkSeedDataGenerator.cs` - Bogus data generation
- `apps/api/Src/Lib/Seeding/BulkSeedConstants.cs` - Configuration constants

### CLI Commands

- `dotnet run --project apps/api -- seed-bulk` - Generate bulk data
- `dotnet run --project apps/api -- seed-bulk-reset` - Clear bulk data only

### Dependencies

Add **Bogus** NuGet package for realistic data generation.

## Data Generation Strategy

### Tenants (500)

- Codes: `bulk-tenant-001` to `bulk-tenant-500`
- Names: Fake company names
- Status: 90% Active, 10% Suspended
- 10% marked as soft-deleted

### Users (~8,000 total)

- **Power users (~200):** Member of 10-50 tenants each - tests UI dropdowns, permission checks
- **Standard cross-tenant (~1,400):** Member of 2-5 tenants each
- **Single-tenant users (~6,400):** Member of 1 tenant only
- Emails: `bulk.user001@example.com` (dedicated domain to avoid collision)
- Status: 85% Active, 15% Suspended
- 15% marked as soft-deleted

**Generation order:**
1. Generate 200 power users, assign each to 10-50 random tenants
2. Generate 1,400 cross-tenant users, assign each to 2-5 random tenants
3. Generate 6,400 single-tenant users, assign each to 1 random tenant

### Projects (~5,000)

- 3-8 projects per tenant
- Names: Fake project names
- 5% marked as soft-deleted

### Invitations (~1,000)

- 0-3 pending invitations per tenant
- Useful for testing invitation list UI

### Relationships

- Generation order: Tenants → Users → UserAccounts → Projects → Invitations
- Each batch (500 entities) is inserted and tracked separately
- Change tracker cleared after each batch to prevent memory pressure

## Configuration (env vars)

```
BULK_SEED_TENANTS=500
BULK_SEED_POWER_USERS=200
BULK_SEED_CROSS_TENANT_USERS=1400
BULK_SEED_SINGLE_TENANT_USERS=6400
BULK_SEED_PROJECTS_PER_TENANT=10
BULK_SEED_INVITATIONS_PER_TENANT=2
BULK_SEED_BATCH_SIZE=500
```

## Reset Strategy

- Bulk data identified by code/email prefix (`bulk-tenant-*`, `bulk.user*@bulk.example.com`)
- Only deletes records matching these patterns
- Preserves original seed data (acme, techstart, etc.)

## Memory Management

- Batch size: 500 entities per batch
- EF Core change tracker cleared after each batch
- Async generation with proper disposal
