import {
	IconAdjustments,
	IconAlertCircle,
	IconBriefcase,
	IconEye,
	IconKey,
	IconLock,
	IconPencil,
	IconPlus,
	IconSettings,
	IconShield,
	IconStar,
	IconTrash,
	IconUsers,
} from '@tabler/icons-react';
import type { Icon } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import {
	DataTableCursorFooter,
	DataTableToolbar,
} from '~/components/table/data-table';
import { DataTableRowActions } from '~/components/table/row-actions';
import { resolveTableBodyState } from '~/components/table/table-body-state';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { Skeleton } from '~/components/ui/skeleton';
import {
	ErrorStateSurface,
	NoMatchStateSurface,
	StateSurface,
} from '~/components/ui/state-surface';
import {
	STAFF_TENANT_PROFILES_QUERY_KEY,
	type StaffTenantProfileRow,
	toStaffTenantProfileRows,
	useDeleteStaffTenantProfileMutation,
	useStaffTenantProfilesQuery,
} from '~/lib/query/staff-tenant-profiles';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
} from '~/lib/url-state/table-search-params';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from './_tenant-details-shell';
import { ProfileFormDrawer } from './profiles/_profile-form-drawer';

type StaffTenantProfilesSearchParams = TableSearchParams & { new?: string };
type StaffTenantProfilesSearchParamInput = TableSearchParamInput & {
	new?: unknown;
};

const parseStaffTenantProfilesSearchParams = (
	search: StaffTenantProfilesSearchParamInput,
): StaffTenantProfilesSearchParams => {
	const base = parseTableSearchParams(search);
	const isCreateOpen =
		typeof search.new === 'string' && search.new.trim() === '1';

	return { ...base, ...(isCreateOpen ? { new: '1' } : {}) };
};

const serializeStaffTenantProfilesSearchParams = (
	params: StaffTenantProfilesSearchParams,
): Record<string, string | undefined> => {
	const next = serializeTableSearchParams(params);

	return { ...next, ...(params.new === '1' ? { new: '1' } : {}) };
};

const DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const DEFAULT_SIZE = 100;

/** Deterministic, decorative icon + tone for a profile card — same hashing
 * approach as the staff (non-tenant) profiles list; not a contract field. */
const PROFILE_CARD_ICONS: readonly Icon[] = [
	IconShield,
	IconKey,
	IconLock,
	IconStar,
	IconBriefcase,
	IconAdjustments,
	IconUsers,
	IconSettings,
];
const PROFILE_CARD_TONE_COUNT = 8;

export const deriveTenantProfileCardStyle = (
	name: string,
): { Icon: Icon; tone: string } => {
	let sum = 0;
	for (const char of name) {
		sum += char.codePointAt(0) ?? 0;
	}

	return {
		Icon: PROFILE_CARD_ICONS[sum % PROFILE_CARD_ICONS.length] ?? IconShield,
		tone: String(sum % PROFILE_CARD_TONE_COUNT),
	};
};

export const tenantProfileTypeChipClassName = (isDefault: boolean): string =>
	isDefault
		? 'publy-detail-chip publy-detail-chip--amber'
		: 'publy-detail-chip publy-detail-chip--outline';

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles',
)({
	validateSearch: (search) =>
		parseStaffTenantProfilesSearchParams(
			search as StaffTenantProfilesSearchParamInput,
		),
	component: StaffTenantProfilesPage,
});

const ProfileCardGridSkeleton = ({ testId }: { testId: string }) => (
	<div className="publy-profile-card-grid" data-testid={`${testId}-loading`}>
		{['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'].map((key) => (
			<Card key={key} className="flex flex-col gap-3 p-4">
				<Skeleton className="size-10 rounded-[10px]" />
				<Skeleton className="h-3 w-2/3" />
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-1/3" />
			</Card>
		))}
	</div>
);

