import { type MouseEventHandler } from 'react';

import { LoadingButton } from '@mui/lab';
import { Container, Typography, type ContainerProps } from '@mui/material';

import Iconify from '@/ui-react/components/Iconify';

import useTranslate from '../hooks/useTranslate';

type Props = {
	message: string;
	onRetry?: MouseEventHandler;
	loading?: boolean;
	hideRetryButton?: boolean;
} & ContainerProps;

const Retry = ({ message, onRetry, loading, sx, hideRetryButton, children, ...other }: Props) => {
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
				...sx,
			}}
			{...other}
		>
			<Typography variant="h3" mb={3}>
				{message}
			</Typography>
			{/* <p>{description}</p> */}
			{!hideRetryButton ? (
				<LoadingButton
					size="large"
					variant="contained"
					startIcon={<Iconify icon="gravity-ui:arrow-rotate-right" width={24} />}
					loadingIndicator={<Iconify icon="svg-spinners:12-dots-scale-rotate" width={24} />}
					loading={loading}
					loadingPosition="start"
					onClick={onRetry}
				>
					<span>{t('retry')}</span>
				</LoadingButton>
			) : null}
			{children}
		</Container>
	);
};

export default Retry;
