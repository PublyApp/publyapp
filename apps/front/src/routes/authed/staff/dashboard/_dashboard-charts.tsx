import { useState, type ReactNode } from 'react';
import { cn } from '~/lib/utils';

/**
 * The dashboard's chart set (§5.2): the prototype draws its figures as inline
 * SVG (`redesign/dashboard.css`), so no chart library is added. Every
 * component takes the series it is given — the caller decides what the API
 * actually provides; `null`/empty renders the unknown value « — », never a
 * silent zero.
 */

export const UNKNOWN_VALUE = '—';

export type ChartPoint = {
	label: string;
	value: number;
};

export type DonutSegment = {
	label: string;
	value: number;
	color: string;
};

export type BarRow = {
	label: string;
	value: number;
	/** Optional trailing figure (« 15 · 63 % »). */
	detail?: string;
	color: string;
};

/** The line chart's own viewBox, also the ghost line's (same height at every
 * width, so nothing moves when the data lands). */
export const CHART_WIDTH = 760;
export const CHART_HEIGHT = 220;
const AXIS_LEFT = 42;

export const formatCount = (value: number, locale: string): string =>
	new Intl.NumberFormat(locale).format(value);

export const formatShare = (
	value: number,
	total: number,
	locale: string,
): string =>
	total <= 0
		? UNKNOWN_VALUE
		: new Intl.NumberFormat(locale, {
				style: 'percent',
				maximumFractionDigits: 1,
			}).format(value / total);

export const UnknownValue = ({ testId }: { testId?: string }) => (
	<span
		className="text-sm text-muted-foreground"
		data-testid={testId}
		title={UNKNOWN_VALUE}
	>
		{UNKNOWN_VALUE}
	</span>
);

/** A tooltip anchored inside a chart body; no portal, no z-index war. */
const ChartTooltip = ({
	leftPercent,
	children,
}: {
	leftPercent: number;
	children: ReactNode;
}) => (
	<div
		className="pointer-events-none absolute z-(--publy-z-raised) -translate-x-1/2 -translate-y-[110%] rounded-[var(--publy-radius-small-control)] bg-popover-surface px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-[var(--effect-popover)]"
		style={{ left: `${leftPercent}%` }}
	>
		{children}
	</div>
);

/** The KPI sparkline (86 × 28, as the prototype). Renders nothing without a
 * series: a flat line would read as a measured « no change ». */
export const Sparkline = ({
	values,
	testId,
}: {
	values: readonly number[];
	testId?: string;
}) => {
	if (values.length < 2) {
		return null;
	}

	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min || 1;
	const step = 86 / (values.length - 1);
	const points = values.map((value, index) => {
		const x = index * step;
		const y = 25 - ((value - min) / span) * 22;
		return `${x.toFixed(1)} ${y.toFixed(1)}`;
	});
	const line = points.join(' L');
	const lastValue = values.at(-1) ?? min;
	const lastX = 86;
	const lastY = 25 - ((lastValue - min) / span) * 22;

	return (
		<svg
			className="h-7 w-[86px] shrink-0 overflow-visible"
			viewBox="0 0 86 28"
			fill="none"
			aria-hidden="true"
			data-testid={testId}
		>
			<path
				d={`M${line} L86 28 L0 28 Z`}
				fill="var(--publy-chart-1)"
				opacity=".1"
			/>
			<path
				d={`M${line}`}
				stroke="var(--publy-chart-1)"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<circle cx={lastX} cy={lastY} r="2.6" fill="var(--publy-chart-1)" />
		</svg>
	);
};

/**
 * The line chart with the prototype's crosshair + tooltip. `points` are
 * already period-labelled by the caller; an empty series renders « — ».
 */
