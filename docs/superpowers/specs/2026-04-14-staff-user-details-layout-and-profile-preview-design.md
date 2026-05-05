# Staff User Profiles Permissions Follow-Up: Stable Details Layout And Profile Preview

## Summary

This document is a follow-up design for branch `feat/staff-user-profiles-permissions`.

The branch already introduced the core staff-scope user/profile assignment surface:

- staff user details page with a dedicated profiles assignment section
- profile-centric user assignment drawer on the staff profile details page
- related backend endpoints, permissions, and smoke-test coverage

What remains is a UX hardening slice discovered during smoke testing:

- keep the staff user details layout visually invariant across different records
- prevent long content from distorting cards and columns
- improve inspection of assigned profiles on the staff user details page by adding a right-side preview drawer opened from selected profile pills

This is not a new branch-level feature. It is a refinement of the existing `staff-user-profiles-permissions` work.

## Branch Context

The baseline design for this branch already exists in:

- `docs/superpowers/specs/2026-04-09-staff-user-profiles-permissions-design.md`

This follow-up spec narrows scope to two concrete enhancements inside that larger feature:

1. layout stability for the staff user details page
2. preview interaction for assigned profiles in the existing autocomplete-based assignment UI

## Problem

Smoke testing exposed two issues in the current implementation of the staff user details page.

### 1. Record-to-record layout instability

Long values can distort the page:

- long emails in the left metadata rail can visually exceed the intended row width
- long selected profile names in the assignment autocomplete can create unstable field geometry
- the page can look different from one user record to another because content length influences the visual structure

This breaks a core admin UX expectation: the details layout should be stable regardless of which record is loaded.

### 2. Weak inspection affordance for assigned profiles

The branch already supports assigning and unassigning profiles from the staff user details page, but selected profile pills are currently selection-only. There is no lightweight in-place way to inspect an assigned profile before deciding whether to keep or remove it.

That creates friction, especially now that the branch is explicitly about user/profile/permission relationships.

## Goals

- Preserve the existing staff user profiles assignment flow.
- Keep both desktop columns visually stable across all staff user details records.
- Prevent long content from resizing cards or shifting adjacent sections.
- Add a mouse-driven preview drawer for assigned profiles from the selected pills in the existing autocomplete.
- Expose navigation to the full profile details page only from inside that preview drawer.

## Non-Goals

- Re-specifying the core `staff-user-profiles-permissions` branch scope.
- Replacing the existing autocomplete-based assignment UI with a different control.
- Changing the existing profile users assignment drawer on the staff profile details page.
- Introducing keyboard-triggered drawer opening from selected pills.
- Expanding this slice to tenant/project profile assignment UX.

## Existing Implementation Assumptions

The current branch state already provides:

- `GET /staff/users/{userId}/profiles`
- `PUT /staff/users/{userId}/profiles`
- frontend query/mutation hooks for staff user profile assignment
- `StaffUserProfilesSection` rendered inside the staff user details page
- profile-centric assignment tooling elsewhere in the branch, including a right-side drawer pattern

This follow-up design should build on those existing structures instead of reintroducing parallel abstractions.

## Design Decisions

### 1. Page layout must be invariant on desktop

The staff user details page should behave as a stable two-column desktop layout:

- the left summary rail keeps a fixed column width
- the right content stack keeps a fixed complementary column width
- card widths remain the same across different user detail records
- content may increase card height, but must never change card width or column alignment

This rule applies to both sides of the page:

- the left summary/metadata card
- the right details form card
- the right profiles assignment card
- the right danger zone card

The user’s requirement is explicit: user A and user B should not produce even slightly different card widths because of content.

### 2. Overflow policy depends on content type

The page should use different degradation rules for different kinds of text.

Machine-like values:

- email addresses and similar identifiers use single-line truncation with ellipsis
- full value is available via tooltip

Human-readable labels:

- assigned profile names may use up to two lines before truncating
- secondary descriptive copy may wrap if it remains inside the card boundary

Dense multi-select regions:

- the selected-chip area may grow vertically only up to a defined maximum
- beyond that maximum, it scrolls internally

