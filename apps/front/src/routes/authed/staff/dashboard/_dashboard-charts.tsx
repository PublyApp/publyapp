import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';

import { UNKNOWN_VALUE, formatCount, formatShare } from './_dashboard-format';

/**
 * The dashboard's chart set (§5.2): the prototype draws its figures as inline
 * SVG (`redesign/dashboard.css`), so no chart library is added. Every
 * component takes the series it is given — the caller decides what the API
 * actually provides; a series that exists but is empty still draws its real
 * shapes with real zeros, never « — ».
 */

export type DonutSegment = {
	label: string;
	value: number;
	color: string;
};

type BarRow = {
	label: string;
	value: number;
	/** Optional trailing figure (« 15 · 63 % »). */
	detail?: string;
	color: string;
};

const UnknownValue = ({ testId }: { testId?: string }) => (
	<span
		className="text-sm text-muted-foreground"
		data-testid={testId}
		title={UNKNOWN_VALUE}
	>
		{UNKNOWN_VALUE}
	</span>
);

/** The status donut: one `pathLength=100` circle per segment. */
export const DonutChart = ({
	segments,
	total,
	totalLabel,
	locale,
	testId,
}: {
	segments: readonly DonutSegment[];
	total: number;
	totalLabel: string;
	locale: string;
	testId?: string;
}) => {
	if (segments.length === 0) {
		return (
			<div className="flex h-[172px] items-center justify-center">
				<UnknownValue testId={testId} />
			</div>
		);
	}

	let offset = 0;
	const circles = segments.map((segment) => {
		// A real empty collection draws the bare track and a real 0 in the
		// middle — never « — », which means "the API has no such series".
		const share = total > 0 ? (segment.value / total) * 100 : 0;
		const circle = (
			<circle
				key={segment.label}
				cx="86"
				cy="86"
				r="74"
				pathLength="100"
				fill="none"
				stroke={segment.color}
				strokeWidth="20"
				strokeDasharray={`${share} ${100 - share}`}
				strokeDashoffset={-offset}
				className="transition-[stroke-width] hover:stroke-[24]"
			>
				<title>{`${segment.label} · ${formatCount(segment.value, locale)} · ${formatShare(segment.value, total, locale)}`}</title>
			</circle>
		);
		offset += share;
		return circle;
	});

	return (
		<div className="flex flex-col" data-testid={testId}>
			<div className="flex justify-center pt-0.5 pb-1">
				<svg
					className="h-auto w-full max-w-[172px]"
					viewBox="0 0 172 172"
					role="img"
					aria-label={totalLabel}
				>
					<g
						style={{
							transform: 'rotate(-90deg)',
							transformOrigin: '86px 86px',
						}}
					>
						<circle
							cx="86"
							cy="86"
							r="74"
							fill="none"
							stroke="var(--publy-chart-track)"
							strokeWidth="20"
						/>
						{circles}
					</g>
					<text
						x="86"
						y="84"
						textAnchor="middle"
						fontSize="26"
						fontWeight="600"
						fill="var(--publy-foreground)"
					>
						{formatCount(total, locale)}
					</text>
					<text
						x="86"
						y="102"
						textAnchor="middle"
						fontSize="11"
						fill="var(--publy-foreground-muted)"
					>
						{totalLabel}
					</text>
				</svg>
			</div>
			<div className="flex flex-col pt-1.5">
				{segments.map((segment) => (
					<div
						key={segment.label}
						className="flex w-full items-center gap-2 border-t border-(--publy-row-border) py-2 text-xs leading-[1.45] text-(--publy-foreground-secondary) first:border-t-0"
					>
						<span
							className="size-2.5 shrink-0 rounded-[3px]"
							style={{ backgroundColor: segment.color }}
						/>
						<span>{segment.label}</span>
						<span className="ml-auto font-mono text-(--publy-foreground-muted) tabular-nums">
							{formatCount(segment.value, locale)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};

/** The invitation-outcome horizontal bars (« 15 · 63 % »). */
export const HorizontalBars = ({
	rows,
	locale,
	testId,
}: {
	rows: readonly BarRow[];
	locale: string;
	testId?: string;
}) => {
	if (rows.length === 0) {
		return <UnknownValue testId={testId} />;
	}

	const max = Math.max(...rows.map((row) => row.value), 1);

	return (
		<div className="flex flex-col gap-[15px]" data-testid={testId}>
			{rows.map((row) => (
				<div key={row.label}>
					<div className="mb-1.5 flex items-baseline justify-between gap-3">
						<span className="text-[13px] font-medium">{row.label}</span>
						<span className="font-mono text-xs text-muted-foreground tabular-nums">
							{formatCount(row.value, locale)}
							{row.detail ? ` · ${row.detail}` : ''}
						</span>
					</div>
					<div className="h-2.5 rounded-[3px] bg-(--publy-chart-track)">
						<span
							className="block h-2.5 rounded-[3px]"
							style={{
								width: `${(row.value / max) * 100}%`,
								backgroundColor: row.color,
							}}
						/>
					</div>
				</div>
			))}
		</div>
	);
};

export const ChartBody = ({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) => (
	<div
		className={cn(
			'flex flex-1 flex-col justify-center px-4 pt-3.5 pb-4',
			className,
		)}
	>
		{children}
	</div>
);

/** The card's note: the caller's desc wrapper already carries the prototype's
 * 16px inline padding, so the note itself stays unpadded (#2339 fidelity). */
export const ChartNote = ({ children }: { children: ReactNode }) => (
	<p className="text-[12px] leading-[1.45] text-(--publy-foreground-muted)">
		{children}
	</p>
);

export const ChartTable = ({
	head,
	rows,
}: {
	head: readonly string[];
	rows: ReadonlyArray<readonly ReactNode[]>;
}) => (
	<table className="w-full border-collapse text-[13px]">
		<thead>
			<tr>
				{head.map((label, index) => (
					<th
						key={label}
						scope="col"
						className={cn(
							'border-b border-(--publy-row-border) pb-1.5 text-[11px] font-medium tracking-[0.04em] text-(--publy-foreground-subtle) uppercase',
							index === 0 ? 'text-left' : 'text-right font-mono',
						)}
					>
						{label}
					</th>
				))}
			</tr>
		</thead>
		<tbody>
			{rows.map((row, rowIndex) => (
				<tr key={rowIndex}>
					{row.map((cell, cellIndex) => (
						<td
							key={cellIndex}
							className={cn(
								'border-t border-(--publy-row-border) py-2',
								cellIndex === 0
									? 'text-left'
									: 'text-right font-mono text-(--publy-foreground-muted) tabular-nums',
							)}
						>
							{cell}
						</td>
					))}
				</tr>
			))}
		</tbody>
	</table>
);
