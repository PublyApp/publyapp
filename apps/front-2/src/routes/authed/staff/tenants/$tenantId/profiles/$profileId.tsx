import { Card, Chip, Spinner } from '@heroui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import {
	toStaffTenantProfileDetails,
	toStaffTenantProfilePermissionKeys,
	useStaffTenantProfileDetailsQuery,
	useStaffTenantProfilePermissionKeysQuery,
} from '~/lib/query/staff-tenant-profiles';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	DetailItem,
	MALFORMED_ID_TRANSLATION_KEY,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
} from '../_tenant-details-shell';

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

const ProfileDetailsLoading = () => (
	<div
		className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
		data-testid="staff-tenant-profile-details-loading"
	>
		<div className="flex items-center gap-3 text-sm text-foreground-500">
			<Spinner size="sm" />
			<span>Loading tenant profile…</span>
		</div>
	</div>
);

const InvalidTenantProfileView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon="!"
		code="400 — Bad Request"
		title="Invalid profile link"
		description={getFailureDescription(
			error,
			'This tenant profile link is malformed or incomplete.',
		)}
		testId="staff-tenant-profile-details-invalid"
	/>
);

const MissingTenantProfileView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon="🔎"
		code="404 — Not Found"
		title="Tenant profile not found"
		description={getFailureDescription(
			error,
			'The requested tenant profile does not exist or is no longer available.',
		)}
		testId="staff-tenant-profile-details-not-found"
	/>
);

const TenantProfileDetailsError = ({ error }: { error: unknown }) => {
	if (isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
		return <InvalidTenantProfileView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return (
			<AppErrorView
				icon="⛔"
				code="403 — Forbidden"
				title="You don't have access"
				description="Your account does not have permission to view this tenant profile."
				testId="forbidden-view"
			/>
		);
	}

	if (isProblemStatus(error, 404)) {
		return <MissingTenantProfileView error={error} />;
	}

	return (
		<AppErrorView
			icon="!"
			code="500 — Server Error"
			title="Unable to load this tenant profile"
			description="There was a problem loading the profile details."
			testId="staff-tenant-profile-details-error"
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId',
)({
	component: StaffTenantProfileDetailsPage,
});

function StaffTenantProfileDetailsPage() {
	const { tenantId, profileId } = Route.useParams();

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
	const permissionKeysQuery = useStaffTenantProfilePermissionKeysQuery(
		{ tenantId, profileId },
		{
			enabled:
				tenantId.length > 0 &&
				profileId.length > 0 &&
				!tenantQuery.isPending &&
				!tenantQuery.isError,
		},
	);

	if (tenantQuery.isPending) {
		return <TenantDetailsLoading />;
	}

	if (tenantQuery.isError) {
		if (shouldLogoutForFailure(tenantQuery.error)) {
			return <LogoutRedirect />;
		}

		return <TenantDetailsError error={tenantQuery.error} />;
	}

	const tenant = toStaffTenantDetails(tenantQuery.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon="!"
				code="500 — Server Error"
				title="Unable to load this tenant"
				description="The tenant response was incomplete."
				testId="staff-tenant-details-error"
			/>
		);
	}

	if (
		(detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) ||
		(permissionKeysQuery.isError &&
			shouldLogoutForFailure(permissionKeysQuery.error))
	) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending || permissionKeysQuery.isPending) {
		return <ProfileDetailsLoading />;
	}

	if (detailQuery.isError) {
		return <TenantProfileDetailsError error={detailQuery.error} />;
	}

	if (permissionKeysQuery.isError) {
		return <TenantProfileDetailsError error={permissionKeysQuery.error} />;
	}

	const profile = toStaffTenantProfileDetails(detailQuery.data);
	if (!profile) {
		return (
			<AppErrorView
				icon="🔎"
				code="404 — Not Found"
				title="Tenant profile not found"
				description="The profile payload was empty."
				testId="staff-tenant-profile-details-not-found"
			/>
		);
	}

	const permissionKeys = toStaffTenantProfilePermissionKeys(
		permissionKeysQuery.data,
	);

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="profiles"
			summary="Review tenant profile details and edit the profile name or description."
			testId="staff-tenant-profile-details-page"
		>
			<div className="space-y-6">
				<div className="space-y-4">
					<Link
						to={'/staff/tenants/$tenantId/profiles' as never}
						params={{ tenantId } as never}
						className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
					>
						Back to profiles
					</Link>

					<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<div className="space-y-3">
							<div className="flex flex-wrap items-center gap-3">
								<h2 className="text-2xl font-semibold text-foreground">
									{profile.name}
								</h2>
								{profile.isDefault ? (
									<Chip color="accent" size="sm" variant="soft">
										Default
									</Chip>
								) : null}
							</div>
							<p className="max-w-3xl text-sm text-foreground-500">
								{profile.description ?? 'No description provided.'}
							</p>
						</div>

						<div className="flex w-full max-w-xs flex-col gap-3">
							<DetailItem
								label="Assigned users"
								value={String(profile.userAccountCount)}
							/>
							<Link
								to={
									'/staff/tenants/$tenantId/profiles/$profileId/edit' as never
								}
								params={{ tenantId, profileId } as never}
								className="inline-flex items-center justify-center rounded-medium border border-divider px-4 py-2 text-sm font-medium text-foreground transition hover:border-default-400 hover:bg-default-100"
							>
								Edit profile
							</Link>
						</div>
					</div>
				</div>

				<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
					<Card className="space-y-4 p-5">
						<div className="space-y-1">
							<p className="text-lg font-semibold text-foreground">
								Profile details
							</p>
							<p className="text-sm text-foreground-500">
								Core information for this tenant profile.
							</p>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<div className="md:col-span-2">
								<DetailItem label="Name" value={profile.name} />
							</div>
							<div className="md:col-span-2">
								<DetailItem
									label="Description"
									value={profile.description ?? 'No description provided.'}
								/>
							</div>
							<DetailItem
								label="Default profile"
								value={profile.isDefault ? 'Yes' : 'No'}
							/>
							<DetailItem
								label="Assigned permission keys"
								value={String(permissionKeys.length)}
							/>
						</div>
					</Card>

					<Card className="space-y-4 p-5">
						<div className="space-y-1">
							<p className="text-lg font-semibold text-foreground">
								Assigned permission keys
							</p>
							<p className="text-sm text-foreground-500">
								Permissions currently assigned by the backend for this profile.
							</p>
						</div>

						{permissionKeys.length === 0 ? (
							<div className="rounded-large border border-dashed border-divider px-4 py-6 text-sm text-foreground-500">
								No permission keys are assigned to this profile.
							</div>
						) : (
							<ul className="space-y-2">
								{permissionKeys.map((permissionKey) => (
									<li
										key={permissionKey}
										className="rounded-large border border-divider bg-content1 px-4 py-3"
									>
										<p className="font-mono text-sm text-foreground">
											{permissionKey}
										</p>
									</li>
								))}
							</ul>
						)}
					</Card>
				</div>
			</div>
		</TenantDetailsPageShell>
	);
}
