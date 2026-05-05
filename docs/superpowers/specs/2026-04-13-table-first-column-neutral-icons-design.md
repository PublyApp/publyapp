# Table First-Column Neutral Icons Design

## Summary

Restyle first-column table avatar fallbacks to use the same muted, neutral ambiance as the sidebar user icon.

Scope is limited to first-column table cells. Real images remain unchanged. When no image exists, the row should render its existing entity-specific icon inside a neutral `Avatar` shell instead of relying on the global bright avatar fallback colors.

## Goal

Make first-column table cells feel more restrained and product-like, closer to shadcn, Vercel, and Attio, without changing avatar behavior elsewhere in the app.

## Current Behavior

- Many first-column table cells use MUI `Avatar`.
- When `src` is present, the avatar shows the image.
- When `src` is missing, the global `MuiAvatar` theme fallback uses `alt`-derived colors.
- That global fallback creates bright, varied fills that feel visually louder than the sidebar user menu treatment.

## Approved Direction

Follow the base template's approach and keep using `Avatar` directly in table cells.

Do not introduce a new shared component for this change.

For first-column table cells only:

- Keep `Avatar` as the row media primitive.
- Keep real image rendering via `src` when an image exists.
- When no image exists, render the table's entity-specific `Iconify` glyph as `Avatar` children.
- Apply neutral `sx` styles to the `Avatar` and fallback icon so they visually align with the sidebar user icon treatment.
- Do not rely on the global `MuiAvatar` bright fallback for these table cells.

## Visual Rules

Fallback avatars in first-column table cells should use:

- Neutral background such as `background.neutral`
- Subdued icon color such as `text.disabled` or `text.secondary`
- Existing `Avatar` shape for the table context (`rounded` where already rounded, circular where already circular)
- Existing table-specific sizing unless a local size looks obviously off after the restyle

Fallback avatars should not use:

- Semantic palette fills such as `primary`, `success`, `warning`, `error`, or similar bright variants
- Name-derived background colors
- New decorative effects or badges

## Entity Semantics

The fallback glyph should remain entity-specific.

Examples:

- User rows keep a user-related glyph
- Tenant or workspace rows keep a tenant or workspace-related glyph
- Profile rows keep a profile-related glyph

Color should stop carrying meaning. The icon shape should carry meaning.

## Implementation Boundary

Update only first-column table cell renderers that currently display avatars or avatar-like row media.

Do not change:

- Sidebar user menu
- Workspace switchers
- Account drawers
- Upload avatars
- Non-table avatars elsewhere in the app
- Global `MuiAvatar` fallback theme behavior for the rest of the application

## Expected Code Pattern

Preferred fallback pattern inside affected table cells:

1. If row image exists, pass it to `Avatar` via `src`
2. If row image does not exist, omit `src` and render the entity icon inside the `Avatar`
3. Apply neutral `sx` to the `Avatar` and icon for the fallback case

This keeps the implementation aligned with the base template primitives: `Avatar`, `Iconify`, and local `sx`.

## Verification

Verify on representative tables that:

- Rows with real images still show those images
- Rows without images show muted neutral fallback icons
- Existing link, spacing, and text layout remain unchanged
- Rounded versus circular table treatments still look intentional
- No non-table avatar styling changes were introduced

## Risks

- Some tables may not currently have an explicit fallback icon and will need a sensible entity-specific glyph chosen during implementation
- A few tables may rely on implicit `Avatar` initials behavior today; those will need explicit fallback children to avoid reverting to bright theme colors
- There may be minor size mismatches that need one-off `sx` tuning after the neutral restyle is applied
