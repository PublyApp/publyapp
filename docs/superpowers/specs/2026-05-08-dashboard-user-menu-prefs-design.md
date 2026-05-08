# Move language + color-scheme switchers into the dashboard user menu

Issue: [#323](https://github.com/radandevist/publyapp/issues/323)
Date: 2026-05-08

## Goal

Relocate the language switcher and color-scheme switcher from the dashboard topbar's right area into the `SidebarUserMenu` popover. Other layouts (marketing, auth-split, tenant-picker) keep the existing standalone topbar popovers.

## Why

- "Personalization in the user menu" is the dominant pattern in modern SaaS dashboards (Linear, Notion, Vercel, GitHub).
- Frees the dashboard topbar's right area for future product slots (notifications, search, etc.).
- Co-locates user preferences (profile, security, notifications) with personalization (theme, language) — they share the "things specific to me" mental model.

## Scope

In scope:
- `apps/front/src/layouts/dashboard/layout.tsx` — drop the two switcher imports and the topbar `rightArea` `Box`.
- `apps/front/src/layouts/components/sidebar-user-menu.tsx` — add two new rows.
- New: `apps/front/src/layouts/components/user-menu-color-scheme-item.tsx` (`ColorSchemeMenuItem`).
- New: `apps/front/src/layouts/components/user-menu-language-item.tsx` (`LanguageMenuItem`).
- `packages/shared-ts/lib/i18n/json/common.{en,fr}.json` — add `theme`, `language`, `system-mode`.

Out of scope (untouched):
- `apps/front/src/layouts/main/layout.tsx` (marketing).
- `apps/front/src/layouts/auth-split/layout.tsx`.
- `apps/front/src/routes/authed/tenant/_shared/tenant-picker-view.tsx`.
- Existing `ColorSchemePopover` / `LanguagePopover` components — still consumed by the three layouts above.

## Architecture

### Component split

Two new sibling components colocated with the other layout components in `apps/front/src/layouts/components/`. Each is self-contained: owns its trigger row, its `usePopover` state, its nested `CustomPopover`, and the change handler. This keeps `sidebar-user-menu.tsx` focused on layout/structure and lets the items be reused later (e.g., if we ever add a "preferences" page).

Each component renders:

```
<MenuItem onClick={popover.onOpen}>
  <Iconify width={18} icon={...current state icon...} />
  <Typography variant="body2" sx={{ fontSize: '0.8125rem', flex: 1 }}>
    {t('theme' | 'language')}
  </Typography>
  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
    {currentValueLabel}
  </Typography>
  <Iconify width={16} icon="eva:arrow-ios-forward-fill" sx={{ color: 'text.disabled' }} />
</MenuItem>

<CustomPopover
  open={popover.open}
  anchorEl={popover.anchorEl}
  onClose={popover.onClose}
  anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
  transformOrigin={{ vertical: 'top', horizontal: 'left' }}
>
  <MenuList>{...same options as today's standalone popovers...}</MenuList>
</CustomPopover>
```

The `MenuItem` is the popover's anchor (we attach the ref via the standard MUI pattern: `usePopover` exposes `onOpen` which captures the event's currentTarget).

### Wiring in `sidebar-user-menu.tsx`

Insert a third `MenuList` wrapping the two new items, between the navigation `MenuList` and the logout `MenuList`, separated by the existing dashed `Divider`. No props need to be threaded from `SidebarUserMenu` — the items are self-sufficient.

```tsx
<Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

<MenuList sx={{ py: 0.5 }}>
  <ColorSchemeMenuItem />
  <LanguageMenuItem />
</MenuList>

<Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />
```

The new items take no props from `SidebarUserMenu`. After a selection they close their own nested popover but leave the parent user menu open so the user can see the change applied. (Deliberate choice; revisit if user testing disagrees.)

### Topbar after

