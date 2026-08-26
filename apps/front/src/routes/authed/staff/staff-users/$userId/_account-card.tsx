import { useTranslation } from 'react-i18next';

import { DetailMetaItem } from './_detail-meta-item';

export const AccountCard = ({ displayId }: { displayId: string }) => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">{t('account')}</p>
			</div>
			<div className="px-4 pb-4 pt-3">
				<div className="space-y-3 text-sm">
					<DetailMetaItem label={t('common:user-id')} value={displayId} />
				</div>
			</div>
		</section>
	);
};
