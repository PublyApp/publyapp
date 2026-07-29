import Button from '@mui/material/Button';

import { useHomePath } from '#app/hooks/use-home-path.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type View403Props = {
	withLayout?: boolean;
};

export const View403 = ({ withLayout = true }: View403Props) => {
	const { t } = useTranslate();
	const homePath = useHomePath();

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="error"
			icon="solar:forbidden-circle-outline"
			code="403 — Forbidden"
			title={t('no-permission')}
			description={t('forbidden-description')}
			actions={
				<Button component={RouterLink} href={homePath} variant="contained">
					{t('go-to-home')}
				</Button>
			}
		/>
	);
};
