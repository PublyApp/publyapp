# Front-2 design handoff — artboard assertion registry

Demoted from `src/design-handoff/artboard-assertions.ts` (2026-07-13, wave-1 r1 PKT-A,
per review-r1-ui.md F8 / review-r1-tests.md F5, captain-ruled option (b)).

The original module was shaped like a test but was not one: its own vitest file
compared its constants to itself, and the one check with real teeth (diffing
against `.dump/design_handoff_publyapp_front2/spec.json`) silently no-opped in CI
because that bundle is gitignored. 57 artboards of "expected" values shipped as
false confidence rather than a guard. This document keeps the same information as
plain prose — a historical/reference record of the per-artboard focus expectations
from the original design handoff — with no code pretending to verify it.

**Option (a) — wiring this into a real e2e check that navigates each artboard's
route and asserts the focus values with `toHaveCSS` (the pattern
`e2e/design-handoff-foundation.spec.ts` already uses by hand) — is queued for the
front-2 design-system owner, not done here.** That is the high-value fix (it would
have caught the F6 primary-button-radius regression); this demotion only removes
the false-confidence artifact.

## Coverage legend

- **json-backed** — originally cross-checked against the design handoff bundle's
  `spec.json` (`.dump/design_handoff_publyapp_front2/spec.json`, not committed).
- **prose-backed** — originally derived by hand from `SPEC.md` prose sections.

## Artboard 2a (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `shell.rail` | `width` | `49px` |
| token | `shell.rail` | `background` | `#fafafa` |
| radius | `topbar.iconButton` | `border-radius` | `999px` |
| layout | `bodyGrid` | `grid-template-columns` | `1fr 420px` |

## Artboard 2b (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `shell.panel` | `width` | `272px` |
| token | `shell.panel` | `background` | `#fafafa` |
| radius | `shell.panel.searchRow` | `border-radius` | `10px` |

## Artboard 2c (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| token | `identity.suspendButton` | `background` | `rgba(220,38,38,0.08)` |
| layout | `tabs.rule` | `border-bottom` | `1px solid #e4e4e7` |
| radius | `card` | `border-radius` | `14px` |

## Artboard 2d (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `field.input` | `height` | `36px` |
| radius | `field.input` | `border-radius` | `10px` |
| token | `field.input` | `border` | `1px solid #e4e4e7` |

## Artboard 2e (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| token | `backdrop` | `background` | `rgba(24,24,27,0.32)` |
| layout | `modal` | `width` | `480px` |
| radius | `modal` | `border-radius` | `28px` |
| radius | `table.statusChip` | `border-radius` | `8px` |

## Artboard 2f (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `empty.icon` | `width` | `48px` |
| layout | `error.icon` | `width` | `48px` |
| token | `empty.icon` | `color` | `#71717a` |
| layout | `skeleton.row` | `height` | `48px` |

## Artboard 2g (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `table` | `grid-template-columns` | `40px 240px 1fr 104px 140px 120px 40px` |
| radius | `table.profileTile` | `border-radius` | `9px` |

## Artboard 2h (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| radius | `identity.iconTile` | `border-radius` | `14px` |
| layout | `bodyGrid` | `grid-template-columns` | `1fr 420px` |

## Artboard 2i (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `table.row` | `height` | `48px` |
| radius | `invitation.statusChip` | `border-radius` | `8px` |

## Artboard 3a (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| token | `shell.panel.viewsGroupLabel` | `text-transform` | `uppercase` |
| layout | `table` | `grid-template-columns` | `40px 248px 116px 124px 92px 1fr 132px 40px` |
| radius | `table.tenantTile` | `border-radius` | `8px` |

## Artboard 3b (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| radius | `identity.brandTile` | `border-radius` | `14px` |
| layout | `bodyGrid` | `grid-template-columns` | `1fr 420px` |
| token | `meter.fill` | `background` | `#FDC700` |

## Artboard 3c (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `field.input` | `height` | `36px` |
| radius | `field.input` | `border-radius` | `10px` |

## Artboard 3d (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `toolbar.dateRange` | `height` | `36px` |
| radius | `toolbar.dateRange` | `border-radius` | `14px` |
| token | `table.row.selected` | `background` | `#f4f4f5` |

## Artboard 3e (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `field.input` | `height` | `36px` |
| token | `dangerRow.transferOwnership` | `color` | `#dc2626` |

## Artboard 4a (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| token | `panel.draftsBadge` | `background` | `#fffbeb` |
| radius | `calendarToolbar.navButton` | `border-radius` | `10px` |
| layout | `calendar.weekdayHeader` | `height` | `34px` |

## Artboard 4b (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `table` | `grid-template-columns` | `40px 1fr 132px 190px 190px 168px 40px` |
| token | `table.statusChip.scheduled` | `background` | `#f0f9ff` |

## Artboard 4c (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| token | `draft.statusChip` | `background` | `#f4f4f5` |
| layout | `table.row` | `height` | `48px` |

