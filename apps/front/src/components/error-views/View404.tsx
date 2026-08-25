import { IconSearchOff } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button.variants';

import { AppErrorView } from './AppErrorView';

export const View404 = ({ embedded }: { embedded?: boolean } = {}) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconSearchOff aria-hidden="true" className="size-7" />}
			code={t('error-404-code')}
			title={t('page-not-found')}
			description={t('not-found-sentence')}
			testId="view-404"
			embedded={embedded}
			actions={
				<Link to="/" className={buttonVariants({ variant: 'default' })}>
					{t('go-to-home')}
				</Link>
			}
		/>
	);
};
