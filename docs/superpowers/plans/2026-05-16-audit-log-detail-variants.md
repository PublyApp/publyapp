# Audit Log Detail Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `staff-audit-log-details-page.tsx` to render one of three layout variants (`sectioned`, `split`, `stacked`) chosen via a nuqs-bound `?variant=` query param + a small `<ToggleButtonGroup>` switcher next to the page heading. The three variants share six reusable building blocks. Default variant is `stacked` (matches the app's existing `<Stack> + Cards` detail-page pattern).

**Architecture:** Page-level wiring stays minimal — the existing `useGetStaffAuditLog` query + `<QueryDisplay>` flow is preserved. On success, a small dispatcher renders one of three sibling composition components based on the active `variant`. The compositions are pure functions of `AuditLogDetail`. Six building blocks (`hero`, `actor`, `context-grid`, `payload`, `variant-switcher`, plus the pure `audit-log-action-category.ts` helper) live under the existing `_parts/` folder.

**Tech Stack:** React 19 · MUI v7 · `nuqs` for URL state · `@org/client-ts` Kiota client (`AuditLogDetail`) · `useTranslate` for i18n · `format-time.ts` for dates · no new dependencies.

**Spec:** [`docs/superpowers/specs/2026-05-16-audit-log-detail-variants-design.md`](../specs/2026-05-16-audit-log-detail-variants-design.md)

---

## File Structure

**New (all under `apps/front/src/routes/authed/staff/audit-logs/details/_parts/`):**

| File | Responsibility |
| --- | --- |
| `audit-log-action-category.ts` | Pure helper — derives `{ kind, color }` from the dotted action string. |
| `audit-log-hero.tsx` | Hero block: category `<Chip>` + monospace action title + timestamp. Caller controls outer chrome via `sx`. |
| `audit-log-actor.tsx` | Avatar + name + email block. |
| `audit-log-context-grid.tsx` | Configurable 2-column grid of label/value cells (`fields` prop). |
| `audit-log-payload.tsx` | JSON viewer in `background.neutral` well; renders nothing when `details` is null. |
| `audit-log-variant-switcher.tsx` | `<ToggleButtonGroup>` bound to the nuqs `?variant=` param. |
| `use-audit-log-detail-variant.ts` | Thin hook wrapping the nuqs `useQueryState`. |
| `audit-log-detail-sectioned.tsx` | Variant A: single `<Card>` sectioned by `<Divider>`. |
| `audit-log-detail-split.tsx` | Variant B: chrome-less `<Hero>` + 2-column `<Grid>` of two Cards. |
| `audit-log-detail-stacked.tsx` | Variant C: chrome-less `<Hero>` + three discrete `<Card>` sections. |

**Modified:**

- `apps/front/src/routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx` — drop in-file `AuditLogDetailsContent` and `DetailRow`; render `<VariantSwitcher>` via `CustomBreadcrumbs` `action` prop; dispatch on `variant` inside `QueryDisplay` success branch. Drop the hard-coded `width: 800`.
- `packages/shared-ts/lib/i18n/json/common.en.json` — add new keys.
- `packages/shared-ts/lib/i18n/json/common.fr.json` — add new keys.
- `apps/front/public/tx/common.en.json` — mirror of the EN file consumed at runtime (the build copies it).

---

## Task 1: Add i18n keys for the variant switcher

**Files:**
- Modify: `packages/shared-ts/lib/i18n/json/common.en.json`
- Modify: `packages/shared-ts/lib/i18n/json/common.fr.json`
- Modify: `apps/front/public/tx/common.en.json`

The switcher needs three labels (`sectioned`, `split`, `stacked`) plus one new field label (`event-id`) used by the `ContextGrid`. Keep the existing flat-key style of the rest of the file.

- [ ] **Step 1: Add the four EN keys**

Open `packages/shared-ts/lib/i18n/json/common.en.json`. Insert in alphabetical order (the file is alphabetised):

```json
"event-id": "Event ID",
"sectioned": "Sectioned",
"split": "Split",
"stacked": "Stacked",
```

If alphabetical neighbours already exist with similar keys, place the new ones next to them so the diff stays tidy.

- [ ] **Step 2: Mirror the keys into the public runtime EN file**

Open `apps/front/public/tx/common.en.json` and add the same four keys in the same alphabetical positions:

