# Audit Log List Inspect Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a URL-bound right-anchored inspect Drawer to the Staff audit logs list, opened from a single `solar:list-bold` action button in the Actions column. Reorder columns so `Event` (action key + event id, 2-line cell with the action key acting as a permalink) is first instead of `User`. The Drawer reuses the detail-page building blocks (`AuditLogHero`, `AuditLogActor`, `AuditLogContextGrid`, `AuditLogPayload`).

**Architecture:** A new nuqs param `?inspect=<logId>` drives the Drawer's open state. A thin hook (`use-audit-log-inspect.ts`) wraps the param. The Drawer fetches its own `AuditLogDetail` via the existing `useGetStaffAuditLog` query, gated on the param being non-empty. The Event-cell click is a real `<Link>` navigation; the Inspect-button click writes the URL param. Backend untouched. Detail page untouched.

**Tech Stack:** React 19 · MUI v7 (`<Drawer>`, `<Tooltip>`, `<IconButton>`, `<Link>`) · `nuqs` for URL state · `@org/client-ts` Kiota client (`AuditLogDetail`) · the existing `DrawerAnchor` component and `useTranslate` hook. No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-05-19-audit-log-list-inspect-drawer-design.md`](../specs/2026-05-19-audit-log-list-inspect-drawer-design.md)

---

## File Structure

**New (all under `apps/front/src/routes/authed/staff/audit-logs/list/_parts/`):**

| File | Responsibility |
| --- | --- |
| `use-audit-log-inspect.ts` | nuqs `useQueryState('inspect', parseAsString)` wrapper. Returns `{ inspectedLogId, openInspect, closeInspect }`. |
| `audit-logs-event-cell.tsx` | The new Event column cell — action key as a `<Link component={RouterLink}>`, event id below truncated with `<Tooltip>`. |
| `audit-logs-inspect-action.tsx` | The Actions column button (`solar:list-bold` + tooltip `t('inspect')`) that calls `openInspect(row.id)`. |
| `audit-log-inspect-drawer.tsx` | The right-anchored `<Drawer>`. Reads `inspectedLogId` from the hook, runs the detail query when open, renders header + body, hosts the `<DrawerAnchor>` close handle. |

**Modified:**

- `staff-audit-logs-table.tsx` — column reorder (`Event` first, `User` second), swap `ActionCell` and `UserCell`, drop the existing `solar:eye-bold` ActionsCell, render `<AuditLogInspectDrawer />` once at the table root.
- `packages/shared-ts/lib/i18n/json/common.en.json` and `common.fr.json` — add two keys (`event`, `inspect`).
- (Runtime mirror file `apps/front/public/tx/common.en.json` is gitignored — skip.)

The category helper, hero, actor, context-grid, and payload blocks under `apps/front/src/routes/authed/staff/audit-logs/details/_parts/` are **reused as-is** — no changes to those files.

---

## Task 1: Add i18n keys

**Files:**
- Modify: `packages/shared-ts/lib/i18n/json/common.en.json`
- Modify: `packages/shared-ts/lib/i18n/json/common.fr.json`

Existing keys already cover everything else the drawer needs (`view-details`, `audit-log`, `close`, `actions`, `user`, `ip-address`, `user-agent`, `target-id`, `event-id`, `details`). Only `event` (Event column header) and `inspect` (Actions tooltip) need adding.

- [ ] **Step 1: Add EN keys**

Open `packages/shared-ts/lib/i18n/json/common.en.json`. Insert near the existing `event-id` entry to keep the diff tidy:

```json
"event": "Event",
"inspect": "Inspect",
```

- [ ] **Step 2: Add FR keys**

Open `packages/shared-ts/lib/i18n/json/common.fr.json` and add in the matching positions:

```json
"event": "Événement",
"inspect": "Inspecter",
```

- [ ] **Step 3: Commit**

```bash
git add packages/shared-ts/lib/i18n/json/common.en.json packages/shared-ts/lib/i18n/json/common.fr.json
git commit -m "i18n: add 'event' and 'inspect' keys for audit-log list drawer"
```

---

## Task 2: Build the inspect hook

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/list/_parts/use-audit-log-inspect.ts`