export const LineChart = ({
	points,
	unitLabel,
	locale,
	testId,
}: {
	points: readonly ChartPoint[];
	unitLabel: string;
	locale: string;
	testId?: string;
}) => {
	const [activeIndex, setActiveIndex] = useState<number | null>(null);

	if (points.length === 0) {
		return (
			<div className="flex h-[180px] items-center justify-center">
				<UnknownValue testId={testId} />
			</div>
		);
	}

	const values = points.map((point) => point.value);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const span = max - min || 1;
	const plotWidth = CHART_WIDTH - AXIS_LEFT;
	const step = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth;

	const coordinates = points.map((point, index) => ({
		x: AXIS_LEFT + index * step,
		y: CHART_HEIGHT - ((point.value - min) / span) * CHART_HEIGHT,
	}));
	const path = coordinates
		.map(
			(coordinate, index) =>
				`${index === 0 ? 'M' : 'L'}${coordinate.x.toFixed(1)} ${coordinate.y.toFixed(1)}`,
		)
		.join(' ');
	const last = coordinates.at(-1);
	const ticks = [0, 1, 2, 3, 4].map((index) => {
		const ratio = index / 4;
		return {
			y: CHART_HEIGHT * ratio,
			value: Math.round(max - span * ratio),
		};
	});
	const active = activeIndex === null ? null : points[activeIndex];

	return (
		<div className="relative" data-testid={testId}>
			<svg
				className="block h-auto w-full overflow-visible"
				viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
				fill="none"
				role="img"
				aria-label={unitLabel}
				onMouseMove={(event) => {
					const rect = event.currentTarget.getBoundingClientRect();
					if (rect.width === 0) {
						return;
					}
					const ratio = (event.clientX - rect.left) / rect.width;
					const plotRatio = Math.min(
						1,
						Math.max(0, (ratio * CHART_WIDTH - AXIS_LEFT) / plotWidth),
					);
					setActiveIndex(Math.round(plotRatio * (points.length - 1)));
				}}
				onMouseLeave={() => setActiveIndex(null)}
			>
				{ticks.map((tick) => (
					<g key={tick.y}>
						<line
							x1={AXIS_LEFT}
							y1={tick.y}
							x2={CHART_WIDTH}
							y2={tick.y}
							stroke="var(--publy-chart-grid)"
							strokeWidth="1"
						/>
						<text
							x={AXIS_LEFT - 10}
							y={tick.y + 3.5}
							textAnchor="end"
							fontSize="11"
							fontFamily="var(--publy-font-mono)"
							fill="var(--publy-foreground-subtle)"
						>
							{tick.value}
						</text>
					</g>
				))}
				<path
					d={`${path} L${CHART_WIDTH} ${CHART_HEIGHT} L${AXIS_LEFT} ${CHART_HEIGHT} Z`}
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
				{last ? (
					<circle
						cx={last.x}
						cy={last.y}
						r="4"
						fill="var(--publy-chart-1)"
						stroke="var(--publy-surface)"
						strokeWidth="2"
					/>
				) : null}
				{activeIndex !== null ? (
					<g>
						<line
							x1={coordinates[activeIndex]?.x}
							y1="0"
							x2={coordinates[activeIndex]?.x}
							y2={CHART_HEIGHT}
							stroke="var(--publy-chart-grid)"
							strokeWidth="1"
						/>
						<circle
							cx={coordinates[activeIndex]?.x}
							cy={coordinates[activeIndex]?.y}
							r="4.5"
							fill="var(--publy-chart-1)"
						/>
					</g>
				) : null}
			</svg>
			<div className="flex justify-between pt-2 font-mono text-[11px] text-muted-foreground">
				<span>{points[0]?.label}</span>
				<span>{points[Math.floor(points.length / 3)]?.label}</span>
				<span>{points[Math.floor((points.length * 2) / 3)]?.label}</span>
				<span>{points.at(-1)?.label}</span>
			</div>
			{active && activeIndex !== null ? (
				<ChartTooltip
					leftPercent={(activeIndex / Math.max(1, points.length - 1)) * 100}
				>
					<span className="block font-medium">{active.label}</span>
					<span className="font-mono">
						{formatCount(active.value, locale)}
					</span>{' '}
					<span className="text-muted-foreground">{unitLabel}</span>
				</ChartTooltip>
			) : null}
		</div>
	);
};