```json
"event-id": "Event ID",
"sectioned": "Sectioned",
"split": "Split",
"stacked": "Stacked",
```

- [ ] **Step 3: Add the four FR keys**

Open `packages/shared-ts/lib/i18n/json/common.fr.json` and add:

```json
"event-id": "ID d'événement",
"sectioned": "Sections",
"split": "Côte à côte",
"stacked": "Empilé",
```

- [ ] **Step 4: Commit**

```bash
git add packages/shared-ts/lib/i18n/json/common.en.json packages/shared-ts/lib/i18n/json/common.fr.json apps/front/public/tx/common.en.json
git commit -m "i18n: add keys for audit-log detail variant switcher + event-id"
```

---

## Task 2: Build the pure category helper

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-action-category.ts`

The helper is pure, synchronous, and has no React or MUI imports. It parses the dotted action string (`tenant.user.suspended`, `auth.login.failed`, etc.) and returns `{ kind, color }` consumed by the hero chip. Verb-derived so new backend actions categorize sensibly with no frontend change.

- [ ] **Step 1: Create the file**

Write the entire helper:

```typescript
import capitalize from 'lodash/capitalize';

export type AuditCategoryColor =
	| 'success'
	| 'warning'
	| 'error'
	| 'info'
	| 'default';

export type AuditCategory = {
	kind: string;
	color: AuditCategoryColor;
};

const DESTRUCTIVE_VERBS = new Set(['deleted', 'removed', 'revoked']);

export const categorizeAuditAction = (action: string): AuditCategory => {
	if (!action) {
		return { kind: 'Event', color: 'default' };
	}

	const segments = action.split('.');
	const first = segments[0] ?? '';
	const last = segments[segments.length - 1] ?? '';

	if (first === 'auth') {
		if (last === 'succeeded') {
			return { kind: 'Auth', color: 'success' };
		}
		if (last === 'failed') {
			return { kind: 'Auth', color: 'error' };
		}
		return { kind: 'Auth', color: 'info' };
	}

	if (first === 'impersonation') {
		return { kind: 'Impersonation', color: 'warning' };
	}

	if (first === 'system') {
		return { kind: 'System', color: 'info' };
	}

	const kind = capitalize(first) || 'Event';

	if (DESTRUCTIVE_VERBS.has(last)) {
		return { kind, color: 'error' };
	}
	if (last === 'suspended') {
		return { kind, color: 'warning' };
	}
	if (last === 'reactivated') {
		return { kind, color: 'success' };
	}

	return { kind, color: 'default' };
};
```

- [ ] **Step 2: Run type-check**

```bash
just tsc-front
```

Expected: PASS (no new files referenced yet, but the new file itself must compile).

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-action-category.ts
git commit -m "feat(audit-logs): pure category helper for action strings"
```

---

## Task 3: Build `audit-log-payload.tsx`

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-payload.tsx`

Wraps the existing pretty-print logic (`JSON.parse → JSON.stringify(..., null, 2)` with a raw-string fallback). Renders nothing when `details` is null — the caller decides whether to also hide the surrounding Card.

- [ ] **Step 1: Create the file**

```tsx
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { useTranslate } from '#app/hooks/use-translate.ts';

type AuditLogPayloadProps = {
	details?: string | null;
};

const formatPayload = (raw: string): string => {
	try {
		return JSON.stringify(JSON.parse(raw), null, 2);
	} catch {
		return raw;
	}
};

export const AuditLogPayload = ({ details }: AuditLogPayloadProps) => {
	const { t } = useTranslate();

	if (!details) {
		return null;
	}

	return (
		<Box>
			<Typography
				variant="caption"
				sx={{
					color: 'text.secondary',
					textTransform: 'uppercase',
					letterSpacing: 0.4,
					display: 'block',
					mb: 1,
				}}
			>
				{t('details')}
			</Typography>
			<Box
				component="pre"
				sx={{
					m: 0,
					p: 1.5,
					borderRadius: 1,
					bgcolor: 'background.neutral',
					fontFamily: 'monospace',
					fontSize: '0.8rem',
					overflow: 'auto',
					maxHeight: 360,
					whiteSpace: 'pre-wrap',
					wordBreak: 'break-word',
				}}
			>
				{formatPayload(details)}
			</Box>
		</Box>
	);
};
```

- [ ] **Step 2: Run type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-payload.tsx
git commit -m "feat(audit-logs): payload block for detail variants"
```

