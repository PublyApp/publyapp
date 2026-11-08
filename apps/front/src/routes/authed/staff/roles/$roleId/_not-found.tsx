import { IconSearchOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';

/** The staff-role detail page's 404 view: an empty body, or a payload without
 * its required role identity. Extracted so the page component stays under the
 * giant-component threshold. */
export const StaffRoleNotFound = () => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('staff-role-not-found')}
			description={t('staff-role-payload-empty')}
			testId="staff-role-details-empty"
		/>
	);
};