## Artboard 4d (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| token | `published.statusChip` | `background` | `#ecfdf5` |
| layout | `table.row` | `height` | `48px` |

## Artboard 5a (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| token | `panel.invitationsBadge` | `background` | `#fffbeb` |
| layout | `table` | `grid-template-columns` | `40px 210px 250px 150px 122px 1fr 40px` |
| radius | `inviteModal` | `border-radius` | `28px` |

## Artboard 5b (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `table` | `grid-template-columns` | `220px 116px 128px 1fr 40px` |
| radius | `table.roleTile` | `border-radius` | `9px` |
| token | `table.typeChip.system` | `background` | `#f4f4f5` |

## Artboard 5c (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `matrix` | `grid-template-columns` | `1fr 1fr` |
| token | `group.header` | `background` | `#fcfcfd` |
| radius | `perm.checkbox` | `border-radius` | `5px` |

## Artboard 5d (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `grid` | `grid-template-columns` | `repeat(3,1fr)` |
| radius | `card` | `border-radius` | `14px` |
| radius | `card.button` | `border-radius` | `14px` |
| token | `card.button.connected` | `background` | `#ecfdf5` |

## Artboard 5e (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| radius | `planCard` | `border-radius` | `14px` |
| layout | `planCard.footerStrip` | `grid-template-columns` | `repeat(3,1fr)` |
| token | `invoices.header` | `background` | `#fcfcfd` |

## Artboard 5f (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| radius | `settings.card` | `border-radius` | `14px` |
| token | `settings.card` | `box-shadow` | `0 0 0 1px rgb(228, 228, 231)` |

## Artboard 5g (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `settings.switchRow` | `min-height` | `48px` |
| radius | `settings.smallControl` | `border-radius` | `10px` |

## Artboard 5h (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `workspaces.grid` | `grid-template-columns` | `repeat(3,1fr)` |
| radius | `workspaces.addCard` | `border-radius` | `14px` |

## Artboard 5i (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `security.switch` | `width` | `44px` |
| token | `security.switch.on` | `background` | `#FDC700` |

## Artboard 5j (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `invitations.table.row` | `height` | `48px` |
| radius | `invitations.statusChip` | `border-radius` | `8px` |

## Artboard 6a (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `field.input` | `height` | `36px` |
| radius | `field.input` | `border-radius` | `10px` |

## Artboard 6b (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| radius | `passwordField` | `border-radius` | `10px` |
| token | `twoFactorTile` | `background` | `#ecfdf5` |

## Artboard 6c (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `switch` | `width` | `44px` |

## Artboard 6d (json-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| token | `page` | `background` | `#fafafa` |
| layout | `search` | `height` | `44px` |
| radius | `search` | `border-radius` | `14px` |

## Artboard 7a (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `responsive.tablet.list` | `grid-template-columns` | `list-card rows` |

## Artboard 7b (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `responsive.mobile.list` | `grid-template-columns` | `1fr` |

## Artboard 7c (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `responsive.navDrawer` | `width` | `min(320px,100vw)` |

## Artboard 7d (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `responsive.mobile.detail` | `grid-template-columns` | `1fr` |

## Artboard 7e (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `responsive.form.input` | `height` | `44px` |

## Artboard 7f (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| radius | `responsive.confirmSheet` | `border-radius` | `28px 28px 0 0` |

## Artboard 7g (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `responsive.tablet.detail` | `grid-template-columns` | `1fr` |

## Artboard 7h (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `responsive.cardGrid` | `grid-template-columns` | `1fr` |

## Artboard 7i (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `responsive.calendarAgenda` | `grid-template-columns` | `1fr` |

## Artboard 8a (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.inviteStaff` | `width` | `460px` |

## Artboard 8b (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.assignProfile` | `width` | `460px` |

## Artboard 8c (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.editContact` | `width` | `460px` |

## Artboard 8d (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.invitationDetail` | `width` | `460px` |

## Artboard 8e (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.createProfile` | `width` | `460px` |

## Artboard 8f (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.bulkAssignProfile` | `width` | `460px` |

## Artboard 8g (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.composePost` | `width` | `460px` |

## Artboard 8h (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.changeMemberRole` | `width` | `460px` |

## Artboard 8i (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.createRole` | `width` | `460px` |

## Artboard 8j (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.configureIntegration` | `width` | `460px` |

## Artboard 8k (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.changePlan` | `width` | `460px` |

## Artboard 8l (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.paymentMethod` | `width` | `460px` |

## Artboard 8m (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.manageTwoFactor` | `width` | `460px` |

## Artboard 8n (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.notifications` | `width` | `460px` |

## Artboard 8o (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.newWorkspace` | `width` | `460px` |

## Artboard 8p (prose-backed)

| Kind | Component | Property | Expected |
| --- | --- | --- | --- |
| layout | `drawer.filters` | `width` | `400px` |
| token | `drawer` | `border-left` | `1px solid #e4e4e7` |