---

## Task 4: Build `audit-log-context-grid.tsx`

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-context-grid.tsx`

Configurable 2-column grid. Takes a `fields` prop and renders only the requested cells. Long monospace values truncate with ellipsis and surface in a `<Tooltip>` on hover.

- [ ] **Step 1: Create the file**

```tsx
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import map from 'lodash/map';

import { useTranslate } from '#app/hooks/use-translate.ts';

import type { AuditLogDetail } from '@org/client-ts/src/models';

export type AuditLogContextField =
	| 'ip'
	| 'userAgent'
	| 'targetId'
	| 'eventId';

type AuditLogContextGridProps = {
	auditLog: AuditLogDetail;
	fields: AuditLogContextField[];
};

type Cell = {
	key: AuditLogContextField;
	labelKey: string;
	value: string;
	mono: boolean;
};

const dash = '-';

export const AuditLogContextGrid = ({
	auditLog,
	fields,
}: AuditLogContextGridProps) => {
	const { t } = useTranslate();

	const allCells: Record<AuditLogContextField, Cell> = {
		ip: {
			key: 'ip',
			labelKey: 'ip-address',
			value: auditLog.ipAddress || dash,
			mono: true,
		},
		userAgent: {
			key: 'userAgent',
			labelKey: 'user-agent',
			value: auditLog.userAgent || dash,
			mono: false,
		},
		targetId: {
			key: 'targetId',
			labelKey: 'target-id',
			value: auditLog.targetId ?? dash,
			mono: true,
		},
		eventId: {
			key: 'eventId',
			labelKey: 'event-id',
			value: auditLog.id ?? dash,
			mono: true,
		},
	};

	const visible = map(fields, (f) => allCells[f]);

	return (
		<Grid container spacing={2}>
			{map(visible, (cell) => (
				<Grid key={cell.key} size={{ xs: 12, sm: 6 }}>
					<Typography
						variant="caption"
						sx={{
							color: 'text.secondary',
							textTransform: 'uppercase',
							letterSpacing: 0.4,
							display: 'block',
							mb: 0.5,
						}}
					>
						{t(cell.labelKey)}
					</Typography>
					<Tooltip title={cell.value} placement="top" enterDelay={600}>
						<Box
							sx={{
								overflow: 'hidden',
								textOverflow: 'ellipsis',
								whiteSpace: 'nowrap',
								fontFamily: cell.mono ? 'monospace' : undefined,
								fontSize: cell.mono ? '0.8rem' : undefined,
								color: cell.mono ? 'text.secondary' : 'text.primary',
							}}
						>
							{cell.value}
						</Box>
					</Tooltip>
				</Grid>
			))}
		</Grid>
	);
};
```

- [ ] **Step 2: Run type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-context-grid.tsx
git commit -m "feat(audit-logs): context-grid block with configurable fields"
```

---

## Task 5: Build `audit-log-actor.tsx`

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-actor.tsx`

Avatar (initials, `primary.lighter` bg, `primary.darker` text) + name + email. Falls back to `-`/`?` when fields are null.

- [ ] **Step 1: Create the file**

```tsx
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { useTranslate } from '#app/hooks/use-translate.ts';

import type { AuditLogDetail } from '@org/client-ts/src/models';

type AuditLogActorProps = {
	auditLog: AuditLogDetail;
};

const getInitials = (name?: string | null): string => {
	if (!name) {
		return '?';
	}
	const parts = name.trim().split(/\s+/);
	const first = parts[0]?.[0] ?? '';
	const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
	const initials = (first + last).toUpperCase();
	return initials || '?';
};

export const AuditLogActor = ({ auditLog }: AuditLogActorProps) => {
	const { t } = useTranslate();

	return (
		<Box>
			<Typography
				variant="caption"
				sx={{
					color: 'text.secondary',
					textTransform: 'uppercase',
					letterSpacing: 0.4,
					display: 'block',
					mb: 1,
				}}
			>
				{t('user')}
			</Typography>
			<Stack direction="row" spacing={1.5} alignItems="center">
				<Avatar
					sx={{
						bgcolor: 'primary.lighter',
						color: 'primary.darker',
						width: 36,
						height: 36,
						fontSize: 13,
						fontWeight: 600,
					}}
				>
					{getInitials(auditLog.userName)}
				</Avatar>
				<Box sx={{ minWidth: 0 }}>
					<Typography variant="subtitle2" noWrap>
						{auditLog.userName || '-'}
					</Typography>
					<Typography
						variant="caption"
						noWrap
						sx={{ color: 'text.secondary', display: 'block' }}
					>
						{auditLog.userEmail || '-'}
					</Typography>
				</Box>
			</Stack>
		</Box>
	);
};
```

- [ ] **Step 2: Run type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-actor.tsx
git commit -m "feat(audit-logs): actor block with avatar + name + email"
```

