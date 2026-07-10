import {
	IconAlertCircle,
	IconChevronLeft,
	IconId,
	IconLock,
	IconMail,
	IconPencil,
	IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { DataTableRowActions } from '~/components/table/row-actions';
import { Button, buttonVariants } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DangerZoneCard,
	DangerZoneRow,
	DetailAside,
	DetailGrid,
	DetailMain,
} from '~/components/ui/detail-layout';
import { DropdownMenuItem } from '~/components/ui/dropdown-menu';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { Input } from '~/components/ui/input';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
	STAFF_USERS_QUERY_KEY,
	STAFF_USER_DETAILS_QUERY_KEY,
	toAssignedStaffProfiles,
	toStaffUserDetails,
	useDeleteStaffUserMutation,
	useReactivateStaffUserMutation,
	useStaffUserDetailsQuery,
	useStaffUserProfilesQuery,
	useSuspendStaffUserMutation,
} from '~/lib/query/staff-users';
import type { AssignedStaffProfile } from '~/lib/query/staff-users';
import { shouldLogoutForFailure } from '~/routes/authed/layout';

import {
	getFailureMessage,
	toApiFailure,
} from '@org/shared-ts/lib/api-failure/to-api-failure';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

const MALFORMED_ID_TRANSLATION_KEY = 'malformed-id';
const STAFF_STATUS_ACTIVE = 'active';
const STAFF_STATUS_SUSPENDED = 'suspended';

const DATE_TIME_FORMAT_OPTIONS = {
	dateStyle: 'medium',
	timeStyle: 'short',
} as const;

const formatDateTime = (
	value: Date | null | undefined,
	locale: string,
): string => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return '—';
	}

	return value.toLocaleString(locale, DATE_TIME_FORMAT_OPTIONS);
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

const normalizeStatus = (value: string | null | undefined): string =>
	value?.trim().toLowerCase() ?? '';

const getSuspendLabel = (status: string | null): 'Suspend' | 'Reactivate' => {
	const normalized = normalizeStatus(status);
	if (normalized === STAFF_STATUS_ACTIVE) {
		return 'Suspend';
	}

	if (normalized === STAFF_STATUS_SUSPENDED) {
		return 'Reactivate';
	}

	return 'Suspend';
};

const getSuspendDescription = (
	status: string | null,
): { title: string; description: string } => {
	const normalized = normalizeStatus(status);

	if (normalized === STAFF_STATUS_ACTIVE) {
		return {
			title: 'Suspend staff user',
			description:
				'Suspending this user revokes access to staff-level tools. You can reactivate this account at any time.',
		};
	}

	if (normalized === STAFF_STATUS_SUSPENDED) {
		return {
			title: 'Reactivate staff user',
			description:
				'Reactivating this user restores staff-level access and permissions.',
		};
	}

	return {
		title: 'Suspend staff user',
		description: 'This action updates this staff user status.',
	};
};

const DetailMetaItem = ({
	label,
	value,
}: {
	label: string;
	value: React.ReactNode;
}) => (
	<div className="space-y-1.5">
		<div className="publy-type-metadata-label">{label}</div>
		<div className="publy-type-metadata-value">{value}</div>
	</div>
);

const ContactDetailsCard = ({
	details,
	locale,
}: {
	details: {
		displayName: string;
		email: string;
		firstName: string | null;
		lastName: string | null;
		accountLevel: string | null;
		status: string | null;
		createdAt: Date | null;
		updatedAt: Date | null;
	};
	locale: string;
}) => (
	<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
		<div className="publy-card-header">
			<p className="publy-type-section-title">Contact details</p>
		</div>
		<div className="px-4 pb-4 pt-3">
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<DetailMetaItem label="Name" value={details.displayName} />
				<DetailMetaItem label="Email" value={details.email || '—'} />
				<DetailMetaItem label="Role" value={details.accountLevel || '—'} />
				<DetailMetaItem
					label="Status"
					value={
						<StatusPill tone={statusPillTone(details.status)}>
							{details.status || 'Unknown'}
						</StatusPill>
					}
				/>
				<DetailMetaItem
					label="Created"
					value={formatDateTime(details.createdAt, locale)}
				/>
				<DetailMetaItem
					label="Updated"
					value={formatDateTime(details.updatedAt, locale)}
				/>
			</div>
		</div>
	</section>
);