const ProfileCard = ({
	tenantId,
	profile,
	onDeleteRequest,
}: {
	tenantId: string;
	profile: StaffTenantProfileRow;
	onDeleteRequest: (profile: StaffTenantProfileRow) => void;
}) => {
	const { t } = useTranslation('common');
	const { Icon: ProfileIcon, tone } = deriveTenantProfileCardStyle(
		profile.name,
	);

	return (
		<Card
			className="flex flex-col gap-3 p-4"
			data-testid={`staff-tenant-profile-card-${profile.id}`}
		>
			<div className="flex items-start justify-between gap-2">
				<Link
					to="/staff/tenants/$tenantId/profiles/$profileId"
					params={{ tenantId, profileId: profile.id }}
					className="no-underline"
				>
					<span
						className="publy-profile-icon-tile publy-profile-icon-tile--lg"
						data-tone={tone}
					>
						<ProfileIcon aria-hidden="true" />
					</span>
				</Link>
				<DataTableRowActions
					ariaLabel={`Actions for ${profile.name || 'profile'}`}
					testId={`staff-tenant-profile-actions-${profile.id}`}
				>
					<DropdownMenuItem
						render={
							<Link
								to="/staff/tenants/$tenantId/profiles/$profileId"
								params={{ tenantId, profileId: profile.id }}
							/>
						}
					>
						<IconEye className="size-[15px]" />
						{t('view-details')}
					</DropdownMenuItem>
					<DropdownMenuItem
						render={
							<Link
								to="/staff/tenants/$tenantId/profiles/$profileId/edit"
								params={{ tenantId, profileId: profile.id }}
							/>
						}
					>
						<IconPencil className="size-[15px]" />
						{t('edit')}
					</DropdownMenuItem>
					{profile.isDefault ? null : (
						<DropdownMenuItem
							variant="destructive"
							onClick={() => onDeleteRequest(profile)}
						>
							<IconTrash className="size-[15px]" />
							{t('delete')}
						</DropdownMenuItem>
					)}
				</DataTableRowActions>
			</div>

			<div className="min-w-0 space-y-1">
				<div className="flex flex-wrap items-center gap-2">
					<Link
						to="/staff/tenants/$tenantId/profiles/$profileId"
						params={{ tenantId, profileId: profile.id }}
						className="publy-record-link truncate text-[14px] font-semibold text-foreground no-underline"
						title={profile.name || undefined}
					>
						{profile.name || '—'}
					</Link>
					<span className={tenantProfileTypeChipClassName(profile.isDefault)}>
						{profile.isDefault ? t('default') : t('custom')}
					</span>
				</div>
				<p
					className="truncate text-xs text-muted-foreground"
					title={profile.description || undefined}
				>
					{profile.description || t('no-description-provided')}
				</p>
				<p className="text-[11px] text-muted-foreground">
					{t('tenant-member-count', { count: profile.userAccountCount })}
				</p>
			</div>
		</Card>
	);
};

