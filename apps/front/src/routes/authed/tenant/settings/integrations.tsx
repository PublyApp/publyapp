import {
	IconApi,
	IconGridDots,
	IconPlugConnected,
	IconPlugOff,
	IconRefresh,
} from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReconnectBanner } from '~/components/social-accounts/reconnect-banner';
import type { ColumnDef } from '~/components/table/column-type';
import { DataTable } from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { StateSurface } from '~/components/ui/state-surface';
import { formatDateTime } from '~/lib/format-date-time';
import { useCanManageSocialAccounts } from '~/lib/permissions/use-has-tenant-permission';
import {
	needsReconnectAccountsQueryOptions,
	toNeedsReconnectAccounts,
	useNeedsReconnectAccountsQuery,
} from '~/lib/query/needs-reconnect-accounts';
import {
	socialAccountsQueryOptions,
	toSocialAccountRows,
	type SocialAccountRow,
	useSocialAccountsQuery,
} from '~/lib/query/social-accounts';
import {
	tenantProjectsQueryOptions,
	toTenantProjectItems,
	useTenantProjectsQuery,
} from '~/lib/query/tenant-projects';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';
import { readSelectedTenantId } from '~/lib/selected-tenant-storage';

import { WorkspacePageHeader, ReadOnlyBadge } from '../_workspace-page-parts';
import { BlueskyConnectDrawer } from './_bluesky-connect-drawer';
import { DisconnectDialog } from './_disconnect-dialog';
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
	onReconnect: (account: SocialAccountRow) => void;
	onDisconnect: (account: SocialAccountRow) => void;
};

const buildColumns = (
	context: IntegrationsColumnContext,
): ColumnDef<SocialAccountRow>[] => {
	const { t, locale, canManage, projects, onReconnect, onDisconnect } = context;

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
					<DropdownMenuItem onClick={() => onReconnect(row.original)}>
						<IconRefresh />
						{t('reconnect')}
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						onClick={() => onDisconnect(row.original)}
					>
						<IconPlugOff />
						{t('disconnect')}
					</DropdownMenuItem>
				</DataTableRowActions>
			),
		});
	}

	return columns;
};

type DrawerUiState = {
	connectOpen: boolean;
	/** Non-null while the reconnect drawer targets a specific row. */
	reconnectAccount: SocialAccountRow | null;
	disconnectAccount: SocialAccountRow | null;
};

const IDLE_DRAWER_UI: DrawerUiState = {
	connectOpen: false,
	reconnectAccount: null,
	disconnectAccount: null,
};

/** ConfirmDialog requires a non-null account even when closed; this inert
 * placeholder is only mounted while `isOpen` is false. */
const PLACEHOLDER_ACCOUNT: SocialAccountRow = {
	id: '',
	provider: 'bluesky',
	displayHandle: '',
	statusWire: 'active',
	tone: 'success',
	statusLabelKey: 'settings:status-active',
	lastSuccessAt: null,
	projectIds: [],
};

/**
 * Org integrations: the C3 connected-accounts surface (list, connect/
 * reconnect/disconnect actions gated by `tenant.socialaccounts.manage`)
 * carrying the C4 needs-reconnect banner above the connected card, plus the
 * remaining read-only placeholder cards. The C4 banner's Reconnect action
 * opens the real reconnect drawer here; the manage gate is the same real
 * permission check C4's handover note reserved for this lane.
 */
