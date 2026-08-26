import { IconLoader2 } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

export const AssignedProfilesLoadingCard = () => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<section
			className="rounded-[var(--publy-radius-card)] bg-[var(--publy-surface)] shadow-[var(--publy-shadow-ring)]"
			data-testid="staff-user-profiles-loading"
		>
			<div className="publy-card-header">
				<p className="publy-type-section-title">
					{t('assigned-profiles-and-roles')}
				</p>
			</div>
			<div className="flex items-center gap-2.5 px-4 pb-4 pt-3 text-sm text-muted-foreground">
				<IconLoader2
					role="status"
					aria-label={t('common:common-loading')}
					className="size-4 animate-spin"
				/>
				<span>{t('loading-assigned-profiles')}</span>
			</div>
		</section>
	);
};
