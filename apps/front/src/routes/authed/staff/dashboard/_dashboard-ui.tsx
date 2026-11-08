import { IconArrowRight, IconTrendingUp } from '@tabler/icons-react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorKindState } from '~/components/error-views/error-kind-state';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { CodeSelect } from '~/components/ui/code-select';
import { SectionCard } from '~/components/ui/section-card';
import { Segmented } from '~/components/ui/segmented';
import { Skeleton } from '~/components/ui/skeleton';
import { StatCard } from '~/components/ui/stat-card';
import { resolveQueryError } from '~/lib/server/query-error-resolver';

import { GhostSpark, GhostTag } from './_chart-ghost';
import { ChartBody, ChartNote, Sparkline } from './_dashboard-charts';
import {
	DASHBOARD_PERIODS,
	ORGANISATION_SCOPES,
	organisationScopeLabelKey,
	periodLabelKey,
	periodStart,
	type DashboardPeriod,
	type OrganisationScope,
} from './_dashboard-filters';
import {
	UNKNOWN_VALUE,
	formatCount,
	formatPeriodRange,
} from './_dashboard-format';

type ChartView = 'chart' | 'table';
const CHART_VIEWS: readonly ChartView[] = ['chart', 'table'];

/** The « Période » / « Période du rapport » filter: CodeSelect (popup ≥ md,
 * bottom sheet below), never a native select element. */
