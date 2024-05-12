import { type MouseEventHandler } from 'react';

import { LoadingButton } from '@mui/lab';
import { Container, Typography } from '@mui/material';

import Iconify from '@/ui-react/components/Iconify';
import useTranslate from '@/ui-react/hooks/useTranslate';

type Props = {
	message: string;
	onRetry: MouseEventHandler;
	loading?: boolean;
};

const Retry = ({ message, onRetry, loading }: Props) => {
	const { t } = useTranslate();

	return (
		<Container
			maxWidth="lg"
			sx={{
				py: 12,
				mb: 6,
				borderBottom: (theme) => {
					return `solid 1px ${theme.palette.divider}`;
				},
			}}
		>
			<Typography variant="h3" mb={3}>
				{message}
			</Typography>
			{/* <p>{description}</p> */}
			<LoadingButton
				size="large"
				variant="contained"
				// <Icon icon="fa6-solid:arrow-rotate-right" />
				// <Icon icon="gravity-ui:arrow-rotate-right" />
				startIcon={<Iconify icon="gravity-ui:arrow-rotate-right" width={24} />}
				// startIcon={<Iconify icon="svg-spinners:12-dots-scale-rotate" width={24} />}
				loadingIndicator={<Iconify icon="svg-spinners:12-dots-scale-rotate" width={24} />}
				loading={loading}
				loadingPosition="start"
				onClick={onRetry}
			>
				<span>{t('retry')}</span>
			</LoadingButton>
		</Container>
	);
};

export default Retry;
