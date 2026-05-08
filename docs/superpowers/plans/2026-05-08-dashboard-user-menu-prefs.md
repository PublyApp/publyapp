# Dashboard user-menu prefs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the language and color-scheme switchers out of the dashboard topbar and into the `SidebarUserMenu` popover as nested-submenu rows.

**Architecture:** Two new self-contained components (`ColorSchemeMenuItem`, `LanguageMenuItem`) — each renders a row inside the user-menu popover and owns a nested `CustomPopover` anchored to that row, opening to the right via `arrow.placement = 'left-top'`. The dashboard layout drops the two switchers from the topbar's `rightArea`. Other layouts (marketing, auth-split, tenant-picker) are untouched.

**Tech Stack:** React 19, MUI v6, `react-i18next`, `minimal-shared/hooks` (`usePopover`), `Iconify`, `CustomPopover`, `FlagIcon`.

**Spec:** `docs/superpowers/specs/2026-05-08-dashboard-user-menu-prefs-design.md`

**No frontend tests:** The project has no frontend test suite yet (`AGENTS.md` says "when implemented"). Verification is type-check + lint + manual smoke test in the dev server.

---

### Task 1: Create the feature branch

**Files:** none

- [ ] **Step 1: Cut a new branch off develop**

```bash
git switch -c feat/dashboard-user-menu-prefs
git status
```

Expected: `On branch feat/dashboard-user-menu-prefs`. The untracked spec file is still in the worktree.

- [ ] **Step 2: Commit the spec onto the new branch**

```bash
git add docs/superpowers/specs/2026-05-08-dashboard-user-menu-prefs-design.md
git commit -m "docs(specs): design for dashboard user-menu prefs (#323)"
```

---

### Task 2: Add the i18n keys

**Files:**
- Modify: `packages/shared-ts/lib/i18n/json/common.en.json`
- Modify: `packages/shared-ts/lib/i18n/json/common.fr.json`

- [ ] **Step 1: Add `theme`, `language`, `system-mode` to the en file**

Insert near the existing `light-mode` / `dark-mode` keys (alphabetical-ish neighborhood — match the existing layout):

```json
"language": "Language",
"system-mode": "System",
"theme": "Theme",
```

- [ ] **Step 2: Add the same keys to the fr file**

```json
"language": "Langue",
"system-mode": "Système",
"theme": "Thème",
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared-ts/lib/i18n/json/common.en.json packages/shared-ts/lib/i18n/json/common.fr.json
git commit -m "i18n: add theme/language/system-mode keys (#323)"
```

---

### Task 3: Create `ColorSchemeMenuItem`

**Files:**
- Create: `apps/front/src/layouts/components/user-menu-color-scheme-item.tsx`

- [ ] **Step 1: Write the new component**

Use icon mapping mirroring the existing `colorscheme-popover.tsx`, but explicitly map `system` to `solar:monitor-bold-duotone` (small visual improvement over the current fallback to moon).

```tsx
import { type SupportedColorScheme, useColorScheme } from '@mui/material';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import get from 'lodash/get';
import map from 'lodash/map';
import { usePopover } from 'minimal-shared/hooks';

import { CustomPopover } from '#app/components/custom-popover/custom-popover.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useSettingsContext } from '#app/hooks/use-settings-context.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

// ----------------------------------------------------------------------

const colorSchemeConfigs = {
	light: { icon: 'solar:sun-bold-duotone', tKey: 'light-mode' },
	dark: { icon: 'solar:moon-bold-duotone', tKey: 'dark-mode' },
	system: { icon: 'solar:monitor-bold-duotone', tKey: 'system-mode' },
};

export const ColorSchemeMenuItem = () => {
	const { t } = useTranslate();
	const { open, anchorEl, onClose, onOpen } = usePopover();
	const settings = useSettingsContext();
	const { mode, systemMode, setMode, allColorSchemes } = useColorScheme();

	const resolvedMode = mode === 'system' ? (systemMode ?? 'dark') : mode;
	const activeKey = mode ?? resolvedMode;
	const activeIcon = get(
		colorSchemeConfigs,
		`${activeKey}.icon`,
		'solar:moon-bold-duotone',
	) as string;
	const activeLabel = t(
		get(colorSchemeConfigs, `${activeKey}.tKey`, activeKey) as never,
	);

	const handleChangeColorScheme = (colorScheme: SupportedColorScheme) => {
		setMode(colorScheme);
		settings.setState({ colorScheme });
		onClose();
	};

	return (
		<>
			<MenuItem
				onClick={onOpen}
				sx={{
					gap: 1,
					py: 0.5,
					px: 1.5,
					minHeight: 32,
				}}
			>
				<Iconify width={18} icon={activeIcon as never} />
				<Typography variant="body2" sx={{ fontSize: '0.8125rem', flex: 1 }}>
					{t('theme')}
				</Typography>
				<Typography
					variant="caption"
					sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
				>
					{activeLabel}
				</Typography>
				<Iconify
					width={16}
					icon="eva:arrow-ios-forward-fill"
					sx={{ color: 'text.disabled' }}
				/>
			</MenuItem>

			<CustomPopover
				open={open}
				anchorEl={anchorEl}
				onClose={onClose}
				slotProps={{
					arrow: { placement: 'left-top', hide: true },
					paper: { sx: { ml: 0.5 } },
				}}
			>
				<MenuList sx={{ width: 160 }}>
					{map(allColorSchemes, (option) => {
						const optionIcon = get(
							colorSchemeConfigs,
							`${option}.icon`,
							'solar:moon-bold-duotone',
						) as string;
						const optionLabel = t(
							get(colorSchemeConfigs, `${option}.tKey`, option) as never,
						);

						return (
							<MenuItem
								key={option}
								selected={option === activeKey}
								onClick={() => {
									handleChangeColorScheme(option);
								}}
							>
								<Iconify icon={optionIcon as never} />
								<Box component="span" sx={{ flex: 1 }}>
									{optionLabel}
								</Box>
							</MenuItem>
						);
					})}
				</MenuList>
			</CustomPopover>
		</>
	);
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/front/src/layouts/components/user-menu-color-scheme-item.tsx
git commit -m "feat(layouts): add ColorSchemeMenuItem for user menu (#323)"
```

