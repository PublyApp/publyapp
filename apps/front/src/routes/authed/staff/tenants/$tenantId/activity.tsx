import { IconActivity } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { PageHeader } from '~/components/ui/product-page';
import {
	type TenantActivityRow,
	toTenantActivityRows,
	useTenantActivityQuery,
} from '~/lib/query/staff-tenant-activity';
import {
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
} from '~/lib/url-state/table-search-params';
import type {
	TableSearchParamInput,
	TableSearchParams,
} from '~/lib/url-state/table-search-params';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { makeTenantActivityColumns } from './_tenant-activity-columns';
import {
	TenantDetailsError,
	TenantDetailsIncomplete,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from './_tenant-details-shell';

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

const StaffTenantActivityPage = () => {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = parseTableSearchParams(
		Route.useSearch() as TableSearchParamInput,
	);
	const { i18n, t } = useTranslation(['staff-tenant-activity', 'common']);
	const locale = i18n?.language ?? 'en';

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeTableSearchParams(next),
			replace: true,
		});
	};

	const controller = useTableController({
		search,
		onSearchChange,
		defaultSort: DEFAULT_SORT,
		defaultSize: DEFAULT_SIZE,
		cursorResetKey: tenantId,
	});

	const detailsQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const activityQuery = useTenantActivityQuery(
		{
			tenantId,
			sortId: controller.apiVariables.sortId,
			sortOrder: controller.apiVariables.sortOrder,
			cursor: controller.apiVariables.cursor,
			size: controller.apiVariables.size,
		},
		{ enabled: tenantId.length > 0 },
	);

	const rows = toTenantActivityRows(activityQuery.data?.data);
	const columns = useMemo(
		() => makeTenantActivityColumns(t, locale),
		[t, locale],
	);

	const detailsError = detailsQuery.error;
	if (detailsError !== null && shouldLogoutForFailure(detailsError)) {
		return <LogoutRedirect />;
	}

	const activityError = activityQuery.error;
	if (activityError !== null && shouldLogoutForFailure(activityError)) {
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
						activeSection="activity"
						testId="staff-tenant-activity-page"
						bodyScroll="contained"
					>
						<PageHeader
							title={t('tenant-activity-page-title')}
							description={t('tenant-activity-page-description')}
						/>
						<DataTable<TenantActivityRow>
							testId="staff-tenant-activity-table"
							ariaLabel={t('tenant-activity-page-title')}
							columns={columns}
							rows={rows}
							queryState={{
								isPending: activityQuery.isPending,
								isError: activityQuery.isError,
								onRetry: () => void activityQuery.refetch(),
								hasActiveSearch: false,
							}}
							pagination={{
								pageIndex: controller.cursor.pageIndex,
								hasPreviousPage: controller.cursor.hasPreviousPage,
								hasNextPage: activityQuery.data?.nextCursor != null,
								isPaginationPending: activityQuery.isFetching,
								onNextPage: () =>
									controller.cursor.onNextPage(
										activityQuery.data?.nextCursor ?? undefined,
									),
								onPreviousPage: controller.cursor.onPreviousPage,
							}}
							emptyIcon={IconActivity}
							emptyTitle={t('tenant-activity-empty-title')}
							emptyContent={t('tenant-activity-empty-description')}
							noMatchTitle={t('tenant-activity-empty-title')}
							noMatchContent={t('tenant-activity-empty-description')}
							sort={controller.sort}
							onSortChange={controller.onSortChange}
							size={controller.size}
							onSizeChange={controller.onSizeChange}
						/>
					</TenantDetailsPageShell>
				);
			}}
		</QueryDisplay>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/activity',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-activity', 'common'],
		crumbs: () => [
			{ kind: 'label', labelKey: 'common:activity' },
			{
				kind: 'entity',
				query: staffTenantCrumbQuery,
				select: selectStaffTenantCrumbName,
			},
		],
	},
	validateSearch: (search) =>
		serializeTableSearchParams(
			parseTableSearchParams(search as TableSearchParamInput),
		),
	component: StaffTenantActivityPage,
});
