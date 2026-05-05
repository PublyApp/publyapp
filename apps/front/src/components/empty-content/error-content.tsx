import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import type { SxProps, Theme } from '@mui/material/styles';
import { styled } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import { varAlpha } from 'minimal-shared/utils';

import { Iconify } from '#app/components/iconify/iconify.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';

// ----------------------------------------------------------------------

export type ErrorContentProps = React.ComponentProps<'div'> & {
	title?: string;
	description?: string;
	filled?: boolean;
	sx?: SxProps<Theme>;
	onRetry?: () => void;
	retryLabel?: string;
	slotProps?: {
		title?: React.ComponentProps<typeof Typography>;
		description?: React.ComponentProps<typeof Typography>;
		retryButton?: React.ComponentProps<typeof Button>;
	};
};

export const ErrorContent = ({
	sx,
	filled,
	slotProps,
	onRetry,
	retryLabel,
	description,
	title = 'Something went wrong',
	...other
}: ErrorContentProps) => {
	const { t } = useTranslate();

	return (
		<ContentRoot filled={filled} sx={sx} {...other}>
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: 80,
					height: 80,
					borderRadius: '50%',
					bgcolor: (theme) =>
						varAlpha(theme.vars.palette.error.mainChannel, 0.08),
				}}
			>
				<Iconify
					icon="solar:danger-triangle-bold"
					width={48}
					sx={{ color: 'error.main' }}
				/>
			</Box>

			{title && (
				<Typography
					variant="h6"
					{...slotProps?.title}
					sx={[
						{
							mt: 2,
							textAlign: 'center',
							color: 'text.primary',
						},
						...(Array.isArray(slotProps?.title?.sx)
							? (slotProps?.title?.sx ?? [])
							: [slotProps?.title?.sx]),
					]}
				>
					{title}
				</Typography>
			)}

			{description && (
				<Typography
					variant="body2"
					{...slotProps?.description}
					sx={[
						{
							mt: 1,
							textAlign: 'center',
							color: 'text.secondary',
							maxWidth: 360,
						},
						...(Array.isArray(slotProps?.description?.sx)
							? (slotProps?.description?.sx ?? [])
							: [slotProps?.description?.sx]),
					]}
				>
					{description}
				</Typography>
			)}

			{onRetry && (
				<Button
					variant="outlined"
					color="error"
					onClick={onRetry}
					startIcon={<Iconify icon="solar:restart-bold" />}
					{...slotProps?.retryButton}
					sx={[
						{ mt: 3 },
						...(Array.isArray(slotProps?.retryButton?.sx)
							? (slotProps?.retryButton?.sx ?? [])
							: [slotProps?.retryButton?.sx]),
					]}
				>
					{retryLabel ?? t('retry')}
				</Button>
			)}
		</ContentRoot>
	);
};

// ----------------------------------------------------------------------

const ContentRoot = styled('div', {
	shouldForwardProp: (prop: string) => !['filled', 'sx'].includes(prop),
})<Pick<ErrorContentProps, 'filled'>>(({ filled, theme }) => ({
	flexGrow: 1,
	height: '100%',
	display: 'flex',
	alignItems: 'center',
	flexDirection: 'column',
	justifyContent: 'center',
	padding: theme.spacing(3),
	...(filled && {
		borderRadius: _.toNumber(theme.shape.borderRadius) * 2,
		backgroundColor: varAlpha(theme.vars.palette.error.mainChannel, 0.04),
		border: `dashed 1px ${varAlpha(theme.vars.palette.error.mainChannel, 0.16)}`,
	}),
}));
