import { useTranslation } from 'react-i18next';
import { Card } from '~/components/ui/card';

import { DetailItem, formatDateTime } from '../_tenant-details-shell';

export const TenantUserActivityCard = ({
	createdAt,
	updatedAt,
	language,
}: {
	createdAt: Date | null;
	updatedAt: Date | null;
	language: string;
}) => {
	const { t } = useTranslation('common');

	return (
		<Card className="space-y-4 p-5">
			<div className="space-y-1">
				<p className="text-lg font-semibold text-foreground">{t('activity')}</p>
				<p className="text-sm text-muted-foreground">
					{t('tenant-user-activity-description')}
				</p>
			</div>
			<div className="grid gap-4">
				{createdAt ? (
					<DetailItem
						label={t('created')}
						value={formatDateTime(createdAt, language)}
					/>
				) : null}
				{updatedAt ? (
					<DetailItem
						label={t('updated')}
						value={formatDateTime(updatedAt, language)}
					/>
				) : null}
				{!createdAt && !updatedAt ? (
					<div className="rounded-large border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
						{t('tenant-user-no-timestamps')}
					</div>
				) : null}
			</div>
		</Card>
	);
};