/** The reports' daily column chart (bars + native title tooltips). */
export const ColumnChart = ({
	points,
	unitLabel,
	locale,
	testId,
}: {
	points: readonly ChartPoint[];
	unitLabel: string;
	locale: string;
	testId?: string;
}) => {
	if (points.length === 0) {
		return (
			<div className="flex h-[180px] items-center justify-center">
				<UnknownValue testId={testId} />
			</div>
		);
	}

	const max = Math.max(...points.map((point) => point.value), 1);

	return (
		<div className="flex h-[180px] items-end gap-0.5" data-testid={testId}>
			{points.map((point) => (
				<div
					key={point.label}
					className="flex h-full min-w-0 flex-1 items-end"
					title={`${point.label} · ${formatCount(point.value, locale)} ${unitLabel}`}
				>
					<span
						className="mx-auto block w-full max-w-[22px] rounded-t-[4px] bg-(--publy-chart-1) transition-[filter] hover:brightness-90"
						style={{ height: `${Math.max(2, (point.value / max) * 100)}%` }}
					/>
				</div>
			))}
		</div>
	);
};

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
	if (total <= 0) {
		return (
			<div className="flex h-[172px] items-center justify-center">
				<UnknownValue testId={testId} />
			</div>
		);
	}

	let offset = 0;
	const circles = segments.map((segment) => {
		const share = (segment.value / total) * 100;
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
		<div className="flex flex-col gap-3" data-testid={testId}>
			<div className="flex justify-center py-1">
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
			<div className="flex flex-col">
				{segments.map((segment) => (
					<div
						key={segment.label}
						className="flex w-full items-center gap-2 border-t border-(--publy-row-border) py-2 text-xs text-(--publy-foreground-secondary) first:border-t-0"
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

/** The « Répartition par type » share bar. */
export const ShareBar = ({
	segments,
	total,
	locale,
	label,
}: {
	segments: readonly DonutSegment[];
	total: number;
	locale: string;
	label: string;
}) => {
	if (total <= 0) {
		return <UnknownValue />;
	}

	return (
		<div className="flex h-3 gap-0.5" role="img" aria-label={label}>
			{segments.map((segment) => (
				<span
					key={segment.label}
					className="rounded-[3px] hover:outline-2 hover:outline-offset-2 hover:outline-(--publy-foreground)"
					style={{
						width: `${(segment.value / total) * 100}%`,
						backgroundColor: segment.color,
					}}
					title={`${segment.label} · ${formatCount(segment.value, locale)} · ${formatShare(segment.value, total, locale)}`}
				/>
			))}
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
		<div className="flex flex-col gap-4" data-testid={testId}>
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

export type HeatmapDay = {
	/** `YYYY-MM-DD`. */
	date: string;
	/** `null` = the API has no figure for that day (not a zero). */
	count: number | null;
};

const HEATMAP_LEVELS = [
	'var(--publy-chart-empty)',
	'var(--publy-chart-seq-1)',
	'var(--publy-chart-seq-2)',
	'var(--publy-chart-seq-3)',
	'var(--publy-chart-seq-4)',
] as const;

const heatLevel = (count: number | null): number => {
	if (count === null || count <= 0) {
		return 0;
	}
	if (count < 75) {
		return 1;
	}
	if (count < 133) {
		return 2;
	}
	if (count < 176) {
		return 3;
	}
	return 4;
};

const weekdayIndex = (date: Date): number => (date.getUTCDay() + 6) % 7;

/**
 * The platform-activity heatmap. It fills the card width: the grid flows in
 * columns of seven days and its columns share the available width, so a wide
 * card simply shows more weeks (the prototype's ResizeObserver behaviour,
 * without a JS measurement).
 */
export const Heatmap = ({
	days,
	locale,
	testId,
}: {
	days: readonly HeatmapDay[];
	locale: string;
	testId?: string;
}) => {
	if (days.length === 0) {
		return (
			<div className="flex h-[160px] items-center justify-center">
				<UnknownValue testId={testId} />
			</div>
		);
	}

	const firstDate = new Date(`${days[0]?.date}T12:00:00Z`);
	const pad = weekdayIndex(firstDate);
	const cells: Array<HeatmapDay | null> = [];
	for (let index = 0; index < pad; index += 1) {
		cells.push(null);
	}
	cells.push(...days);
	while (cells.length % 7 !== 0) {
		cells.push(null);
	}

	const formatter = new Intl.DateTimeFormat(locale, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});
	const weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

	return (
		<div className="flex gap-2.5" data-testid={testId}>
			<div className="grid shrink-0 grid-rows-7 gap-[3px] pt-[17px] text-[10px] leading-[14px] text-(--publy-foreground-subtle)">
				{weekdays.map((weekday, index) => (
					<span key={`${weekday}-${index}`}>
						{index % 2 === 1 ? weekday : ''}
					</span>
				))}
			</div>
			<div className="min-w-0 flex-1">
				<div className="h-[14px]" />
				<div className="grid auto-cols-fr grid-flow-col grid-rows-7 gap-[3px]">
					{cells.map((cell, index) => {
						if (cell === null) {
							return <span key={`pad-${index}`} className="aspect-square" />;
						}
						const level = heatLevel(cell.count);
						const label =
							cell.count === null
								? `${formatter.format(new Date(`${cell.date}T12:00:00Z`))} · ${UNKNOWN_VALUE}`
								: `${formatter.format(new Date(`${cell.date}T12:00:00Z`))} · ${formatCount(cell.count, locale)}`;
						return (
							<span
								key={cell.date}
								className="aspect-square rounded-[3px] hover:outline-2 hover:outline-offset-1 hover:outline-(--publy-foreground)"
								style={{ backgroundColor: HEATMAP_LEVELS[level] }}
								title={label}
							/>
						);
					})}
				</div>
			</div>
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
		className={cn('flex flex-1 flex-col justify-center px-4 py-4', className)}
	>
		{children}
	</div>
);

export const ChartNote = ({ children }: { children: ReactNode }) => (
	<p className="px-4 pt-3 text-xs text-muted-foreground">{children}</p>
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

/** A one-cell « — » table row, for a series the API does not provide yet. */
export const unknownTableRows = (
	columnCount: number,
): ReadonlyArray<readonly ReactNode[]> => {
	const row: ReactNode[] = [];
	for (let index = 0; index < columnCount; index += 1) {
		row.push(<UnknownValue />);
	}
	return [row];
};
