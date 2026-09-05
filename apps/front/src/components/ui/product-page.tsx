import type { ReactNode } from 'react';

export const PageHeader = ({
	title,
	description,
	actions,
	count,
}: {
	title: string;
	description?: string;
	actions?: ReactNode;
	/** Count badge rendered beside the title inside a shared flex wrapper. */
	count?: ReactNode;
}) => (
	<header className="publy-page-header">
		<div className="min-w-0">
			{count ? (
				<div className="flex items-center gap-2.5">
					<h1 className="publy-type-page-title">{title}</h1>
					{count}
				</div>
			) : (
				<h1 className="publy-type-page-title">{title}</h1>
			)}
			{description ? (
				<p className="publy-type-helper mt-1">{description}</p>
			) : null}
		</div>
		{actions ? <div className="publy-action-cluster">{actions}</div> : null}
	</header>
);

export const StatusPill = ({
	children,
	tone = 'neutral',
	testId,
}: {
	children: ReactNode;
	tone?: 'danger' | 'info' | 'neutral' | 'primary' | 'success' | 'warning';
	/** Optional test-id passthrough so consumers can pin a stable selector
	 * without wrapping the pill (mirrors the pattern used by other product
	 * primitives such as PageHeader). */
	testId?: string;
}) => (
	<span className="publy-status-pill" data-tone={tone} data-testid={testId}>
		{children}
	</span>
);

export const DetailRow = ({
	label,
	value,
}: {
	label: string;
	value: ReactNode;
}) => (
	<div className="publy-detail-row">
		<div className="publy-type-metadata-label">{label}</div>
		<div className="publy-type-metadata-value">{value}</div>
	</div>
);

export const PillTabs = ({ children }: { children: ReactNode }) => (
	<div className="publy-pill-tabs">{children}</div>
);
