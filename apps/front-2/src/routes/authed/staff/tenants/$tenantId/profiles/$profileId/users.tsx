import { IconAlertCircle, IconSearchOff, IconUsers } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import { StateView } from '~/components/ui/state-view';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
	toStaffTenantProfileDetails,
	useStaffTenantProfileDetailsQuery,
} from '~/lib/query/staff-tenant-profiles';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	BackToTenantsLink,
	MALFORMED_ID_TRANSLATION_KEY,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from '../../_tenant-details-shell';
import { AssignMembersDrawer } from './_assign-members-drawer';

export type ProfileMembersSearchParams = { assign?: 1 };
export type ProfileMembersSearchParamInput = { assign?: unknown };

/** Mirrors `$profileId.tsx`'s `edit` flag: round-trips as the NUMBER 1, never
 * the string `'1'` (the router's search serializer JSON-quotes strings). */
export const parseProfileMembersSearchParams = (
	search: ProfileMembersSearchParamInput,
): ProfileMembersSearchParams => {
	const isAssignOpen =
		search.assign === 1 ||
		(typeof search.assign === 'string' && search.assign.trim() === '1');

	return { assign: isAssignOpen ? 1 : undefined };
};

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

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId/users',
)({
	validateSearch: (search) =>
		parseProfileMembersSearchParams(search as ProfileMembersSearchParamInput),
	component: StaffTenantProfileMembersPage,
});

function StaffTenantProfileMembersPage() {
	const { tenantId, profileId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t } = useTranslation('common');
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const isAssignDrawerOpen = search.assign === 1;

	const setAssignDrawerOpen = (isOpen: boolean): void => {
		void navigate({
			search: (previous: ProfileMembersSearchParams) => ({
				...previous,
				assign: isOpen ? 1 : undefined,
			}),
			replace: true,
		});
	};

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
		>
			<div className="space-y-6">
				<div className="space-y-1">
					<h2 className="text-2xl font-semibold text-foreground">
						{profile.name}
					</h2>
					<p className="max-w-3xl text-sm text-muted-foreground">
						{profile.description ?? t('no-description-provided')}
					</p>
				</div>

				<Tabs value="members">
					<TabsList variant="line" aria-label={t('profile-sections')}>
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

					<TabsContent value="members" className="mt-5">
						<Card className="space-y-4 p-5">
							<div className="flex flex-wrap items-center justify-between gap-3">
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

							<StateView
								icon={<IconUsers aria-hidden="true" />}
								scale="inline"
								title={t('profile-member-list-unavailable-title')}
								description={t('profile-member-list-unavailable-description')}
								testId="staff-tenant-profile-members-list-unavailable"
								className="py-8"
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
}