export const PeriodSelect = ({
	id,
	value,
	onChange,
	ariaLabel,
	range = false,
}: {
	id: string;
	value: DashboardPeriod;
	onChange: (period: DashboardPeriod) => void;
	ariaLabel: string;
	/** Show the resolved date range instead of the period's name (the
	 * prototype's report filter). */
	range?: boolean;
}) => {
	const { t, i18n } = useTranslation('common');
	// The prototype's select trigger: 12px radius, its own hairline and muted
	// fill, 14px/21px text (#2339 fidelity). The shared SelectTrigger keeps its
	// site-wide 13px/10px scale; the plain classes win over its defaults.
	const triggerClass =
		'min-w-48 rounded-[12px] border-(--publy-input-border) bg-(--publy-muted) text-[14px] leading-[21px]';
	return (
		<CodeSelect
			id={id}
			value={value}
			options={DASHBOARD_PERIODS}
			label={(period) =>
				range
					? formatPeriodRange(periodStart(period), i18n.language)
					: t(periodLabelKey(period))
			}
			onChange={onChange}
			ariaLabel={ariaLabel}
			className={triggerClass}
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
			className="min-w-48 rounded-[12px] border-(--publy-input-border) bg-(--publy-muted) text-[14px] leading-[21px]"
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
			// The prototype's `.pa-seg`: a translucent border-coloured track and
			// 10px/12px items (#2339 fidelity). Its buttons are 500-weight.
			className="bg-[color-mix(in_srgb,var(--publy-border)_60%,transparent)]"
			itemClassName="px-2.5 leading-[1.45] font-medium"
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
		className="group/link inline-flex h-7 shrink-0 items-center gap-1 rounded-[var(--publy-radius-small-control)] px-1.5 text-[13px] leading-[1.45] font-medium text-(--publy-foreground-secondary) hover:text-foreground hover:underline hover:underline-offset-4"
	>
		{label}
		<IconArrowRight
			aria-hidden="true"
			className="size-3.5 transition-transform group-hover/link:translate-x-0.5"
		/>
	</Link>
);

/** The prototype's `.card-foot`: a quiet 12px line under a list card's rows
 * (10px/16px padding, 38px tall — #2339 fidelity). The prototype also prints
 * its data endpoint there; that is prototype metadata, not product copy. */
export const CardFoot = ({ children }: { children: ReactNode }) => (
	<div className="flex min-h-[38px] items-center justify-between gap-3 px-4 py-[10px] text-[12px] leading-[1.45] text-(--publy-foreground-muted)">
		{children}
	</div>
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
	// The prototype keeps the figure and the note inside one `.pa-shell-desc`
	// wrapper (2px gap, 14px top padding, 13px/1.45 base — #2339 fidelity).
	const body = (
		<>
			<div className="flex flex-col gap-[2px] px-4 pt-3.5 text-[13px] leading-[1.45]">
				{hero ? (
					<p className="text-[26px] leading-[1.1] font-semibold tracking-[-0.02em]">
						{unavailable ? (
							<span className="text-muted-foreground">{UNKNOWN_VALUE}</span>
						) : (
							hero
						)}
					</p>
				) : null}
				{noteSlot}
			</div>
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
	delta,
	deltaPeriod,
	sparkline,
}: {
	testId: string;
	label: string;
	icon: ReactNode;
	figure: number | null | undefined;
	locale: string;
	query?: UseQueryResult<unknown, Error>;
	/** The change against the previous window (« +8,4 % »), when a series the
	 * API serves makes it computable. */
	delta?: { label: string; direction: 'up' | 'down' };
	/** The comparison window's name (« vs 30 jours précédents »). */
	deltaPeriod?: string;
	sparkline?: readonly number[];
}) => {
	const { t } = useTranslation('common');
	const missing = figure === null || figure === undefined;

	let footer: ReactNode;
	if (missing) {
		footer = (
			<>
				<span className="min-w-0 truncate">{t('dashboard-ghost-tag')}</span>
				<GhostSpark />
			</>
		);
	} else if (delta) {
		footer = (
			<div className="flex min-h-9 min-w-0 items-center justify-between gap-3">
				<div className="min-w-0">
					<span
						data-testid={`${testId}-delta`}
						data-dir={delta.direction}
						className="inline-flex items-center gap-1 font-mono text-[13px] font-medium tabular-nums"
						style={{
							color:
								delta.direction === 'up'
									? 'var(--publy-success)'
									: 'var(--publy-danger)',
						}}
					>
						<IconTrendingUp
							aria-hidden="true"
							className={
								delta.direction === 'down' ? 'size-3.5 rotate-180' : 'size-3.5'
							}
						/>
						{delta.label}
					</span>
					{deltaPeriod ? (
						<p className="truncate text-[12px] text-(--publy-foreground-muted)">
							{deltaPeriod}
						</p>
					) : null}
				</div>
				{sparkline && sparkline.length > 1 ? (
					<Sparkline values={sparkline} />
				) : null}
			</div>
		);
	} else {
		// The ghost footer's 36 px, kept so the card does not jump once the
		// delta series ships. No ghost text or sparkline on a figure.
		footer = <span aria-hidden="true" className="block min-h-9" />;
	}

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
			footer={footer}
			unavailable={missing}
		/>
	);

	if (!query) {
		return card;
	}

	// The compact error names the real cause (server, offline, 403…)
	// through the shared resolver, and paints nothing for a cancelled request.
	const resolvedError = resolveQueryError(query.error, t);

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
				// A KPI is one cell of a four-card row: the page-scale error state
				// (pictogram, title, sentence, 44 px button) made that row ~400 px
				// tall. The compact error keeps the card's own frame and its « — »
				// figure; the message stacks above the retry so the whole cause
				// reads at 1440 px and at 390 px — never an ellipsis (#2339 fix6).
				resolvedError.silent ? null : (
					<StatCard
						testId={testId}
						label={label}
						icon={icon}
						value={
							<span className="text-muted-foreground">{UNKNOWN_VALUE}</span>
						}
						footer={
							<div
								role="alert"
								data-testid={`${testId}-error`}
								className="flex min-w-0 flex-col items-start gap-1.5"
							>
								<span>{resolvedError.title}</span>
								<Button
									size="sm"
									variant="outline"
									className="h-7 shrink-0 px-2"
									onClick={() => void query.refetch()}
								>
									{t('common:retry')}
								</Button>
							</div>
						}
					/>
				)
			}
		>
			{() => card}
		</QueryDisplay>
	);
};
