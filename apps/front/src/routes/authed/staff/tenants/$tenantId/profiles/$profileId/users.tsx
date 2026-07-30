import { IconAlertCircle, IconSearchOff, IconUsers } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { DataTable } from '~/components/table/data-table';
import { useTableController } from '~/components/table/use-table-controller';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
	selectStaffTenantProfileCrumbName,
	staffTenantProfileCrumbQuery,
	toStaffTenantProfileDetails,
	toStaffTenantProfileMemberRows,
	useStaffTenantProfileDetailsQuery,
	useStaffTenantProfileMembersQuery,
	type StaffTenantProfileMemberRow,
} from '~/lib/query/staff-tenant-profiles';
import {
	selectStaffTenantCrumbName,
	staffTenantCrumbQuery,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';
import {
	parseTableSearchParams,
	serializeTableSearchParams,
} from '~/lib/url-state/table-search-params';
import type {
	TableSearchParamInput,
	TableSearchParams,
} from '~/lib/url-state/table-search-params';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	BackToTenantsLink,
	MALFORMED_ID_TRANSLATION_KEY,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from '../../_tenant-details-shell';
import { makeProfileMemberColumns } from '../_profile-member-columns';
import { AssignMembersDrawer } from './_assign-members-drawer';

export { makeProfileMemberColumns } from '../_profile-member-columns';

export type ProfileMembersSearchParams = TableSearchParams & { assign?: 1 };
export type ProfileMembersSearchParamInput = TableSearchParamInput & {
	assign?: unknown;
};

const MEMBERS_DEFAULT_SORT = { id: 'created_at', order: 'desc' as const };
const MEMBERS_DEFAULT_SIZE = 20;

/** Mirrors `$profileId.tsx`'s `edit` flag: round-trips as the NUMBER 1, never
 * the string `'1'` (the router's search serializer JSON-quotes strings). */
export const parseProfileMembersSearchParams = (
	search: ProfileMembersSearchParamInput,
): ProfileMembersSearchParams => {
	const base = parseTableSearchParams(search);
	const isAssignOpen =
		search.assign === 1 ||
		(typeof search.assign === 'string' && search.assign.trim() === '1');

	return { ...base, assign: isAssignOpen ? 1 : undefined };
};

/** The counterpart to `parseProfileMembersSearchParams` — every `navigate`
 * call must serialize through this before writing to the URL, so table
 * state never leaks camelCase keys (`sortId`) into the query string. */
export const serializeProfileMembersSearchParams = (
	params: ProfileMembersSearchParams,
): Record<string, string | 1 | undefined> => ({
	...serializeTableSearchParams(params),
	assign: params.assign,
});

const isProblemStatus = (
	error: unknown,
	status: number,
	translationKey?: string,
): boolean => {
	const failure = toApiFailure(error);

	if (failure.kind !== 'problem' || failure.status !== status) {
		return false;
	}

	return (
		translationKey === undefined || failure.translationKey === translationKey
	);
};

const getFailureDescription = (error: unknown, fallback: string): string => {
	const failure = toApiFailure(error);

	if (failure.kind === 'problem' && failure.detail) {
		return failure.detail;
	}

	return fallback;
};

const ProfileMembersLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-profile-members-loading"
		>
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<LoadingSpinner />
				<span>{t('loading-tenant-profile')}</span>
			</div>
		</div>
	);
};

const MissingTenantProfileView = ({ error }: { error: unknown }) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('tenant-profile-not-found-title')}
			description={getFailureDescription(
				error,
				t('tenant-profile-not-found-description'),
			)}
			testId="staff-tenant-profile-members-not-found"
			actions={<BackToTenantsLink />}
		/>
	);
};

const TenantProfileMembersError = ({
	error,
	onRetry,
}: {
	error: unknown;
	onRetry: () => void;
}) => {
	const { t } = useTranslation('common');

	if (
		isProblemStatus(error, 404) ||
		isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)
	) {
		return <MissingTenantProfileView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('unable-to-load-tenant-profile')}
			description={t('tenant-profile-load-error-description')}
			testId="staff-tenant-profile-members-error"
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};