---

## Task 6: Build `audit-log-hero.tsx`

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-hero.tsx`

Hero block: category `<Chip>` (color from `categorizeAuditAction`) + monospace action title (`Typography variant="h5"`) + absolute timestamp + relative timestamp. The caller passes optional `sx` to control the outer chrome (the `sectioned` variant tints the background; the other two render it as-is).

- [ ] **Step 1: Create the file**

```tsx
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';

import type { AuditLogDetail } from '@org/client-ts/src/models';

import { fDateTime, fToNow } from '#app/utils/format-time.ts';

import { categorizeAuditAction } from './audit-log-action-category';

type AuditLogHeroProps = {
	auditLog: AuditLogDetail;
	sx?: SxProps<Theme>;
};

export const AuditLogHero = ({ auditLog, sx }: AuditLogHeroProps) => {
	const { kind, color } = categorizeAuditAction(auditLog.action ?? '');

	return (
		<Box sx={{ p: 3, ...sx }}>
			<Stack spacing={1.5}>
				<Chip
					label={kind}
					color={color === 'default' ? undefined : color}
					size="small"
					variant={color === 'default' ? 'outlined' : 'filled'}
					sx={{ alignSelf: 'flex-start', fontWeight: 500 }}
				/>
				<Typography
					variant="h5"
					sx={{
						fontFamily: 'monospace',
						wordBreak: 'break-all',
						lineHeight: 1.3,
					}}
				>
					{auditLog.action || '-'}
				</Typography>
				{auditLog.createdAt && (
					<Stack
						direction="row"
						spacing={1}
						alignItems="center"
						sx={{ color: 'text.secondary' }}
					>
						<Typography variant="body2">
							{fDateTime(auditLog.createdAt)}
						</Typography>
						<Typography variant="body2" aria-hidden>
							·
						</Typography>
						<Typography variant="body2">
							{fToNow(auditLog.createdAt)}
						</Typography>
					</Stack>
				)}
			</Stack>
		</Box>
	);
};
```

- [ ] **Step 2: Run type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-hero.tsx
git commit -m "feat(audit-logs): hero block with category chip + action + timestamp"
```

---

## Task 7: Build the variant param hook

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/details/_parts/use-audit-log-detail-variant.ts`

Thin wrapper around `useQueryState` with `parseAsStringLiteral`. Exports the `VARIANTS` array (used by the switcher to render buttons) and the `AuditLogDetailVariant` type. Default = `stacked`.

- [ ] **Step 1: Create the file**

```typescript
import { parseAsStringLiteral, useQueryState } from 'nuqs';

export const AUDIT_LOG_DETAIL_VARIANTS = [
	'sectioned',
	'split',
	'stacked',
] as const;

export type AuditLogDetailVariant =
	(typeof AUDIT_LOG_DETAIL_VARIANTS)[number];

export const useAuditLogDetailVariant = () => {
	return useQueryState(
		'variant',
		parseAsStringLiteral(AUDIT_LOG_DETAIL_VARIANTS).withDefault('stacked'),
	);
};
```

- [ ] **Step 2: Run type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/details/_parts/use-audit-log-detail-variant.ts
git commit -m "feat(audit-logs): nuqs-bound variant hook for detail page"
```

---

## Task 8: Build the variant switcher

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-variant-switcher.tsx`

`<ToggleButtonGroup size="small" exclusive>` with three `<ToggleButton>`s labelled via i18n. Reads/writes the variant param through the hook from Task 7. Compact, theme-native styling.

- [ ] **Step 1: Create the file**

```tsx
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import map from 'lodash/map';

import { useTranslate } from '#app/hooks/use-translate.ts';

import {
	AUDIT_LOG_DETAIL_VARIANTS,
	type AuditLogDetailVariant,
	useAuditLogDetailVariant,
} from './use-audit-log-detail-variant';

