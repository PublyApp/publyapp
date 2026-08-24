import type * as React from 'react';
import { cn } from '~/lib/utils';

/**
 * Detail-page foundations from the handoff (artboards 2c/3b): the
 * `1fr / 420px` body grid (owner-approved 2026-07-10 deviation from the
 * spec's `1fr / 372px`) and the rose-ringed danger-zone card with
 * soft-destructive row actions. The 1440px page measure lives one level up,
 * on `.publy-detail-page` (owner decision R2-4), not on the grid itself.
 * Values live in app.css (`.publy-detail-*`, `.publy-danger-*`).
 */

const DetailGrid = ({ className, ...props }: React.ComponentProps<'div'>) => {
	return (
		<div
			data-slot="detail-grid"
			className={cn('publy-detail-grid', className)}
			{...props}
		/>
	);
};

const DetailMain = ({ className, ...props }: React.ComponentProps<'div'>) => {
	return <div data-slot="detail-main" className={className} {...props} />;
};

const DetailAside = ({
	className,
	...props
}: React.ComponentProps<'aside'>) => {
	return <aside data-slot="detail-aside" className={className} {...props} />;
};

const DangerZoneCard = ({
	title,
	className,
	children,
	...props
}: React.ComponentProps<'section'> & { title: string }) => {
	return (
		<section
			data-slot="danger-zone"
			className={cn('publy-danger-zone', className)}
			{...props}
		>
			<h2 className="publy-danger-zone-title">{title}</h2>
			{children}
		</section>
	);
};

const DangerZoneRow = ({
	title,
	description,
	action,
}: {
	title: string;
	description?: string;
	action: React.ReactNode;
}) => {
	return (
		<div data-slot="danger-zone-row" className="publy-danger-zone-row">
			<div className="flex min-w-0 flex-col gap-px">
				<span className="publy-danger-zone-row-title">{title}</span>
				{description ? (
					<span className="publy-danger-zone-row-description">
						{description}
					</span>
				) : null}
			</div>
			<div className="shrink-0">{action}</div>
		</div>
	);
};

export { DangerZoneCard, DangerZoneRow, DetailAside, DetailGrid, DetailMain };
