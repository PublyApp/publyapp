import { Link } from '@tanstack/react-router';
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy';
import { PersonAvatar } from '~/components/ui/person-avatar';
import { Switch } from '~/components/ui/switch';
import type { StaffTenantUserRow } from '~/lib/query/staff-tenant-users';

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Per-row assign/unassign toggle, seeded from the batch "resolve assignment"
 * read (#875) so a row's switch starts checked when the tenant member is
 * already assigned — not just when THIS drawer session toggled it. Every
 * toggle click is still a single, immediately-persisted POST/DELETE against
 * the real per-member endpoint; the resolve read only feeds the initial
 * (and post-refresh) checked state.
 *
 * The first column links with the row's GLOBAL `id` (the tenant-users
 * candidate-list identity, matching `/users/{userId}`), per the mandatory
 * entity-link convention (docs/guides/front/conventions.md:254-258) —
 * step4b-rereview MAJOR 5. The assign/unassign toggle is keyed by
 * `userAccountId` (the tenant membership id the resolve/assign/unassign
 * endpoints all require), NEVER `row.id` — step4b-review BLOCKER 1. A row
 * whose assignment status has not resolved yet renders DISABLED rather than
 * unchecked-and-actionable, which would misrepresent an actually-assigned
 * member as available to assign (step4b-review MAJOR 3).
 */
export const makeAssignMembersColumns = (
	tenantId: string,
	t: Translate,
	assignedIds: Set<string>,
	resolvedIds: Set<string>,
	pendingIds: Set<string>,
	onToggle: (row: StaffTenantUserRow, checked: boolean) => void,
): ColumnDef<StaffTenantUserRow>[] => [
	{
		id: 'name',
		header: t('members'),
		enableSorting: false,
		cell: ({ row }) => (
			<Link
				to="/staff/tenants/$tenantId/users/$userId"
				params={{ tenantId, userId: row.original.id }}
				className="flex min-w-0 items-center gap-2.5 no-underline"
			>
				<PersonAvatar
					name={row.original.displayName}
					avatarUrl={row.original.avatarUrl}
				/>
				<span className="min-w-0 space-y-0.5">
					<span
						className="publy-record-link block truncate text-[13px] font-medium"
						title={row.original.displayName}
					>
						{row.original.displayName}
					</span>
					<span
						className="block truncate text-xs text-muted-foreground"
						title={row.original.email}
					>
						{row.original.email}
					</span>
				</span>
			</Link>
		),
	},
	{
		id: 'assigned',
		header: () => <span className="sr-only">{t('assign-members')}</span>,
		enableSorting: false,
		meta: { width: '64px', align: 'center' },
		cell: ({ row }) => {
			const userAccountId = row.original.userAccountId;

			return (
				<Switch
					checked={assignedIds.has(userAccountId)}
					disabled={
						pendingIds.has(userAccountId) || !resolvedIds.has(userAccountId)
					}
					onCheckedChange={(checked) => onToggle(row.original, checked)}
					aria-label={t('assign-member-toggle-label', {
						name: row.original.displayName,
					})}
					data-testid={`assign-member-toggle-${userAccountId}`}
				/>
			);
		},
	},
];