export const AuditLogVariantSwitcher = () => {
	const { t } = useTranslate();
	const [variant, setVariant] = useAuditLogDetailVariant();

	const handleChange = (
		_event: React.MouseEvent<HTMLElement>,
		next: AuditLogDetailVariant | null,
	) => {
		if (!next) {
			return;
		}
		setVariant(next);
	};

	return (
		<ToggleButtonGroup
			size="small"
			exclusive
			value={variant}
			onChange={handleChange}
			aria-label={t('layout')}
		>
			{map(AUDIT_LOG_DETAIL_VARIANTS, (v) => (
				<ToggleButton
					key={v}
					value={v}
					sx={{ textTransform: 'none', px: 1.5 }}
				>
					{t(v)}
				</ToggleButton>
			))}
		</ToggleButtonGroup>
	);
};
```

- [ ] **Step 2: Confirm `layout` is an existing i18n key**

```bash
grep -E '"layout"\s*:' packages/shared-ts/lib/i18n/json/common.en.json
```

Expected: at least one match. If the key does not exist, add it: `"layout": "Layout"` in EN, `"layout": "Disposition"` in FR, and mirror into `apps/front/public/tx/common.en.json`. Then stage those files together in Step 4.

- [ ] **Step 3: Run type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-variant-switcher.tsx
git commit -m "feat(audit-logs): variant switcher ToggleButtonGroup"
```

If you added `layout` keys in Step 2, also `git add` the three JSON files.

---

## Task 9: Build the `sectioned` variant composition

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-detail-sectioned.tsx`

One `<Card>` with no width override. Vertical: `Hero` (with `background.neutral` tint) → `Divider` → `Actor` → `Divider` → `ContextGrid` with all four fields → `Divider` → `Payload`. The Payload's containing section is omitted (along with its leading Divider) when `details` is null.

- [ ] **Step 1: Create the file**

```tsx
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Divider from '@mui/material/Divider';

import type { AuditLogDetail } from '@org/client-ts/src/models';

import { AuditLogActor } from './audit-log-actor';
import { AuditLogContextGrid } from './audit-log-context-grid';
import { AuditLogHero } from './audit-log-hero';
import { AuditLogPayload } from './audit-log-payload';

type AuditLogDetailSectionedProps = {
	auditLog: AuditLogDetail;
};

export const AuditLogDetailSectioned = ({
	auditLog,
}: AuditLogDetailSectionedProps) => {
	return (
		<Card>
			<AuditLogHero auditLog={auditLog} sx={{ bgcolor: 'background.neutral' }} />
			<Divider />
			<Box sx={{ p: 3 }}>
				<AuditLogActor auditLog={auditLog} />
			</Box>
			<Divider />
			<Box sx={{ p: 3 }}>
				<AuditLogContextGrid
					auditLog={auditLog}
					fields={['ip', 'userAgent', 'targetId', 'eventId']}
				/>
			</Box>
			{auditLog.details && (
				<>
					<Divider />
					<Box sx={{ p: 3 }}>
						<AuditLogPayload details={auditLog.details} />
					</Box>
				</>
			)}
		</Card>
	);
};
```

- [ ] **Step 2: Run type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-detail-sectioned.tsx
git commit -m "feat(audit-logs): sectioned variant composition"
```

---

## Task 10: Build the `split` variant composition

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-detail-split.tsx`

Page-level `<Stack spacing={3}>`. Chrome-less `<Hero>`. Then a `<Grid container spacing={3}>` with two `<Grid>` items — left (`xs=12`, `md=7`) carrying a Card with `Actor` + `ContextGrid` (all four fields), right (`xs=12`, `md=5`) carrying a Card with `Payload`. When `details` is null, the right Card is omitted and the left Card takes the full width via `md=12`.

- [ ] **Step 1: Create the file**

```tsx
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';

import type { AuditLogDetail } from '@org/client-ts/src/models';

import { AuditLogActor } from './audit-log-actor';
import { AuditLogContextGrid } from './audit-log-context-grid';
import { AuditLogHero } from './audit-log-hero';
import { AuditLogPayload } from './audit-log-payload';

type AuditLogDetailSplitProps = {
	auditLog: AuditLogDetail;
};

