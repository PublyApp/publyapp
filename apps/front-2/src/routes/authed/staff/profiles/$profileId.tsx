import { Card, Spinner } from '@heroui/react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import {
	type StaffPermissionCatalog,
	toAssignedStaffPermissionGroups,
	toStaffProfileDetails,
	useStaffPermissionCatalogQuery,
	useStaffProfileDetailsQuery,
	useStaffProfilePermissionKeysQuery,
} from '~/lib/query/staff-profiles';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import { toApiFailure } from '@org/shared-ts/lib/api-failure/to-api-failure';

const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';

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

const getFailureDescription = (
	failure: ReturnType<typeof toApiFailure>,
	fallback: string,
): string => {
	if (failure.kind === 'problem') {
		return failure.detail || fallback;
	}

	return fallback;
};

const ProfileDetailsLoading = () => (
	<div
		className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
		data-testid="staff-profile-details-loading"
	>
		<div className="flex items-center gap-3 text-sm text-foreground-500">
			<Spinner size="sm" />
			<span>Loading staff profile…</span>
		</div>
	</div>
);

const InvalidProfileView = ({ error }: { error: unknown }) => {
	const failure = toApiFailure(error);

	return (
		<AppErrorView
			icon="!"
			code="400 — Bad Request"
			title="Invalid profile link"
			description={getFailureDescription(
				failure,
				'This staff profile link is malformed or incomplete.',
			)}
			testId="staff-profile-details-invalid"
		/>
	);
};

const MissingProfileView = ({ error }: { error: unknown }) => {
	const failure = toApiFailure(error);

	return (
		<AppErrorView
			icon="🔎"
			code="404 — Not Found"
			title="Staff profile not found"
			description={getFailureDescription(
				failure,
				'The requested staff profile does not exist or is no longer available.',
			)}
			testId="staff-profile-details-not-found"
		/>
	);
};

