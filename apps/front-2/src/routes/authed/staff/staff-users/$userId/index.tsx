import { IconId } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '~/components/ui/button';
import {
	DangerZoneCard,
	DangerZoneRow,
	DetailAside,
	DetailGrid,
	DetailMain,
} from '~/components/ui/detail-layout';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import type { AssignedStaffProfile } from '~/lib/query/staff-users';

import { useStaffUserOverviewContext } from './_overview-context';

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
										<p
											className="truncate text-xs text-muted-foreground"
											title={profile.description || undefined}
										>
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

export const Route = createFileRoute(
	'/_authed-layout/staff/staff-users/$userId/',
)({
	component: StaffUserOverviewTab,
});

function StaffUserOverviewTab() {
	const {
		user,
		locale,
		profiles,
		profilesHasError,
		maxProfilesPerUser,
		canSuspend,
		canReactivate,
		suspendLabel,
		suspendDescription,
		isDeletePending,
		onOpenSuspendDialog,
		onOpenDeleteDialog,
	} = useStaffUserOverviewContext();

	return (
		<DetailGrid>
			<DetailMain>
				<ContactDetailsCard details={user} locale={locale} />
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
						maxProfiles={maxProfilesPerUser}
					/>
				)}
			</DetailMain>
			<DetailAside>
				<AccountCard displayId={user.id} />
				<RecentSecurityCard />
				<DangerZoneCard title="Danger zone">
					<DangerZoneRow
						title="Suspend or reactivate"
						description={suspendDescription}
						action={
							<Button
								type="button"
								className="publy-danger-action"
								variant="secondary"
								onClick={onOpenSuspendDialog}
								disabled={!canSuspend && !canReactivate}
							>
								{suspendLabel}
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
								onClick={onOpenDeleteDialog}
								disabled={isDeletePending}
							>
								Delete
							</Button>
						}
					/>
				</DangerZoneCard>
			</DetailAside>
		</DetailGrid>
	);
}