const TenantSettingsIntegrationsPage = () => {
	const { t, i18n } = useTranslation(['settings', 'common']);
	const canManage = useCanManageSocialAccounts();
	const tenantId = useResolvedWorkspaceTenantId();
	const socialAccountsQuery = useSocialAccountsQuery({
		tenantId: tenantId ?? '',
	});
	const projectsQuery = useTenantProjectsQuery({ tenantId: tenantId ?? '' });
	const needsReconnectQuery = useNeedsReconnectAccountsQuery(tenantId);
	const needsReconnectAccounts = toNeedsReconnectAccounts(
		needsReconnectQuery.data,
	);

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
				onReconnect: (account) =>
					setDrawerUi({
						connectOpen: false,
						reconnectAccount: account,
						disconnectAccount: null,
					}),
				onDisconnect: (account) =>
					setDrawerUi({
						connectOpen: false,
						reconnectAccount: null,
						disconnectAccount: account,
					}),
			}),
		[t, i18n.resolvedLanguage, canManage, projects],
	);

	const isListLoadedAndEmpty =
		socialAccountsQuery.data !== undefined && rows.length === 0;

	const [drawerUi, setDrawerUi] = useState<DrawerUiState>(IDLE_DRAWER_UI);
	const closeDrawerUi = () => setDrawerUi(IDLE_DRAWER_UI);

	return (
		<div className="space-y-5" data-testid="tenant-settings-integrations-page">
			<WorkspacePageHeader titleKey="integrations" />

			{canManage ? (
				<div className="flex justify-end">
					<Button
						type="button"
						disabled={tenantId === null}
						onClick={() =>
							setDrawerUi({
								connectOpen: true,
								reconnectAccount: null,
								disconnectAccount: null,
							})
						}
					>
						<IconPlugConnected aria-hidden="true" className="size-4" />
						{t('connect-bluesky')}
					</Button>
				</div>
			) : null}

			<ReconnectBanner
				accounts={needsReconnectAccounts}
				hasManagePermission={canManage}
				onReconnect={(accountId) => {
					const account = rows.find((row) => row.id === accountId);
					if (account) {
						setDrawerUi({
							connectOpen: false,
							reconnectAccount: account,
							disconnectAccount: null,
						});
					}
				}}
			/>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:connected')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
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
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:available-integrations')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconGridDots}
						title={t('available-integrations-coming-later-title')}
						description={t('available-integrations-coming-later-description')}
						testId="tenant-settings-available-integrations-empty"
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t('common:api-access')}</CardTitle>
					<ReadOnlyBadge />
				</CardHeader>
				<CardContent>
					<StateSurface
						icon={IconApi}
						title={t('api-access-coming-later-title')}
						description={t('api-access-coming-later-description')}
						testId="tenant-settings-api-access-empty"
					/>
				</CardContent>
			</Card>

			{tenantId === null ? null : (
				<>
					<BlueskyConnectDrawer
						mode={drawerUi.reconnectAccount ? 'reconnect' : 'connect'}
						open={drawerUi.connectOpen || drawerUi.reconnectAccount !== null}
						onOpenChange={(open) => {
							if (!open) {
								closeDrawerUi();
							}
						}}
						tenantId={tenantId}
						account={drawerUi.reconnectAccount ?? undefined}
					/>
					<DisconnectDialog
						account={drawerUi.disconnectAccount ?? PLACEHOLDER_ACCOUNT}
						isOpen={drawerUi.disconnectAccount !== null}
						onOpenChange={(open) => {
							if (!open) {
								closeDrawerUi();
							}
						}}
						tenantId={tenantId}
					/>
				</>
			)}
		</div>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/tenant/settings/integrations',
)({
	staticData: {
		preload: () => {
			const tenantId = readSelectedTenantId();
			if (!tenantId) {
				return [];
			}
			return [
				{
					options: socialAccountsQueryOptions,
					variables: { tenantId },
				},
				{
					options: tenantProjectsQueryOptions,
					variables: { tenantId },
				},
				{
					options: needsReconnectAccountsQueryOptions,
					variables: { tenantId },
				},
			];
		},
		crumbs: () => [
			{ kind: 'label', labelKey: 'settings', to: '/tenant/settings' },
			{ kind: 'label', labelKey: 'integrations' },
		],
		i18nNamespaces: ['settings', 'social-accounts'],
	},
	component: TenantSettingsIntegrationsPage,
});
