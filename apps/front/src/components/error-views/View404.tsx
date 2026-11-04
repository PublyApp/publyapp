import { IconSearchOff } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { AppErrorView } from './AppErrorView';

/** ShopKart OS's 404 pair: « Réessayer » (the link may be right by now) then
 * the outline « Retour à l'accueil »; no eyebrow, no raw status sentence. */
export const View404 = ({ embedded }: { embedded?: boolean } = {}) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('page-not-found')}
			description={t('not-found-sentence')}
			testId="view-404"
			tone="neutral"
			embedded={embedded}
		/>
	);
};