Thin nuqs wrapper. Single source of truth for the `?inspect=<logId>` URL param so the action button and drawer share the same setter/reader.

- [ ] **Step 1: Create the file**

```typescript
import { parseAsString, useQueryState } from 'nuqs';

export const useAuditLogInspect = () => {
	const [inspectedLogId, setInspectedLogId] = useQueryState(
		'inspect',
		parseAsString,
	);

	const openInspect = (logId: string) => {
		setInspectedLogId(logId);
	};

	const closeInspect = () => {
		setInspectedLogId(null);
	};

	return { inspectedLogId, openInspect, closeInspect };
};
```

- [ ] **Step 2: Type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/list/_parts/use-audit-log-inspect.ts
git commit -m "feat(audit-logs): nuqs-bound hook for the inspect drawer URL param"
```

---

## Task 3: Build the Event column cell

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/list/_parts/audit-logs-event-cell.tsx`

Two-line cell. Primary line is the action key as a real `<Link>` to the detail page (cmd-click opens new tab). Secondary line is the event id, monospace, truncated with ellipsis, full value revealed via `<Tooltip>` on hover — same shape as the existing `TargetIdCell`.

- [ ] **Step 1: Create the file**

```tsx
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { RouterLink } from '#app/components/router-link.tsx';

type AuditLogsEventCellProps = {
	id: string;
	action: string;
};

export const AuditLogsEventCell = ({
	id,
	action,
}: AuditLogsEventCellProps) => {
	return (
		<Box sx={{ minWidth: 0 }}>
			<Link
				component={RouterLink}
				href={FRONT_PATH_NAMES.staff.auditLogs.details(id)}
				underline="none"
				sx={{
					display: 'block',
					fontFamily: 'monospace',
					fontSize: '0.8rem',
					color: 'text.primary',
					fontWeight: 500,
					'&:hover': { color: 'primary.main' },
				}}
			>
				{action || '-'}
			</Link>
			<Tooltip title={id} placement="top" arrow>
				<Typography
					variant="caption"
					noWrap
					sx={{
						display: 'block',
						fontFamily: 'monospace',
						fontSize: '0.75rem',
						color: 'text.secondary',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{id}
				</Typography>
			</Tooltip>
		</Box>
	);
};
```

- [ ] **Step 2: Type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/list/_parts/audit-logs-event-cell.tsx
git commit -m "feat(audit-logs): two-line Event cell with action key as permalink"
```

---

## Task 4: Build the Inspect action button

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/list/_parts/audit-logs-inspect-action.tsx`

`<IconButton>` + `<Tooltip>` wrapper, calling `openInspect(logId)` from the hook in Task 2.

- [ ] **Step 1: Create the file**

```tsx
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { useAuditLogInspect } from './use-audit-log-inspect';

type AuditLogsInspectActionProps = {
	logId: string;
};

export const AuditLogsInspectAction = ({
	logId,
}: AuditLogsInspectActionProps) => {
	const { t } = useTranslate();
	const { openInspect } = useAuditLogInspect();

	return (
		<Tooltip title={t('inspect')} placement="top" arrow>
			<IconButton
				color="default"
				size="small"
				onClick={() => openInspect(logId)}
				aria-label={t('inspect')}
				sx={{ color: 'text.primary' }}
			>
				<Iconify icon="solar:list-bold" width={18} />
			</IconButton>
		</Tooltip>
	);
};
```

- [ ] **Step 2: Type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/list/_parts/audit-logs-inspect-action.tsx
git commit -m "feat(audit-logs): Actions column inspect button (solar:list-bold)"
```

---

## Task 5: Build the inspect drawer

**Files:**
- Create: `apps/front/src/routes/authed/staff/audit-logs/list/_parts/audit-log-inspect-drawer.tsx`

The drawer itself. Reads `inspectedLogId` from the hook, runs the detail query when non-empty, renders the header + flat-Stack body. The body composes the existing detail-page blocks. Loading / error / empty states are minimal inline skeletons sized for 480px width.

- [ ] **Step 1: Create the file**

```tsx
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import capitalize from 'lodash/capitalize';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import DrawerAnchor from '#app/components/drawer-anchor.tsx';
import { EmptyContent } from '#app/components/empty-content/empty-content.tsx';
import { ErrorContent } from '#app/components/empty-content/error-content.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import QueryDisplay from '#app/components/query-display.tsx';
import { RouterLink } from '#app/components/router-link.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { isProblemFailure, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useGetStaffAuditLog } from '#app/lib/react-query/features/staff/staff-audit-log.hooks.ts';

