import { IconAlertCircle } from '@tabler/icons-react';
import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AppErrorView } from '~/components/error-views/AppErrorView';
import { LogoutRedirect } from '~/components/error-views/LogoutRedirect';
import { View403 } from '~/components/error-views/View403';
import { View404 } from '~/components/error-views/View404';
import { Button } from '~/components/ui/button';
import { buttonVariants } from '~/components/ui/button.variants';

import { getFailureStatus } from './_api-problem-status';

export const AuthedLayoutErrorBoundary = ({
	error,
	reset,
}: {
	error: unknown;
	reset: () => void;
}) => {
	const router = useRouter();
	const { t } = useTranslation('common');
	const routeStatus = getFailureStatus(error);
	if (routeStatus === 401) {
		return <LogoutRedirect />;
	}

	if (routeStatus === 403) {
		return <View403 />;
	}

	if (routeStatus === 404) {
		return <View404 />;
	}

	const retry = () => {
		reset();
		void router.invalidate();
	};

	return (
		<AppErrorView
			icon={<IconAlertCircle aria-hidden="true" className="size-7" />}
			code={t('error-500-code')}
			title={t('something-went-wrong')}
			description={t('problem-loading-page')}
			actions={
				<>
					<Button variant="default" onClick={() => retry()} type="button">
						{t('retry')}
					</Button>
					<Link to="/" className={buttonVariants({ variant: 'outline' })}>
						{t('go-to-home')}
					</Link>
				</>
			}
		/>
	);
};
