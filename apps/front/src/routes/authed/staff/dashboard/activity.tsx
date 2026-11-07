import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { HistoryPage } from '~/components/history/history-page';
import type {
	HistoryCategory,
	HistoryEvent,
} from '~/components/history/history-types';
import type { ListFiltersValue } from '~/components/list/list-types';
import {
	toStaffAuditLogRows,
	useAuditLogActionsQuery,
	useStaffAuditLogsQuery,
} from '~/lib/query/staff-audit-logs';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import {
	buildAuditActionCatalog,
	buildAuditLogFilters,
	resolveAuditLogSelection,
} from '../audit-logs/_audit-log-history-filters';
import {
	auditLogPeriodStart,
	type AuditLogPeriod,
} from '../audit-logs/_list-search-params';

/** The dashboard feed is a glance, not the full log: one page of the same
 * query the audit-logs page pages through. */
const ACTIVITY_FEED_SIZE = 50;

const toHistoryEvents = (
	rows: ReturnType<typeof toStaffAuditLogRows>,
): HistoryEvent[] =>
	rows.map((row) => ({
		id: row.id,
		at: row.createdAt,
		actorName: row.userName,
		action: row.action,
		ipAddress: row.ipAddress,
		targetId: row.targetId,
	}));

/**
 * The staff Dashboard › Activité tab: the shared activity history (§5.1), fed
 * by the same `GET /staff/audit-logs` query as `/staff/audit-logs` — per-day
 * groups, search, category/period/sensitivity filters and the retention
 * footnote. The dashboard owns the page title, so the history renders without
 * its own title row.
 */
const Activity = () => {
	const { t, i18n } = useTranslation(['staff-audit-logs', 'common']);
	const { t: tCommon } = useTranslation('common');
	const navigate = Route.useNavigate();
	const locale = i18n.language;

	const [q, setQ] = useState('');
	const [categories, setCategories] = useState<HistoryCategory[]>([]);
	const [period, setPeriod] = useState<AuditLogPeriod | undefined>();
	const [sensitive, setSensitive] = useState(false);

	const catalogQuery = useAuditLogActionsQuery();
	const catalog = useMemo(
		() => buildAuditActionCatalog(catalogQuery.data?.actions ?? []),
		[catalogQuery.data],
	);
	const selection = resolveAuditLogSelection({
		catalog,
		categories,
		sensitivity: sensitive,
		startDate: period ? auditLogPeriodStart(period) : undefined,
	});
	const query = useStaffAuditLogsQuery(
		{
			q: q.trim() || undefined,
			actions: selection.actions?.split(','),
			startDate: selection.startDate,
			size: ACTIVITY_FEED_SIZE,
		},
		{ enabled: !selection.impossible },
	);

	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	const rows = selection.impossible
		? []
		: toStaffAuditLogRows(query.data?.data);
	const events = toHistoryEvents(rows);

	const search = {
		q,
		period,
		category: categories.join(','),
		sensitivity: sensitive ? ('sensitive' as const) : undefined,
	};
	const filters = buildAuditLogFilters({
		t: tCommon,
		catalog,
		search,
		categoryCounts: null,
	});
	const filtersValue: ListFiltersValue = {
		category: categories,
		period: period ? [period] : [],
		sensitivity: sensitive ? ['sensitive'] : [],
	};

	const applyFilters = (next: ListFiltersValue): void => {
		const nextPeriod = (next.period ?? []).at(-1);
		setPeriod(
			nextPeriod === 'today' || nextPeriod === 'week' || nextPeriod === 'month'
				? nextPeriod
				: undefined,
		);
		setCategories((next.category ?? []) as HistoryCategory[]);
		setSensitive((next.sensitivity ?? []).includes('sensitive'));
	};

	return (
		<HistoryPage
			testId="staff-dashboard-activity"
			title={t('common:activity')}
			header={<div />}
			totalCount={query.data?.totalCount ?? null}
			searchPlaceholder={tCommon('history-search-placeholder')}
			q={q}
			onSearch={(next) => setQ(next ?? '')}
			searchTestId="staff-dashboard-activity-search"
			events={events}
			locale={locale}
			onOpen={(event) => {
				void navigate({
					to: '/staff/audit-logs/$logId',
					params: { logId: event.id },
				});
			}}
			openLabel={(event) =>
				t('common:list-open-row', {
					name: event.action ?? event.actorName ?? event.id,
				})
			}
			emptyTitle={t('no-audit-logs-yet')}
			emptyText={t('no-audit-logs-description')}
			noMatchTitle={t('no-audit-logs-match-title')}
			noMatchText={t('no-audit-logs-match-description')}
			filters={filters}
			filtersValue={filtersValue}
			onFiltersChange={applyFilters}
			queryState={{
				isPending: query.isPending,
				isError: query.isError,
				onRetry: () => void query.refetch(),
			}}
		/>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/dashboard/activity',
)({
	staticData: {
		crumbs: () => [
			{ kind: 'label', labelKey: 'nav-dashboard', to: '/staff/dashboard' },
			{ kind: 'label', labelKey: 'nav-dashboard-activity' },
		],
		i18nNamespaces: ['staff-audit-logs'],
	},
	component: Activity,
});
