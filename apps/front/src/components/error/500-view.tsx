import Button from '@mui/material/Button';

import { useRouter } from '#app/hooks/use-router.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';

import { Iconify } from '../iconify/iconify';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type View500Props = {
	withLayout?: boolean;
};

export const View500 = ({ withLayout = true }: View500Props) => {
	const { t } = useTranslate();
	const router = useRouter();

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="error"
			icon="solar:danger-triangle-outline"
			code="500"
			title={t('error-500-title')}
			description={t('error-500-description')}
			actions={
				<Button
					variant="contained"
					onClick={() => router.refresh()}
					startIcon={<Iconify icon="solar:restart-bold" width={18} />}
				>
					{t('reload-page')}
				</Button>
			}
		/>
	);
};
