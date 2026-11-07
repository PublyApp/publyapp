import { useTranslation } from 'react-i18next';
import { Card } from '~/components/ui/card';
import type { StaffRoleDetails } from '~/lib/query/staff-roles';

/** The role detail page's About card. Split out of the page component so the
 * page stays a size a reader can hold in one view. */
export const StaffRoleAboutCard = ({
	details,
	permissionsCountLabel,
}: {
	details: StaffRoleDetails;
	permissionsCountLabel: string | number;
}) => {
	const { t } = useTranslation('common');

	return (
		<Card className="publy-detail-card">
			<div className="publy-detail-card-header">
				<span className="text-[14px] font-semibold">{t('about')}</span>
			</div>
			<div className="publy-detail-card-body">
				<div className="publy-detail-row">
					<span className="publy-type-metadata-label">{t('role-id')}</span>
					<span className="font-mono text-[12px] text-[var(--publy-foreground-secondary)]">
						{details.id}
					</span>
				</div>
				<div className="publy-detail-row">
					<span className="publy-type-metadata-label">{t('permissions')}</span>
					<span className="text-[12px] font-medium">
						{permissionsCountLabel}
					</span>
				</div>
			</div>
		</Card>
	);
};
