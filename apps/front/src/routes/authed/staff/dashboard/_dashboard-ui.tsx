import { IconArrowRight } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorKindState } from '~/components/error-views/error-kind-state';
import { CodeSelect } from '~/components/ui/code-select';
import { SectionCard } from '~/components/ui/section-card';
import { Segmented } from '~/components/ui/segmented';
import { Skeleton } from '~/components/ui/skeleton';

import { GhostTag } from './_chart-ghost';
import { ChartBody, ChartNote, UNKNOWN_VALUE } from './_dashboard-charts';

/** The overview/report periods (§5.2), in the prototype's order. */
export type DashboardPeriod = '30d' | '7d' | '90d' | '12m';
export const DASHBOARD_PERIODS: readonly DashboardPeriod[] = [
	'30d',
	'7d',
	'90d',
	'12m',
];

export type OrganisationScope = 'all' | 'active' | 'pending' | 'suspended';
export const ORGANISATION_SCOPES: readonly OrganisationScope[] = [
	'all',
	'active',
	'pending',
	'suspended',
];

export type ChartView = 'chart' | 'table';
const CHART_VIEWS: readonly ChartView[] = ['chart', 'table'];

const PERIOD_DAYS = {
	'30d': 30,
	'7d': 7,
	'90d': 90,
	'12m': 365,
} satisfies Record<DashboardPeriod, number>;

/** `YYYY-MM-DD` for the API's `start_date` (the audit endpoints parse a bare
 * date as midnight, which is what a period start means). */
export const periodStart = (
	period: DashboardPeriod,
	now: Date = new Date(),
): string => {
	const start = new Date(now);
	start.setDate(start.getDate() - PERIOD_DAYS[period]);
	return start.toISOString().slice(0, 10);
};

export const periodLabelKey = (period: DashboardPeriod): string =>
	`dashboard-period-${period}`;

export const organisationScopeLabelKey = (scope: OrganisationScope): string =>
	`dashboard-org-${scope}`;

/** The « Période » / « Période du rapport » filter: CodeSelect (popup ≥ md,
 * bottom sheet below), never a native select element. */
export const PeriodSelect = ({
	id,
	value,
	onChange,
	ariaLabel,
}: {
	id: string;
	value: DashboardPeriod;
	onChange: (period: DashboardPeriod) => void;
	ariaLabel: string;
}) => {
	const { t } = useTranslation('common');
	return (
		<CodeSelect
			id={id}
			value={value}
			options={DASHBOARD_PERIODS}
			label={(period) => t(periodLabelKey(period))}
			onChange={onChange}
			ariaLabel={ariaLabel}
		/>
	);
};

/** The « Organisations » filter. */
export const OrganisationScopeSelect = ({
	id,
	value,
	onChange,
}: {
	id: string;
	value: OrganisationScope;
	onChange: (scope: OrganisationScope) => void;
}) => {
	const { t } = useTranslation('common');
	return (
		<CodeSelect
			id={id}
			value={value}
			options={ORGANISATION_SCOPES}
			label={(scope) => t(organisationScopeLabelKey(scope))}
			onChange={onChange}
			ariaLabel={t('dashboard-filter-organisations')}
		/>
	);
};

/** The « Graphique | Tableau » segmented control. */
export const ChartViewToggle = ({
	value,
	onChange,
}: {
	value: ChartView;
	onChange: (value: ChartView) => void;
}) => {
	const { t } = useTranslation('common');
	return (
		<Segmented
			value={value}
			options={CHART_VIEWS}
			ariaLabel={t('dashboard-view-toggle')}
			onChange={onChange}
			label={(view) =>
				view === 'chart' ? t('dashboard-view-chart') : t('dashboard-view-table')
			}
		/>
	);
};

/** The prototype's quiet « Tout voir → » text link (not a framed button). */
export const ViewAllLink = ({
	to,
	label,
	testId,
}: {
	to: '/staff/tenants' | '/staff/invitations';
	label: string;
	testId?: string;
}) => (
	<Link
		to={to}
		data-testid={testId}
		className="group/link inline-flex h-7 shrink-0 items-center gap-1 rounded-[var(--publy-radius-small-control)] px-1.5 text-[13px] font-medium text-(--publy-foreground-secondary) hover:text-foreground hover:underline hover:underline-offset-4"
	>
		{label}
		<IconArrowRight
			aria-hidden="true"
			className="size-3.5 transition-transform group-hover/link:translate-x-0.5"
		/>
	</Link>
);

