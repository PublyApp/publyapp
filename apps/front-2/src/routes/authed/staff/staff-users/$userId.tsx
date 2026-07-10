import {
	IconAlertCircle,
	IconCirclePlus,
	IconDots,
	IconId,
	IconLock,
	IconMail,
	IconShieldCheck,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DangerZoneCard,
	DangerZoneRow,
	DetailAside,
	DetailGrid,
	DetailMain,
} from '~/components/ui/detail-layout';
import { InitialsAvatar } from '~/components/ui/initials-avatar';
import { Input } from '~/components/ui/input';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import {
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

const AssignedProfilesCard = ({
	profiles,
	totalPermissions,
}: {
	profiles: AssignedStaffProfile[];
	totalPermissions: number;
}) => (
	<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
		<div className="publy-card-header">
			<p className="publy-type-section-title">Assigned profiles & roles</p>
			<span className="text-xs text-muted-foreground">
				{profiles.length} assigned
			</span>
		</div>
		<div className="px-4 pb-4 pt-3 space-y-4">
			{profiles.length === 0 ? (
				<div className="rounded-large border border-dashed border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
					No profiles are currently assigned.
				</div>
			) : (
				<div className="space-y-2">
					{profiles.map((profile, index) => (
						<div
							key={profile.id}
							className="flex items-center justify-between gap-3 rounded-[10px] px-1 py-1"
						>
							<div className="flex min-w-0 items-center gap-2.5">
								<span
									aria-hidden="true"
									className="publy-icon-tile inline-flex h-7 w-7 items-center justify-center rounded-[9px]"
									data-tone={index % 2 === 0 ? 'success' : 'info'}
								>
									<IconId className="size-4" />
								</span>
								<div className="min-w-0">
									<p className="text-sm font-medium text-foreground">
										{profile.name}
									</p>
									<p className="text-xs text-muted-foreground">
										{profile.description ?? 'No description'}
									</p>
								</div>
							</div>
							<div className="shrink-0 text-right text-xs text-muted-foreground">
								<span>{Math.min(3, totalPermissions)} permissions</span>
								<div className="mt-1 text-[11px]">
									<BadgeLikeTone tone={index % 2 === 0 ? 'primary' : 'success'}>
										Role
									</BadgeLikeTone>
								</div>
							</div>
						</div>
					))}
				</div>
			)}
			<div className="rounded-[9px] border border-border bg-background p-2">
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>Permission summary</span>
					<span>
						{totalPermissions} of {totalPermissions || 0}
					</span>
				</div>
				<div className="mt-2 h-1 rounded-[4px] bg-[var(--publy-row-border)]">
					<div
						className="h-full rounded-[4px] bg-[var(--publy-primary)]"
						style={{ width: `${Math.min(totalPermissions, 100)}%` }}
					/>
				</div>
			</div>
		</div>
	</section>
);

const RecentSecurityCard = () => (
	<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
		<div className="publy-card-header">
			<p className="publy-type-section-title">Recent security activity</p>
		</div>
		<div className="px-4 pb-4 pt-3 space-y-3 text-sm text-foreground">
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="size-1.5 rounded-[3px] bg-emerald-500" />
					<span>Password changed</span>
				</div>
				<span className="text-xs text-muted-foreground">2h ago</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="size-1.5 rounded-[3px] bg-amber-500" />
					<span>New session from new device</span>
				</div>
				<span className="text-xs text-muted-foreground">1d ago</span>
			</div>
			<div className="flex items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<span className="size-1.5 rounded-[3px] bg-muted" />
					<span>No critical events</span>
				</div>
			</div>
		</div>
	</section>
);

const getBadgeTone = (tone: 'primary' | 'success' | 'warning' | 'danger') =>
	({
		primary: {
			bg: 'bg-[var(--publy-primary-soft)]',
			text: 'text-[var(--publy-primary-foreground)]',
		},
		success: {
			bg: 'bg-[var(--publy-chip-active-bg)]',
			text: 'text-[var(--publy-chip-active-text)]',
		},
		warning: {
			bg: 'bg-[var(--publy-chip-pending-bg)]',
			text: 'text-[var(--publy-chip-pending-text)]',
		},
		danger: {
			bg: 'bg-destructive/10',
			text: 'text-destructive',
		},
	})[tone];

const BadgeLikeTone = ({
	tone,
	children,
}: {
	tone: 'primary' | 'success' | 'warning' | 'danger';
	children: React.ReactNode;
}) => {
	const toneClass = getBadgeTone(tone);

	return (
		<span
			className={`${toneClass.bg} ${toneClass.text} inline-flex h-[20px] rounded-[8px] px-2 text-[11px] font-medium`}
		>
			{children}
		</span>
	);
};

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
						<div className="flex items-center gap-2">
							<IconShieldCheck className="size-4 text-emerald-600" />
							<BadgeLikeTone tone="success">Enabled</BadgeLikeTone>
						</div>
					}
				/>
				<DetailMetaItem label="Sessions" value="2 active sessions" />
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
			<InitialsAvatar name={avatarSeed} size="lg" />
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
			To delete this account, type <span className="font-mono">delete</span>
			in the field below.
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
	const [detailActionError, setDetailActionError] = useState('');
	const [deleteConfirmText, setDeleteConfirmText] = useState('');
	const [isSuspendDialogOpen, setSuspendDialogOpen] = useState(false);
	const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [activeTab, setActiveTab] = useState<
		'overview' | 'permissions' | 'activity' | 'settings'
	>('overview');
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
			await queryClient.invalidateQueries({
				queryKey: ['staff', 'staff-users'],
			});
			window.history.replaceState({}, '', '/staff/staff-users');
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
		} finally {
			setDeleteDialogOpen(false);
			setDeleteConfirmText('');
		}
	};

	const tabs = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'permissions', label: 'Permissions' },
		{ id: 'activity', label: 'Activity' },
		{ id: 'settings', label: 'Settings' },
	] as const;

	const isDeleteConfirmReady =
		deleteConfirmText.trim().toLowerCase() === 'delete';
	const maxProfilesPerUser =
		(profilesQuery.data?.maxProfilesPerUser as number | undefined) ?? 0;
	const profilesHasError =
		profilesQuery.isError && !shouldLogoutForFailure(profilesQuery.error);

	return (
		<div className="space-y-5" data-testid="staff-user-details-page">
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
						{/* TODO(2d): edit form screen (future packet); route not yet registered */}
						<Button
							type="button"
							variant="outline"
							size="sm"
							render={
								<Link to={`/staff/staff-users/${userId}/edit` as never} />
							}
						>
							<IconCirclePlus className="size-4" />
							Edit
						</Button>
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
						<Button
							type="button"
							variant="outline"
							className="h-9 w-9 rounded-[999px]"
							aria-label="User actions"
							onClick={() => {
								setDeleteDialogOpen(true);
							}}
						>
							<IconDots className="size-4" />
						</Button>
					</div>
				</div>

				<div className="publy-section-tabs" role="tablist">
					{tabs.map((tab) => (
						<button
							type="button"
							role="tab"
							aria-selected={activeTab === tab.id}
							className="publy-section-tab"
							data-active={activeTab === tab.id ? 'true' : undefined}
							onClick={() => setActiveTab(tab.id)}
						>
							{tab.label}
						</button>
					))}
				</div>

				<div className="mt-5">
					{activeTab === 'overview' ? (
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
										totalPermissions={Math.max(0, maxProfilesPerUser)}
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
											canSuspend || canReactivate
												? canSuspend
													? `Suspend account ${user.displayName}.`
													: `Reactivate account ${user.displayName}.`
												: 'Status actions are currently unavailable.'
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
					) : (
						<div className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] p-4 shadow-[var(--publy-shadow-ring)]">
							<p className="text-sm text-muted-foreground">
								This tab is intentionally kept minimal in this handoff scope.
							</p>
						</div>
					)}

					{detailActionError ? (
						<div className="mt-2 text-sm text-destructive" role="status">
							{detailActionError}
						</div>
					) : null}
				</div>
			</div>

			<ConfirmDialog
				isOpen={isDeleteDialogOpen}
				title="Delete staff user"
				description="Deleting this staff user is permanent and can’t be undone. Reassign ownership and project responsibilities first."
				confirmLabel="Delete"
				tone="danger"
				isPending={deleteUser.isPending || !isDeleteConfirmReady}
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