---

### Task 4: Create `LanguageMenuItem`

**Files:**
- Create: `apps/front/src/layouts/components/user-menu-language-item.tsx`

- [ ] **Step 1: Write the new component**

```tsx
import MenuItem from '@mui/material/MenuItem';
import MenuList from '@mui/material/MenuList';
import Typography from '@mui/material/Typography';
import { usePopover } from 'minimal-shared/hooks';

import type { AppLocale } from '@org/shared-ts/lib/i18n/resources';

import { CustomPopover } from '#app/components/custom-popover/custom-popover.tsx';
import { FlagIcon } from '#app/components/flag-icon/flag-icon.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { allLangs } from '#app/lib/locales/all-langs.ts';

// ----------------------------------------------------------------------

export const LanguageMenuItem = () => {
	const { t, onChangeLang, currentLang } = useTranslate();
	const { open, anchorEl, onClose, onOpen } = usePopover();

	const handleChangeLang = (newLang: AppLocale) => {
		void onChangeLang(newLang);
		onClose();
	};

	return (
		<>
			<MenuItem
				onClick={onOpen}
				sx={{
					gap: 1,
					py: 0.5,
					px: 1.5,
					minHeight: 32,
				}}
			>
				<FlagIcon code={currentLang.countryCode} sx={{ width: 18, height: 18 }} />
				<Typography variant="body2" sx={{ fontSize: '0.8125rem', flex: 1 }}>
					{t('language')}
				</Typography>
				<Typography
					variant="caption"
					sx={{ color: 'text.secondary', fontSize: '0.75rem' }}
				>
					{currentLang.label}
				</Typography>
				<Iconify
					width={16}
					icon="eva:arrow-ios-forward-fill"
					sx={{ color: 'text.disabled' }}
				/>
			</MenuItem>

			<CustomPopover
				open={open}
				anchorEl={anchorEl}
				onClose={onClose}
				slotProps={{
					arrow: { placement: 'left-top', hide: true },
					paper: { sx: { ml: 0.5 } },
				}}
			>
				<MenuList sx={{ width: 160 }}>
					{allLangs.map((option) => (
						<MenuItem
							key={option.value}
							selected={option.value === currentLang.value}
							onClick={() => {
								handleChangeLang(option.value as AppLocale);
							}}
						>
							<FlagIcon code={option.countryCode} />
							{option.label}
						</MenuItem>
					))}
				</MenuList>
			</CustomPopover>
		</>
	);
};
```

- [ ] **Step 2: Verify FlagIcon supports an `sx` prop**

Run: `grep -n "sx" apps/front/src/components/flag-icon/flag-icon.tsx`
Expected: at least one match for `sx`. If not, drop the `sx` prop on the trigger-row `FlagIcon` and let it use the default size.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/layouts/components/user-menu-language-item.tsx
git commit -m "feat(layouts): add LanguageMenuItem for user menu (#323)"
```

---

### Task 5: Wire the new items into `SidebarUserMenu`

**Files:**
- Modify: `apps/front/src/layouts/components/sidebar-user-menu.tsx`

- [ ] **Step 1: Add imports**

Add near the other component imports:

```ts
import { ColorSchemeMenuItem } from './user-menu-color-scheme-item';
import { LanguageMenuItem } from './user-menu-language-item';
```

- [ ] **Step 2: Insert the new MenuList between nav items and logout**

Find the existing block that ends with the navigation `MenuList` and immediately precedes the dashed `Divider` before the logout `MenuList`. Insert a new `MenuList` + `Divider` before the logout block.

Replace (the segment between the last nav `MenuList` and the logout `MenuList`):

```tsx
				</MenuList>

				<Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

				<MenuList sx={{ py: 0.5 }}>
					<MenuItem
						onClick={handleLogout}
