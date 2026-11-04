import { IconLock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { AppErrorView } from './AppErrorView';

/**
 * Forbidden keeps the one tone rule ShopKart OS applies: retrying cannot help
 * a 403, so « Retour à l'accueil » is the primary action and there is no
 * retry button.
 */
export const View403 = ({ embedded }: { embedded?: boolean } = {}) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconLock aria-hidden="true" className="size-7" />}
			code={t('error-403-code')}
			title={t('no-access-title')}
			description={t('forbidden-description')}
			testId="view-403"
			tone="warning"
			embedded={embedded}
			backOnly
		/>
	);
};
