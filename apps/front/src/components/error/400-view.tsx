import Button from '@mui/material/Button';

import { useHomePath } from '#app/hooks/use-home-path.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type View400Props = {
	withLayout?: boolean;
	title?: string;
	description?: string;
};

const View400 = ({ withLayout = true, title, description }: View400Props) => {
	const { t } = useTranslate();
	const homePath = useHomePath();

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="warning"
			numeral="400"
			title={title ?? t('bad-request')}
			description={description ?? t('bad-request-sentence')}
			actions={
				<Button
					component={RouterLink}
					href={homePath}
					size="large"
					variant="contained"
					sx={{ px: 4, py: 1.5, fontWeight: 600 }}
				>
					{t('go-to-home')}
				</Button>
			}
		/>
	);
};

export default View400;
