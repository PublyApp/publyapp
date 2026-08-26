import { useTranslation } from 'react-i18next';
import { StatusPill } from '~/components/ui/product-page';
import { statusPillTone } from '~/components/ui/status-tone';
import { formatDateTime } from '~/lib/format-date-time';
import {
	formatAccountLevelLabel,
	formatStaffStatusLabel,
} from '~/routes/authed/staff/staff-users/status-labels';

import { DetailMetaItem } from './_detail-meta-item';

export const ContactDetailsCard = ({
	details,
	locale,
}: {
	details: {
		displayName: string;
		email: string;
		firstName: string | null;
		lastName: string | null;
		accountLevel: string | null;
		status: string | null;
		createdAt: Date | null;
		updatedAt: Date | null;
	};
	locale: string;
}) => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<section className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]">
			<div className="publy-card-header">
				<p className="publy-type-section-title">{t('contact-details')}</p>
			</div>
			<div className="px-4 pb-4 pt-3">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					<DetailMetaItem
						label={t('common:name')}
						value={details.displayName}
					/>
					<DetailMetaItem
						label={t('common:email')}
						value={details.email || t('common:no-email-address')}
					/>
					{details.accountLevel ? (
						<DetailMetaItem
							label={t('role')}
							value={formatAccountLevelLabel(details.accountLevel, t)}
						/>
					) : null}
					<DetailMetaItem
						label={t('common:status')}
						value={
							<StatusPill tone={statusPillTone(details.status)}>
								{formatStaffStatusLabel(details.status, t)}
							</StatusPill>
						}
					/>
					<DetailMetaItem
						label={t('common:created')}
						value={formatDateTime(details.createdAt, locale)}
					/>
					<DetailMetaItem
						label={t('common:updated')}
						value={formatDateTime(details.updatedAt, locale)}
					/>
				</div>
			</div>
		</section>
	);
};
