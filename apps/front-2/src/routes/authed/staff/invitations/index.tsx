import { IconChevronDown, IconCircleDot, IconPlus } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { Button, buttonVariants } from '~/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { PageHeader } from '~/components/ui/product-page';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import type { InvitationListItem } from '@org/client-ts/src/models/index.js';

import {
	filterInvitationRows,
	formatInvitationStatusLabel,
	type InvitationListSearchParamInput,
	type InvitationListSearchParams,
	type KnownInvitationStatus,
	normalizeInvitationStatus,
	parseInvitationListSearchParams,
	parseInvitationStatusFilter,
	serializeInvitationListSearchParams,
	serializeInvitationStatusFilter,
	KNOWN_INVITATION_STATUSES,
} from './list-helpers';
import { createInvitationColumns, type InvitationRow } from './table-columns';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const toRows = (
	items: InvitationListItem[] | null | undefined,
): InvitationRow[] => {
	const list = items ?? [];
	const rows: InvitationRow[] = [];

	for (const item of list) {
		if (typeof item.id !== 'string' || item.id.length === 0) {
			continue;
		}

		rows.push({
			id: item.id,
			email: item.email ?? '',
			profileName: item.profileName?.trim() || '-',
			invitedByName: item.invitedByName?.trim() || '-',
			status: normalizeInvitationStatus(item.status),
			acceptedAt: item.acceptedAt ?? null,
			createdAt: item.createdAt ?? null,
			expiresAt: item.expiresAt ?? null,
		});
	}

	return rows;
};

export const Route = createFileRoute('/_authed-layout/staff/invitations')({
	validateSearch: (search) =>
		parseInvitationListSearchParams(search as InvitationListSearchParamInput),
	component: StaffInvitationsPage,
});

function StaffInvitationsPage() {
	const navigate = Route.useNavigate();
	const search = Route.useSearch() as InvitationListSearchParams;
	const { t, i18n } = useTranslation('common');

	const selectedStatuses = parseInvitationStatusFilter(search.status);

	const onSearchChange = (next: InvitationListSearchParams): void => {
		void navigate({
			search: serializeInvitationListSearchParams({
				...search,
				...next,
				status: search.status,
			}) as unknown as InvitationListSearchParams,
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: search.status ?? '',
	});
	const query = useStaffInvitationsQuery({
		...controller.apiVariables,
		q: controller.search.committed,
		status: search.status,
	});

	const onRefetch = useCallback(() => {
		void query.refetch();
	}, [query]);

	const columns = createInvitationColumns({
		t: (key) => t(key),
		locale: i18n.language,
		onActionSuccess: onRefetch,
	});
	const rows = toRows(query.data?.data);
	const filteredRows = filterInvitationRows(rows, controller.search.committed);
	const selection = useRowSelection(filteredRows.map((row) => row.id));

	const { resetDraftToCommitted } = controller.search;
	useEffect(() => {
		if (selection.isSelectionMode) {
			resetDraftToCommitted();
		}
	}, [selection.isSelectionMode, resetDraftToCommitted]);

	if (query.isError && shouldLogoutForFailure(query.error)) {
		return <LogoutRedirect />;
	}

	const setStatuses = (nextStatuses: KnownInvitationStatus[]): void => {
		void navigate({
			search: serializeInvitationListSearchParams({
				...search,
				status: serializeInvitationStatusFilter(nextStatuses),
				cursor: undefined,
			}) as unknown as InvitationListSearchParams,
			replace: true,
		});
	};

	const toggleStatus = (status: KnownInvitationStatus): void => {
		if (selectedStatuses.includes(status)) {
			setStatuses(selectedStatuses.filter((value) => value !== status));
			return;
		}

		setStatuses([...selectedStatuses, status]);
	};

	const statusFilterLabel =
		selectedStatuses.length === 0
			? 'All statuses'
			: selectedStatuses.map(formatInvitationStatusLabel).join(', ');

	return (
		<div className="publy-page-fill" data-testid="staff-invitations-list-page">
			<PageHeader
				title={t('staff-invitations')}
				description="Invite staff users to the platform."
				count={
					filteredRows.length > 0 ? (
						<span className="publy-profile-count-badge">
							{filteredRows.length}
						</span>
					) : null
				}
				actions={
					<Link
						to="/staff/invitations/new"
						className={buttonVariants({ variant: 'default' })}
					>
						<IconPlus aria-hidden="true" className="size-[15px]" />
						{t('invite-user')}
					</Link>
				}
			/>

			<DataTable
				toolbarEnd={
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									type="button"
									variant="outline"
									className="publy-data-table-filter-button max-w-64 text-[13px]"
								/>
							}
						>
							<IconCircleDot
								aria-hidden="true"
								className="size-[15px] text-[var(--publy-foreground-secondary)]"
							/>
							<span className="truncate">{statusFilterLabel}</span>
							<IconChevronDown aria-hidden="true" className="size-3" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" sideOffset={6}>
							{KNOWN_INVITATION_STATUSES.map((status) => (
								<DropdownMenuCheckboxItem
									key={status}
									checked={selectedStatuses.includes(status)}
									closeOnClick={false}
									onCheckedChange={() => toggleStatus(status)}
								>
									{formatInvitationStatusLabel(status)}
								</DropdownMenuCheckboxItem>
							))}
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => setStatuses([])}>
								{t('clear')}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				}
				testId="staff-invitations-table"
				ariaLabel={t('staff-invitations')}
				columns={columns}
				rows={filteredRows}
				isPending={query.isPending}
				isError={query.isError}
				onRetry={() => void query.refetch()}
				emptyContent="No invitations found."
				noMatchContent="No invitations match your search."
				hasActiveSearch={Boolean(controller.search.committed)}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				pageIndex={controller.cursor.pageIndex}
				hasPreviousPage={controller.cursor.hasPreviousPage}
				hasNextPage={query.data?.nextCursor != null}
				isPaginationPending={query.isFetching}
				onNextPage={() =>
					controller.cursor.onNextPage(query.data?.nextCursor ?? undefined)
				}
				onPreviousPage={controller.cursor.onPreviousPage}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
				searchPlaceholder="Search invitations…"
				selection={selection}
			/>
		</div>
	);
}
