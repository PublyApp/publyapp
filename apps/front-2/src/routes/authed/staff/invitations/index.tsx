import { buttonVariants, Button } from '@heroui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { useStaffInvitationsQuery } from '~/lib/query/staff-invitations';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import type { InvitationListItem } from '@org/client-ts/src/models/index.js';

import {
	filterInvitationRows,
	formatInvitationStatusLabel,
	type InvitationDisplayStatus,
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

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

type InvitationRow = {
	id: string;
	email: string;
	profileName: string;
	invitedByName: string;
	status: InvitationDisplayStatus;
	acceptedAt: Date | null;
	createdAt: Date | null;
	expiresAt: Date | null;
};

const formatDateTime = (value: Date | null, locale: string): string => {
	if (!value) {
		return '-';
	}

	return new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(value);
};

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

export const Route = createFileRoute('/_authed-layout/staff/invitations/')({
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

	const columns: ColumnDef<InvitationRow>[] = [
		{
			id: 'email',
			header: t('email'),
			accessorKey: 'email',
			cell: ({ row }) => (
				<div>
					<div>{row.original.email || '-'}</div>
					<div className="text-xs text-muted">
						{t('staff-invited-by')}: {row.original.invitedByName}
					</div>
				</div>
			),
		},
		{
			id: 'profile_name',
			header: t('profiles'),
			accessorKey: 'profileName',
		},
		{
			id: 'status',
			header: t('status'),
			enableSorting: false,
			cell: ({ row }) => (
				<span className="inline-flex rounded-full bg-default-100 px-2 py-1 text-xs font-medium text-foreground">
					{formatInvitationStatusLabel(row.original.status)}
				</span>
			),
		},
		{
			id: 'expires_at',
			header: t('expiry-date'),
			accessorFn: (row) => row.expiresAt,
			cell: ({ row }) => formatDateTime(row.original.expiresAt, i18n.language),
		},
		{
			id: 'accepted_at',
			header: t('accepted-at'),
			accessorFn: (row) => row.acceptedAt,
			cell: ({ row }) => formatDateTime(row.original.acceptedAt, i18n.language),
		},
		{
			id: 'created_at',
			header: t('created-at'),
			accessorFn: (row) => row.createdAt,
			cell: ({ row }) => formatDateTime(row.original.createdAt, i18n.language),
		},
	];

	return (
		<div className="space-y-4 p-4" data-testid="staff-invitations-list-page">
			<div className="flex items-center justify-between gap-4">
				<h1 className="text-xl font-semibold">{t('staff-invitations')}</h1>
				<Link
					to="/staff/invitations/new"
					className={buttonVariants({ variant: 'primary' })}
				>
					{t('invite-users')}
				</Link>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{KNOWN_INVITATION_STATUSES.map((status) => {
					const isSelected = selectedStatuses.includes(status);
					return (
						<Button
							key={status}
							size="sm"
							type="button"
							variant={isSelected ? 'primary' : 'secondary'}
							onPress={() => toggleStatus(status)}
						>
							{formatInvitationStatusLabel(status)}
						</Button>
					);
				})}
				<Button
					size="sm"
					type="button"
					variant="ghost"
					onPress={() => setStatuses([])}
				>
					{t('clear')}
				</Button>
			</div>

			<DataTable
				testId="staff-invitations-table"
				ariaLabel="Staff invitations"
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
				selection={selection}
			/>
		</div>
	);
}