/** One section card with an optional header action cluster. */
export const DashboardCard = ({
	label,
	icon,
	actions,
	testId,
	headerClassName,
	children,
}: {
	label: ReactNode;
	icon?: ReactNode;
	actions?: ReactNode;
	testId?: string;
	headerClassName?: string;
	children: ReactNode;
}) => (
	<div data-testid={testId} className="flex min-w-0">
		<SectionCard
			label={label}
			icon={icon}
			action={actions}
			className="w-full"
			headerClassName={headerClassName}
		>
			{children}
		</SectionCard>
	</div>
);

/**
 * A card's query state: skeleton, inline retry on error, content otherwise.
 * Keeps every dashboard card honest about loading/error instead of printing
 * an empty figure while the API is still answering.
 */
export const DashboardCardState = ({
	isPending,
	error,
	onRetry,
	testId,
	children,
}: {
	isPending: boolean;
	error: unknown;
	onRetry: () => void;
	testId: string;
	children: ReactNode;
}) => {
	if (error) {
		return (
			<div className="p-4">
				<ErrorKindState
					scale="inline"
					panel
					error={error}
					onRetry={onRetry}
					testId={`${testId}-error`}
				/>
			</div>
		);
	}

	if (isPending) {
		return (
			<div className="space-y-3 p-4" data-testid={`${testId}-skeleton`}>
				<Skeleton className="h-4 w-2/5" />
				<Skeleton className="h-24 w-full" />
			</div>
		);
	}

	return <>{children}</>;
};

/**
 * A chart card's series: the chart (and its table twin) when the API serves it,
 * or — when it does not — the card's own ghost chart and the one sentence that
 * says what will live there. The two branches are the only way in: an
 * unavailable series can never be passed as an empty chart.
 */
export type ChartCardSeries =
	| { status: 'ready'; chart: ReactNode; table: ReactNode }
	| { status: 'unavailable'; sentence: string; ghost: ReactNode };

/** The card body: the ghost with its tag, or the chosen chart/table. */
const chartBodyOf = (series: ChartCardSeries, view: ChartView): ReactNode => {
	if (series.status === 'unavailable') {
		return (
			<div className="relative flex flex-col">
				<div className="ghost-fade flex flex-col">{series.ghost}</div>
				<GhostTag />
			</div>
		);
	}
	return view === 'chart' ? series.chart : series.table;
};

/**
 * A chart card: header (label + Graphique|Tableau), the note, then the chosen
 * body. The table is the chart's own data, never a second query. An
 * unavailable series draws its own chart as a grey ghost, swaps the note for
 * the card's sentence, and steps the switch aside (without data there is no
 * table; a disabled button would read as a fault) while the header keeps its
 * height.
 */
export const ChartCard = ({
	testId,
	label,
	icon,
	note,
	hero,
	series,
	toggle = true,
	state,
	action,
}: {
	testId: string;
	label: string;
	icon: ReactNode;
	note: string;
	/** An optional figure above the note (the prototype's `chart-hero`). */
	hero?: ReactNode;
	series: ChartCardSeries;
	toggle?: boolean;
	state?: {
		isPending: boolean;
		error: unknown;
		onRetry: () => void;
	};
	action?: ReactNode;
}) => {
	const [view, setView] = useState<ChartView>('chart');
	const unavailable = series.status === 'unavailable';
	const body = (
		<>
			{hero ? (
				<p className="px-4 pt-3 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
					{unavailable ? (
						<span className="text-muted-foreground">{UNKNOWN_VALUE}</span>
					) : (
						hero
					)}
				</p>
			) : null}
			<ChartNote>
				{unavailable ? (
					<span className="ghost-sentence">{series.sentence}</span>
				) : (
					note
				)}
			</ChartNote>
			<ChartBody>{chartBodyOf(series, view)}</ChartBody>
		</>
	);

	return (
		<DashboardCard
			testId={testId}
			label={label}
			icon={icon}
			// The switch (28 px) made the header 40 px tall; a ghost card keeps
			// that height once the switch steps aside.
			headerClassName={unavailable && toggle ? 'min-h-10' : undefined}
			actions={
				unavailable ? null : (
					<div className="flex items-center gap-2">
						{action}
						{toggle ? (
							<ChartViewToggle value={view} onChange={setView} />
						) : null}
					</div>
				)
			}
		>
			{state ? (
				<DashboardCardState testId={testId} {...state}>
					{body}
				</DashboardCardState>
			) : (
				body
			)}
		</DashboardCard>
	);
};

/** The unknown-value convention: a figure the API cannot source is « — ». */
export const Unknown = () => (
	<span className="text-sm text-muted-foreground">{UNKNOWN_VALUE}</span>
);
