import { IconAlertCircle, IconLock, IconSearchOff } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	STAFF_TENANT_PROFILE_DETAILS_QUERY_KEY,
	STAFF_TENANT_PROFILE_PERMISSION_KEYS_QUERY_KEY,
	STAFF_TENANT_PROFILES_QUERY_KEY,
	buildStaffTenantPermissionCatalogOptions,
	useAssignStaffTenantProfilePermissionMutation,
	toStaffTenantProfileDetails,
	toStaffTenantProfilePermissionKeys,
	useDeleteStaffTenantProfileMutation,
	useStaffTenantPermissionCatalogQuery,
	useStaffTenantProfileDetailsQuery,
	useStaffTenantProfilePermissionKeysQuery,
	useUnassignStaffTenantProfilePermissionMutation,
} from '~/lib/query/staff-tenant-profiles';
import {
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

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
			<LoadingSpinner />
			<span>Loading tenant profile…</span>
		</div>
	</div>
);

const LoadingSpinner = () => (
	<span
		role="status"
		aria-label="Loading"
		className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
	/>
);

const InvalidTenantProfileView = ({ error }: { error: unknown }) => (
	<AppErrorView
		icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
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
		icon={<IconSearchOff aria-hidden="true" className="size-7" />}
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
				icon={<IconLock aria-hidden="true" className="size-7" />}
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
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
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
	const navigate = Route.useNavigate();
	const queryClient = useQueryClient();
	const [actionError, setActionError] = useState('');
	const [permissionActionError, setPermissionActionError] = useState('');
	const [pendingDelete, setPendingDelete] = useState(false);
	const [busyPermissionKey, setBusyPermissionKey] = useState('');
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);

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
	const permissionCatalogQuery = useStaffTenantPermissionCatalogQuery({});
	const deleteProfile = useDeleteStaffTenantProfileMutation();
	const assignPermission = useAssignStaffTenantProfilePermissionMutation();
	const unassignPermission = useUnassignStaffTenantProfilePermissionMutation();
	const profile = toStaffTenantProfileDetails(detailQuery.data);
	const permissionKeys = toStaffTenantProfilePermissionKeys(
		permissionKeysQuery.data,
	);
	const permissionCatalogOptions = buildStaffTenantPermissionCatalogOptions(
		permissionCatalogQuery.data?.additionalData,
	);
	const permissionDescriptionsByKey = new Map<string, string | null>();

	for (const option of permissionCatalogOptions) {
		permissionDescriptionsByKey.set(option.key, option.description ?? null);
	}
	const assignedPermissionEntries = permissionKeys.map((permissionKey) => {
		const catalogItem = permissionCatalogOptions.find(
			(option) => option.key === permissionKey,
		);

		return {
			key: permissionKey,
			label: catalogItem?.label ?? permissionKey,
			description: permissionDescriptionsByKey.get(permissionKey) ?? null,
		};
	});
	const assignedPermissionKeySet = new Set(
		assignedPermissionEntries.map((permission) => permission.key),
	);
	const availablePermissionEntries = permissionCatalogOptions.filter(
		(option) => !assignedPermissionKeySet.has(option.key),
	);

	const isPermissionBusy = busyPermissionKey.length > 0;
	const invalidatePermissionQueries = () =>
		Promise.all([
			queryClient.invalidateQueries({
				queryKey: STAFF_TENANT_PROFILES_QUERY_KEY,
			}),
			queryClient.invalidateQueries({
				queryKey: STAFF_TENANT_PROFILE_DETAILS_QUERY_KEY,
			}),
			queryClient.invalidateQueries({
				queryKey: STAFF_TENANT_PROFILE_PERMISSION_KEYS_QUERY_KEY,
			}),
		]);

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

		return <TenantDetailsError error={tenantQuery.error} />;
	}

	const tenant = toStaffTenantDetails(tenantQuery.data);
	if (!tenant) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
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
		return <TenantProfileDetailsError error={detailQuery.error} />;
	}

	if (permissionKeysQuery.isError) {
		return <TenantProfileDetailsError error={permissionKeysQuery.error} />;
	}

	if (!profile) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code="404 — Not Found"
				title="Tenant profile not found"
				description="The profile payload was empty."
				testId="staff-tenant-profile-details-not-found"
			/>
		);
	}

	const handleAssignPermission = async (permissionKey: string) => {
		setPermissionActionError('');
		setBusyPermissionKey(permissionKey);

		try {
			await assignPermission.mutateAsync({
				tenantId,
				profileId,
				permissionKey,
			});
			await invalidatePermissionQueries();
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldRedirectToLogout(true);
				return;
			}

			setPermissionActionError(
				getFailureMessage(toApiFailure(error), {
					fallback: 'Unable to update this tenant profile permission.',
				}),
			);
		} finally {
			setBusyPermissionKey('');
		}
	};
	const handleUnassignPermission = async (permissionKey: string) => {
		setPermissionActionError('');
		setBusyPermissionKey(permissionKey);

		try {
			await unassignPermission.mutateAsync({
				tenantId,
				profileId,
				permissionKey,
			});
			await invalidatePermissionQueries();
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldRedirectToLogout(true);
				return;
			}

			setPermissionActionError(
				getFailureMessage(toApiFailure(error), {
					fallback: 'Unable to update this tenant profile permission.',
				}),
			);
		} finally {
			setBusyPermissionKey('');
		}
	};
	const handleDelete = async () => {
		setActionError('');

		if (profile.isDefault) {
			return;
		}

		try {
			await deleteProfile.mutateAsync({ tenantId, profileId });
			await invalidatePermissionQueries();
			void navigate({
				to: '/staff/tenants/$tenantId/profiles',
				params: { tenantId },
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldRedirectToLogout(true);
				return;
			}

			setActionError(
				getFailureMessage(toApiFailure(error), {
					fallback: 'Unable to delete this tenant profile.',
				}),
			);
		} finally {
			setPendingDelete(false);
		}
	};

	return (
		<TenantDetailsPageShell
			tenant={tenant}
			activeSection="profiles"
			summary="Review tenant profile details, edit the profile, or delete non-default profiles."
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
									<Badge variant="secondary">Default</Badge>
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
							{profile.isDefault ? (
								<div className="rounded-large border border-default-200 bg-default-50 px-4 py-3 text-sm text-foreground-600">
									Default profiles cannot be deleted.
								</div>
							) : (
								<Button
									type="button"
									variant="destructive"
									onClick={() => setPendingDelete(true)}
									disabled={deleteProfile.isPending}
								>
									Delete profile
								</Button>
							)}
							{actionError ? (
								<div
									className="rounded-large border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
									role="status"
								>
									{actionError}
								</div>
							) : null}
						</div>
					</div>
				</div>

				<ConfirmDialog
					isOpen={pendingDelete}
					title="Delete tenant profile"
					description="This will permanently delete this tenant profile. Users assigned to this profile may be affected and the action cannot be undone."
					confirmLabel="Delete"
					isPending={deleteProfile.isPending}
					onConfirm={() => {
						void handleDelete();
					}}
					onOpenChange={setPendingDelete}
				/>

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
								Permission keys
							</p>
							<p className="text-sm text-foreground-500">
								Manage assigned and available permission keys for this profile.
							</p>
						</div>

						<div className="space-y-4">
							{permissionCatalogQuery.isPending ? (
								<div className="rounded-large border border-dashed border-divider px-4 py-6 text-sm text-foreground-500">
									<div className="flex items-center gap-2">
										<LoadingSpinner />
										<span>Loading available permissions…</span>
									</div>
								</div>
							) : null}

							{permissionCatalogQuery.isError ? (
								<div className="rounded-large border border-dashed border-danger bg-danger-50 px-4 py-4 text-sm text-danger-700">
									<p>
										{getFailureMessage(
											toApiFailure(permissionCatalogQuery.error),
											{
												fallback: 'Unable to load tenant permission catalog.',
											},
										)}
									</p>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => {
											void permissionCatalogQuery.refetch();
										}}
										className="mt-3"
									>
										Retry
									</Button>
								</div>
							) : null}

							<section className="space-y-3">
								<div className="flex items-center justify-between">
									<p className="font-medium text-foreground">Assigned</p>
									<span className="rounded-full bg-default-100 px-2 py-1 text-xs text-foreground-500">
										{assignedPermissionEntries.length}
									</span>
								</div>

								{assignedPermissionEntries.length === 0 ? (
									<div className="rounded-large border border-dashed border-divider px-4 py-3 text-sm text-foreground-500">
										No permissions are assigned to this profile.
									</div>
								) : (
									<ul className="space-y-2">
										{assignedPermissionEntries.map((permission) => (
											<li
												key={permission.key}
												className="rounded-large border border-divider bg-content1 px-3 py-3"
											>
												<div className="flex items-start justify-between gap-3">
													<div>
														<p className="font-mono text-sm text-foreground">
															{permission.label}
														</p>
														{permission.description ? (
															<p className="mt-1 max-w-xl text-xs text-foreground-500">
																{permission.description}
															</p>
														) : null}
													</div>
													<Button
														type="button"
														size="sm"
														variant="outline"
														disabled={
															isPermissionBusy &&
															busyPermissionKey !== permission.key
														}
														onClick={() => {
															void handleUnassignPermission(permission.key);
														}}
													>
														Unassign {permission.key}
													</Button>
												</div>
											</li>
										))}
									</ul>
								)}
							</section>

							{permissionCatalogQuery.isPending ? null : (
								<section className="space-y-3">
									<div className="flex items-center justify-between">
										<p className="font-medium text-foreground">Available</p>
										<span className="rounded-full bg-default-100 px-2 py-1 text-xs text-foreground-500">
											{availablePermissionEntries.length}
										</span>
									</div>

									{availablePermissionEntries.length === 0 ? (
										<div className="rounded-large border border-dashed border-divider px-4 py-3 text-sm text-foreground-500">
											{assignedPermissionEntries.length === 0
												? 'No permission keys are available.'
												: 'No additional permission keys are available to assign.'}
										</div>
									) : (
										<ul className="space-y-2">
											{availablePermissionEntries.map((permission) => (
												<li
													key={permission.key}
													className="rounded-large border border-divider bg-content1 px-3 py-3"
												>
													<div className="flex items-start justify-between gap-3">
														<div>
															<p className="font-mono text-sm text-foreground">
																{permission.label}
															</p>
															{permission.description ? (
																<p className="mt-1 max-w-xl text-xs text-foreground-500">
																	{permission.description}
																</p>
															) : null}
														</div>
														<Button
															type="button"
															size="sm"
															variant="outline"
															disabled={
																isPermissionBusy &&
																busyPermissionKey !== permission.key
															}
															onClick={() => {
																void handleAssignPermission(permission.key);
															}}
														>
															Assign {permission.key}
														</Button>
													</div>
												</li>
											))}
										</ul>
									)}
								</section>
							)}

							{permissionActionError ? (
								<p className="text-sm text-danger-600">
									{permissionActionError}
								</p>
							) : null}
						</div>
					</Card>
				</div>
			</div>
		</TenantDetailsPageShell>
	);
}
