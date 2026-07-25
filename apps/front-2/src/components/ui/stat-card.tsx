import type { ReactNode } from 'react';

/**
 * Shared stat card for detail-page headers (tenant detail, tenant-profile
 * Overview). Renders the `.publy-stat-card` family from styles/app.css: a
 * label + icon header, a large value (with optional suffix via
 * `.publy-stat-card-value-suffix` in `children`), and a secondary row for
 * meters, avatar stacks, pills, or links. Extracted from the tenant detail
 * page so both surfaces stay pixel-identical instead of drifting copies.
 */
export const StatCard = ({
	testId,
	label,
	icon,
	secondary,
	children,
}: {
	testId: string;
	label: string;
	icon: ReactNode;
	secondary: ReactNode;
	children: ReactNode;
}) => (
	<div className="publy-stat-card" data-testid={testId}>
		<div className="publy-stat-card-header">
			<span className="publy-stat-card-label">{label}</span>
			<span className="publy-stat-card-icon" aria-hidden="true">
				{icon}
			</span>
		</div>
		<div className="publy-stat-card-inner">
			<p className="publy-stat-card-value">{children}</p>
			<div className="publy-stat-card-secondary">{secondary}</div>
		</div>
	</div>
);
