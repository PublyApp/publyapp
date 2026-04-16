# Bulk Seeding Utilities

This repo includes a bulk seed CLI to generate large, realistic datasets for:

- pagination and cursor/keyset behavior testing
- table performance testing (sorting, filtering, searching)
- UI flows that require "lots of records" without manual setup

The bulk seed data is clearly identifiable and can be wiped with a dedicated reset command.

## Running Bulk Seed

From the repo root:

```bash
just dev-db
just db-migrate
just seed-bulk
```

Bulk seed is intended for **Development only**. If you really need to run it elsewhere, pass `--force`:

```bash
cd apps/api
dotnet run -- seed-bulk --force
```

## What Gets Seeded

### Tenants

- `500` tenants (default)
- tenant codes prefixed with `bulk-tenant-...` (`BulkSeedConstants.TenantCodePrefix`)
- a portion of tenants are `Suspended` or `IsDeleted` to exercise lifecycle edge cases

### Tenant Users and Memberships

- ~`8,000` tenant users (default distribution)
- tenant memberships created via `UserAccount` rows (`Scope = Tenant`)
- memberships are linked only to active (non-deleted) tenants

Tenant user emails use:

- domain: `bulk.example.com` (`BulkSeedConstants.UserEmailDomain`)
- prefix: `bulk.user...`

### Staff Members (New)

Bulk seed now also creates staff members so staff-only list screens (users, permissions, profiles, etc.)
have enough rows for pagination/search testing.

- `500` staff users (default)
- each staff user gets exactly one `UserAccount` row with `Scope = Staff`
- staff account level is mixed (`Admin`/`User`) using `BulkSeedConstants.StaffAdminRatio`

Staff user emails use:

- domain: `bulk.example.com`
- prefix: `bulk.staff...` (`BulkSeedConstants.StaffUserEmailPrefix`)

### Projects

- projects are created under active (non-deleted) tenants

## Resetting Bulk Seed Data

From the repo root:

```bash
just seed-bulk-reset
```

This deletes:

- bulk tenants (`code` starts with `bulk-tenant-`)
- bulk users and their accounts (email ends with `@bulk.example.com`)
- bulk projects (`name` starts with `Bulk Project `)

The reset command is destructive and guarded in the same way as bulk seed.