const profileHueIndex = (profileId: string): number => {
	let hash = 0;
	for (const char of profileId) {
		hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 997;
	}

	return hash % 2;
};

const AssignedProfilesCard = ({
	profiles,
	maxProfiles,
}: {
	profiles: AssignedStaffProfile[];
	maxProfiles: number;
}) => {
	const assignedCount = profiles.length;
	const meterPercent =
		maxProfiles > 0 ? Math.min((assignedCount / maxProfiles) * 100, 100) : 0;

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">
					Assigned profiles &amp; roles
				</p>
				<span className="text-xs text-muted-foreground">
					{assignedCount} assigned
				</span>
			</div>
			<div className="px-4 pb-4 pt-3 space-y-4">
				{profiles.length === 0 ? (
					<div className="rounded-large border border-dashed border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
						No profiles are currently assigned.
					</div>
				) : (
					<div className="space-y-2">
						{profiles.map((profile) => (
							<div
								key={profile.id}
								className="flex items-center justify-between gap-3 rounded-[10px] px-1 py-1"
							>
								<div className="flex min-w-0 items-center gap-2.5">
									<span
										aria-hidden="true"
										className="publy-icon-tile inline-flex h-7 w-7 items-center justify-center rounded-[9px]"
										data-tone={
											profileHueIndex(profile.id) === 0 ? 'success' : 'info'
										}
									>
										<IconId className="size-4" />
									</span>
									<div className="min-w-0">
										<Link
											to="/staff/profiles/$profileId"
											params={{ profileId: profile.id }}
											className="text-sm font-medium text-foreground hover:underline"
										>
											{profile.name}
										</Link>
										<p className="text-xs text-muted-foreground">
											{profile.description ?? 'No description'}
										</p>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
				{maxProfiles > 0 ? (
					<div className="rounded-[9px] border border-border bg-background p-2">
						<div className="flex items-center justify-between text-xs text-muted-foreground">
							<span>Profile summary</span>
							<span>
								{assignedCount} of {maxProfiles}
							</span>
						</div>
						<div className="mt-2 h-1 rounded-[4px] bg-[var(--publy-row-border)]">
							<div
								className="h-full rounded-[4px] bg-[var(--publy-primary)]"
								style={{ width: `${meterPercent}%` }}
							/>
						</div>
					</div>
				) : null}
			</div>
		</section>
	);
};

const RecentSecurityCard = () => (
	<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
		<div className="publy-card-header">
			<p className="publy-type-section-title">Recent security activity</p>
		</div>
		<div className="px-4 pb-4 pt-3 space-y-3 text-sm text-foreground">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="size-1.5 rounded-[3px] bg-[var(--publy-foreground-subtle)]" />
					<span>Security events</span>
				</div>
				<span className="text-xs text-muted-foreground">
					— {/* TODO(contract): security event feed */}
				</span>
			</div>
		</div>
	</section>
);

const AccountCard = ({ displayId }: { displayId: string }) => (
	<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
		<div className="publy-card-header">
			<p className="publy-type-section-title">Account</p>
		</div>
		<div className="px-4 pb-4 pt-3">
			<div className="space-y-3 text-sm">
				<DetailMetaItem label="User ID" value={displayId} />
				<DetailMetaItem
					label="2FA"
					value={
						<span className="italic text-[var(--publy-foreground-subtle)]">
							Not available {/* TODO(contract): 2FA status */}
						</span>
					}
				/>
				<DetailMetaItem
					label="Sessions"
					value={
						<span className="italic text-[var(--publy-foreground-subtle)]">
							Not available {/* TODO(contract): active sessions */}
						</span>
					}
				/>
			</div>
		</div>
	</section>
);

const ConfirmHeaderInfo = ({
	name,
	email,
	avatarSeed,
}: {
	name: string;
	email: string;
	avatarSeed: string;
}) => (
	<div className="rounded-[14px] border border-[var(--publy-row-border)] bg-[var(--publy-surface-raised)] p-3">
		<div className="flex items-center gap-2.5">
			<InitialsAvatar name={avatarSeed} size="sm" />
			<div className="min-w-0">
				<p className="text-sm font-medium text-foreground">{name}</p>
				<p className="truncate text-xs text-muted-foreground">{email}</p>
			</div>
		</div>
	</div>
);

const DeleteConfirmField = ({
	value,
	onChange,
}: {
	value: string;
	onChange: (next: string) => void;
}) => (
	<div className="space-y-1.5">
		<p className="text-xs text-muted-foreground">
			To delete this account, type <span className="font-mono">delete</span> in
			the field below.
		</p>
		<Input
			aria-label="Confirm delete"
			value={value}
			placeholder="Type delete to confirm"
			onChange={(event) => onChange(event.target.value)}
			className="h-9 rounded-[8px]"
		/>
	</div>
);

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId',
)({
	component: StaffUserDetailsPage,
});

function StaffUserDetailsPage() {
	const { userId } = Route.useParams();
	const { i18n } = useTranslation('common');
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [detailActionError, setDetailActionError] = useState('');
	const [deleteConfirmText, setDeleteConfirmText] = useState('');
	const [isSuspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [shouldLogout, setShouldLogout] = useState(false);
	const suspendUser = useSuspendStaffUserMutation();
	const reactivateUser = useReactivateStaffUserMutation();
	const deleteUser = useDeleteStaffUserMutation();

	const detailQuery = useStaffUserDetailsQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);
	const profilesQuery = useStaffUserProfilesQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);

	if (
		(detailQuery.isError && shouldLogoutForFailure(detailQuery.error)) ||
		(profilesQuery.isError && shouldLogoutForFailure(profilesQuery.error))
	) {
		return <LogoutRedirect />;
	}

	if (detailQuery.isPending) {
		return (
			<div className="mx-auto flex min-h-[50vh] w-full max-w-5xl items-center justify-center px-4 py-12">
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<div className="h-2 w-2 rounded-full bg-primary" />
					<span>Loading staff user…</span>
				</div>
			</div>
		);
	}

	if (detailQuery.isError) {
		if (isProblemStatus(detailQuery.error, 400, MALFORMED_ID_TRANSLATION_KEY)) {
			return (
				<AppErrorView
					icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
					code="400 — Bad Request"
					title="Invalid staff user link"
					description={getFailureDescription(
						detailQuery.error,
						'This staff user link is malformed or incomplete.',
					)}
					testId="staff-user-details-invalid"
				/>
			);
		}

		if (isProblemStatus(detailQuery.error, 403)) {
			return <View403 />;
		}

		if (isProblemStatus(detailQuery.error, 404)) {
			return (
				<AppErrorView
					icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
					code="404 — Not Found"
					title="Staff user not found"
					description={getFailureDescription(
						detailQuery.error,
						'The requested staff user does not exist or is no longer available.',
					)}
					testId="staff-user-details-not-found"
				/>
			);
		}

		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code="500 — Server Error"
				title="Unable to load this staff user"
				description="There was a problem loading the staff user details."
				testId="staff-user-details-error"
			/>
		);
	}

	const user = toStaffUserDetails(detailQuery.data);
	const profiles = toAssignedStaffProfiles(profilesQuery.data);
	if (!user) {
		return (
			<AppErrorView
				icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
				code="404 — Not Found"
				title="Staff user not found"
				description="The staff user payload was empty."
				testId="staff-user-details-empty"
			/>
		);
	}

	if (shouldLogout) {
		return <LogoutRedirect />;
	}

	const normalizedStatus = normalizeStatus(user.status);
	const isActive = normalizedStatus === STAFF_STATUS_ACTIVE;
	const canSuspend = isActive;
	const canReactivate = normalizedStatus === STAFF_STATUS_SUSPENDED;
	const pendingAction = suspendUser.isPending || reactivateUser.isPending;

	const handleLifecycleAction = async () => {
		if (!canSuspend && !canReactivate) {
			setSuspendDialogOpen(false);

			return;
		}

		try {
			setDetailActionError('');
			if (canSuspend) {
				await suspendUser.mutateAsync({ userId });
			} else if (canReactivate) {
				await reactivateUser.mutateAsync({ userId });
			}

			await queryClient.invalidateQueries({
				queryKey: ['staff', 'staff-users'],
			});
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setDetailActionError(
				getFailureMessage(toApiFailure(error), {
					fallback: canSuspend
						? 'Unable to suspend this staff user.'
						: 'Unable to reactivate this staff user.',
				}),
			);
		} finally {
			setSuspendDialogOpen(false);
		}
	};

	const handleDeleteAction = async () => {
		try {
			setDetailActionError('');
			await deleteUser.mutateAsync({ userId });
		} catch (error) {
			if (shouldLogoutForFailure(error)) {
				setShouldLogout(true);
				return;
			}

			setDetailActionError(
				getFailureMessage(toApiFailure(error), {
					fallback: 'Unable to delete this staff user.',
				}),
			);
			return;
		} finally {
			setDeleteDialogOpen(false);
			setDeleteConfirmText('');
		}

		try {
			await navigate({ to: '/staff/staff-users' });
		} catch (error) {
			// navigation rejection after successful delete — don't reuse failure message
			logger.warn('Staff user delete navigation failed', error);
		}

		queryClient.removeQueries({
			queryKey: ['staff', ...STAFF_USER_DETAILS_QUERY_KEY],
		});
		void queryClient.invalidateQueries({
			queryKey: ['staff', ...STAFF_USERS_QUERY_KEY],
		});
	};

	const isDeleteConfirmReady =
		deleteConfirmText.trim().toLowerCase() === 'delete';
	const maxProfilesPerUser = profilesQuery.data?.maxProfilesPerUser;
	const profilesHasError =
		profilesQuery.isError && !shouldLogoutForFailure(profilesQuery.error);

	return (
		<div className="space-y-5" data-testid="staff-user-details-page">
			<div className="space-y-3">
				<Link
					to="/staff/staff-users"
					className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<IconChevronLeft className="size-3" />
					Back to staff users
				</Link>
				<div className="space-y-1">
					<nav
						aria-label="Breadcrumb"
						className="text-[13px] text-muted-foreground"
					>
						<span>Staff</span>
						<span className="mx-1 text-[var(--publy-foreground-subtle)]">
							›
						</span>
						<Link to="/staff/staff-users" className="hover:text-foreground">
							Users
						</Link>
						<span className="mx-1 text-[var(--publy-foreground-subtle)]">
							›
						</span>
						<span className="text-foreground">{user.displayName}</span>
					</nav>
				</div>
			</div>
			<div className="space-y-1">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-start gap-3">
						<div className="h-14 w-14">
							<InitialsAvatar name={user.displayName} size="lg" />
						</div>
						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-2">
								<h1 className="text-[22px] font-semibold leading-7 tracking-[-0.01em] text-foreground">
									{user.displayName}
								</h1>
								{user.accountLevel ? (
									<StatusPill tone="neutral">{user.accountLevel}</StatusPill>
								) : null}
								{user.status ? (
									<StatusPill tone={statusPillTone(user.status)}>
										{user.status}
									</StatusPill>
								) : null}
							</div>
							<p className="max-w-3xl text-[13px] text-muted-foreground">
								{user.email || 'No email address'}
							</p>
						</div>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						{/* TODO(contract): wire reset-invite endpoint when available */}
						<Button type="button" variant="outline" size="sm" disabled>
							<IconMail className="size-4" />
							Reset invite
						</Button>
						<Link
							to="/staff/staff-users/$userId/edit"
							params={{ userId }}
							className={buttonVariants({ variant: 'outline', size: 'sm' })}
						>
							<IconPencil className="size-4" />
							Edit
						</Link>
						<Button
							type="button"
							variant="outline"
							className="h-9 rounded-[12px] border-destructive/30 bg-[var(--publy-danger-soft)] text-destructive hover:bg-[color-mix(in_srgb,var(--publy-danger)_16%,transparent)]"
							onClick={() => {
								if (canSuspend || canReactivate) {
									setSuspendDialogOpen(true);
								}
							}}
							disabled={!canSuspend && !canReactivate}
						>
							<IconLock className="size-4" />
							{getSuspendLabel(user.status)}
						</Button>
						<ConfirmDialog
							isOpen={isSuspendDialogOpen}
							title={getSuspendDescription(user.status).title}
							description={getSuspendDescription(user.status).description}
							confirmLabel={getSuspendLabel(user.status)}
							isPending={pendingAction}
							onConfirm={() => {
								void handleLifecycleAction();
							}}
							onOpenChange={(nextOpen) => {
								setSuspendDialogOpen(nextOpen);
							}}
						>
							<ConfirmHeaderInfo
								name={user.displayName}
								email={user.email || 'No email'}
								avatarSeed={user.displayName}
							/>
						</ConfirmDialog>
						<DataTableRowActions
							ariaLabel="User actions"
							testId="staff-user-actions-menu"
						>
							<DropdownMenuItem
								variant="destructive"
								onClick={() => {
									setDeleteDialogOpen(true);
								}}
							>
								<IconTrash className="size-4" />
								Delete
							</DropdownMenuItem>
						</DataTableRowActions>
					</div>
				</div>

				<Tabs defaultValue="overview">
					<TabsList variant="line">
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="permissions">Permissions</TabsTrigger>
						<TabsTrigger value="activity">Activity</TabsTrigger>
						<TabsTrigger value="settings">Settings</TabsTrigger>
					</TabsList>

					<div className="mt-5">
						<TabsContent value="overview">
							<DetailGrid>
								<DetailMain>
									<ContactDetailsCard details={user} locale={i18n.language} />
									{profilesHasError ? (
										<div
											data-testid="staff-user-profiles-error"
											className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)] text-sm text-muted-foreground"
										>
											Unable to load assigned profiles.
										</div>
									) : (
										<AssignedProfilesCard
											profiles={profiles}
											maxProfiles={maxProfilesPerUser ?? 0}
										/>
									)}
								</DetailMain>
								<DetailAside>
									<AccountCard displayId={user.id} />
									<RecentSecurityCard />
									<DangerZoneCard title="Danger zone">
										<DangerZoneRow
											title="Suspend or reactivate"
											description={
												getSuspendDescription(user.status).description
											}
											action={
												<Button
													type="button"
													className="publy-danger-action"
													variant="secondary"
													onClick={() => {
														setSuspendDialogOpen(true);
													}}
													disabled={!canSuspend && !canReactivate}
												>
													{getSuspendLabel(user.status)}
												</Button>
											}
										/>
										<DangerZoneRow
											title="Delete user"
											description="This permanently removes the staff user and cannot be undone."
											action={
												<Button
													type="button"
													variant="destructive"
													className="publy-danger-action"
													onClick={() => {
														setDeleteDialogOpen(true);
													}}
													disabled={deleteUser.isPending}
												>
													Delete
												</Button>
											}
										/>
									</DangerZoneCard>
								</DetailAside>
							</DetailGrid>
						</TabsContent>
						<TabsContent value="permissions">
							<div className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)]">
								<p className="text-sm text-muted-foreground">
									This tab is intentionally kept minimal in this handoff scope.
								</p>
							</div>
						</TabsContent>
						<TabsContent value="activity">
							<div className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)]">
								<p className="text-sm text-muted-foreground">
									This tab is intentionally kept minimal in this handoff scope.
								</p>
							</div>
						</TabsContent>
						<TabsContent value="settings">
							<div className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)]">
								<p className="text-sm text-muted-foreground">
									This tab is intentionally kept minimal in this handoff scope.
								</p>
							</div>
						</TabsContent>

						{detailActionError ? (
							<div className="mt-2 text-sm text-destructive" role="alert">
								{detailActionError}
							</div>
						) : null}
					</div>
				</Tabs>
			</div>

			<ConfirmDialog
				isOpen={isDeleteDialogOpen}
				title="Delete staff user"
				description="Deleting this staff user is permanent and can’t be undone. Reassign ownership and project responsibilities first."
				confirmLabel="Delete"
				tone="danger"
				isPending={deleteUser.isPending}
				isConfirmDisabled={!isDeleteConfirmReady}
				onConfirm={() => {
					if (isDeleteConfirmReady) {
						void handleDeleteAction();
					}
				}}
				onOpenChange={(isOpen) => {
					setDeleteDialogOpen(isOpen);
					if (!isOpen) {
						setDeleteConfirmText('');
					}
				}}
			>
				<div className="space-y-2">
					<ConfirmHeaderInfo
						name={user.displayName}
						email={user.email}
						avatarSeed={user.displayName}
					/>
					<DeleteConfirmField
						value={deleteConfirmText}
						onChange={(next) => {
							setDeleteConfirmText(next);
						}}
					/>
				</div>
			</ConfirmDialog>
		</div>
	);
}
