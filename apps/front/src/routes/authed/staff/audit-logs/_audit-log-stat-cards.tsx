import {
	IconAlertTriangle,
	IconFileSearch,
	IconKey,
	IconMask,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { isSensitiveHistoryAction } from '~/components/history/history-actions';
import { StatCard } from '~/components/ui/stat-card';

import type { AuditLogListCounts } from '@org/client-ts/models/index';

/** The unknown-figure convention (§1.6): a stat the API cannot source is
 * « — », never a fabricated or page-local number. */
const DASH = '—';

/** The reference's card shell (§4.7): a 16px radius and a flat 1px ring. The
 * shared StatCard keeps the product's 14px chrome shadow for the pages the QA
 * lot owns; these four cards override it to the prototype's measured values. */
const CARD = 'rounded-[16px] shadow-[var(--publy-shadow-ring)]';

/** Sums the per-action counts of the whole history for one action family. The
 * classification stays in `history-actions`, the single source the filter and
 * the pills already read. */
const sumActions = (
	counts: AuditLogListCounts,
	matches: (action: string) => boolean,
): number => {
	let total = 0;
	for (const row of counts.byAction ?? []) {
		if (matches(row.action ?? '')) {
			total += row.count ?? 0;
		}
	}
	return total;
};

/**
 * The four audit figures (§4.7), all sourced from the find response's
 * whole-history `counts` (events today + last 30 days, sensitive actions,
 * impersonations, refused sign-ins). « — » only while the API has not
 * answered.
 */
export const AuditLogStatCards = ({
	counts,
}: {
	counts: AuditLogListCounts | null | undefined;
}) => {
	const { t } = useTranslation('staff-audit-logs');

	const sensitive = counts
		? sumActions(counts, (action) => isSensitiveHistoryAction(action))
		: null;
	const impersonations = counts
		? sumActions(counts, (action) => action.startsWith('impersonation.'))
		: null;
	const refused = counts
		? sumActions(counts, (action) => action === 'auth.login.failed')
		: null;

	return (
		<>
			<StatCard
				testId="audit-stat-today"
				className={CARD}
				label={t('stat-events-today')}
				icon={<IconFileSearch />}
				value={counts ? (counts.today ?? 0) : DASH}
				footer={
					counts
						? t('stat-events-today-window', { count: counts.last30Days ?? 0 })
						: DASH
				}
			/>
			<StatCard
				testId="audit-stat-sensitive"
				className={CARD}
				label={t('stat-sensitive')}
				icon={<IconAlertTriangle />}
				value={sensitive ?? DASH}
				footer={
					<span className="text-[var(--publy-chip-pending-text)]">
						{t('stat-sensitive-footer')}
					</span>
				}
			/>
			<StatCard
				testId="audit-stat-impersonations"
				className={CARD}
				label={t('stat-impersonations')}
				icon={<IconMask />}
				value={impersonations ?? DASH}
				footer={t('stat-impersonations-footer')}
			/>
			<StatCard
				testId="audit-stat-denied"
				className={CARD}
				label={t('stat-denied')}
				icon={<IconKey />}
				value={refused ?? DASH}
				footer={t('stat-denied-footer')}
			/>
		</>
	);
};
