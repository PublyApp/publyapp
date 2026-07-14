import {
	IconAlertCircle,
	IconArrowLeft,
	IconSearchOff,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { LoadingSpinner } from '~/components/ui/loading-spinner';
import {
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
	invalidateAllStaffTenantScopes,
	toStaffTenantDetails,
	useStaffTenantDetailsQuery,
} from '~/lib/query/staff-tenants';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';

import {
	BackToTenantsLink,
	DetailItem,
	MALFORMED_ID_TRANSLATION_KEY,
	TenantDetailsError,
	TenantDetailsLoading,
	TenantDetailsPageShell,
	TenantRetryActions,
} from '../_tenant-details-shell';
import { ProfileFormDrawer } from './_profile-form-drawer';

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

const ProfileDetailsLoading = () => {
	const { t } = useTranslation('common');

	return (
		<div
			className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12"
			data-testid="staff-tenant-profile-details-loading"
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
			testId="staff-tenant-profile-details-not-found"
			actions={<BackToTenantsLink />}
		/>
	);
};

const TenantProfileDetailsError = ({
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
			testId="staff-tenant-profile-details-error"
			actions={<TenantRetryActions onRetry={onRetry} />}
		/>
	);
};

type ProfileDetailsSearchParams = { edit?: 1 };
type ProfileDetailsSearchParamInput = { edit?: unknown };

/** The flag round-trips as the NUMBER 1 — a string '1' would be JSON-quoted
 * in the URL (`?edit=%221%22`) by the router's search serializer. */
const parseProfileDetailsSearchParams = (
	search: ProfileDetailsSearchParamInput,
): ProfileDetailsSearchParams => {
	const isEditOpen =
		search.edit === 1 ||
		(typeof search.edit === 'string' && search.edit.trim() === '1');

	return isEditOpen ? { edit: 1 } : {};
};

export const Route = createFileRoute(
	'/_authed-layout/staff/tenants/$tenantId/profiles/$profileId',
)({
	validateSearch: (search) =>
		parseProfileDetailsSearchParams(search as ProfileDetailsSearchParamInput),
	component: StaffTenantProfileDetailsPage,
});

function StaffTenantProfileDetailsPage() {
	const { tenantId, profileId } = Route.useParams();
	const navigate = Route.useNavigate();
	const search = Route.useSearch();
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [actionError, setActionError] = useState('');
	const [permissionActionError, setPermissionActionError] = useState('');
	const [pendingDelete, setPendingDelete] = useState(false);
	const [busyPermissionKey, setBusyPermissionKey] = useState('');
	const [shouldRedirectToLogout, setShouldRedirectToLogout] = useState(false);
	const isEditDrawerOpen = search.edit === 1;
	const setEditDrawerOpen = (isOpen: boolean): void => {
		void navigate({
			search: isOpen ? { edit: 1 } : {},
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
	// Stable identity across refetch re-renders — the drawer resets its form
	// whenever this prop's reference changes, so a new object literal here
	// would silently discard unsaved edits (see _profile-form-drawer.tsx).
	const permissionKeysCacheKey = permissionKeys.join(',');
	const profileFormDrawerProfile = useMemo(
		() =>
			profile === null
				? undefined
				: {
						id: profile.id,
						name: profile.name,
						description: profile.description,
						permissionKeys,
					},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- permissionKeysCacheKey is the stable key, not the array identity
		[profile?.id, profile?.name, profile?.description, permissionKeysCacheKey],
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
		invalidateAllStaffTenantScopes(queryClient);

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
		return (
			<TenantProfileDetailsError
				error={detailQuery.error}
				onRetry={() => void detailQuery.refetch()}
			/>
		);
	}

	if (permissionKeysQuery.isError) {
		return (
			<TenantProfileDetailsError
				error={permissionKeysQuery.error}
				onRetry={() => void permissionKeysQuery.refetch()}
			/>
		);
	}

	if (!profile) {
		return (
			<AppErrorView
				icon={<IconSearchOff aria-hidden="true" className="size-7" />}
				code={t('error-404-code')}
				title={t('tenant-profile-not-found-title')}
				description={t('tenant-profile-payload-empty')}
				testId="staff-tenant-profile-details-not-found"
				actions={<BackToTenantsLink />}
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
					fallback: t('unable-to-update-tenant-profile-permission'),
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
					fallback: t('unable-to-update-tenant-profile-permission'),
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
					fallback: t('unable-to-delete-tenant-profile'),
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
			testId="staff-tenant-profile-details-page"
		>
			<div className="space-y-6">
				<div className="space-y-4">
					<Link
						to="/staff/tenants/$tenantId/profiles"
						params={{ tenantId }}
						className="publy-back-link"
					>
						<IconArrowLeft aria-hidden="true" className="size-3" />
						{t('back-to-profiles')}
					</Link>

					<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
						<div className="space-y-3">
							<div className="flex flex-wrap items-center gap-3">
								<h2 className="text-2xl font-semibold text-foreground">
									{profile.name}
								</h2>
								{profile.isDefault ? (
									<Badge variant="secondary">{t('default')}</Badge>
								) : null}
							</div>
							<p className="max-w-3xl text-sm text-muted-foreground">
								{profile.description ?? t('no-description-provided')}
							</p>
						</div>

						<div className="flex w-full max-w-xs flex-col gap-3">
							<DetailItem
								label={t('assigned-users')}
								value={String(profile.userAccountCount)}
							/>
							<Button
								type="button"
								variant="outline"
								onClick={() => setEditDrawerOpen(true)}
							>
								{t('edit-profile')}
							</Button>
						</div>
					</div>
				</div>

				<ConfirmDialog
					isOpen={pendingDelete}
					title={t('delete-tenant-profile-confirm-title')}
					description={t('confirm-delete-tenant-profile-description')}
					confirmLabel={t('delete')}
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
								{t('profile-details')}
							</p>
							<p className="text-sm text-muted-foreground">
								{t('tenant-profile-details-description')}
							</p>
						</div>

						<div className="grid gap-4 md:grid-cols-2">
							<div className="md:col-span-2">
								<DetailItem label={t('name')} value={profile.name} />
							</div>
							<div className="md:col-span-2">
								<DetailItem
									label={t('description')}
									value={profile.description ?? t('no-description-provided')}
								/>
							</div>
							<DetailItem
								label={t('default-profile')}
								value={profile.isDefault ? t('yes') : t('no')}
							/>
							<DetailItem
								label={t('assigned-permission-keys')}
								value={String(permissionKeys.length)}
							/>
						</div>
					</Card>

					<Card className="space-y-4 p-5">
						<div className="space-y-1">
							<p className="text-lg font-semibold text-foreground">
								{t('permission-keys')}
							</p>
							<p className="text-sm text-muted-foreground">
								{t('manage-permission-keys-description')}
							</p>
						</div>

						<div className="space-y-4">
							{permissionCatalogQuery.isPending ? (
								<div className="rounded-large border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
									<div className="flex items-center gap-2">
										<LoadingSpinner />
										<span>{t('loading-available-permissions')}</span>
									</div>
								</div>
							) : null}

							{permissionCatalogQuery.isError ? (
								<div className="rounded-large border border-dashed border-destructive bg-destructive/10 px-4 py-4 text-sm text-destructive">
									<p>
										{getFailureMessage(
											toApiFailure(permissionCatalogQuery.error),
											{
												fallback: t('tenant-permission-catalog-load-failed'),
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
										{t('retry')}
									</Button>
								</div>
							) : null}

							<section className="space-y-3">
								<div className="flex items-center justify-between">
									<p className="font-medium text-foreground">{t('assigned')}</p>
									<span className="publy-detail-chip publy-detail-chip--outline">
										{assignedPermissionEntries.length}
									</span>
								</div>

								{assignedPermissionEntries.length === 0 ? (
									<div className="rounded-large border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
										{t('no-permissions-assigned-to-profile')}
									</div>
								) : (
									<ul className="space-y-2">
										{assignedPermissionEntries.map((permission) => (
											<li
												key={permission.key}
												className="rounded-large border border-border bg-card px-3 py-3"
											>
												<div className="flex items-start justify-between gap-3">
													<div>
														<p className="font-mono text-sm text-foreground">
															{permission.label}
														</p>
														{permission.description ? (
															<p className="mt-1 max-w-xl text-xs text-muted-foreground">
																{permission.description}
															</p>
														) : null}
													</div>
													<Button
														type="button"
														size="sm"
														variant="outline"
														disabled={isPermissionBusy}
														onClick={() => {
															void handleUnassignPermission(permission.key);
														}}
														aria-label={t('unassign-permission', {
															name: permission.label,
														})}
													>
														{t('unassign')}
													</Button>
												</div>
											</li>
										))}
									</ul>
								)}
							</section>

							{permissionCatalogQuery.isPending ||
							permissionCatalogQuery.isError ? null : (
								<section className="space-y-3">
									<div className="flex items-center justify-between">
										<p className="font-medium text-foreground">
											{t('available')}
										</p>
										<span className="publy-detail-chip publy-detail-chip--outline">
											{availablePermissionEntries.length}
										</span>
									</div>

									{availablePermissionEntries.length === 0 ? (
										<div className="rounded-large border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
											{assignedPermissionEntries.length === 0
												? t('no-permissions-available')
												: t('no-additional-permission-keys-available')}
										</div>
									) : (
										<ul className="space-y-2">
											{availablePermissionEntries.map((permission) => (
												<li
													key={permission.key}
													className="rounded-large border border-border bg-card px-3 py-3"
												>
													<div className="flex items-start justify-between gap-3">
														<div>
															<p className="font-mono text-sm text-foreground">
																{permission.label}
															</p>
															{permission.description ? (
																<p className="mt-1 max-w-xl text-xs text-muted-foreground">
																	{permission.description}
																</p>
															) : null}
														</div>
														<Button
															type="button"
															size="sm"
															variant="outline"
															disabled={isPermissionBusy}
															onClick={() => {
																void handleAssignPermission(permission.key);
															}}
														>
															{t('assign')} {permission.key}
														</Button>
													</div>
												</li>
											))}
										</ul>
									)}
								</section>
							)}

							<section className="space-y-3 border-t border-border pt-3">
								{profile.isDefault ? (
									<div className="rounded-large border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
										{t('default-profile-delete-disabled')}
									</div>
								) : (
									<Button
										type="button"
										variant="destructive"
										onClick={() => setPendingDelete(true)}
										disabled={deleteProfile.isPending}
									>
										{t('delete-profile')}
									</Button>
								)}

								{actionError ? (
									<div
										className="rounded-large border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
										role="status"
									>
										{actionError}
									</div>
								) : null}
							</section>

							{permissionActionError ? (
								<p className="text-sm text-destructive">
									{permissionActionError}
								</p>
							) : null}
						</div>
					</Card>
				</div>
			</div>

			<ProfileFormDrawer
				tenantId={tenantId}
				mode="edit"
				isOpen={isEditDrawerOpen}
				profile={profileFormDrawerProfile}
				onOpenChange={setEditDrawerOpen}
				onSessionExpired={() => setShouldRedirectToLogout(true)}
				onSaved={() => setEditDrawerOpen(false)}
			/>
		</TenantDetailsPageShell>
	);
}
