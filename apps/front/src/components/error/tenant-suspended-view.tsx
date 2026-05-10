import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';

import { FRONT_PATH_NAMES } from '@org/shared-ts/lib/constants';

import { useTranslate } from '#app/hooks/use-translate.ts';

import { RouterLink } from '../router-link';
import { AppErrorView } from './app-error-view';

// ----------------------------------------------------------------------

type TenantSuspendedViewProps = {
	withLayout?: boolean;
};

export const TenantSuspendedView = ({
	withLayout = true,
}: TenantSuspendedViewProps) => {
	const { t } = useTranslate();

	const description = (
		<Typography
			component="span"
			variant="body2"
			sx={{ color: 'text.secondary', lineHeight: 1.6 }}
		>
			{t('tenant-suspended-description')}{' '}
			<Link
				href="mailto:support@example.com"
				color="inherit"
				sx={{ fontWeight: 'bold' }}
			>
				{t('contact-support')}
			</Link>
		</Typography>
	);

	return (
		<AppErrorView
			withLayout={withLayout}
			tone="warning"
			icon="solar:shield-keyhole-outline"
			title={t('tenant-suspended-title')}
			errorDetails={description}
			actions={
				<Button
					component={RouterLink}
					href={FRONT_PATH_NAMES.tenant().organizations}
					variant="contained"
				>
					{t('go-to-my-organizations')}
				</Button>
			}
		/>
	);
};
