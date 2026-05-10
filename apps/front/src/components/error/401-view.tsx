import Button from '@mui/material/Button';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type View401Props = {
	withLayout?: boolean;
};

export const View401 = ({ withLayout = true }: View401Props) => {
	const { t } = useTranslate();

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="primary"
			icon="solar:shield-keyhole-outline"
			code="401"
			title={t('authentication-required')}
			description={t('unauthorized-description')}
			actions={
				<>
					<Button
						component={RouterLink}
						href={FRONT_PATH_NAMES.auth.login}
						variant="contained"
					>
						{t('go-to-login')}
					</Button>
					<Button component={RouterLink} href="/" variant="outlined">
						{t('go-to-home')}
					</Button>
				</>
			}
		/>
	);
};
