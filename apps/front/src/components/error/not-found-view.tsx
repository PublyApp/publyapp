import Button from '@mui/material/Button';

import { useHomePath } from '#app/hooks/use-home-path.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type NotFoundViewProps = {
	withLayout?: boolean;
	title?: string;
	description?: string;
};

export const NotFoundView = ({
	withLayout = true,
	title,
	description,
}: NotFoundViewProps) => {
	const { t } = useTranslate();
	const homePath = useHomePath();

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="primary"
			icon="solar:magnifer-bold"
			code="404"
			title={title || t('page-not-found')}
			description={description || t('not-found-sentence')}
			actions={
				<Button component={RouterLink} href={homePath} variant="contained">
					{t('go-to-home')}
				</Button>
			}
		/>
	);
};
