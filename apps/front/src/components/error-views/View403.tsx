import { IconLock } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/components/ui/button.variants';

import { AppErrorView } from './AppErrorView';

export const View403 = ({ embedded }: { embedded?: boolean } = {}) => {
	const { t } = useTranslation('common');

	return (
		<AppErrorView
			icon={<IconLock aria-hidden="true" className="size-7" />}
			code={t('error-403-code')}
			title={t('no-access-title')}
			description={t('forbidden-description')}
			testId="view-403"
			tone="danger"
			embedded={embedded}
			actions={
				<Link to="/" className={buttonVariants({ variant: 'default' })}>
					{t('go-to-home')}
				</Link>
			}
		/>
	);
};
