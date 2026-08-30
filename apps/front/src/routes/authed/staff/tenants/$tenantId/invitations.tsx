import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { useRowSelection } from '~/components/table/use-row-selection';
import { useTableController } from '~/components/table/use-table-controller';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	staffTenantInvitationsQueryOptions,
	type StaffTenantInvitationRow,
	toStaffTenantInvitationRows,
	useRevokeStaffTenantInvitationMutation,
	useStaffTenantInvitationsQuery,
} from '~/lib/query/staff-tenant-invitations';
import {
	invalidateAllStaffTenantScopes,
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	staffTenantDetailsQueryOptions,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { createTenantInvitationColumns } from './_invitation-columns';
import { buildInvitationsFilterState } from './_invitations-filter-state';
import { InvitationsPageHeader } from './_invitations-page-header';
import {
	parseInvitationRouteSearchParams,
	serializeInvitationRouteSearchParams,
} from './_invitations-route-search';
import { TenantInvitationsSelectionExport } from './_invitations-selection-export';
import { InvitationsTable } from './_invitations-table';
import { InviteTenantUserDrawerHost } from './_invite-user-drawer-host';
import {
	TenantDetailsError,
	TenantDetailsIncomplete,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from './_tenant-details-shell';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const StaffTenantInvitationsPage = () => {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = parseInvitationRouteSearchParams(
		Route.useSearch() as Record<string, unknown>,
	);
	const queryClient = useQueryClient();
	const { i18n, t } = useTranslation('common');
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const [pendingRevokeRowId, setPendingRevokeRowId] = useState<string | null>(
		null,
	);
	const isInviteDrawerOpen = search.invite === 1;

	const onSearchChange = (next: typeof search): void => {
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

	// Plain functions + unwrapped columns: the React Compiler caches each per
	// value, and the manual useCallback/useMemo chain triggered preserve-memo
	// diagnostics that skipped optimizing this component.
	const handleRevoke = async (row: StaffTenantInvitationRow) => {
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
	};

	const promptRevoke = (row: StaffTenantInvitationRow) => {
		setPendingRevokeRowId(row.id);
	};

	const columns = createTenantInvitationColumns({
		locale: i18n.language,
		t,
		isRevokePending: revokeInvitation.isPending,
		onRevoke: promptRevoke,
	});

	const rows = toStaffTenantInvitationRows(invitationsQuery.data?.data);
	const selection = useRowSelection(rows.map((row) => row.id));
	const filters = buildInvitationsFilterState({
		search,
		t,
		applySearch: onSearchChange,
		selection,
	});

	// tenants-r6-F2 (mirrors invitations/index.tsx, staff-users.tsx,
	// profiles.tsx): freeze the selection target set — cancel a pending
	// search commit the moment selection mode starts; the level/status
	// filter triggers are disabled for the same reason.
	const { resetDraftToCommitted } = controller.search;
	useEffect(() => {
		if (selection.isSelectionMode) {
			resetDraftToCommitted();
		}
	}, [selection.isSelectionMode, resetDraftToCommitted]);

	if (shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

	// Hoisted so the fatal-error gates read plain locals, not query flags —
	// QueryDisplay owns the loading/error/data rendering below.
	const detailsError = detailsQuery.error;
	if (detailsError !== null && shouldLogoutForFailure(detailsError)) {
		return <LogoutRedirect />;
	}

	const invitationsError = invitationsQuery.error;
	if (invitationsError !== null && shouldLogoutForFailure(invitationsError)) {
		return <LogoutRedirect />;
	}

	const renderTenantMissingSlot = (
		<TenantDetailsIncomplete
			onRetry={() => void detailsQuery.refetch()}
			testId="staff-tenant-details-error"
		/>
	);

	return (
		<QueryDisplay
			query={detailsQuery}
			LoadingSlot={<TenantDetailsLoading />}
			ErrorSlot={
				<TenantDetailsError
					error={detailsError}
					onRetry={() => void detailsQuery.refetch()}
				/>
			}
		>
			{() => {
				const tenant = toStaffTenantDetails(detailsQuery.data);
				if (!tenant) {
					return renderTenantMissingSlot;
				}

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
								if (!isOpen) {
									setPendingRevokeRowId(null);
								}
							}}
						/>

						<InvitationsTable
							columns={columns}
							rows={rows}
							invitationsQuery={invitationsQuery}
							controller={controller}
							hasActiveSearch={Boolean(
								controller.search.committed || search.status || search.level,
							)}
							filters={filters}
							onInvite={() => setInviteDrawerOpen(true)}
							t={t}
						/>

						{/* #838: meaningful selected-row action — client-side CSV of the
				selected visible invitations (no tenant bulk endpoints exist;
				bulk revoke is explicitly out of scope for this issue). */}
						<TenantInvitationsSelectionExport
							rows={rows}
							selection={selection}
						/>

						<InviteTenantUserDrawerHost
							tenantId={tenantId}
							isOpen={isInviteDrawerOpen}
							onOpenChange={setInviteDrawerOpen}
							onSessionExpired={() => setShouldRedirectToLogout(true)}
						/>
					</TenantDetailsPageShell>
				);
			}}
		</QueryDisplay>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/invitations',
)({
	staticData: {
		preload: ({ params }) => [
			{
				options: staffTenantDetailsQueryOptions,
				variables: { tenantId: params.tenantId },
			},
			{
				options: staffTenantInvitationsQueryOptions,
				variables: {
					tenantId: params.tenantId,
					q: '',
					status: undefined,
					level: undefined,
					sortId: 'created_at',
					sortOrder: 'desc',
					size: 100,
				},
			},
		],
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
			parseInvitationRouteSearchParams(search as Record<string, unknown>),
		),
	component: StaffTenantInvitationsPage,
});
