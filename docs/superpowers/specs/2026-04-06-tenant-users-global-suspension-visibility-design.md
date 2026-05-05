# Tenant Users Global Suspension Visibility Design

## Goal

Keep globally suspended users visible in each tenant `Users` list where they still
have a membership, while making the global suspension state visually dominant and
tenant-level controls non-actionable.

## Problem

The current invariant work treats global user suspension as a hard exclusion from
tenant membership read paths. That is clean from a pure "active membership"
perspective, but it is poor staff UX:

- rows disappear from tenant users lists without an obvious explanation
- staff cannot tell whether the user was removed from the tenant, suspended only
  at membership level, or suspended globally
- the tenant users table loses audit/admin visibility over a still-existing tenant
  relationship

We want global suspension to continue blocking auth and active account behavior,
but we do not want globally suspended users to disappear from tenant-user
management views.

## Decision

Show globally suspended users by default in tenant details `Users` lists.

Use a status-precedence model:

1. `Globally suspended`
2. `Suspended`
3. `Active`

Where:

- `Globally suspended` means the parent `User` identity is globally suspended,
  regardless of `UserAccount.IsSuspended`
- `Suspended` means the parent identity is globally active but the tenant
  membership is suspended
- `Active` means both the parent identity and the tenant membership are active

All tenant-row actions and tenant-level inline controls must be disabled for
globally suspended users.

## Scope

In scope:

- backend tenant-user list semantics
- tenant-user status parsing/description helpers
- tenant-user filtering semantics
- tenant users table status chip/filter rendering
- disabling row actions and inline controls for globally suspended users
- smoke-test checklist updates

Out of scope:

- changing the global auth/session invariant
- allowing tenant-level actions on globally suspended users
- redesigning global staff user management

## Backend Design

### Query semantics

`FindTenantUsersAsync(...)` should no longer exclude `ua.User.IsSuspended`.

It should still exclude:

- deleted memberships
- deleted users

But it must include globally suspended users so the tenant users list can render
their rows.

### Effective status computation

The effective tenant-user status must be computed by precedence:

```text
if user.IsSuspended => GloballySuspended
else if userAccount.IsSuspended => Suspended
else => Active
```

This effective status is what should be serialized to the tenant users API
response and what frontend filters should reason about.

### Helper methods

Extend `UserAccount` status helpers so they support the third effective state:

- `ParseStatus(...)`
- `GetStatusDescription(...)`

These helpers should represent tenant-user display/filter semantics, not just the
raw `UserAccount.IsSuspended` boolean.

If needed, introduce an explicit enum or status abstraction that can represent:

- `Active`
- `Suspended`
- `GloballySuspended`

That is preferable to overloading the existing two-state membership helper if the
current signature becomes misleading.

### Filter semantics

Tenant-user status filter behavior must be:

- `active` => globally active + membership active
- `suspended` => globally active + membership suspended
- `globally_suspended` => globally suspended, regardless of membership state

`pending` must remain invalid for tenant users.

### Invariant clarification

This design intentionally changes read semantics only:

- globally suspended users remain non-active in auth/picker/session flows
- globally suspended users remain non-actionable in tenant-user management
- they are merely visible again in the tenant users read model

## Frontend Design

### Status column

The `Status` cell continues to be the primary status surface, but for globally
suspended users it becomes read-only and visually dominant.

Status display rules:

- `Active`
- `Suspended`
- `Globally suspended`

`Globally suspended` must look clearly different from normal membership
`Suspended`.

### Inline controls

For globally suspended rows:

- status control is disabled
- level control is disabled
- row actions are disabled

Tooltip copy:

`This user is globally suspended. Reactivate the user globally before managing tenant membership.`

### Row actions

All row actions are disabled for globally suspended users.

This includes:

- tenant membership suspend/reactivate
- account-level change
- remove from tenant
- details/drawer actions if they are modeled as row actions in this table

The UX goal is zero ambiguity: tenant-level management is blocked until the user
is reactivated globally.

### Filter UI

The tenant users filter must expose:

- `Active`
- `Suspended`
- `Globally suspended`

It must not expose `Pending`.

## API/Contract Implications

The tenant users API contract will change if a new wire value is introduced:

- likely `globally_suspended`

If that happens:

- backend query validation/parser must accept `globally_suspended`
- generated client must be regenerated
- frontend filter UI and table logic must use the generated client contract

## Testing Strategy

### Integration tests

Add or update integration coverage proving:

1. globally active + membership active => row visible as `Active`
2. globally active + membership suspended => row visible as `Suspended`
3. globally suspended + membership active => row visible as `Globally suspended`
4. globally suspended + membership suspended => row visible as `Globally suspended`
5. `active` filter excludes globally suspended users
6. `suspended` filter excludes globally suspended users
7. `globally_suspended` filter returns globally suspended users only

### Frontend verification

Smoke checks must confirm:

- globally suspended rows stay visible
- every inline control is disabled
- tooltip copy is clear
- status chip/filter copy is consistent

## Risks / Trade-offs

### Pros

- better administrative visibility
- fewer "disappearing row" surprises
- clearer distinction between global identity suspension and tenant membership
  suspension

### Cons

- read semantics become slightly more complex than the earlier hard-exclusion rule
- status/filter logic now has a three-state model instead of two
- some existing helper abstractions may need to be widened for clarity

## Recommendation

Implement this as a read-model/UI refinement on top of the existing auth/session
invariant:

- keep global suspension as a hard auth/access block
- show globally suspended users in tenant lists
- disable all tenant-level controls for those rows
- introduce `Globally suspended` as the dominant effective status
