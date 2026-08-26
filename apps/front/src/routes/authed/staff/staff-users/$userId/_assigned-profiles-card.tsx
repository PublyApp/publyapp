import { IconId } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { AssignedStaffProfile } from '~/lib/query/staff-users';

export const AssignedProfilesCard = ({
	profiles,
	maxProfiles,
}: {
	profiles: AssignedStaffProfile[];
	maxProfiles: number;
}) => {
	const { t } = useTranslation(['staff-users', 'common']);
	const assignedCount = profiles.length;
	const meterPercent =
		maxProfiles > 0 ? Math.min((assignedCount / maxProfiles) * 100, 100) : 0;

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">
					{t('assigned-profiles-and-roles')}
				</p>
				<span className="text-xs text-muted-foreground">
					{t('assigned-count', { count: assignedCount })}
				</span>
			</div>
			<div className="px-4 pb-4 pt-3 space-y-4">
				{profiles.length === 0 ? (
					<div className="rounded-large border border-dashed border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
						{t('no-profiles-assigned')}
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
									>
										<IconId className="size-4" />
									</span>
									<div className="min-w-0">
										<Link
											to="/staff/profiles/$profileId"
											params={{ profileId: profile.id }}
											className="text-sm font-medium text-foreground hover:underline"
										>
											{profile.name ?? t('common:unnamed-profile')}
										</Link>
										<p
											className="truncate text-xs text-muted-foreground"
											title={profile.description || undefined}
										>
											{profile.description ??
												t('common:no-description-provided')}
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
							<span>{t('profile-summary')}</span>
							<span>
								{t('count-of-max', { count: assignedCount, max: maxProfiles })}
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