const ProfileDetailsError = ({ error }: { error: unknown }) => {
	if (isProblemStatus(error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
		return <InvalidProfileView error={error} />;
	}

	if (isProblemStatus(error, 403)) {
		return <View403 />;
	}

	if (isProblemStatus(error, 404)) {
		return <MissingProfileView error={error} />;
	}

	return (
		<AppErrorView
			icon="!"
			code="500 — Server Error"
			title="Unable to load this staff profile"
			description="There was a problem loading the profile details."
			testId="staff-profile-details-error"
		/>
	);
};

const DetailStat = ({
	label,
	value,
}: {
	label: string;
	value: string | number;
}) => (
	<div className="rounded-large border border-divider bg-content1 p-4">
		<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
			{label}
		</p>
		<p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
	</div>
);

export const Route = createFileRoute(
	'/_authed-layout/staff/profiles/$profileId',
)({
	component: StaffProfileDetailsPage,
});

function StaffProfileDetailsPage() {
	const { profileId } = Route.useParams();
	const { i18n } = useTranslation('common');

	const detailQuery = useStaffProfileDetailsQuery({ profileId });
	const permissionKeysQuery = useStaffProfilePermissionKeysQuery({ profileId });
	const permissionCatalogQuery = useStaffPermissionCatalogQuery({
		language: i18n.language,
	});

	if (
		(detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) ||
		(permissionKeysQuery.isError &&
			shouldLogoutForFailure(permissionKeysQuery.error)) ||
		(permissionCatalogQuery.isError &&
			shouldLogoutForFailure(permissionCatalogQuery.error))
	) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending || permissionKeysQuery.isPending) {
		return <ProfileDetailsLoading />;
	}

	if (detailQuery.isError) {
		return <ProfileDetailsError error={detailQuery.error} />;
	}

	if (permissionKeysQuery.isError) {
		return <ProfileDetailsError error={permissionKeysQuery.error} />;
	}

	const details = toStaffProfileDetails(detailQuery.data);
	if (!details) {
		return (
			<AppErrorView
				icon="🔎"
				code="404 — Not Found"
				title="Staff profile not found"
				description="The profile payload was empty."
				testId="staff-profile-details-empty"
			/>
		);
	}

	const assignedKeys = permissionKeysQuery.data.permissionKeys ?? [];
	const permissionGroups = toAssignedStaffPermissionGroups(
		assignedKeys,
		(permissionCatalogQuery.data?.additionalData ?? undefined) as
			| StaffPermissionCatalog
			| undefined,
	);

	return (
		<div
			className="mx-auto w-full max-w-5xl space-y-6 p-4"
			data-testid="staff-profile-details-page"
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<Link
						to="/staff/profiles"
						className="text-sm text-foreground-500 underline-offset-4 hover:text-foreground hover:underline"
					>
						Back to staff profiles
					</Link>
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="space-y-2">
							<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
								Staff profile
							</p>
							<h1 className="text-3xl font-semibold tracking-tight text-foreground">
								{details.name}
							</h1>
							<p className="max-w-2xl text-sm text-foreground-500">
								{details.description ?? 'No description provided.'}
							</p>
						</div>
						<div className="w-full max-w-xs">
							<DetailStat
								label="Assigned users"
								value={details.userAccountCount}
							/>
						</div>
					</div>
				</div>

				<nav
					aria-label="Staff profile sections"
					className="flex flex-wrap gap-2 border-b border-divider pb-2"
				>
					<span className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
						Basics
					</span>
					<span
						aria-disabled="true"
						className="rounded-full border border-divider px-4 py-2 text-sm text-foreground-400"
					>
						Users
					</span>
				</nav>
			</div>

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
				<Card className="space-y-4 p-5">
					<div className="space-y-1">
						<p className="text-lg font-semibold text-foreground">
							Profile details
						</p>
						<p className="text-sm text-foreground-500">
							Core information for this staff profile.
						</p>
					</div>

					<div className="grid gap-4 md:grid-cols-2">
						<div className="rounded-large border border-divider bg-content1 p-4 md:col-span-2">
							<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
								Name
							</p>
							<p className="mt-2 text-base font-medium text-foreground">
								{details.name}
							</p>
						</div>
						<div className="rounded-large border border-divider bg-content1 p-4 md:col-span-2">
							<p className="text-xs font-medium uppercase tracking-[0.2em] text-foreground-500">
								Description
							</p>
							<p className="mt-2 text-sm text-foreground-600">
								{details.description ?? 'No description provided.'}
							</p>
						</div>
						<DetailStat
							label="User accounts"
							value={details.userAccountCount}
						/>
						<DetailStat
							label="Assigned permission keys"
							value={assignedKeys.length}
						/>
					</div>
				</Card>

				<Card className="space-y-4 p-5">
					<div className="space-y-1">
						<p className="text-lg font-semibold text-foreground">
							Assigned permissions
						</p>
						<p className="text-sm text-foreground-500">
							Grouped by module when catalog data is available.
						</p>
					</div>

					{permissionGroups.length === 0 ? (
						<div className="rounded-large border border-dashed border-divider px-4 py-6 text-sm text-foreground-500">
							No permissions are assigned to this profile.
						</div>
					) : (
						<div className="space-y-4">
							{permissionGroups.map((group) => (
								<section
									key={group.key}
									className="space-y-3 rounded-large border border-divider bg-content1 p-4"
								>
									<div className="flex items-center justify-between gap-3">
										<h2 className="text-base font-semibold text-foreground">
											{group.label}
										</h2>
										<span className="rounded-full bg-default-100 px-2.5 py-1 text-xs text-foreground-500">
											{group.permissions.length}
										</span>
									</div>
									<ul className="space-y-2">
										{group.permissions.map((permission) => (
											<li
												key={permission.key}
												className="rounded-medium border border-divider bg-default-50 px-3 py-2"
											>
												<p className="text-sm font-medium text-foreground">
													{permission.label}
												</p>
												<p className="mt-1 font-mono text-xs text-foreground-500">
													{permission.key}
												</p>
												{permission.description ? (
													<p className="mt-1 text-xs text-foreground-500">
														{permission.description}
													</p>
												) : null}
											</li>
										))}
									</ul>
								</section>
							))}
						</div>
					)}
				</Card>
			</div>
		</div>
	);
}