import { AuditLogActor } from '../../details/_parts/audit-log-actor';
import { AuditLogContextGrid } from '../../details/_parts/audit-log-context-grid';
import { AuditLogHero } from '../../details/_parts/audit-log-hero';
import { AuditLogPayload } from '../../details/_parts/audit-log-payload';

import { useAuditLogInspect } from './use-audit-log-inspect';

export const AuditLogInspectDrawer = () => {
	const { t } = useTranslate();
	const { inspectedLogId, closeInspect } = useAuditLogInspect();
	const open = !!inspectedLogId;

	const auditLogQuery = useGetStaffAuditLog({
		variables: { logId: inspectedLogId ?? '' },
		enabled: open,
	});

	return (
		<Drawer
			open={open}
			onClose={closeInspect}
			anchor="right"
			sx={(theme) => ({
				zIndex: theme.zIndex.modal + 1,
			})}
			slotProps={{
				transition: { appear: true },
				paper: {
					sx: {
						width: 480,
						maxWidth: '100%',
						overflow: 'unset',
					},
				},
			}}
		>
			<DrawerAnchor
				onClick={closeInspect}
				aria-label={t('close')}
				sx={{ left: 0 }}
			>
				<Iconify icon="mingcute:close-line" width={18} />
			</DrawerAnchor>

			<QueryDisplay
				query={auditLogQuery}
				LoadingSlot={AuditLogInspectDrawerSkeleton}
				ErrorSlot={AuditLogInspectDrawerError}
				EmptySlot={AuditLogInspectDrawerEmpty}
			>
				{({ data: auditLog }) => (
					<Stack spacing={3} sx={{ p: 3, pt: 8 }}>
						{inspectedLogId && (
							<Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
								<Link
									component={RouterLink}
									href={FRONT_PATH_NAMES.staff.auditLogs.details(
										inspectedLogId,
									)}
									underline="none"
									sx={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 0.75,
										fontSize: '0.8125rem',
										fontWeight: 600,
									}}
								>
									{capitalize(t('view-details'))}
									<Iconify icon="eva:external-link-outline" width={16} />
								</Link>
							</Box>
						)}
						<AuditLogHero auditLog={auditLog} sx={{ p: 0 }} />
						<AuditLogActor auditLog={auditLog} />
						<AuditLogContextGrid
							auditLog={auditLog}
							fields={['ip', 'userAgent', 'targetId', 'eventId']}
						/>
						<AuditLogPayload details={auditLog.details} />
					</Stack>
				)}
			</QueryDisplay>
		</Drawer>
	);
};

const AuditLogInspectDrawerSkeleton = () => {
	return (
		<Stack spacing={3} sx={{ p: 3, pt: 8 }}>
			<Skeleton variant="rounded" width={120} height={24} />
			<Skeleton variant="text" width="70%" height={28} />
			<Skeleton variant="text" width="40%" height={16} />
			<Stack direction="row" spacing={1.5} alignItems="center">
				<Skeleton variant="circular" width={36} height={36} />
				<Stack spacing={0.5} sx={{ flex: 1 }}>
					<Skeleton variant="text" width="50%" height={16} />
					<Skeleton variant="text" width="70%" height={14} />
				</Stack>
			</Stack>
			{[1, 2, 3, 4].map((row) => (
				<Stack key={row} spacing={0.5}>
					<Skeleton variant="text" width="30%" height={12} />
					<Skeleton variant="text" width="80%" height={18} />
				</Stack>
			))}
		</Stack>
	);
};