`rightArea` slot is dropped from the `headerSlots` object entirely. `HeaderSection` accepts an undefined `rightArea` slot. The unused imports of `ColorSchemePopover`, `LanguagePopover`, `allLangs`, and the `Box` that wrapped them are removed from `layout.tsx`.

## Data flow / handlers

Same handlers as the existing topbar popovers — only the trigger surface changes:

- Color scheme: `useColorScheme().setMode(option)` + `useSettingsContext().setState({ colorScheme: option })`.
- Language: `useTranslate().onChangeLang(option.value)`.

The "current value" shown on the row:

- Theme — `mode === 'system' ? 'System' : mode === 'dark' ? 'Dark' : 'Light'` (translated).
- Language — `currentLang.label` (raw English label from `allLangs`, matching the existing topbar popover behavior).

## i18n

Add to `common.en.json` and `common.fr.json`:

| Key           | en       | fr       |
| ------------- | -------- | -------- |
| `theme`       | Theme    | Thème    |
| `language`    | Language | Langue   |
| `system-mode` | System   | Système  |

`light-mode` / `dark-mode` already exist and are reused. `log-out`, `un-named` already exist.

## Design-system alignment (must match)

- MUI v6 components only — `MenuItem`, `MenuList`, `Box`, `Typography`, `Divider`, `Iconify`, `FlagIcon`, `CustomPopover`. No native HTML, no Tailwind.
- `sx` prop for all styling, no `className`.
- 18 px row icons + 16 px chevron + `body2` 0.8125rem typography (matches Profile/Security/Notifications rows).
- `eva:arrow-ios-forward-fill` chevron — already used elsewhere in the popover.
- Solar duotone icons for state (sun/moon/monitor) — matches `colorscheme-popover.tsx`.
- Selected option in nested popover uses `MenuItem selected={...}` (matches both existing popovers).

## Risks and mitigations

1. **Two open popovers at once.** MUI `Popover` listens for outside clicks. The nested popover renders in a portal at the root, so it is "outside" the parent's Paper. Mitigation: anchor the nested popover to the row inside the parent's Paper (the row IS inside the parent's portal, so MUI's clickaway treats clicks on the nested popover's portaled Paper as descendants of the same anchor tree). If the parent still closes, fall back to `disableEnforceFocus` + a `stopPropagation` on the nested popover's onClose path. Verify in browser before committing.
2. **Side popover overflow on narrow viewports.** MUI's auto-positioning will flip if there's not enough room; if it looks wrong, switch the nested `anchorOrigin` to `{ vertical: 'bottom', horizontal: 'left' }` on small viewports.
3. **RTL.** `CustomPopover` already supports RTL. Side-popover origins may need flipping in RTL — verify in browser if RTL switching is exercised in this PR's smoke test.
4. **Icon for "system" theme.** Today's `colorscheme-popover.tsx` falls back to the moon icon for system (`get(...) ?? <Iconify icon="solar:moon-bold-duotone" />`). We will use `solar:monitor-bold-duotone` for system explicitly; this is a tiny visual improvement, not a regression.

## Verification plan

- `just tsc-front` — type checks pass.
- `just check-write` — lint/format clean.
- `just knip` — no new unused deps.
- Manual smoke test via `just dev-front`:
  - Dashboard topbar right side is empty.
  - User menu popover shows the two new rows with current values.
  - Clicking Theme opens the side popover; selecting Light/Dark/System updates the app theme; the user menu stays open.
  - Clicking Language opens the side popover; selecting English/French updates the app language; the user menu stays open.
  - Clicking outside any popover closes the right thing (nested first, then parent).
  - Marketing layout, auth-split layout, and tenant-picker view still show the original switchers in their topbars.

## Out of scope (deliberately deferred)

- "Preferences" settings page or any sidebar entry for it.
- Renaming/refactoring the existing `LanguagePopover` / `ColorSchemePopover` components.
- Visual changes to the popover itself (size, icons, divider style).
