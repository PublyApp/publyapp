import { IconArrowRight } from '@tabler/icons-react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import QueryDisplay from '~/components/query-display';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { StatusPill } from '~/components/ui/product-page';
import { StateSurface } from '~/components/ui/state-surface';
import { formatDateTime } from '~/lib/format-date-time';
import {
	staffAuditLogsQueryOptions,
	toStaffAuditLogRows,
	useStaffAuditLogsQuery,
	type StaffAuditLogRow,
} from '~/lib/query/staff-audit-logs';

import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

import { categorizeAuditAction } from '../audit-logs/_audit-log-action-category';

/** The number of audit events the activity feed shows. The list endpoint's
 * default page is far larger than a feed needs; a small explicit size keeps
 * the dashboard payload light. */
const ACTIVITY_FEED_SIZE = 8;

/**
 * Maps one API row to the feed. This is the screen's only data-mapping line:
 * every rendered value below comes from `toStaffAuditLogRows` over
 * `GET /staff/audit-logs`, so removing this line empties the feed and fails
 * `activity.test.tsx` ("renders the mapped recent audit events").
 */
const toActivityEntries = (
	items: Parameters<typeof toStaffAuditLogRows>[0],
): StaffAuditLogRow[] => toStaffAuditLogRows(items);

const ActivityEntry = ({
	entry,
	t,
	locale,
}: {
	entry: StaffAuditLogRow;
	t: (key: string) => string;
	locale: string;
}) => {
	const { kind, tone } = categorizeAuditAction(entry.action);

	return (
		<div
			className="flex items-start justify-between gap-3 py-2.5"
			data-testid="staff-dashboard-activity-entry"
		>
			<div className="min-w-0">
				<StatusPill tone={tone}>{kind}</StatusPill>
				<p className="publy-type-helper mt-1 truncate">
					{entry.userName ?? entry.userEmail ?? t('common:unknown')}
				</p>
			</div>
			<time
				className="shrink-0 text-xs text-[var(--publy-foreground-secondary)]"
				dateTime={entry.createdAt?.toISOString()}
			>
				{formatDateTime(entry.createdAt, locale)}
			</time>
		</div>
	);
};

/**
 * The staff Dashboard › Activity tab: a real feed of the most recent audit
 * events (`GET /staff/audit-logs`, smallest honest slice of the same query
 * the full audit-logs page uses), linking there for filters and details.
 * No fabricated events — an empty log renders the empty state.
 */
const StaffDashboardActivityTab = () => {
	const { t, i18n } = useTranslation(['staff-audit-logs', 'common']);
	const locale = i18n?.language ?? 'en';
	const query = useStaffAuditLogsQuery({ size: ACTIVITY_FEED_SIZE });

	// Logout gate: read the hoisted error local instead of branching on the
	// query result — QueryDisplay owns state rendering below.
	const queryError = query.error;
	if (queryError !== null && shouldLogoutForFailure(queryError)) {
		return <LogoutRedirect />;
	}

	return (
		<Card data-testid="staff-dashboard-activity-panel">
			<CardHeader>
				<CardTitle>{t('common:recent-activity')}</CardTitle>
				<Link
					to="/staff/audit-logs"
					className={buttonVariants({ variant: 'outline', size: 'sm' })}
					data-testid="staff-dashboard-activity-view-all"
				>
					{t('common:view-all')}
					<IconArrowRight aria-hidden="true" className="size-4" />
				</Link>
			</CardHeader>
			<CardContent>
				<QueryDisplay
					query={query}
					LoadingSlot={
						<div
							className="space-y-3"
							data-testid="staff-dashboard-activity-skeleton"
						>
							<div className="h-4 w-2/5 animate-pulse rounded-[var(--publy-radius-sm)] bg-muted" />
							<div className="h-4 w-1/3 animate-pulse rounded-[var(--publy-radius-sm)] bg-muted" />
							<div className="h-4 w-1/2 animate-pulse rounded-[var(--publy-radius-sm)] bg-muted" />
						</div>
					}
					ErrorSlot={
						<StateSurface
							tone="danger"
							title={t('failed-to-load-activity')}
							description={t('failed-to-load-activity-description')}
							actions={
								<Button
									variant="outline"
									size="sm"
									onClick={() => void query.refetch()}
								>
									{t('common:retry')}
								</Button>
							}
							testId="staff-dashboard-activity-error"
						/>
					}
					EmptySlot={
						<StateSurface
							title={t('no-audit-logs-yet')}
							description={t('no-audit-logs-description')}
							testId="staff-dashboard-activity-empty"
						/>
					}
				>
					{({ data }) => {
						const entries = toActivityEntries(data.data).slice(
							0,
							ACTIVITY_FEED_SIZE,
						);

						if (entries.length === 0) {
							return (
								<StateSurface
									title={t('no-audit-logs-yet')}
									description={t('no-audit-logs-description')}
									testId="staff-dashboard-activity-empty"
								/>
							);
						}

						return (
							<div className="divide-y">
								{entries.map((entry) => (
									<ActivityEntry
										key={entry.id}
										entry={entry}
										t={(key) =>
											key.startsWith('common:')
												? t(key.slice('common:'.length))
												: t(key)
										}
										locale={locale}
									/>
								))}
							</div>
						);
					}}
				</QueryDisplay>
			</CardContent>
		</Card>
	);
};

export const Route = createFileRoute(
	'/_authed-layout/staff/dashboard/activity',
)({
	staticData: {
		preload: () => [
			{
				options: staffAuditLogsQueryOptions,
				variables: { size: ACTIVITY_FEED_SIZE },
			},
		],
		crumbs: () => [
			{ kind: 'label', labelKey: 'nav-dashboard', to: '/staff/dashboard' },
			{ kind: 'label', labelKey: 'nav-dashboard-activity' },
		],
		i18nNamespaces: ['staff-audit-logs'],
	},
	component: StaffDashboardActivityTab,
});
