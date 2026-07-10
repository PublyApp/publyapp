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
			{count !== undefined ? (
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

export const ActionCluster = ({ children }: { children: ReactNode }) => (
	<div className="publy-action-cluster">{children}</div>
);

export const MetricTile = ({
	label,
	value,
	helper,
}: {
	label: string;
	value: ReactNode;
	helper?: string;
}) => (
	<div className="publy-metric-tile">
		<div className="publy-type-stat-label">{label}</div>
		<div className="publy-type-stat-value">{value}</div>
		{helper ? <div className="publy-type-helper">{helper}</div> : null}
	</div>
);

export const StatusPill = ({
	children,
	tone = 'neutral',
}: {
	children: ReactNode;
	tone?: 'danger' | 'info' | 'neutral' | 'primary' | 'success' | 'warning';
}) => (
	<span className="publy-status-pill" data-tone={tone}>
		{children}
	</span>
);

export const MetadataCard = ({
	title,
	children,
}: {
	title?: string;
	children: ReactNode;
}) => (
	<section className="publy-metadata-card">
		{title ? <h2 className="publy-type-section-title">{title}</h2> : null}
		<div className="publy-metadata-rows">{children}</div>
	</section>
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