const StaffTenantProfileMembersPage = () => {
	const { tenantId, profileId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t, i18n } = useTranslation(['common', 'staff-tenant-profiles']);
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const isAssignDrawerOpen = search.assign === 1;

	const setAssignDrawerOpen = (isOpen: boolean): void => {
		void navigate({
			search: (previous: ProfileMembersSearchParams) =>
				serializeProfileMembersSearchParams({
					...previous,
					assign: isOpen ? 1 : undefined,
				}) as unknown as ProfileMembersSearchParams,
			replace: true,
		});
	};

	const onMembersSearchChange = (next: TableSearchParams): void => {
		void navigate({
			search: serializeProfileMembersSearchParams({
				...next,
				assign: search.assign,
			}) as unknown as ProfileMembersSearchParams,
			replace: true,
		});
	};

	const [membersPageIndex, setMembersPageIndex] = useState(0);
	const membersController = useTableController({
		search,
		onSearchChange: onMembersSearchChange,
		defaultSort: MEMBERS_DEFAULT_SORT,
		defaultSize: MEMBERS_DEFAULT_SIZE,
	});

	const tenantQuery = useStaffTenantDetailsQuery(
		{ tenantId },
		{ enabled: tenantId.length > 0 },
	);
	const detailQuery = useStaffTenantProfileDetailsQuery(
		{ tenantId, profileId },
		{
			enabled:
				tenantId.length > 0 &&
				profileId.length > 0 &&
				!tenantQuery.isPending &&
				!tenantQuery.isError,
		},
	);
	const membersQuery = useStaffTenantProfileMembersQuery(
		{
			tenantId,
			profileId,
			q: membersController.search.committed,
			sortId: membersController.sort.id,
			sortOrder: membersController.sort.order,
			pageIndex: membersPageIndex,
			size: membersController.size,
		},
		{
			enabled:
				tenantId.length > 0 &&
				profileId.length > 0 &&
				!tenantQuery.isPending &&
				!tenantQuery.isError &&
				!detailQuery.isPending &&
				!detailQuery.isError,
		},
	);
	const memberRows = useMemo(
		() => toStaffTenantProfileMemberRows(membersQuery.data?.users),
		[membersQuery.data?.users],
	);
	const memberColumns = useMemo(
		() => makeProfileMemberColumns(tenantId, t, i18n.language),
		[i18n.language, tenantId, t],
	);

	useEffect(() => {
		setMembersPageIndex(0);
	}, [
		tenantId,
		profileId,
		membersController.search.committed,
		membersController.sort.id,
		membersController.sort.order,
		membersController.size,
	]);

	useEffect(() => {
		const totalCount = membersQuery.data?.count ?? 0;
		const lastPageIndex =
			totalCount > 0
				? Math.max(Math.ceil(totalCount / membersController.size) - 1, 0)
				: 0;

		if (membersPageIndex > lastPageIndex) {
			setMembersPageIndex(lastPageIndex);
		}
	}, [membersController.size, membersPageIndex, membersQuery.data?.count]);

	if (shouldRedirectToLogout) {
		return <LogoutRedirect />;
	}

	if (tenantQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (tenantQuery.isError) {
		if (shouldLogoutForFailure(tenantQuery.error)) {
			return <LogoutRedirect />;
		}

		return (
			<TenantDetailsError
				error={tenantQuery.error}
				onRetry={() => void tenantQuery.refetch()}
			/>
		);
	}

	const tenant = toStaffTenantDetails(tenantQuery.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code={t('error-500-code')}
				title={t('tenant-details-error-title')}
				description={t('tenant-response-incomplete')}
				testId="staff-tenant-details-error"
				actions={
					<TenantRetryActions onRetry={() => void tenantQuery.refetch()} />
				}
			/>
		);
	}

	if (detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending) {
		return <ProfileMembersLoading />;
	}

	if (detailQuery.isError) {
		return (
			<TenantProfileMembersError
				error={detailQuery.error}
				onRetry={() => void detailQuery.refetch()}
			/>
		);
	}

	const profile = toStaffTenantProfileDetails(detailQuery.data);
	if (!profile) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code={t('error-404-code')}
				title={t('tenant-profile-not-found-title')}
				description={t('tenant-profile-payload-empty')}
				testId="staff-tenant-profile-members-not-found"
				actions={<BackToTenantsLink />}
			/>
		);
	}

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="profiles"
			testId="staff-tenant-profile-members-page"
			bodyScroll="contained"
		>
			<div className="flex h-full min-h-0 flex-1 flex-col gap-6">
				<div className="shrink-0 space-y-1">
					<h2 className="text-2xl font-semibold text-foreground">
						{profile.name}
					</h2>
					<p className="max-w-3xl text-sm text-muted-foreground">
						{profile.description ?? t('no-description-provided')}
					</p>
				</div>

				<Tabs value="members" className="min-h-0 flex-1">
					<TabsList
						variant="line"
						aria-label={t('staff-tenant-profiles:profile-sections')}
						className="shrink-0"
					>
						<TabsTrigger
							value="profile"
							render={
								<Link
									to="/staff/tenants/$tenantId/profiles/$profileId"
									params={{ tenantId, profileId }}
								/>
							}
						>
							{t('profile')}
						</TabsTrigger>
						<TabsTrigger value="members">
							{t('members')}
							<span className="publy-detail-chip publy-detail-chip--outline">
								{profile.userAccountCount}
							</span>
						</TabsTrigger>
					</TabsList>

					<TabsContent
						value="members"
						className="publy-detail-tab-body min-h-0"
					>
						<Card className="min-h-0 flex-1 gap-4 p-5">
							<div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
								<div className="space-y-1">
									<p className="text-lg font-semibold text-foreground">
										{t('members')}
										<span className="ml-2 publy-profile-count-badge align-middle">
											{profile.userAccountCount}
										</span>
									</p>
									<p className="text-sm text-muted-foreground">
										{t('profile-members-tab-description')}
									</p>
								</div>
								<Button
									type="button"
									variant="default"
									onClick={() => setAssignDrawerOpen(true)}
								>
									{t('assign-members')}
								</Button>
							</div>

							<DataTable<StaffTenantProfileMemberRow>
								testId="staff-tenant-profile-members-table"
								ariaLabel={t('profile-members-table-aria-label')}
								columns={memberColumns}
								rows={memberRows}
								getRowLabel={(row) => row.displayName}
								isPending={membersQuery.isPending}
								isError={membersQuery.isError}
								onRetry={() => void membersQuery.refetch()}
								emptyIcon={IconUsers}
								emptyTitle={t('profile-members-empty-title')}
								emptyContent={t('profile-members-empty-description')}
								noMatchTitle={t('tenant-users-no-match-title')}
								noMatchContent={t('tenant-users-no-match-description')}
								hasActiveSearch={Boolean(membersController.search.committed)}
								sort={membersController.sort}
								onSortChange={membersController.onSortChange}
								size={membersController.size}
								onSizeChange={membersController.onSizeChange}
								pageIndex={membersPageIndex}
								hasPreviousPage={membersPageIndex > 0}
								hasNextPage={
									(membersPageIndex + 1) * membersController.size <
									(membersQuery.data?.count ?? 0)
								}
								isPaginationPending={
									membersQuery.isFetching && !membersQuery.isPending
								}
								onNextPage={() => {
									const hasNext =
										(membersPageIndex + 1) * membersController.size <
										(membersQuery.data?.count ?? 0);
									if (hasNext) {
										setMembersPageIndex((current) => current + 1);
									}
								}}
								onPreviousPage={() => {
									if (membersPageIndex > 0) {
										setMembersPageIndex((current) => Math.max(current - 1, 0));
									}
								}}
								searchDraft={membersController.search.draft}
								onSearchDraftChange={membersController.search.onDraftChange}
								searchPlaceholder={t('search-tenant-members')}
							/>
						</Card>
					</TabsContent>
				</Tabs>
			</div>

			<AssignMembersDrawer
				tenantId={tenantId}
				profileId={profileId}
				isOpen={isAssignDrawerOpen}
				onOpenChange={setAssignDrawerOpen}
				onSessionExpired={() => setShouldRedirectToLogout(true)}
			/>
		</TenantDetailsPageShell>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId/users',
)({
	staticData: {
		i18nNamespaces: ['staff-tenant-profiles'],
		crumbs: (params) => [
			{ kind: 'label', labelKey: 'nav-tenants', to: '/staff/tenants' },
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}`,
				query: staffTenantCrumbQuery,
				select: selectStaffTenantCrumbName,
			},
			{
				kind: 'label',
				labelKey: 'common:profiles',
				to: `/staff/tenants/${params.tenantId}/profiles`,
			},
			{
				kind: 'entity',
				to: `/staff/tenants/${params.tenantId}/profiles/${params.profileId}`,
				query: staffTenantProfileCrumbQuery,
				select: selectStaffTenantProfileCrumbName,
			},
			{ kind: 'label', labelKey: 'common:members' },
		],
	},
	validateSearch: (search) =>
		parseProfileMembersSearchParams(search as ProfileMembersSearchParamInput),
	component: StaffTenantProfileMembersPage,
});
