import { IconAlertCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';

export const StaffUserDetailsEmptyPayload = () => {
	const { t } = useTranslation(['staff-users', 'common']);

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('common:error-404-code')}
			title={t('staff-user-not-found-title')}
			description={t('staff-user-payload-empty')}
			testId="staff-user-details-empty"
		/>
	);
};