export const AuditLogDetailSplit = ({ auditLog }: AuditLogDetailSplitProps) => {
	const hasPayload = !!auditLog.details;

	return (
		<Stack spacing={3}>
			<AuditLogHero auditLog={auditLog} sx={{ p: 0 }} />
			<Grid container spacing={3}>
				<Grid size={{ xs: 12, md: hasPayload ? 7 : 12 }}>
					<Card>
						<Stack spacing={3} sx={{ p: 3 }}>
							<AuditLogActor auditLog={auditLog} />
							<AuditLogContextGrid
								auditLog={auditLog}
								fields={['ip', 'userAgent', 'targetId', 'eventId']}
							/>
						</Stack>
					</Card>
				</Grid>
				{hasPayload && (
					<Grid size={{ xs: 12, md: 5 }}>
						<Card>
							<Box sx={{ p: 3 }}>
								<AuditLogPayload details={auditLog.details} />
							</Box>
						</Card>
					</Grid>
				)}
			</Grid>
		</Stack>
	);
};
```

- [ ] **Step 2: Run type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-detail-split.tsx
git commit -m "feat(audit-logs): split variant composition"
```

---

## Task 11: Build the `stacked` variant composition

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-detail-stacked.tsx`

Page-level `<Stack spacing={3}>`. Chrome-less `<Hero>`. Then three discrete Cards in order: Overview (`Actor` + `ContextGrid` with `targetId` + `eventId`), Context (`ContextGrid` with `ip` + `userAgent`), Payload (only when `details` is non-null).

- [ ] **Step 1: Create the file**

```tsx
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';

import type { AuditLogDetail } from '@org/client-ts/src/models';

import { AuditLogActor } from './audit-log-actor';
import { AuditLogContextGrid } from './audit-log-context-grid';
import { AuditLogHero } from './audit-log-hero';
import { AuditLogPayload } from './audit-log-payload';

type AuditLogDetailStackedProps = {
	auditLog: AuditLogDetail;
};

export const AuditLogDetailStacked = ({
	auditLog,
}: AuditLogDetailStackedProps) => {
	return (
		<Stack spacing={3}>
			<AuditLogHero auditLog={auditLog} sx={{ p: 0 }} />
			<Card>
				<Stack spacing={3} sx={{ p: 3 }}>
					<AuditLogActor auditLog={auditLog} />
					<AuditLogContextGrid
						auditLog={auditLog}
						fields={['targetId', 'eventId']}
					/>
				</Stack>
			</Card>
			<Card>
				<Box sx={{ p: 3 }}>
					<AuditLogContextGrid
						auditLog={auditLog}
						fields={['ip', 'userAgent']}
					/>
				</Box>
			</Card>
			{auditLog.details && (
				<Card>
					<Box sx={{ p: 3 }}>
						<AuditLogPayload details={auditLog.details} />
					</Box>
				</Card>
			)}
		</Stack>
	);
};
```

- [ ] **Step 2: Run type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/details/_parts/audit-log-detail-stacked.tsx
git commit -m "feat(audit-logs): stacked variant composition"
```

---

## Task 12: Refactor the page to dispatch on variant

**Files:**
- Modify: `apps/front/src/routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx`

Replace the in-file `AuditLogDetailsContent` + `DetailRow` (which together hold the current 800px Card) with a small dispatcher that selects one of the three variant compositions. Wire `<AuditLogVariantSwitcher />` into the `<CustomBreadcrumbs>` `action` slot. Keep the `<View400>`, `<QueryDisplay>`, skeleton, error, and empty branches intact.

- [ ] **Step 1: Apply the edit**

Replace the entire file with:

```tsx
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';
import { isServer } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { data, useParams } from 'react-router';

import type { AuditLogDetail } from '@org/client-ts/src/models';
import { APP_NAME, FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { CustomBreadcrumbs } from '#app/components/custom-breadcrumbs/custom-breadcrumbs.tsx';
import { EmptyContent } from '#app/components/empty-content/empty-content.tsx';
import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import { View400 } from '#app/components/error/400-view.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { DashboardContent } from '#app/layouts/dashboard/content.tsx';
import { isProblemFailure, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useGetStaffAuditLog } from '#app/lib/react-query/features/staff/staff-audit-log.hooks.ts';
import { getServerLoader } from '#app/lib/react-router/server-data.server.ts';

import { AuditLogDetailSectioned } from './_parts/audit-log-detail-sectioned';
import { AuditLogDetailSplit } from './_parts/audit-log-detail-split';
import { AuditLogDetailStacked } from './_parts/audit-log-detail-stacked';
import { AuditLogVariantSwitcher } from './_parts/audit-log-variant-switcher';
import { useAuditLogDetailVariant } from './_parts/use-audit-log-detail-variant';

import type { Route } from './+types/staff-audit-log-details-page';

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, seo?: boolean) => {
	let str: string = _.capitalize(t('audit-log-details'));

	if (seo) {
		str = `${str} | Staff Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.loaderData, 'meta', []);
	}

	const t: TFunction = i18next.t;

	return [
		{
			title: getPageTitle(t, true),
		},
	];
};

