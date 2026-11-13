import { IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTable } from '~/components/table/data-table';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import {
	Drawer,
	DrawerBody,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
} from '~/components/ui/drawer';
import { PersonAvatar } from '~/components/ui/person-avatar';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-feedback/mutation-toast';
import { useBulkAssignStaffRoleUsersMutation } from '~/lib/query/staff-role-users';
import {
	type StaffUserRow,
	toStaffUserRows,
	useStaffUsersQuery,
} from '~/lib/query/staff-users';
import type { TableSearchParams } from '~/lib/url-state/table-search-params';

import type { BulkStaffRoleUserAssignActionResult } from '@org/client-ts/models/index';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 20;
const EMPTY_SEARCH: TableSearchParams = {};

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Per-member outcome lines for the skipped ids, reasons translated here
 * (an unknown future reason falls back to its raw value). */
export const buildAssignFailureLines = (
	result: BulkStaffRoleUserAssignActionResult | undefined,
	nameOf: (userId: string) => string,
	t: Translate,
): string[] => {
	const reasonLabels = new Map<string, string>([
		['already_assigned', t('bulk-assign-failed-item-already-assigned')],
		['not_found', t('bulk-assign-failed-item-not-found')],
		['max_roles_exceeded', t('bulk-assign-failed-item-max-roles-exceeded')],
	]);

	return (result?.failedItems ?? []).map((item) => {
		const userId = String(item.userId ?? '');
		const reason = reasonLabels.get(item.reason ?? '') ?? item.reason ?? '';
		return [nameOf(userId), reason].filter(Boolean).join(': ');
	});
};

const makeColumns = (t: Translate): ColumnDef<StaffUserRow>[] => [
	{
		id: 'name',
		header: t('members'),
		enableSorting: false,
		cell: ({ row }) => (
			<span className="flex min-w-0 items-center gap-2.5">
				<PersonAvatar
					name={row.original.displayName}
					avatarUrl={row.original.avatarUrl}
				/>
				<span className="min-w-0 space-y-0.5">
					<span
						className="block truncate text-[13px] font-medium"
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
			</span>
		),
	},
];

const AssignMembersBody = ({
	roleId,
	onClose,
	onSessionExpired,
}: {
	roleId: string;
	onClose: () => void;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const [search, setSearch] = useState<TableSearchParams>(EMPTY_SEARCH);
	const assignMutation = useBulkAssignStaffRoleUsersMutation();
	// Debounced/committed search and cursor pagination, as the tenant drawer.
	const controller = useTableController({
		search,
		onSearchChange: setSearch,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: roleId,
	});
	// preload-exempt: opened on demand from the page's action, nothing to warm
	const usersQuery = useStaffUsersQuery({
		...controller.apiVariables,
		// Members NOT in the role, by id, server-side: composes with search/paging.
		excludeRoleId: roleId,
	});
	const rows = toStaffUserRows(usersQuery.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));
	const columns = makeColumns(t);

	const submit = async () => {
		// Names are captured at submit time: the toast must not depend on rows
		// that a refetch is about to replace.
		const selectedRows = rows.filter((row) => selection.rowSelection[row.id]);
		const nameById = new Map(
			selectedRows.map((row) => [row.id, row.displayName]),
		);
		let result;
		try {
			result = await assignMutation.mutateAsync({
				roleId,
				userIds: selectedRows.map((row) => row.id),
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}
			await displayLocalMutationFailure(
				error,
				t('staff-role-user-bulk-assign-failure'),
			);
			return;
		}

		const succeeded = result?.succeededCount ?? 0;
		const failed = result?.failedCount ?? 0;
		if (failed > 0) {
			const lines = buildAssignFailureLines(
				result,
				(userId) => nameById.get(userId) ?? userId,
				t,
			);
			toastLocalMutationResult.error(
				t('staff-role-user-bulk-assign-partial-success', { succeeded, failed }),
				lines.join('\n'),
			);
		} else {
			toastLocalMutationResult.success(
				t('staff-role-user-bulk-assign-success', { count: succeeded }),
			);
		}
		onClose();
	};

	return (
		<>
			<DrawerBody className="flex min-h-0 flex-1 flex-col gap-3">
				<DataTable<StaffUserRow>
					testId="assign-staff-members-table"
					ariaLabel={t('assign-staff-members')}
					columns={columns}
					rows={rows}
					query={usersQuery}
					hasActiveSearch={Boolean(controller.search.committed)}
					pagination={{
						pageIndex: controller.cursor.pageIndex,
						hasPreviousPage: controller.cursor.hasPreviousPage,
						hasNextPage: usersQuery.data?.nextCursor != null,
						isPaginationPending: usersQuery.isFetching,
						onNextPage: () =>
							controller.cursor.onNextPage(
								usersQuery.data?.nextCursor ?? undefined,
							),
						onPreviousPage: controller.cursor.onPreviousPage,
					}}
					getRowLabel={(row) => row.displayName}
					emptyIcon={IconUsers}
					emptyTitle={t('no-assignable-staff-members')}
					noMatchTitle={t('no-users-found')}
					sort={controller.sort}
					onSortChange={controller.onSortChange}
					size={controller.size}
					onSizeChange={controller.onSizeChange}
					searchDraft={controller.search.draft}
					onSearchDraftChange={controller.search.onDraftChange}
					searchPlaceholder={t('search-assignable-staff-members')}
					selection={selection}
				/>
			</DrawerBody>
			<DrawerFooter>
				<Button type="button" variant="outline" onClick={onClose}>
					{t('cancel')}
				</Button>
				<Button
					type="button"
					disabled={selection.selectedCount === 0 || assignMutation.isPending}
					onClick={() => void submit()}
				>
					{t('assign-selected-members', { count: selection.selectedCount })}
				</Button>
			</DrawerFooter>
		</>
	);
};

export const AssignMembersDrawer = ({
	roleId,
	isOpen,
	onOpenChange,
	onSessionExpired,
}: {
	roleId: string;
	isOpen: boolean;
	onOpenChange: (isOpen: boolean) => void;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');

	return (
		<Drawer open={isOpen} onOpenChange={onOpenChange}>
			<DrawerContent data-testid="staff-assign-members-drawer">
				<DrawerHeader>
					<DrawerTitle>{t('assign-staff-members')}</DrawerTitle>
					<DrawerDescription>
						{t('assign-staff-members-drawer-description')}
					</DrawerDescription>
				</DrawerHeader>
				{isOpen ? (
					<AssignMembersBody
						roleId={roleId}
						onClose={() => onOpenChange(false)}
						onSessionExpired={onSessionExpired}
					/>
				) : null}
			</DrawerContent>
		</Drawer>
	);
};
