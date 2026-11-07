import { IconPencil } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import type { StaffRoleDetails } from '~/lib/query/staff-roles';
import { deriveRoleCardStyle } from '~/lib/roles/role-card-style';

// Extracted from the details route so the route file stays component-only
// and small (react-doctor `no-multi-component-file` / `no-giant-component`).
export const StaffRoleIdentityHeader = ({
	details,
	roleId,
	assignedCount,
	onEdit,
}: {
	details: StaffRoleDetails;
	roleId: string;
	assignedCount: number;
	onEdit?: () => void;
}) => {
	const { t } = useTranslation('common');

	// #980: the tile shows the persisted style; the helper falls back to the
	// deterministic derivation when the role stores none.
	const { Icon: RoleIcon, tone: roleTone } = deriveRoleCardStyle(
		details.name,
		details.icon,
		details.iconTone,
	);

	return (
		<div
			className="flex items-start justify-between gap-4 mb-8"
			data-testid="staff-role-identity-header"
		>
			<div className="flex min-w-0 items-center gap-4">
				<div className="publy-role-detail-tile" data-tone={roleTone}>
					<RoleIcon aria-hidden="true" className="size-[26px]" />
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
							{t('role')}
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
									{t('role-member-count', {
										count: details.userAccountCount,
									})}
								</>
							)}
							{' · '}
							{details.isFullAccess
								? t('full-access')
								: t('assigned-permissions-count', { count: assignedCount })}
						</span>
					</div>
				</div>
			</div>
			<div className="flex items-center gap-2.5">
				{onEdit && !details.isFullAccess ? (
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onEdit}
						data-testid="staff-role-edit-button"
						aria-label={t('edit-role-aria-label')}
					>
						<IconPencil aria-hidden="true" className="size-4" />
						{t('edit')}
					</Button>
				) : null}
				<Link
					to="/staff/roles/$roleId/users"
					params={{ roleId }}
					className="inline-flex items-center gap-1.5 rounded-[var(--publy-radius-control)] border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
				>
					{t('view-all-assigned-users')}
				</Link>
			</div>
		</div>
	);
};
