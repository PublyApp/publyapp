import { IconPlugConnected } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable } from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { Button } from '~/components/ui/button';
import { StateSurface } from '~/components/ui/state-surface';
import { formatDateTime } from '~/lib/format-date-time';
import { useCanManageSocialAccounts } from '~/lib/permissions/use-has-tenant-permission';
import {
	toSocialAccountRows,
	useSocialAccountsQuery,
	type SocialAccountRow,
} from '~/lib/query/social-accounts';
import {
	toTenantProjectItems,
	useTenantProjectsQuery,
} from '~/lib/query/tenant-projects';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import { WorkspacePageHeader } from '../_workspace-page-parts';
import { IntegrationsStatusPill } from './_integrations-status-pill';
import { IntegrationsVisibleIn } from './_integrations-visible-in';

// The C2 list endpoint carries no sort/search contract yet: the table renders
// the full list in one shot with client-side chrome only. Sort stays pinned;
// size is the parity-contract default.
const DEFAULT_SORT = { id: 'handle', order: 'asc' as const };
const DEFAULT_SIZE = 100;

type IntegrationsColumnContext = {
	t: (key: string, options?: Record<string, unknown>) => string;
	locale: string;
	canManage: boolean;
	projects: Array<{ id: string; label: string }>;
};

const buildColumns = (
	context: IntegrationsColumnContext,
): ColumnDef<SocialAccountRow>[] => {
	const { t, locale, canManage, projects } = context;

	const columns: ColumnDef<SocialAccountRow>[] = [
		{
			id: 'handle',
			header: t('col-handle'),
			accessorKey: 'displayHandle',
			enableSorting: false,
			meta: { width: '220px' },
			cell: ({ getValue }) => {
				const handle = getValue<string>();
				return (
					<span className="block truncate font-normal" title={handle}>
						{handle}
					</span>
				);
			},
		},
		{
			id: 'provider',
			header: t('col-provider'),
			enableSorting: false,
			meta: { width: '140px' },
			cell: () => t('provider-bluesky'),
		},
		{
			id: 'status',
			header: t('common:status'),
			enableSorting: false,
			meta: { width: '180px' },
			cell: ({ row }) => <IntegrationsStatusPill row={row.original} />,
		},
		{
			id: 'last-success',
			header: t('col-last-success'),
			enableSorting: false,
			meta: { width: '200px', hideBelow: 768 },
			cell: ({ row }) =>
				row.original.lastSuccessAt === null ? (
					<span>{t('last-success-never')}</span>
				) : (
					<span>{formatDateTime(row.original.lastSuccessAt, locale)}</span>
				),
		},
		{
			id: 'visible-in',
			header: t('col-visible-in'),
			enableSorting: false,
			meta: { hideBelow: 1024 },
			cell: ({ row }) => (
				<IntegrationsVisibleIn
					projectIds={row.original.projectIds}
					projects={projects}
				/>
			),
		},
	];

	// Spec §1 decision 5: visibility of ACTIONS follows the manage
	// permission, not the screen's view permission.
	if (canManage) {
		columns.push({
			id: 'actions',
			// Visually chromeless; the columnheader still needs an accessible
			// name (axe empty-table-header, parity contract).
			header: () => <span className="sr-only">{t('common:actions')}</span>,
			enableSorting: false,
			meta: { width: '40px', align: 'center' },
			cell: ({ row }) => (
				<DataTableRowActions
					ariaLabel={t('common:actions-for', {
						name: row.original.displayHandle,
					})}
					testId={`social-account-actions-${row.original.id}`}
				>
					{/* Task 5 adds the Reconnect item here; Task 6 adds Disconnect.
					    A JSX comment compiles away, so the required children prop
					    is satisfied explicitly until then. */}
					{null}
				</DataTableRowActions>
			),
		});
	}

	return columns;
};

const TenantSettingsIntegrationsPage = () => {
	const { t, i18n } = useTranslation(['settings', 'common']);
	const canManage = useCanManageSocialAccounts();
	const tenantId = useResolvedWorkspaceTenantId();
	const socialAccountsQuery = useSocialAccountsQuery({
		tenantId: tenantId ?? '',
	});
	const projectsQuery = useTenantProjectsQuery({ tenantId: tenantId ?? '' });

	const rows = toSocialAccountRows(socialAccountsQuery.data);
	const projects = toTenantProjectItems(projectsQuery.data).map((project) => ({
		id: project.id,
		label: project.name,
	}));
	const columns = useMemo(
		() =>
			buildColumns({
				t,
				locale: i18n.resolvedLanguage ?? 'en',
				canManage,
				projects,
			}),
		[t, i18n.resolvedLanguage, canManage, projects],
	);

	const isListLoadedAndEmpty =
		socialAccountsQuery.data !== undefined && rows.length === 0;

	return (
		<div className="space-y-5" data-testid="tenant-settings-integrations-page">
			<WorkspacePageHeader titleKey="integrations" />

			{canManage ? (
				<div className="flex justify-end">
					{/* Task 5 mounts BlueskyConnectDrawer on this trigger; the
					    permission gate is already observable here. */}
					<Button type="button" disabled={tenantId === null}>
						<IconPlugConnected aria-hidden="true" className="size-4" />
						{t('connect-bluesky')}
					</Button>
				</div>
			) : null}

			{isListLoadedAndEmpty ? (
				<StateSurface
					title={t('integrations-empty-title')}
					description={t('integrations-empty-description')}
					testId="tenant-settings-connected-integrations-empty"
				/>
			) : (
				<DataTable
					testId="tenant-settings-social-accounts-table"
					ariaLabel={t('integrations-list-title')}
					columns={columns}
					rows={rows}
					queryState={{
						isPending: tenantId === null || socialAccountsQuery.isPending,
						isError: socialAccountsQuery.isError,
						onRetry: () => void socialAccountsQuery.refetch(),
						hasActiveSearch: false,
					}}
					pagination={{
						pageIndex: 0,
						hasPreviousPage: false,
						hasNextPage: false,
						isPaginationPending: false,
						onNextPage: () => {},
						onPreviousPage: () => {},
					}}
					sort={DEFAULT_SORT}
					onSortChange={() => {}}
					size={DEFAULT_SIZE}
					onSizeChange={() => {}}
					errorTitle={t('integrations-load-failed')}
				/>
			)}
		</div>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/tenant/settings/integrations',
)({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'settings', to: '/tenant/settings' },
			{ kind: 'label', labelKey: 'integrations' },
		],
		i18nNamespaces: ['settings'],
	},
	component: TenantSettingsIntegrationsPage,
});
