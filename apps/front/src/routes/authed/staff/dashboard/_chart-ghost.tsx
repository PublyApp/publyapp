import { useId, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The dashboard's « Pas encore de données » ghosts (style « Légende »): a card
 * whose series the API does not serve yet draws its own chart in grey, whole,
 * at the real chart's size, with real text over it. Not an error and not a
 * loading state — no icon, no warning colour, no shimmer, no spinner.
 *
 * Every shape is `currentColor` at a low opacity and the SVG takes its colour
 * from `--publy-foreground` (`.ghost-svg`), so light and dark follow the
 * tokens. Decorative: `aria-hidden`, no numbers, no legend values, no
 * tooltips. The tag and the card's sentence are real DOM text.
 */

/** Fixed heights of the ghost shapes, in px, matched to the real chart each
 * one stands for (see `_chart-ghost.test.tsx` for the pairs). */
const GHOST_HEIGHT = {
	/** The real `LineChart` viewBox height. */
	line: 220,
	/** The real x-axis label row under a line/column chart. */
	axis: 24,
	/** The real `ColumnChart` body (156 + the 24 px axis = 180). */
	bars: 156,
	stackedBar: 12,
	stackedTable: 214,
	heatmap: 137,
	donutRing: 172,
	donutLegend: 96,
	spark: 28,
} as const;

/** Seeded values so a ghost looks the same on every load. */
const seeded = (seed: number) => {
	let state = seed;
	return () => {
		state = (state * 1103515245 + 12345) & 0x7fffffff;
		return state / 0x7fffffff;
	};
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

type Point = readonly [number, number];

/** A smooth path through points (Catmull-Rom to cubic Bézier). */
const smooth = (points: readonly Point[]): string => {
	let path = '';
	for (let index = 0; index < points.length; index += 1) {
		const [x, y] = points[index];
		if (index === 0) {
			path = `M${round1(x)} ${round1(y)}`;
			continue;
		}
		const [x0, y0] = points[index - 2] ?? points[index - 1];
		const [x1, y1] = points[index - 1];
		const [x3, y3] = points[index + 1] ?? [x, y];
		path += ` C${round1(x1 + (x - x0) / 6)} ${round1(y1 + (y - y0) / 6)} ${round1(x - (x3 - x1) / 6)} ${round1(y - (y3 - y1) / 6)} ${round1(x)} ${round1(y)}`;
	}
	return path;
};

const SOFT = 0.055;
const INK = 0.1;

/** The « Pas encore de données » pill, in the chart's top-left corner. Real
 * DOM text (screen readers hear it), taking no room and not interactive. */
export const GhostTag = () => {
	const { t } = useTranslation('common');
	return <span className="ghost-tag">{t('dashboard-ghost-tag')}</span>;
};

/** A line chart's ghost: the real chart's viewBox, a soft rising curve and its
 * area. The curve draws itself once under `prefers-reduced-motion:
 * no-preference`. */
export const GhostLine = ({
	width = 760,
	height = GHOST_HEIGHT.line,
	seed = 3,
}: {
	width?: number;
	height?: number;
	seed?: number;
}) => {
	const random = seeded(seed);
	const points: Point[] = [];
	for (let index = 0; index < 9; index += 1) {
		const ratio = index / 8;
		points.push([
			ratio * width,
			height * (0.72 - 0.42 * ratio + (random() - 0.5) * 0.14),
		]);
	}
	const path = smooth(points);

	return (
		<svg
			className="ghost-svg h-auto"
			viewBox={`0 0 ${width} ${height}`}
			aria-hidden="true"
			focusable="false"
		>
			{[0.2, 0.47, 0.74].map((ratio) => (
				<line
					key={ratio}
					x1="0"
					x2={width}
					y1={round1(height * ratio)}
					y2={round1(height * ratio)}
					stroke="currentColor"
					strokeOpacity="0.08"
					strokeWidth="1"
					strokeDasharray="3 5"
					vectorEffect="non-scaling-stroke"
				/>
			))}
			<line
				x1="0"
				x2={width}
				y1={height - 1}
				y2={height - 1}
				stroke="currentColor"
				strokeOpacity="0.1"
				vectorEffect="non-scaling-stroke"
			/>
			<path
				d={`${path} L${width} ${height} L0 ${height} Z`}
				fill="currentColor"
				fillOpacity="0.045"
			/>
			<path
				className="ghost-draw"
				pathLength={1}
				d={path}
				fill="none"
				stroke="currentColor"
				strokeOpacity="0.2"
				strokeWidth="2.5"
				strokeLinecap="round"
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
};

/** The x axis under a line or bar ghost: four quiet ticks instead of dates,
 * 24 px as the real axis row. */
export const GhostAxis = () => (
	<svg
		className="ghost-svg"
		width="100%"
		height={GHOST_HEIGHT.axis}
		aria-hidden="true"
		focusable="false"
	>
		{['0%', '33%', '66%'].map((x) => (
			<rect
				key={x}
				x={x}
				y="11"
				width="38"
				height="7"
				rx="3.5"
				fill="currentColor"
				fillOpacity={SOFT}
			/>
		))}
		<rect
			x="100%"
			y="11"
			width="38"
			height="7"
			rx="3.5"
			style={{ transform: 'translate(-38px, 0)' }}
			fill="currentColor"
			fillOpacity={SOFT}
		/>
	</svg>
);

/** Vertical bars (a daily series): a weekday rhythm, 30 days, at the real
 * column chart's height. The bars rise once, staggered. */
export const GhostBars = ({
	count = 30,
	height = GHOST_HEIGHT.bars,
	seed = 11,
}: {
	count?: number;
	height?: number;
	seed?: number;
}) => {
	const random = seeded(seed);
	const step = 100 / count;

	return (
		<svg
			className="ghost-svg"
			width="100%"
			height={height}
			aria-hidden="true"
			focusable="false"
		>
			{Array.from({ length: count }, (_, index) => {
				const weekday = index % 7;
				const value = (weekday >= 5 ? 0.28 : 0.62) + random() * 0.3;
				const barHeight = Math.round(height * Math.min(0.94, value));
				return (
					<rect
						key={index}
						className="ghost-rise"
						style={{ '--i': index } as CSSProperties}
						x={`${round1(index * step + step * 0.12)}%`}
						y={height - barHeight}
						width={`${round1(step * 0.76)}%`}
						height={barHeight}
						rx="3"
						fill="currentColor"
						fillOpacity={INK}
					/>
				);
			})}
		</svg>
	);
};

/** Horizontal bars (an outcome or ranking list): a label, a value and a track
 * per row, at the real rows' height (35 px rows, 16 px gaps). */
export const GhostHBars = ({
	rows = 4,
	seed = 5,
	falling = true,
}: {
	rows?: number;
	seed?: number;
	falling?: boolean;
}) => {
	const random = seeded(seed);
	const rowHeight = 35;
	const gap = 16;
	const height = rows * rowHeight + Math.max(0, rows - 1) * gap;

	return (
		<svg
			className="ghost-svg"
			width="100%"
			height={height}
			aria-hidden="true"
			focusable="false"
		>
			{Array.from({ length: rows }, (_, index) => {
				const y = index * (rowHeight + gap);
				const fill = falling
					? 92 - index * (70 / rows) - random() * 8
					: 30 + random() * 60;
				return (
					<g key={index}>
						<rect
							x="0"
							y={round1(y + 4)}
							width={`${round1(18 + random() * 14)}%`}
							height="9"
							rx="4.5"
							fill="currentColor"
							fillOpacity={SOFT}
						/>
						<rect
							x="100%"
							y={round1(y + 4)}
							width="34"
							height="9"
							rx="4.5"
							style={{ transform: 'translate(-34px, 0)' }}
							fill="currentColor"
							fillOpacity={SOFT}
						/>
						<rect
							x="0"
							y={round1(y + 25)}
							width="100%"
							height="10"
							rx="3"
							fill="currentColor"
							fillOpacity={SOFT}
						/>
						<rect
							className="ghost-grow"
							style={{ '--i': index } as CSSProperties}
							x="0"
							y={round1(y + 25)}
							width={`${round1(fill)}%`}
							height="10"
							rx="3"
							fill="currentColor"
							fillOpacity={INK}
						/>
					</g>
				);
			})}
		</svg>
	);
};

/** The status donut's three fake segments (share, gap), module-scope so a
 * render never rebuilds them. */
const DONUT_SEGMENTS: ReadonlyArray<readonly [number, number]> = [
	[0.62, 0.13],
	[0.22, 0.085],
	[0.12, 0.055],
];

/** A status chart's ghost: the 172 px ring (three segments) and its three
 * legend rows. */
export const GhostDonut = () => {
	const circumference = 2 * Math.PI * 66;
	const segments = DONUT_SEGMENTS;
	let at = 0;

	return (
		<div className="flex flex-col gap-3">
			<div className="flex justify-center py-1">
				<svg
					className="ghost-svg w-[172px]"
					width={GHOST_HEIGHT.donutRing}
					height={GHOST_HEIGHT.donutRing}
					viewBox="0 0 172 172"
					aria-hidden="true"
					focusable="false"
				>
					{segments.map(([share, opacity], index) => {
						const arc = (
							<circle
								key={index}
								cx="86"
								cy="86"
								r="66"
								fill="none"
								stroke="currentColor"
								strokeOpacity={opacity}
								strokeWidth="20"
								strokeDasharray={`${round1(circumference * share - 4)} ${round1(circumference)}`}
								strokeDashoffset={round1(-circumference * at)}
								style={{
									transform: 'rotate(-90deg)',
									transformOrigin: '86px 86px',
								}}
							/>
						);
						at += share;
						return arc;
					})}
					<rect
						x="61"
						y="80"
						width="50"
						height="12"
						rx="6"
						fill="currentColor"
						fillOpacity={SOFT}
					/>
				</svg>
			</div>
			<svg
				className="ghost-svg"
				width="100%"
				height={GHOST_HEIGHT.donutLegend}
				aria-hidden="true"
				focusable="false"
			>
				{[0, 1, 2].map((index) => (
					<g key={index}>
						<circle
							cx="7"
							cy={16 + index * 32}
							r="5"
							fill="currentColor"
							fillOpacity={[0.13, 0.085, 0.055][index]}
						/>
						<rect
							x="22"
							y={11 + index * 32}
							width={`${[30, 36, 40][index]}%`}
							height="10"
							rx="5"
							fill="currentColor"
							fillOpacity={SOFT}
						/>
						<rect
							x="100%"
							y={11 + index * 32}
							width="22"
							height="10"
							rx="5"
							style={{ transform: 'translate(-22px, 0)' }}
							fill="currentColor"
							fillOpacity={SOFT}
						/>
					</g>
				))}
			</svg>
		</div>
	);
};

const STACKED_SHARES = [35, 25, 19, 13, 8] as const;
const STACKED_OPACITIES = [0.16, 0.12, 0.09, 0.065, 0.045] as const;

/** A stacked share bar plus its table ghost (five shares, then the type
 * rows). */
export const GhostStacked = ({ rows = 5 }: { rows?: number }) => {
	const shares = STACKED_SHARES;
	const opacities = STACKED_OPACITIES;
	const head = 34;
	const rowHeight = 36;
	let x = 0;

	return (
		<div className="flex flex-col gap-3">
			<svg
				className="ghost-svg"
				width="100%"
				height={GHOST_HEIGHT.stackedBar}
				aria-hidden="true"
				focusable="false"
			>
				{shares.map((share, index) => {
					const rect = (
						<rect
							key={index}
							x={`${x}%`}
							y="0"
							width={`${share - 0.4}%`}
							height={GHOST_HEIGHT.stackedBar}
							rx="2"
							fill="currentColor"
							fillOpacity={opacities[index]}
						/>
					);
					x += share;
					return rect;
				})}
			</svg>
			<svg
				className="ghost-svg"
				width="100%"
				height={GHOST_HEIGHT.stackedTable}
				aria-hidden="true"
				focusable="false"
			>
				<rect
					x="0"
					y="10"
					width="34"
					height="7"
					rx="3.5"
					fill="currentColor"
					fillOpacity={SOFT}
				/>
				<rect
					x="72%"
					y="10"
					width="28"
					height="7"
					rx="3.5"
					style={{ transform: 'translate(-28px, 0)' }}
					fill="currentColor"
					fillOpacity={SOFT}
				/>
				<rect
					x="100%"
					y="10"
					width="56"
					height="7"
					rx="3.5"
					style={{ transform: 'translate(-56px, 0)' }}
					fill="currentColor"
					fillOpacity={SOFT}
				/>
				{Array.from({ length: rows }, (_, index) => {
					const y = head + index * rowHeight;
					return (
						<g key={index}>
							<line
								x1="0"
								x2="100%"
								y1={y}
								y2={y}
								stroke="currentColor"
								strokeOpacity="0.07"
							/>
							<circle
								cx="4"
								cy={y + 18}
								r="4"
								fill="currentColor"
								fillOpacity={opacities[index]}
							/>
							<rect
								x="16"
								y={y + 13}
								width={`${[26, 30, 22, 20, 14][index]}%`}
								height="10"
								rx="5"
								fill="currentColor"
								fillOpacity={SOFT}
							/>
							<rect
								x="72%"
								y={y + 13}
								width="34"
								height="10"
								rx="5"
								style={{ transform: 'translate(-34px, 0)' }}
								fill="currentColor"
								fillOpacity={SOFT}
							/>
							<rect
								x="100%"
								y={y + 13}
								width="30"
								height="10"
								rx="5"
								style={{ transform: 'translate(-30px, 0)' }}
								fill="currentColor"
								fillOpacity={SOFT}
							/>
						</g>
					);
				})}
			</svg>
		</div>
	);
};

/** The platform-activity heatmap ghost: the 7-day grid as wide as the card,
 * fading towards the oldest weeks, with a row of month marks above. */
export const GhostHeatmap = () => {
	// Two heatmap ghosts on one page must not share SVG ids: the second would
	// otherwise paint with the first's pattern and mask (N13).
	const id = useId();
	const cellId = `${id}-cell`;
	const fadeId = `${id}-fade`;
	const maskId = `${id}-mask`;
	const cellFill = `url(#${cellId})`;
	const fadeFill = `url(#${fadeId})`;
	const maskFill = `url(#${maskId})`;

	return (
		<svg
			className="ghost-svg"
			width="100%"
			height={GHOST_HEIGHT.heatmap}
			aria-hidden="true"
			focusable="false"
		>
			<defs>
				<pattern
					id={cellId}
					width="17"
					height="17"
					patternUnits="userSpaceOnUse"
				>
					<rect
						width="14"
						height="14"
						rx="3"
						fill="currentColor"
						fillOpacity="0.09"
					/>
				</pattern>
				<linearGradient id={fadeId} x1="0" x2="1">
					<stop offset="0" stopColor="currentColor" stopOpacity="0.35" />
					<stop offset="0.7" stopColor="currentColor" stopOpacity="1" />
				</linearGradient>
				{/* `mask-type: alpha` (app.css): the fade must not depend on the
				    theme's luminance, and a raw white stop would be a hard-coded
				    colour. */}
				<mask id={maskId} className="ghost-heat-mask">
					<rect width="100%" height={GHOST_HEIGHT.heatmap} fill={fadeFill} />
				</mask>
			</defs>
			{['0%', '24%', '48%', '72%'].map((x) => (
				<rect
					key={x}
					x={x}
					y="2"
					width="26"
					height="7"
					rx="3.5"
					fill="currentColor"
					fillOpacity={SOFT}
				/>
			))}
			<rect
				x="0"
				y="21"
				width="100%"
				height="116"
				fill={cellFill}
				mask={maskFill}
			/>
		</svg>
	);
};

/** Short list rows (a latest/awaiting list): avatar, two lines, a status chip.
 * Calm: no shimmer. */
export const GhostList = ({
	rows = 5,
	rowHeight = 56,
	chip = true,
	stacked = false,
}: {
	rows?: number;
	rowHeight?: number;
	chip?: boolean;
	stacked?: boolean;
}) => (
	<svg
		className="ghost-svg"
		width="100%"
		height={Math.round(rows * rowHeight)}
		aria-hidden="true"
		focusable="false"
	>
		{Array.from({ length: rows }, (_, index) => {
			const y = index * rowHeight;
			const middle = y + (stacked ? 24 : rowHeight / 2);
			const separator = index ? (
				<line
					x1="0"
					x2="100%"
					y1={y}
					y2={y}
					stroke="currentColor"
					strokeOpacity="0.07"
				/>
			) : null;
			if (stacked) {
				return (
					<g key={index}>
						{separator}
						<circle
							cx="11"
							cy={middle}
							r="11"
							fill="currentColor"
							fillOpacity={SOFT}
						/>
						<rect
							x="30"
							y={middle - 5}
							width={`${[58, 52, 62, 50, 56][index % 5]}%`}
							height="10"
							rx="5"
							fill="currentColor"
							fillOpacity="0.085"
						/>
						<rect
							x="30"
							y={middle + 18}
							width="54"
							height="16"
							rx="8"
							fill="currentColor"
							fillOpacity={SOFT}
						/>
						<rect
							x="30"
							y={middle + 44}
							width="28%"
							height="8"
							rx="4"
							fill="currentColor"
							fillOpacity={SOFT}
						/>
						<rect
							x="30"
							y={middle + 64}
							width="40%"
							height="8"
							rx="4"
							fill="currentColor"
							fillOpacity={SOFT}
						/>
					</g>
				);
			}
			return (
				<g key={index}>
					{separator}
					<circle
						cx="15"
						cy={middle}
						r="15"
						fill="currentColor"
						fillOpacity={SOFT}
					/>
					<rect
						x="42"
						y={middle - 11}
						width={`${[34, 28, 38, 30, 26][index % 5]}%`}
						height="10"
						rx="5"
						fill="currentColor"
						fillOpacity="0.085"
					/>
					<rect
						x="42"
						y={middle + 4}
						width={`${[22, 26, 18, 24, 20][index % 5]}%`}
						height="7"
						rx="3.5"
						fill="currentColor"
						fillOpacity={SOFT}
					/>
					{chip ? (
						<rect
							x="100%"
							y={middle - 9}
							width="58"
							height="18"
							rx="9"
							style={{ transform: 'translate(-58px, 0)' }}
							fill="currentColor"
							fillOpacity={SOFT}
						/>
					) : null}
				</g>
			);
		})}
	</svg>
);

const SPARK_POINTS: Point[] = [
	[0, 20],
	[14, 18],
	[28, 19],
	[43, 16],
	[57, 17],
	[72, 14],
	[86, 15],
];

/** A KPI card's ghost sparkline: a dashed baseline and a faint flat curve, at
 * the real sparkline's height (narrower than the real one: room for the
 * words). */
export const GhostSpark = () => {
	const points = SPARK_POINTS;
	const path = smooth(points);

	return (
		<svg
			className="ghost-svg kpi-spark"
			viewBox="0 0 86 28"
			aria-hidden="true"
			focusable="false"
		>
			<line
				x1="0"
				x2="86"
				y1="27"
				y2="27"
				stroke="currentColor"
				strokeOpacity="0.12"
				strokeDasharray="2 3"
			/>
			<path
				d={`${path} L86 28 L0 28 Z`}
				fill="currentColor"
				fillOpacity="0.04"
			/>
			<path
				className="ghost-draw"
				pathLength={1}
				d={path}
				fill="none"
				stroke="currentColor"
				strokeOpacity="0.16"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
		</svg>
	);
};