```

with:

```tsx
				</MenuList>

				<Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

				<MenuList sx={{ py: 0.5 }}>
					<ColorSchemeMenuItem />
					<LanguageMenuItem />
				</MenuList>

				<Divider sx={{ my: 0.5, borderStyle: 'dashed' }} />

				<MenuList sx={{ py: 0.5 }}>
					<MenuItem
						onClick={handleLogout}
```

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/layouts/components/sidebar-user-menu.tsx
git commit -m "feat(layouts): show theme/language switchers in user menu (#323)"
```

---

### Task 6: Drop switchers from the dashboard topbar

**Files:**
- Modify: `apps/front/src/layouts/dashboard/layout.tsx`

- [ ] **Step 1: Remove unused imports**

Delete the following lines from the import section:

```ts
import { allLangs } from '#app/lib/locales/all-langs.ts';
```

```ts
import { ColorSchemePopover } from '../components/colorscheme-popover';
import { LanguagePopover } from '../components/language-popover';
```

- [ ] **Step 2: Remove the `rightArea` slot**

Delete the entire `rightArea` entry from `headerSlots`:

```tsx
				rightArea: (
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: { xs: 0, sm: 0.75 },
						}}
					>
						{/** @slot Color scheme */}
						<ColorSchemePopover />

						{/** @slot Language popover */}
						<LanguagePopover data={allLangs} />

						{/** @slot Settings button */}
						{/* <SettingsButton /> */}
					</Box>
				),
```

If `Box` is no longer used in the file after this deletion, remove the `import Box from '@mui/material/Box';` line as well. (Verify by grepping for `<Box` in the file.)

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/layouts/dashboard/layout.tsx
git commit -m "refactor(dashboard): drop topbar switchers, now in user menu (#323)"
```

---

### Task 7: Verify

**Files:** none

- [ ] **Step 1: Type-check**

```bash
just tsc-front
```
Expected: zero errors.

- [ ] **Step 2: Lint + format**

```bash
just check-write
```
Expected: zero errors.

- [ ] **Step 3: Knip (unused deps/exports)**

```bash
just knip
```
Expected: no NEW unused exports introduced by this change.

- [ ] **Step 4: Manual smoke test**

Start the dev server and verify by hand:

```bash
just dev-front
# in another terminal:
just dev-api
```

Open the dashboard:
- Topbar's right side is empty.
- Open the user menu in the sidebar; the popover shows: user info → Profile/Security/Notifications → Theme/Language → Logout.
- Click "Theme" — a side popover opens to the right with Light/Dark/System; pick each one and confirm the app theme changes; the user menu stays open.
- Click "Language" — a side popover opens to the right with the language list; pick each one and confirm the language changes; the user menu stays open.
- Visit a marketing page (`/`), an auth page (`/auth/login`), and the tenant picker (`/tenants`) — confirm the original switchers still appear in their topbars.

If the parent popover closes when interacting with the nested popover, fall back to:
- Add `disableRestoreFocus` to the nested `CustomPopover`, OR
- Use `event.stopPropagation()` in the row's `onClick` and the nested popover's `onClose`.

- [ ] **Step 5: Push and open PR**

```bash
git push -u origin feat/dashboard-user-menu-prefs
gh pr create --title "feat(dashboard): move language + theme switchers into user menu" --body "$(cat <<'EOF'
## Summary

- Moves `ColorSchemePopover` and `LanguagePopover` from the dashboard topbar's `rightArea` into the `SidebarUserMenu` popover as nested-submenu rows, matching modern SaaS dashboard patterns (Linear, Notion, Vercel).
- Adds two new self-contained components: `ColorSchemeMenuItem` and `LanguageMenuItem`.
- Adds three new i18n keys: `theme`, `language`, `system-mode` (en + fr).
- Dashboard topbar `rightArea` is now empty; ready for future product slots.
- Marketing, auth-split, and tenant-picker layouts are untouched.

Closes #323.

## Test plan

- [ ] `just tsc-front` passes
- [ ] `just check-write` passes
- [ ] Manual: dashboard topbar right side is empty
- [ ] Manual: user-menu popover shows Theme + Language rows with current value + chevron
- [ ] Manual: clicking Theme opens a side popover with Light/Dark/System; selection updates the app theme and parent menu stays open
- [ ] Manual: clicking Language opens a side popover with language list; selection updates the app language and parent menu stays open
- [ ] Manual: marketing layout, auth-split layout, and tenant-picker view still show their original switchers

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

- [x] Spec coverage: i18n keys, both new components, sidebar-user-menu wiring, topbar removal, verification — all present.
- [x] No placeholders.
- [x] Types/names consistent: `ColorSchemeMenuItem`, `LanguageMenuItem` used the same way in Task 5 as defined in Tasks 3/4.
