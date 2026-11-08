import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';
import {
	formatMonthShort,
	formatShortDate,
	formatWeekdayShort,
} from '~/utils/format-time';

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
			<div className="flex flex-col pt-1.5" data-testid="donut-legend">
				{segments.map((segment) => (
					<div
						key={segment.label}
						className="flex w-full items-center gap-2 border-t border-(--publy-row-border) py-2 text-xs leading-[1.45] text-(--publy-foreground-secondary) first:border-t-0"
					>
						{/* The same square legend swatch as the heatmap's scale:
						   a 10 px dot with a 3 px radius, not a fully rounded
						   avatar-shaped surface. */}
						<span
							className="size-2.5 shrink-0 rounded-[3px] border-[1.5px]"
							style={{ borderColor: segment.color }}
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

// ---------------------------------------------------------------- real series

export type SeriesPoint = { label: string; value: number };

const SERIES_W = 760;
const SERIES_H = 252;

const axisTicks = (min: number, max: number): number[] => {
	const span = Math.max(max - min, 1);
	return [0, 1, 2, 3].map((index) => Math.round(min + (span * index) / 3));
};

/** The x labels the prototype prints under a line/column chart: first, then
 * roughly a third, two thirds, and last. */
const xAnchor = (index: number, count: number): 'start' | 'middle' | 'end' => {
	if (index === 0) {
		return 'start';
	}
	if (index === count - 1) {
		return 'end';
	}
	return 'middle';
};

const xLabelIndexes = (count: number): number[] => {
	if (count <= 1) {
		return [0];
	}
	return [
		0,
		Math.round((count - 1) / 3),
		Math.round(((count - 1) * 2) / 3),
		count - 1,
	];
};

/** « Croissance », « Événements par jour », « Connexions par jour »: an area
 * line with a 4-tick y axis and 4 x labels, inline SVG (no chart library). */
export const LineChart = ({
	points,
	locale,
	label,
	testId,
}: {
	points: readonly SeriesPoint[];
	locale: string;
	/** The chart's accessible name, translated by the caller. */
	label: string;
	testId?: string;
}) => {
	if (points.length === 0) {
		return <UnknownValue testId={testId} />;
	}

	const values = points.map((point) => point.value);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = Math.max(max - min, 1);
	const plotTop = 12;
	const plotBottom = SERIES_H - 28;
	const x = (index: number): number =>
		points.length === 1
			? SERIES_W / 2
			: 42 + (index / (points.length - 1)) * (SERIES_W - 42);
	const y = (value: number): number =>
		plotBottom - ((value - min) / span) * (plotBottom - plotTop);
	const line = points
		.map(
			(point, index) =>
				`${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)} ${y(point.value).toFixed(1)}`,
		)
		.join(' ');
	const area = `${line} L${x(points.length - 1).toFixed(1)} ${plotBottom} L${x(0).toFixed(1)} ${plotBottom} Z`;
	const ticks = axisTicks(min, max);

	return (
		<svg
			className="w-full"
			viewBox={`0 0 ${SERIES_W} ${SERIES_H}`}
			role="img"
			aria-label={label}
			data-testid={testId}
		>
			{ticks.map((tick) => (
				<g key={tick}>
					<line
						x1="42"
						x2={SERIES_W}
						y1={y(tick)}
						y2={y(tick)}
						stroke="var(--publy-chart-grid)"
						strokeWidth="1"
					/>
					<text
						x="32"
						y={y(tick) + 3.5}
						textAnchor="end"
						fontSize="11"
						fontFamily="var(--publy-font-mono)"
						fill="var(--publy-foreground-subtle)"
					>
						{formatCount(tick, locale)}
					</text>
				</g>
			))}
			<path d={area} fill="var(--publy-chart-1)" opacity="0.1" />
			<path
				d={line}
				fill="none"
				stroke="var(--publy-chart-1)"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{xLabelIndexes(points.length).map((index) => (
				<text
					key={index}
					x={x(index)}
					y={SERIES_H - 4}
					textAnchor={xAnchor(index, points.length)}
					fontSize="11"
					fontFamily="var(--publy-font-mono)"
					fill="var(--publy-foreground-subtle)"
				>
					{points[index].label}
				</text>
			))}
		</svg>
	);
};

/** « Événements d'audit par jour »: one column per day. */
export const ColumnChart = ({
	points,
	locale,
	label,
	testId,
}: {
	points: readonly SeriesPoint[];
	locale: string;
	/** The chart's accessible name, translated by the caller. */
	label: string;
	testId?: string;
}) => {
	if (points.length === 0) {
		return <UnknownValue testId={testId} />;
	}

	const max = Math.max(...points.map((point) => point.value), 1);
	const plotTop = 8;
	const plotBottom = 177;
	const gap = 2;
	// One slot per point, not one `barWidth + gap` per point: at 365 daily
	// points the old 1px floor pushed every bar after ~240 outside the
	// viewBox (A-5). A slot-based x keeps every point inside it; the bar may
	// get thin, but it is still drawn.
	const slot = (SERIES_W - 42) / points.length;
	const barWidth = Math.max(slot - gap, 0.4);

	return (
		<svg
			className="w-full"
			viewBox={`0 0 ${SERIES_W} 205`}
			role="img"
			aria-label={label}
			data-testid={testId}
		>
			{[0, 1, 2, 3].map((index) => {
				const tick = Math.round((max * index) / 3);
				const top = plotBottom - (tick / max) * (plotBottom - plotTop);
				return (
					<g key={index}>
						<line
							x1="42"
							x2={SERIES_W}
							y1={top}
							y2={top}
							stroke="var(--publy-chart-grid)"
						/>
						<text
							x="32"
							y={top + 3.5}
							textAnchor="end"
							fontSize="11"
							fontFamily="var(--publy-font-mono)"
							fill="var(--publy-foreground-subtle)"
						>
							{formatCount(tick, locale)}
						</text>
					</g>
				);
			})}
			{points.map((point, index) => {
				const height = (point.value / max) * (plotBottom - plotTop);
				return (
					<rect
						key={`${point.label}-${index}`}
						x={42 + index * slot}
						y={plotBottom - height}
						width={barWidth}
						height={height}
						rx="2"
						fill="var(--publy-chart-1)"
					>
						<title>{`${point.label} · ${formatCount(point.value, locale)}`}</title>
					</rect>
				);
			})}
			{xLabelIndexes(points.length).map((index) => (
				<text
					key={index}
					x={42 + index * slot + barWidth / 2}
					y="197"
					textAnchor="middle"
					fontSize="11"
					fontFamily="var(--publy-font-mono)"
					fill="var(--publy-foreground-subtle)"
				>
					{points[index].label}
				</text>
			))}
		</svg>
	);
};

/** « Répartition par type »: one 100 % stacked bar over the type legend. */
export const StackedShareBar = ({
	segments,
	locale,
	testId,
}: {
	segments: readonly DonutSegment[];
	locale: string;
	testId?: string;
}) => {
	let total = 0;
	for (const segment of segments) {
		total += segment.value;
	}

	return (
		<div className="flex flex-col gap-3" data-testid={testId}>
			<div className="flex h-3 w-full overflow-hidden rounded-[3px] bg-(--publy-chart-track)">
				{segments.map((segment) => (
					<span
						key={segment.label}
						className="h-3"
						style={{
							width: `${total > 0 ? (segment.value / total) * 100 : 0}%`,
							backgroundColor: segment.color,
						}}
						title={`${segment.label} · ${formatCount(segment.value, locale)}`}
					/>
				))}
			</div>
		</div>
	);
};

const HEAT_CELL = 12;
const HEAT_GAP = 3;

/** « Activité de la plateforme »: one square per day, one column per week,
 * month labels above and weekday labels on the left. Level 0 is a real zero. */
export const Heatmap = ({
	days,
	locale,
	label,
	testId,
}: {
	days: ReadonlyArray<{ date: string; value: number }>;
	locale: string;
	/** The chart's accessible name, translated by the caller. */
	label: string;
	testId?: string;
}) => {
	if (days.length === 0) {
		return <UnknownValue testId={testId} />;
	}

	const max = Math.max(...days.map((day) => day.value), 1);
	const level = (value: number): number => {
		if (value <= 0) {
			return 0;
		}
		if (value < max * 0.25) {
			return 1;
		}
		if (value < max * 0.5) {
			return 2;
		}
		if (value < max * 0.75) {
			return 3;
		}
		return 4;
	};
	const cells = days.map((day) => ({
		...day,
		date: new Date(`${day.date}T12:00:00Z`),
	}));
	// Column 0 starts on the Monday of the first week.
	const firstWeekday = (cells[0].date.getUTCDay() + 6) % 7;
	const padded: Array<(typeof cells)[number] | null> = [
		...Array.from({ length: firstWeekday }, () => null),
		...cells,
	];
	const weeks = Math.ceil(padded.length / 7);
	const months: Array<{ label: string; weeks: number }> = [];
	for (let week = 0; week < weeks; week += 1) {
		// The first column's Monday is a padding null when the window does not
		// start on a Monday: label the column by its first real day, so that
		// week still counts and every label stays above its own week column
		// (#2339 fix9 ME-3).
		const cell = padded
			.slice(week * 7, week * 7 + 7)
			.find((day) => day !== null);
		if (!cell) {
			continue;
		}
		const label = formatMonthShort(cell.date, locale);
		const last = months.at(-1);
		if (last && last.label === label) {
			last.weeks += 1;
		} else {
			months.push({ label, weeks: 1 });
		}
	}
	const levelTokens = [
		'--publy-chart-empty',
		'--publy-chart-seq-1',
		'--publy-chart-seq-2',
		'--publy-chart-seq-3',
		'--publy-chart-seq-4',
	] as const;
	// Monday-first, like the grid; every other row (Tue/Thu/Sat) is labelled.
	// The locale's own short weekday, never a hardcoded French list (B ME-2).
	const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
		formatWeekdayShort(new Date(Date.UTC(2024, 0, 1 + index)), locale),
	);
	const width = 30 + weeks * (HEAT_CELL + HEAT_GAP);
	let monthOffset = 0;
	const monthLabels = months.map((month) => {
		const x = 30 + monthOffset * (HEAT_CELL + HEAT_GAP);
		monthOffset += month.weeks;
		return { ...month, x };
	});

	return (
		<div className="flex flex-col overflow-hidden" data-testid={testId}>
			<svg
				className="w-full"
				style={{ height: 137 }}
				viewBox={`0 0 ${width} ${14 + 7 * (HEAT_CELL + HEAT_GAP)}`}
				preserveAspectRatio="none"
				role="img"
				aria-label={label}
				data-testid="staff-dashboard-heatmap-grid"
			>
				{monthLabels.map((month, index) => (
					<text
						key={`${month.label}-${index}`}
						x={month.x}
						y="9"
						fontSize="10"
						fontFamily="var(--publy-font-mono)"
						fill="var(--publy-foreground-subtle)"
					>
						{month.label}
					</text>
				))}
				{weekdayLabels.map((weekday, index) =>
					index % 2 === 1 ? (
						<text
							key={weekday}
							x="0"
							y={14 + index * (HEAT_CELL + HEAT_GAP) + 9}
							fontSize="10"
							fontFamily="var(--publy-font-mono)"
							fill="var(--publy-foreground-subtle)"
						>
							{weekday}
						</text>
					) : null,
				)}
				{padded.map((cell, index) => {
					if (!cell) {
						return null;
					}
					const week = Math.floor(index / 7);
					const weekdayRow = index % 7;
					return (
						<rect
							key={cell.date.toISOString()}
							x={30 + week * (HEAT_CELL + HEAT_GAP)}
							y={14 + weekdayRow * (HEAT_CELL + HEAT_GAP)}
							width={HEAT_CELL}
							height={HEAT_CELL}
							rx="2"
							fill={`var(${levelTokens[level(cell.value)]})`}
						>
							<title>{`${formatShortDate(cell.date, locale, { timeZone: 'UTC' })} · ${formatCount(cell.value, locale)}`}</title>
						</rect>
					);
				})}
			</svg>
		</div>
	);
};

/** A KPI card's 86×28 sparkline, the prototype's own viewBox. */
export const Sparkline = ({ values }: { values: readonly number[] }) => {
	if (values.length === 0) {
		return null;
	}
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = Math.max(max - min, 1);
	const points = values.map((value, index) => {
		const x = values.length === 1 ? 86 : (index / (values.length - 1)) * 86;
		const y = 25 - ((value - min) / span) * 22;
		return [x, y] as const;
	});
	const path = points
		.map(
			([x, y], index) =>
				`${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`,
		)
		.join(' ');
	const last = points.at(-1) ?? [86, 25];

	return (
		<svg
			className="kpi-spark shrink-0"
			viewBox="0 0 86 28"
			fill="none"
			aria-hidden="true"
		>
			<path
				d={`${path} L86 28 L0 28 Z`}
				fill="var(--publy-chart-1)"
				opacity=".1"
			/>
			<path
				d={path}
				stroke="var(--publy-chart-1)"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--publy-chart-1)" />
		</svg>
	);
};
