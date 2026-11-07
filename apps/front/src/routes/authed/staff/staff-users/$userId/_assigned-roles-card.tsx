import { IconId } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { AssignedStaffRole } from '~/lib/query/staff-users';

export const AssignedRolesCard = ({
	roles,
	maxRoles,
}: {
	roles: AssignedStaffRole[];
	maxRoles: number;
}) => {
	const { t } = useTranslation(['staff-users', 'common']);
	const assignedCount = roles.length;
	const meterPercent =
		maxRoles > 0 ? Math.min((assignedCount / maxRoles) * 100, 100) : 0;

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">
					{t('assigned-roles-and-roles')}
				</p>
				<span className="text-xs text-muted-foreground">
					{t('assigned-count', { count: assignedCount })}
				</span>
			</div>
			<div className="px-4 pb-4 pt-3 space-y-4">
				{roles.length === 0 ? (
					<div className="rounded-large border border-dashed border-border bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
						{t('no-roles-assigned')}
					</div>
				) : (
					<div className="space-y-2">
						{roles.map((role) => (
							<div
								key={role.id}
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
											to="/staff/roles/$roleId"
											params={{ roleId: role.id }}
											className="text-sm font-medium text-foreground hover:underline"
										>
											{role.name ?? t('common:unnamed-role')}
										</Link>
										<p
											className="truncate text-xs text-muted-foreground"
											title={role.description || undefined}
										>
											{role.description ?? t('common:no-description-provided')}
										</p>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
				{maxRoles > 0 ? (
					<div className="rounded-[9px] border border-border bg-background p-2">
						<div className="flex items-center justify-between text-xs text-muted-foreground">
							<span>{t('role-summary')}</span>
							<span>
								{t('count-of-max', { count: assignedCount, max: maxRoles })}
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