const AuditLogInspectDrawerEmpty = () => {
	const { t } = useTranslate();

	return (
		<Box sx={{ p: 3, pt: 8 }}>
			<EmptyContent
				title={capitalize(
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

const AuditLogInspectDrawerError = ({ error }: { error: unknown }) => {
	const { t } = useTranslate();

	const failure = toApiFailure(error);
	if (
		isProblemFailure(failure) &&
		(failure.status === 404 ||
			(failure.status === 400 && failure.translationKey === 'malformed-id'))
	) {
		return <AuditLogInspectDrawerEmpty />;
	}

	return (
		<Box sx={{ p: 3, pt: 8 }}>
			<ErrorContent
				title={t('error-loading-items', {
					item: t('audit-log'),
					ns: 'response-message',
				})}
			/>
		</Box>
	);
};
```

- [ ] **Step 2: Type-check**

```bash
just tsc-front
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/list/_parts/audit-log-inspect-drawer.tsx
git commit -m "feat(audit-logs): URL-bound inspect drawer reusing detail blocks"
```

---

## Task 6: Refactor the table — column reorder + cell swaps + mount drawer

**Files:**
- Modify: `apps/front/src/routes/authed/staff/audit-logs/list/_parts/staff-audit-logs-table.tsx`

Surgical changes:

1. Drop the in-file `ActionCell` and `ActionsCell` components (they are replaced by `AuditLogsEventCell` and `AuditLogsInspectAction`).
2. Reorder the columns: `Event` first, then `User`, then everything else unchanged.
3. Update the `Event` column to use `AuditLogsEventCell`, header to `t('event')`.
4. Update the `Actions` column to render `<AuditLogsInspectAction logId={row.original.id} />` instead of the eye-icon link.
5. Mount `<AuditLogInspectDrawer />` once at the root of the returned tree so it can subscribe to the URL param regardless of any row state.

- [ ] **Step 1: Read the current file**

```bash
# Just to refresh context — the implementer should read it before editing.
```

Open `apps/front/src/routes/authed/staff/audit-logs/list/_parts/staff-audit-logs-table.tsx`.

- [ ] **Step 2: Add the new imports**

Replace the imports block (top of file) with the additional cells/drawer. After this step the import section must include these new lines:

```tsx
import { AuditLogInspectDrawer } from './audit-log-inspect-drawer';
import { AuditLogsEventCell } from './audit-logs-event-cell';
import { AuditLogsInspectAction } from './audit-logs-inspect-action';
```

Remove the now-unused imports:

- `Tooltip` from `@mui/material/Tooltip` (no longer used after the cell drops — verify the file has no other Tooltip uses; **the existing `TargetIdCell` and `ActionsCell` use Tooltip — recheck the file after the cell deletions. If `TargetIdCell` still uses it, keep the import**.)
- `IconButton` from `@mui/material/IconButton` (replaced by the inspect action component).
- The `Iconify` import (no longer used at the table level after the eye icon is gone — same recheck: if any other in-file cell still uses it, keep).
- The `RouterLink` import (used only by the dropped `ActionsCell`).
- `FRONT_PATH_NAMES` (only used by the dropped `ActionsCell`).

The safe pattern: make all the table changes first, then let `just tsc-front` and `just check-write` tell you which imports went stale, and remove those.

- [ ] **Step 3: Reorder and rewire the columns**

Find the `columns` `useMemo` and replace it with:

```tsx
const columns = useMemo(() => {
	return [
		columnHelper.accessor('action', {
			header: t('event'),
			Cell: EventCell,
			enableSorting: false,
			size: 240,
		}),
		columnHelper.accessor('userName', {
			header: t('user'),
			Cell: UserCell,
			enableSorting: false,
			size: 220,
		}),
		columnHelper.accessor('targetId', {
			header: t('target-id'),
			Cell: TargetIdCell,
			enableSorting: false,
			size: 160,
		}),
		columnHelper.accessor('ipAddress', {
			header: t('ip-address'),
			Cell: IpAddressCell,
			enableSorting: false,
			size: 140,
		}),
		columnHelper.accessor('createdAt', {
			id: 'created_at',
			header: t('created-at'),
			Cell: DateCell,
			size: 200,
		}),
		columnHelper.display({
			header: t('actions'),
			Cell: ActionsCell,
			size: 80,
		}),
	];
}, [t]);
```

Note the only structural changes vs the current file:

- The first entry was `userName` / `t('user')` / `UserCell` — moved to position 2.
- The `action` entry was at position 2 with `t('action')` / `ActionCell` — moved to position 1, header is now `t('event')`, Cell is `EventCell` (defined below).
- The size of the Event column is widened from `200` to `240` to accommodate the two-line layout.
- The `ActionsCell` body changes (next step) but the column entry signature is unchanged.

- [ ] **Step 4: Replace `ActionCell` with `EventCell`**

Delete the existing `ActionCell` function in the file:

```tsx
const ActionCell: MRT_ColumnDef<AuditLogRowData, string>['Cell'] = (props) => {
	const action = props.cell.getValue();

	return (
		<Typography
			variant="body2"
			sx={{
				fontFamily: 'monospace',
				fontSize: '0.8rem',
			}}
		>
			{action || '-'}
		</Typography>
	);
};
```

Replace it with:

```tsx
const EventCell: MRT_ColumnDef<AuditLogRowData, string>['Cell'] = (props) => {
	const action = props.cell.getValue();
	const id = props.row.original.id;

	return <AuditLogsEventCell id={id} action={action} />;
};
```

- [ ] **Step 5: Replace the existing `ActionsCell` body with the new inspect button**

Delete the existing `ActionsCell` function:

```tsx
const ActionsCell: MRT_ColumnDef<AuditLogRowData>['Cell'] = (props) => {
	const { t } = useTranslate();
	const logId = props.row.original.id;

	return (
		<Tooltip title={t('view-details')} placement="top" arrow>
			<IconButton
				color="default"
				LinkComponent={RouterLink}
				href={FRONT_PATH_NAMES.staff.auditLogs.details(logId)}
				size="small"
				aria-label={t('view-details')}
			>
				<Iconify icon="solar:eye-bold" />
			</IconButton>
		</Tooltip>
	);
};
```

Replace it with:

```tsx
const ActionsCell: MRT_ColumnDef<AuditLogRowData>['Cell'] = (props) => {
	const logId = props.row.original.id;

	return <AuditLogsInspectAction logId={logId} />;
};
```

- [ ] **Step 6: Mount the drawer**

In the `StaffAuditLogsTable` component's returned tree, mount `<AuditLogInspectDrawer />` as a sibling of the table inside the wrapping `<Box>` (alongside the existing `<AuditLogsExportDialogController>`). After the change the return looks like:

```tsx
return (
	<Box
		sx={{
			flexGrow: 1,
			display: 'flex',
			flexDirection: 'column',
			border: 'none',
		}}
	>
		<MaterialReactTable table={table} />

		<AuditLogsExportDialogController
			ref={exportDialogRef}
			actions={actions.length > 0 ? actions : undefined}
			startDate={startDateIso}
			endDate={endDateIso}
		/>

		<AuditLogInspectDrawer />
	</Box>
);
```

The drawer has no props — it subscribes to the URL via `useAuditLogInspect` and pulls its own data.

- [ ] **Step 7: Type-check**

```bash
just tsc-front
```

Expected: PASS. If TypeScript reports unused imports, delete them (the safe imports to remove identified in Step 2 should now light up). Re-run until clean.

- [ ] **Step 8: Lint and knip**

```bash
just check-write
just knip
```

Expected: `check-write` PASS. `knip` PASS or only pre-existing warnings (the `TENANT_HINTS_COOKIE_KEY_LEGACY` etc. listed earlier are not from this work).

- [ ] **Step 9: Commit**

```bash
git add apps/front/src/routes/authed/staff/audit-logs/list/_parts/staff-audit-logs-table.tsx
git commit -m "refactor(audit-logs): Event-first columns + inspect drawer wiring"
```

---

## Task 7: Browser smoke test

This task does not produce a commit — it is a verification step. After Task 6 the implementation is logically complete; this exercises the working software.

- [ ] **Step 1: Start the dev servers**

```bash
just dev-api
just dev-front
```

- [ ] **Step 2: Confirm column order on `/staff/audit-logs`**

Open the list. First column reads `Event` and shows two lines per row: action key (monospace, slightly bolder) and event id (smaller, grey, truncated). User shifts to position 2.

- [ ] **Step 3: Confirm Event-cell click navigates**

Click the action key text in any row → navigates to `/staff/audit-logs/:id`. Cmd-click (or Ctrl-click on Linux/Windows) opens it in a new tab without leaving the list.

- [ ] **Step 4: Confirm event-id truncation behaves**

Hover the secondary line — the full event id appears in a `<Tooltip>` above the cell.

- [ ] **Step 5: Confirm inspect button opens the drawer**

Click the `solar:list-bold` icon in the rightmost Actions column. A drawer slides in from the right at 480px. URL gains `?inspect=<id>`. Drawer body shows the hero (category chip + monospace action + timestamp), actor block (avatar + name + email), context grid (IP, user agent, target id, event id), and payload (when present).

- [ ] **Step 6: Confirm close behavior clears the URL**

Close the drawer via (a) the close anchor on the left edge, (b) clicking outside the drawer, (c) pressing Escape. In all three cases the `?inspect=` param drops from the URL.

- [ ] **Step 7: Confirm URL-bound state survives reload**

With the drawer open, copy the URL (`/staff/audit-logs?…&inspect=<id>`) and paste into a new tab → list loads with the drawer auto-open showing the same audit log.

- [ ] **Step 8: Confirm permalink inside the drawer header works**

Click `View details` in the drawer header → navigates to `/staff/audit-logs/:id`. Click the browser's back button → returns to the list and the drawer is back open (the `?inspect=<id>` URL state restored from history).

- [ ] **Step 9: Confirm bogus id falls through gracefully**

Manually edit the URL to `?inspect=not-a-real-id`. Drawer opens, shows the empty state ("Audit log not found" via the EmptyContent slot) — no console error, no thrown exception.

- [ ] **Step 10: Confirm cursor pagination + drawer coexist**

Open a drawer, then click the next-page pagination control. The drawer stays open with the original log's data, even though that row is no longer in the table.

- [ ] **Step 11: Confirm hero category chip color reflects action**

Same matrix as the detail page:
- `auth.login.succeeded` → success
- `auth.login.failed` → error
- `*.deleted` / `*.removed` / `*.revoked` → error
- `*.suspended` → warning
- `*.reactivated` → success
- `*.created` / `*.updated` / `*.accepted` / `*.assigned` → default outlined

- [ ] **Step 12: Confirm null payload handling**

For an event with `details === null`, the Payload block renders nothing — no empty section, no error.

---

## Self-Review

- **Spec coverage:**
  - Table reorder (Event first, User second) → Task 6.
  - Event cell as two-line with action key as link → Task 3.
  - Action button (`solar:list-bold`) replaces eye icon → Task 4, wired in Task 6.
  - URL-bound drawer with `?inspect=<id>` → Task 5, hook in Task 2.
  - Reuse of `Hero` / `Actor` / `ContextGrid` / `Payload` blocks → Task 5.
  - Drawer header permalink → Task 5.
  - Drawer fetches own `AuditLogDetail` via `useGetStaffAuditLog` → Task 5.
  - Loading / empty / error states inside drawer → Task 5 (inline skeleton, drawer-sized).
  - i18n keys (`event`, `inspect`) → Task 1. (`view-details`, `audit-log`, `close`, `target-id`, `event-id`, `ip-address`, `user-agent` all already exist.)

- **Placeholder scan:** No TBDs, no hand-waved code. Every step ships either complete code, a verifiable command, or an explicit deletion target. Step 2 of Task 6 calls out the safe-pattern for removing dead imports (rely on tsc) rather than enumerating them — this is intentional because the exact set depends on whether `TargetIdCell` keeps using Tooltip.

- **Type consistency:**
  - `useAuditLogInspect()` returns `{ inspectedLogId, openInspect, closeInspect }` — same shape in Task 2 definition and Tasks 4 + 5 consumers.
  - `AuditLogsEventCell` props `{ id, action }` consistent across Task 3 (definition) and Task 6 Step 4 (consumer).
  - `AuditLogsInspectAction` props `{ logId }` consistent across Task 4 (definition) and Task 6 Step 5 (consumer).
  - `AuditLogInspectDrawer` takes no props (self-subscribing), consistent across Task 5 (definition) and Task 6 Step 6 (mount).

---

## Execution Handoff

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — fresh codex per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
