import {
	IconAlertTriangle,
	IconFileSearch,
	IconKey,
	IconMask,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { StatCard } from '~/components/ui/stat-card';

/** The unknown-figure convention (§1.6): a stat the API cannot source is
 * « — », never a fabricated or page-local number. */
const DASH = '—';

/** The reference's card shell (§4.7): a 16px radius and a flat 1px ring. The
 * shared StatCard keeps the product's 14px chrome shadow for the pages the QA
 * lot owns; these four cards override it to the prototype's measured values. */
const CARD = 'rounded-[16px] shadow-[var(--publy-shadow-ring)]';

/**
 * The four audit figures (§4.7). None of them has an API source yet: the list
 * endpoint is cursor-paginated with no count, and there is no audit stats
 * endpoint. The labels and their footers are kept so the gap is visible, and
 * every figure reads « — » (#2286 API gap).
 */
export const AuditLogStatCards = () => {
	const { t } = useTranslation('staff-audit-logs');

	return (
		<>
			<StatCard
				className={CARD}
				label={t('stat-events-today')}
				icon={<IconFileSearch />}
				value={DASH}
				footer={t('stat-events-today-footer')}
			/>
			<StatCard
				className={CARD}
				label={t('stat-sensitive')}
				icon={<IconAlertTriangle />}
				value={DASH}
				footer={
					<span className="text-[var(--publy-chip-pending-text)]">
						{t('stat-sensitive-footer')}
					</span>
				}
			/>
			<StatCard
				className={CARD}
				label={t('stat-impersonations')}
				icon={<IconMask />}
				value={DASH}
				footer={t('stat-impersonations-footer')}
			/>
			<StatCard
				className={CARD}
				label={t('stat-denied')}
				icon={<IconKey />}
				value={DASH}
				footer={t('stat-denied-footer')}
			/>
		</>
	);
};