function StaffTenantProfilesPage() {
	const { tenantId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [deleteTarget, setDeleteTarget] =
		useState<StaffTenantProfileRow | null>(null);
	const [deleteError, setDeleteError] = useState('');
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const deleteProfile = useDeleteStaffTenantProfileMutation();

	const isCreateDrawerOpen = search.new === '1';

	const onSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeStaffTenantProfilesSearchParams({
				...next,
				new: search.new,
			}) as unknown as TableSearchParams,
			replace: true,
		});
	};

	const setCreateDrawerOpen = (isOpen: boolean): void => {
		void navigate({
			search: serializeStaffTenantProfilesSearchParams({
				...search,
				new: isOpen ? '1' : undefined,
			}) as unknown as TableSearchParams,
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
	const profilesQuery = useStaffTenantProfilesQuery(
		{
			tenantId,
			q: controller.apiVariables.q,
			sortId: controller.apiVariables.sortId,
			sortOrder: controller.apiVariables.sortOrder,
			cursor: controller.apiVariables.cursor,
			size: controller.apiVariables.size,
		},
		{
			enabled:
				tenantId.length > 0 && !detailsQuery.isPending && !detailsQuery.isError,
		},
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
				code="500 — Server Error"
				title="Unable to load this tenant"
				description="The tenant response was incomplete."
				testId="staff-tenant-details-error"
				actions={
					<TenantRetryActions onRetry={() => void detailsQuery.refetch()} />
				}
			/>
		);
	}

	if (profilesQuery.isError && shouldLogoutForFailure(profilesQuery.error)) {
		return <LogoutRedirect />;
	}

	if (shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

	const rows = toStaffTenantProfileRows(profilesQuery.data?.data);
	const testId = 'staff-tenant-profiles-grid';
	const hasActiveSearch = Boolean(controller.search.committed);
	const bodyState = resolveTableBodyState({
		isPending: profilesQuery.isPending,
		isError: profilesQuery.isError,
		rowCount: rows.length,
		hasActiveSearch,
	});

	const handleDelete = async () => {
		if (!deleteTarget) {
			return;
		}

		setDeleteError('');

		try {
			await deleteProfile.mutateAsync({
				tenantId,
				profileId: deleteTarget.id,
			});
			await queryClient.invalidateQueries({
				queryKey: STAFF_TENANT_PROFILES_QUERY_KEY,
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldRedirectToLogout(true);
				return;
			}

			setDeleteError(
				getFailureMessage(toApiFailure(error), {
					fallback: 'Unable to delete this tenant profile.',
				}),
			);
			return;
		} finally {
			setDeleteTarget(null);
		}
	};

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="profiles"
			testId="staff-tenant-profiles-page"
		>
			<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div className="space-y-1">
					<h2 className="publy-type-page-title">{t('profiles')}</h2>
					<p className="publy-type-helper">
						{t('tenant-profiles-tab-description')}
					</p>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => setCreateDrawerOpen(true)}
				>
					<IconPlus aria-hidden="true" className="size-[15px]" />
					{t('new-profile')}
				</Button>
			</div>

			<div className="publy-data-table-shell">
				<DataTableToolbar
					testId={testId}
					searchDraft={controller.search.draft}
					onSearchDraftChange={controller.search.onDraftChange}
					searchPlaceholder={t('search-profiles')}
				/>

				{bodyState === 'loading' ? (
					<ProfileCardGridSkeleton testId={testId} />
				) : null}

				{bodyState === 'error' ? (
					<ErrorStateSurface
						title={t('list-unavailable-title')}
						description={t('list-error-default-description')}
						actions={
							<Button
								type="button"
								variant="outline"
								onClick={() => void profilesQuery.refetch()}
							>
								{t('retry')}
							</Button>
						}
						testId={`${testId}-error`}
					/>
				) : null}

				{bodyState === 'empty' ? (
					<StateSurface
						title={t('list-empty-title')}
						description="No tenant profiles found."
						testId={`${testId}-empty`}
					/>
				) : null}

				{bodyState === 'no-match' ? (
					<NoMatchStateSurface
						title={t('list-no-match-title')}
						description="No tenant profiles match your search."
						testId={`${testId}-no-match`}
					/>
				) : null}

				{bodyState === 'rows' ? (
					<>
						<div
							className="publy-profile-card-grid"
							data-testid={`${testId}-rows`}
						>
							{rows.map((profile) => (
								<ProfileCard
									key={profile.id}
									tenantId={tenantId}
									profile={profile}
									onDeleteRequest={setDeleteTarget}
								/>
							))}
						</div>
						<DataTableCursorFooter
							testId={testId}
							pageIndex={controller.cursor.pageIndex}
							size={controller.size}
							onSizeChange={controller.onSizeChange}
							hasPreviousPage={controller.cursor.hasPreviousPage}
							hasNextPage={profilesQuery.data?.nextCursor != null}
							isPaginationPending={profilesQuery.isFetching}
							onNextPage={() =>
								controller.cursor.onNextPage(
									profilesQuery.data?.nextCursor ?? undefined,
								)
							}
							onPreviousPage={controller.cursor.onPreviousPage}
							variant="flat"
						/>
					</>
				) : null}
			</div>

			<ConfirmDialog
				isOpen={deleteTarget !== null}
				title={t('delete')}
				description="This will permanently delete this tenant profile. Users assigned to this profile may be affected and the action cannot be undone."
				confirmLabel={t('delete')}
				isPending={deleteProfile.isPending}
				onConfirm={() => {
					void handleDelete();
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setDeleteTarget(null);
				}}
			/>

			{deleteError ? (
				<p className="text-sm text-destructive" role="status">
					{deleteError}
				</p>
			) : null}

			<ProfileFormDrawer
				tenantId={tenantId}
				mode="create"
				isOpen={isCreateDrawerOpen}
				onOpenChange={setCreateDrawerOpen}
				onSessionExpired={() => setShouldRedirectToLogout(true)}
				onSaved={(profileId) => {
					if (profileId) {
						void navigate({
							to: '/staff/tenants/$tenantId/profiles/$profileId',
							params: { tenantId, profileId },
						});
						return;
					}

					setCreateDrawerOpen(false);
				}}
			/>
		</TenantDetailsPageShell>
	);
}