export const loader = getServerLoader({
	loader: async ({ z }) => {
		const t = z.t;

		return data({
			meta: [
				{
					title: getPageTitle(t, true),
				},
			],
		});
	},
});

// ----------------------------------------------------------------------

const StaffAuditLogDetailsPage = () => {
	const { t } = useTranslate();
	const { logId } = useParams();

	const auditLogQuery = useGetStaffAuditLog({
		variables: { logId: logId ?? '' },
		enabled: !!logId,
	});

	if (!logId) {
		return (
			<View400
				title={_.capitalize(t('bad-request'))}
				description={_.capitalize(t('log-id-required'))}
			/>
		);
	}

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="lg"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never)}
				links={[
					{
						name: _.capitalize(t('audit-logs')),
						href: FRONT_PATH_NAMES.staff.auditLogs.root,
					},
					{ name: _.capitalize(t('details')) },
				]}
				action={<AuditLogVariantSwitcher />}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<QueryDisplay
				query={auditLogQuery}
				LoadingSlot={AuditLogDetailsSkeleton}
				ErrorSlot={AuditLogDetailsError}
				EmptySlot={AuditLogDetailsEmpty}
			>
				{({ data: auditLog }) => <AuditLogDetailDispatcher auditLog={auditLog} />}
			</QueryDisplay>
		</DashboardContent>
	);
};

export default StaffAuditLogDetailsPage;

// ----------------------------------------------------------------------

type AuditLogDetailDispatcherProps = {
	auditLog: AuditLogDetail;
};

const AuditLogDetailDispatcher = ({
	auditLog,
}: AuditLogDetailDispatcherProps) => {
	const [variant] = useAuditLogDetailVariant();

	if (variant === 'sectioned') {
		return <AuditLogDetailSectioned auditLog={auditLog} />;
	}
	if (variant === 'split') {
		return <AuditLogDetailSplit auditLog={auditLog} />;
	}
	return <AuditLogDetailStacked auditLog={auditLog} />;
};

// ----------------------------------------------------------------------

const AuditLogDetailsEmpty = () => {
	const { t } = useTranslate();

	return (
		<Box sx={{ py: 10 }}>
			<EmptyContent
				title={_.capitalize(
					t('no-items-found', {
						item: t('audit-log'),
						ns: 'response-message',
					}),
				)}
				imgUrl="/assets/icons/empty/ic-content.svg"
			/>
		</Box>
	);
};

// ----------------------------------------------------------------------

const AuditLogDetailsError = ({ error }: { error: unknown }) => {
	const { t } = useTranslate();

	const failure = toApiFailure(error);

	if (
		isProblemFailure(failure) &&
		(failure.status === 404 ||
			(failure.status === 400 && failure.translationKey === 'malformed-id'))
	) {
		return <AuditLogDetailsEmpty />;
	}

	return (
		<Box sx={{ py: 10 }}>
			<ErrorContent
				title={t('error-loading-items', {
					item: t('audit-log'),
					ns: 'response-message',
				})}
			/>
		</Box>
	);
};

// ----------------------------------------------------------------------

