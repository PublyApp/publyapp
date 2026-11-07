import { IconArrowRight } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorKindState } from '~/components/error-views/error-kind-state';
import QueryDisplay from '~/components/query-display';
import { CodeSelect } from '~/components/ui/code-select';
import { SectionCard } from '~/components/ui/section-card';
import { Segmented } from '~/components/ui/segmented';
import { Skeleton } from '~/components/ui/skeleton';
import { StatCard } from '~/components/ui/stat-card';

import { GhostSpark, GhostTag } from './_chart-ghost';
import { ChartBody, ChartNote } from './_dashboard-charts';
import {
	DASHBOARD_PERIODS,
	ORGANISATION_SCOPES,
	organisationScopeLabelKey,
	periodLabelKey,
	type DashboardPeriod,
	type OrganisationScope,
} from './_dashboard-filters';
import { UNKNOWN_VALUE, formatCount } from './_dashboard-format';

type ChartView = 'chart' | 'table';
const CHART_VIEWS: readonly ChartView[] = ['chart', 'table'];

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
const ChartViewToggle = ({
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
	to: '/staff/tenants' | '/staff/invitations' | '/staff/audit-logs';
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
 * A card's query ladder, through the shared `QueryDisplay`: the card skeleton
 * while the query answers, the classified error with its retry, the caller's
 * empty state, then the card body. Every dashboard card that owns a query goes
 * through it — a card with no query at all (the ghost case) renders directly.
 */
export const DashboardCardQuery = <TData,>({
	query,
	testId,
	emptySlot,
	isEmpty,
	children,
}: {
	query: UseQueryResult<TData, Error>;
	testId: string;
	emptySlot?: ReactNode;
	isEmpty?: (data: TData) => boolean;
	children: ReactNode | ((props: { data: TData }) => ReactNode);
}) => (
	<QueryDisplay
		query={query}
		LoadingSlot={
			<div className="space-y-3 p-4" data-testid={`${testId}-skeleton`}>
				<Skeleton className="h-4 w-2/5" />
				<Skeleton className="h-24 w-full" />
			</div>
		}
		ErrorSlot={
			<div className="p-4">
				<ErrorKindState
					scale="inline"
					panel
					error={query.error}
					onRetry={() => void query.refetch()}
					testId={`${testId}-error`}
				/>
			</div>
		}
		EmptySlot={emptySlot}
		isEmpty={isEmpty}
	>
		{children}
	</QueryDisplay>
);

/**
 * A chart card's series: the chart (and its table twin) when the API serves it,
 * or — when it does not — the card's own ghost chart and the one sentence that
 * says what will live there. The two branches are the only way in: an
 * unavailable series can never be passed as an empty chart.
 */
type ChartCardSeries =
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
	query,
	action,
}: {
	testId: string;
	label: string;
	icon: ReactNode;
	/** The card's description; omitted when the card has none to state. */
	note?: string;
	/** An optional figure above the note (the prototype's `chart-hero`). */
	hero?: ReactNode;
	series: ChartCardSeries;
	toggle?: boolean;
	/** The card's own query, when it has one. A ghost series has none. */
	query?: UseQueryResult<unknown, Error>;
	action?: ReactNode;
}) => {
	const [view, setView] = useState<ChartView>('chart');
	const unavailable = series.status === 'unavailable';
	let noteSlot: ReactNode = null;
	if (unavailable) {
		noteSlot = (
			<ChartNote>
				<span className="ghost-sentence">{series.sentence}</span>
			</ChartNote>
		);
	} else if (note) {
		noteSlot = <ChartNote>{note}</ChartNote>;
	}
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
			{noteSlot}
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
			{query ? (
				<DashboardCardQuery testId={testId} query={query}>
					{body}
				</DashboardCardQuery>
			) : (
				body
			)}
		</DashboardCard>
	);
};

/**
 * A KPI card (§5.2): the figure when the API answered, the existing skeleton
 * while it is answering, the existing error state when it failed, and only
 * « — » + the ghost footer when the series does not exist at all. A real 0 is
 * a figure and shows « 0 ». A KPI with no query at all (a series the API does
 * not serve) is a ghost and renders directly, outside `QueryDisplay`.
 */
export const KpiCard = ({
	testId,
	label,
	icon,
	figure,
	locale,
	query,
}: {
	testId: string;
	label: string;
	icon: ReactNode;
	figure: number | null | undefined;
	locale: string;
	query?: UseQueryResult<unknown, Error>;
}) => {
	const { t } = useTranslation('common');
	const missing = figure === null || figure === undefined;

	const card = (
		<StatCard
			testId={testId}
			label={label}
			icon={icon}
			value={
				missing ? (
					<span className="text-muted-foreground">{UNKNOWN_VALUE}</span>
				) : (
					formatCount(figure, locale)
				)
			}
			footer={
				missing ? (
					<>
						<span className="min-w-0 truncate">{t('dashboard-ghost-tag')}</span>
						<GhostSpark />
					</>
				) : (
					// The ghost footer's 36 px, kept so the card does not jump once
					// the delta series ships. No ghost text or sparkline on a figure.
					<span aria-hidden="true" className="block min-h-9" />
				)
			}
			unavailable={missing}
		/>
	);

	if (!query) {
		return card;
	}

	return (
		<QueryDisplay
			query={query}
			LoadingSlot={
				<StatCard
					testId={`${testId}-skeleton`}
					label={label}
					icon={icon}
					value={<Skeleton className="h-7 w-20" />}
					footer={<Skeleton className="h-4 w-28" />}
				/>
			}
			ErrorSlot={
				<div
					data-testid={testId}
					className="flex min-h-28 flex-col justify-center rounded-[16px] bg-card p-1 text-card-foreground shadow-(--effect-raised-control)"
				>
					<ErrorKindState
						scale="inline"
						panel
						error={query.error}
						onRetry={() => void query.refetch()}
						testId={`${testId}-error`}
					/>
				</div>
			}
		>
			{() => card}
		</QueryDisplay>
	);
};