### 3. Containment rules must be explicit

The current branch needs stronger containment rules so pathological content does not break layout:

- flex/grid text containers must allow shrinking via `minWidth: 0` where required
- summary rows must constrain the text column rather than letting it force overflow
- selected chips must have explicit max-width behavior relative to the autocomplete field
- chip labels must obey the chosen wrap/truncate policy instead of expanding indefinitely

This is the direct fix for the smoke-test state where one long profile name visually destabilized the whole page.

### 4. The profiles assignment UI remains the same control

The existing autocomplete-based assignment model stays in place.

We do not replace it with:

- a standalone list
- a table
- a custom tag manager

Instead, we enhance the existing selected chips with one new interaction:

- mouse click on a selected profile pill opens a right-side preview drawer for that profile

This preserves the current assignment workflow while adding inspection capability.

### 5. Full navigation lives in the drawer, not on the chip

Selected chips do not navigate directly.

The navigation model is:

- selected chip click opens preview drawer only
- full navigation to the profile details page is available only after the drawer is open
- that navigation is exposed through an explicit drawer action using an anchor-style control with an expand/open icon

This keeps the selected-chip area clean and avoids mixing preview and navigation affordances inside a dense multi-select field.

### 6. Drawer opening is mouse-only for this affordance

The new preview behavior is intentionally limited to mouse click on the selected chip.

- existing autocomplete keyboard behavior remains intact
- selected-chip keyboard focus does not open the preview drawer

This is a product choice for this enhancement and should not be generalized automatically.

## UX Behavior

### Staff user details layout

- The left sidebar width stays stable across records.
- The right content column width stays stable across records.
- Right-side cards align consistently regardless of content length.
- Long content is absorbed inside the card, never by resizing the column.

### Left metadata rail

- Email is displayed as a machine value: one line, ellipsis, tooltip for the full value.
- Other metadata rows remain visually aligned.
- Long text cannot push icons, labels, or adjacent layout out of place.

### Profiles assignment card

- The current autocomplete remains the assignment control.
- Selected profile pills are width-constrained to the field.
- Human-readable chip labels may occupy up to two lines before truncating.
- The selection region can grow vertically to a cap, then scroll internally.
- Clicking a selected pill with the mouse opens the profile preview drawer.

### Profile preview drawer

The drawer is a contextual preview, not a second full details page.

It should include:

- profile name
- concise descriptive metadata if available
- short permission/scope summary if available
- explicit action to open the full profile details page

The drawer exists to support assignment decisions without forcing immediate page navigation.

## Technical Direction

- Reuse existing MUI drawer patterns already present in this branch where practical.
- Prefer local customization in `StaffUserProfilesSection` if shared autocomplete theme changes would create risk for unrelated screens.
- Keep styling in MUI `sx` patterns, consistent with repository frontend conventions.
- Preserve the existing query/mutation model for profile assignment; this slice is UI hardening, not API redesign.

## Edge Cases

- Extremely long email values must remain readable via tooltip without changing sidebar width.
- A single extremely long assigned profile name must not distort the autocomplete card or the overall page.
- Multiple long assigned profile names must not expand the card indefinitely.
- Missing optional metadata in the preview drawer must not create awkward empty sections.

## Testing Expectations

- Smoke-test two different staff users with very different content lengths and verify identical column/card widths.
- Smoke-test long email rendering in the left metadata rail.
- Smoke-test one very long assigned profile name in the autocomplete.
- Smoke-test several long assigned profile names together.
- Verify selected-pill click opens the preview drawer.
- Verify the drawer contains the explicit action to open the full profile details page.
- Verify there is no direct navigation from the selected pill itself.
- Verify right-side cards remain aligned after long-content interactions.

## Recommended Implementation Order

1. Stabilize the staff user details page column and card containment rules.
2. Fix overflow handling in the left metadata rail.
3. Fix selected-chip containment and capped vertical growth in `StaffUserProfilesSection`.
4. Add the selected-profile preview drawer and drawer navigation action.
5. Re-run smoke tests for long-content scenarios on the branch.