const AuditLogDetailsSkeleton = () => {
	return (
		<Card>
			<CardHeader
				title={<Skeleton variant="text" width={200} />}
				sx={{ pb: 2 }}
			/>
			<Divider />
			<CardContent>
				<Grid container spacing={2}>
					<Grid size={12}>
						<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
							<Skeleton variant="circular" width={24} height={24} />
							<Box sx={{ flexGrow: 1 }}>
								<Skeleton variant="text" width="15%" height={16} />
								<Skeleton variant="text" width="40%" height={24} />
							</Box>
						</Box>
					</Grid>
					{[1, 2, 3, 4].map((item) => (
						<Grid key={`skeleton-row-${item}`} size={{ xs: 12, sm: 6 }}>
							<Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
								<Skeleton variant="circular" width={24} height={24} />
								<Box sx={{ flexGrow: 1 }}>
									<Skeleton variant="text" width="40%" height={16} />
									<Skeleton variant="text" width="70%" height={24} />
								</Box>
							</Box>
						</Grid>
					))}
				</Grid>
				<Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}>
					<Skeleton variant="text" width="30%" height={16} />
				</Box>
			</CardContent>
		</Card>
	);
};
```

Key differences from the prior file:
- Drops the in-file `AuditLogDetailsContent` and `DetailRow` (replaced by `AuditLogDetailDispatcher` + the three variant compositions).
- Drops the unused imports: `CardContent`, `CardHeader`, `Grid`, `Typography`, `Iconify`, `IconifyName`, `fDateTime`, `fToNow` from the dispatcher path. (The Skeleton still uses them — keep those.)
- Adds the variant switcher to `<CustomBreadcrumbs action={…} />`.
- The skeleton remains untouched: it covers all three variants well enough.

- [ ] **Step 2: Run type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Run lint**

```bash
just check-write
```

Expected: PASS.

- [ ] **Step 4: Run knip**

```bash
just knip
```

Expected: PASS, no new unused exports/files.

- [ ] **Step 5: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/details/staff-audit-log-details-page.tsx
git commit -m "refactor(audit-logs): dispatch detail page on variant param"
```

---

## Task 13: Browser smoke test

This task does not produce a commit — it is a verification step.

- [ ] **Step 1: Start the API and frontend**

In two terminals:

```bash
just dev-api
just dev-front
```

- [ ] **Step 2: Log in as a Staff admin and seed a few audit-log events of different categories**

Trigger from the app (e.g. log in / log out / suspend a tenant / create a profile) so the list has variety. Or use existing test data.

- [ ] **Step 3: Open a detail page and confirm default variant**

Navigate to any audit log detail. URL has no `variant` param. Confirm `stacked` renders: chrome-less Hero + three Cards.

- [ ] **Step 4: Switch variants via the switcher**

Click each of `Sectioned`, `Split`, `Stacked` in turn. Confirm the URL gains `?variant=…` and the page recomposes without remounting the query (i.e. no loading skeleton flash).

- [ ] **Step 5: Probe param edge cases**

Manually paste `?variant=bogus` and confirm the page falls back to `stacked` (no error in console).

- [ ] **Step 6: Confirm the switcher persists across non-200 states**

Open a malformed ID (e.g. `/staff/audit-logs/not-a-uuid`). Confirm the switcher remains visible above the error/empty surface.

- [ ] **Step 7: Confirm the hero category chip color reflects the action**

Open a `auth.login.failed` event — chip color is `error`. Open a `*.deleted` event — `error`. Open a `*.suspended` event — `warning`. Open a `*.reactivated` event — `success`. Open a `*.created` event — `default` (outlined chip).

- [ ] **Step 8: Confirm null payload handling**

Find or create an event whose `details` is null. In all three variants:
- `sectioned`: no Payload section, no dangling trailing Divider.
- `split`: no right Card; the left Card spans full width.
- `stacked`: no Payload Card.

- [ ] **Step 9: Report which variant feels best**

This is the goal of this whole exercise — pick the winner. The losers are not deleted automatically by this plan; that cleanup is a follow-up task once you've decided.

---

## Self-Review

- **Spec coverage:** Every section of the spec maps to at least one task.
  - URL contract & switcher → Tasks 7, 8, 12.
  - Six building blocks → Tasks 2, 3, 4, 5, 6, 8 (variant switcher is a "block" too) + Task 7 (hook is the seventh, broken out per the spec's `_parts/` list).
  - Three compositions → Tasks 9, 10, 11.
  - Page-level wiring → Task 12.
  - Action category mapping → Task 2.
  - Theme & style anchors → enforced inline in each component's code (theme tokens only; no custom colors).
  - Out-of-scope items (drawer, target resolution, pivots) → not in any task. ✓
  - Testing → Task 13.

- **Placeholder scan:** No "TBD" / "TODO" / hand-waved code. Every step shows the actual code or command.

- **Type consistency:** `AuditLogDetailVariant`, `AuditCategoryColor`, `AuditLogContextField` all defined exactly once and consumed by name. The hook returns the tuple shape `useQueryState` produces.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-16-audit-log-detail-variants.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
