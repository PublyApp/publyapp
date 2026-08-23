import { IconAlertCircle, IconMail, IconPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {} from '~/components/ui/dropdown-menu';
import {
	type StaffTenantInvitationRow,
	toStaffTenantInvitationRows,
	useRevokeStaffTenantInvitationMutation,
	useStaffTenantInvitationsQuery,
} from '~/lib/query/staff-tenant-invitations';
import {
	invalidateAllStaffTenantScopes,
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	type InvitationListSearchParamInput,
	type InvitationListSearchParams,
	type KnownInvitationAccountLevel,
	type KnownInvitationStatus,
	parseInvitationAccountLevelFilter,
	parseInvitationListSearchParams,
	parseInvitationStatusFilter,
	serializeInvitationAccountLevelFilter,
	serializeInvitationListSearchParams,
	serializeInvitationStatusFilter,
} from '../../invitations/list-helpers';
import {
	createTenantInvitationColumns,
	formatTenantInvitationStatusLabel,
} from './_invitation-columns';
import { InvitationToolbarFilters } from './_invitation-toolbar-filters';
import { InvitationsPageHeader } from './_invitations-page-header';
import { InviteTenantUserDrawerHost } from './_invite-user-drawer-host';
import {
	type InviteUserSearchState,
	type InviteUserSearchStateInput,
	parseInviteUserSearchParams,
	serializeInviteUserSearchParams,
} from './_invite-user-search-state';
import {
	formatTenantUserLevelLabel,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './_tenant-details-shell';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

type InvitationRouteSearchParams = InvitationListSearchParams &
	InviteUserSearchState & {
		level?: string;
	};

type InvitationRouteSearchParamInput = InvitationListSearchParamInput &
	InviteUserSearchStateInput & {
		level?: unknown;
	};

const parseInvitationRouteSearchParams = (
	search: InvitationRouteSearchParamInput,
): InvitationRouteSearchParams => {
	const level = serializeInvitationAccountLevelFilter(
		parseInvitationAccountLevelFilter(search.level),
	);

	return {
		...parseInvitationListSearchParams(search),
		level: level || undefined,
		...parseInviteUserSearchParams(search),
	};
};

const serializeInvitationRouteSearchParams = (
	search: InvitationRouteSearchParams,
): Record<string, string | 1 | undefined> => {
	const level = serializeInvitationAccountLevelFilter(
		parseInvitationAccountLevelFilter(search.level),
	);

	return {
		...serializeInvitationListSearchParams(search),
		level: level || undefined,
		...serializeInviteUserSearchParams(search),
	};
};

const StaffTenantInvitationsPage = () => {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = parseInvitationRouteSearchParams(
		Route.useSearch() as InvitationRouteSearchParamInput,
	) satisfies InvitationRouteSearchParams;
	const queryClient = useQueryClient();
	const { i18n, t } = useTranslation('common');
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const [pendingRevokeRowId, setPendingRevokeRowId] = useState<string | null>(
		null,
	);
	const isInviteDrawerOpen = search.invite === 1;

	const selectedStatuses = parseInvitationStatusFilter(search.status);
	const selectedLevels = parseInvitationAccountLevelFilter(search.level);

	const onSearchChange = (next: InvitationRouteSearchParams): void => {
		void navigate({
			search: serializeInvitationRouteSearchParams({
				...next,
				invite: search.invite,
			}),
			replace: true,
		});
	};

	const setInviteDrawerOpen = (isOpen: boolean): void => {
		void navigate({
			search: serializeInvitationRouteSearchParams({
				...search,
				invite: isOpen ? 1 : undefined,
			}),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: `${tenantId}:${search.status ?? ''}:${search.level ?? ''}`,
	});
	const detailsQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const revokeInvitation = useRevokeStaffTenantInvitationMutation();
	const invitationsQuery = useStaffTenantInvitationsQuery(
		{
			tenantId,
			q: controller.apiVariables.q,
			status: search.status,
			level: search.level,
			sortId: controller.apiVariables.sortId,
			sortOrder: controller.apiVariables.sortOrder,
			cursor: controller.apiVariables.cursor,
			size: controller.apiVariables.size,
		},
		{
			enabled: tenantId.length > 0,
		},
	);

	const handleRevoke = useCallback(
		async (row: StaffTenantInvitationRow) => {
			try {
				await revokeInvitation.mutateAsync({
					tenantId,
					invitationId: row.id,
				});
				await invalidateAllStaffTenantScopes(queryClient);
			} catch (error) {
				// Reset pending state on every exit path — no try/finally,
				// which the React Compiler cannot lower yet.
				if (shouldLogoutForFailure(error)) {
					setShouldRedirectToLogout(true);
					setPendingRevokeRowId(null);
					return;
				}
				setPendingRevokeRowId(null);
				return;
			}
			setPendingRevokeRowId(null);
		},
		[queryClient, revokeInvitation, tenantId],
	);

	const promptRevoke = useCallback((row: StaffTenantInvitationRow) => {
		setPendingRevokeRowId(row.id);
	}, []);

	const columns = useMemo(
		() =>
			createTenantInvitationColumns({
				locale: i18n.language,
				t,
				isRevokePending: revokeInvitation.isPending,
				onRevoke: promptRevoke,
			}),
		[i18n.language, t, revokeInvitation.isPending, promptRevoke],
	);

	if (detailsQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (detailsQuery.isError) {
		if (shouldLogoutForFailure(detailsQuery.error)) {
			return <LogoutRedirect />;
		}

		return (
			<TenantDetailsError
				error={detailsQuery.error}
				onRetry={() => void detailsQuery.refetch()}
			/>
		);
	}

	const tenant = toStaffTenantDetails(detailsQuery.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('error-500-code')}
				title={t('tenant-details-error-title')}
				description={t('tenant-response-incomplete')}
				testId="staff-tenant-details-error"
				actions={
					<TenantRetryActions onRetry={() => void detailsQuery.refetch()} />
				}
			/>
		);
	}

	if (
		invitationsQuery.isError &&
		shouldLogoutForFailure(invitationsQuery.error)
	) {
		return <LogoutRedirect />;
	}

	if (shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

	const rows = toStaffTenantInvitationRows(invitationsQuery.data?.data);

	const setStatuses = (nextStatuses: KnownInvitationStatus[]): void => {
		void navigate({
			search: serializeInvitationRouteSearchParams({
				...search,
				status: serializeInvitationStatusFilter(nextStatuses),
				cursor: undefined,
			}),
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
			? t('all-statuses')
			: selectedStatuses
					.map((status) => formatTenantInvitationStatusLabel(status, t))
					.join(', ');

	const setLevels = (nextLevels: KnownInvitationAccountLevel[]): void => {
		void navigate({
			search: serializeInvitationRouteSearchParams({
				...search,
				level: serializeInvitationAccountLevelFilter(nextLevels),
				cursor: undefined,
			}),
			replace: true,
		});
	};

	const toggleLevel = (level: KnownInvitationAccountLevel): void => {
		if (selectedLevels.includes(level)) {
			setLevels(selectedLevels.filter((value) => value !== level));
			return;
		}

		setLevels([...selectedLevels, level]);
	};

	const levelFilterLabel =
		selectedLevels.length === 0
			? t('all-account-levels')
			: selectedLevels
					.map((level) => formatTenantUserLevelLabel(level, t))
					.join(', ');

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="invitations"
			testId="staff-tenant-invitations-page"
			bodyScroll="contained"
		>
			<InvitationsPageHeader
				tenant={tenant}
				onInvite={() => setInviteDrawerOpen(true)}
			/>

			<ConfirmDialog
				isOpen={pendingRevokeRowId !== null}
				title={t('revoke-invitation')}
				description={t('revoke-invitation-confirm-description')}
				confirmLabel={t('revoke')}
				isPending={revokeInvitation.isPending}
				onConfirm={() => {
					const row = rows.find((r) => r.id === pendingRevokeRowId);
					if (row) {
						void handleRevoke(row);
					}
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setPendingRevokeRowId(null);
				}}
			/>

			<DataTable
				testId="staff-tenant-invitations-table"
				ariaLabel={t('tenant-invitations-table-aria-label')}
				columns={columns}
				rows={rows}
				isPending={invitationsQuery.isPending}
				isError={invitationsQuery.isError}
				onRetry={() => void invitationsQuery.refetch()}
				emptyIcon={IconMail}
				emptyTitle={t('tenant-invitations-empty-title')}
				emptyContent={t('tenant-invitations-empty-description')}
				emptyActions={
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setInviteDrawerOpen(true)}
					>
						<IconPlus aria-hidden="true" className="size-[15px]" />
						{t('invite-people')}
					</Button>
				}
				noMatchTitle={t('tenant-invitations-no-match-title')}
				noMatchContent={t('tenant-invitations-no-match-description')}
				hasActiveSearch={Boolean(
					controller.search.committed || search.status || search.level,
				)}
				sort={controller.sort}
				onSortChange={controller.onSortChange}
				size={controller.size}
				onSizeChange={controller.onSizeChange}
				pageIndex={controller.cursor.pageIndex}
				hasPreviousPage={controller.cursor.hasPreviousPage}
				hasNextPage={invitationsQuery.data?.nextCursor != null}
				isPaginationPending={invitationsQuery.isFetching}
				onNextPage={() =>
					controller.cursor.onNextPage(
						invitationsQuery.data?.nextCursor ?? undefined,
					)
				}
				onPreviousPage={controller.cursor.onPreviousPage}
				searchDraft={controller.search.draft}
				onSearchDraftChange={controller.search.onDraftChange}
				searchPlaceholder={t('search-invitations')}
				toolbarEnd={
					<InvitationToolbarFilters
						selectedLevels={selectedLevels}
						selectedStatuses={selectedStatuses}
						levelFilterLabel={levelFilterLabel}
						statusFilterLabel={statusFilterLabel}
						onSetLevels={setLevels}
						onToggleLevel={toggleLevel}
						onSetStatuses={setStatuses}
						onToggleStatus={toggleStatus}
					/>
				}
			/>

			<InviteTenantUserDrawerHost
				tenantId={tenantId}
				isOpen={isInviteDrawerOpen}
				onOpenChange={setInviteDrawerOpen}
				onSessionExpired={() => setShouldRedirectToLogout(true)}
			/>
		</TenantDetailsPageShell>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/invitations',
)({
	staticData: {
		crumbs: (params) => [
			{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}`,
				query: staffTenantCrumbQuery,
				select: selectStaffTenantCrumbName,
			},
			{ kind: 'label', labelKey: 'common:invitations' },
		],
	},
	validateSearch: (search) =>
		serializeInvitationRouteSearchParams(
			parseInvitationRouteSearchParams(
				search as InvitationRouteSearchParamInput,
			),
		),
	component: StaffTenantInvitationsPage,
});
