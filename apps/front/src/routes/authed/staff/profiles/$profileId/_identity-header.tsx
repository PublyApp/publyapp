import { IconPencil } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { deriveProfileCardStyle } from '~/lib/profiles/profile-card-style';
import type { StaffProfileDetails } from '~/lib/query/staff-profiles';

// Extracted from the details route so the route file stays component-only
// and small (react-doctor `no-multi-component-file` / `no-giant-component`).
export const StaffProfileIdentityHeader = ({
	details,
	profileId,
	assignedCount,
	onEdit,
}: {
	details: StaffProfileDetails;
	profileId: string;
	assignedCount: number;
	onEdit?: () => void;
}) => {
	const { t } = useTranslation('common');

	// #980: the tile shows the persisted style; the helper falls back to the
	// deterministic derivation when the profile stores none.
	const { Icon: ProfileIcon, tone: profileTone } = deriveProfileCardStyle(
		details.name,
		details.icon,
		details.iconTone,
	);

	return (
		<div
			className="flex items-start justify-between gap-4 mb-8"
			data-testid="staff-profile-identity-header"
		>
			<div className="flex min-w-0 items-center gap-4">
				<div className="publy-profile-detail-tile" data-tone={profileTone}>
					<ProfileIcon aria-hidden="true" className="size-[26px]" />
				</div>
				<div className="flex min-w-0 flex-col gap-[5px]">
					<div className="flex min-w-0 items-center gap-2.5">
						<h1
							className="publy-type-detail-title min-w-0 truncate"
							title={details.name || undefined}
						>
							{details.name}
						</h1>
						<span className="publy-detail-chip publy-detail-chip--outline shrink-0">
							{t('profile')}
						</span>
					</div>
					<div className="flex min-w-0 items-center gap-1 text-[13px] text-[var(--publy-foreground-muted)]">
						<span
							className="min-w-0 truncate"
							title={details.description || undefined}
						>
							{details.description || t('no-description')}
						</span>
						<span className="shrink-0 whitespace-nowrap">
							{details.userAccountCount === null ? null : (
								<>
									{' · '}
									{t('profile-member-count', {
										count: details.userAccountCount,
									})}
								</>
							)}
							{' · '}
							{t('assigned-permissions-count', { count: assignedCount })}
						</span>
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2.5">
				{onEdit ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onEdit}
						data-testid="staff-profile-edit-button"
						aria-label={t('edit-profile-aria-label')}
					>
						<IconPencil aria-hidden="true" className="size-4" />
						{t('edit')}
					</Button>
				) : null}
				<Link
					to="/staff/profiles/$profileId/users"
					params={{ profileId }}
					className="inline-flex items-center gap-1.5 rounded-[var(--publy-radius-control)] border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
				>
					{t('view-all-assigned-users')}
				</Link>
			</div>
		</div>
	);
};
