import { alpha, Box, Stack, Typography, type StackProps } from '@mui/material';

// ----------------------------------------------------------------------

type EmptyContentProps = StackProps & {
	title?: string;
	imgUrl?: string;
	filled?: boolean;
	description?: string;
	action?: React.ReactNode;
};

const EmptyContent = ({ title, imgUrl, action, filled, description, sx, ...other }: EmptyContentProps) => {
	return (
		<Stack
			flexGrow={1}
			alignItems="center"
			justifyContent="center"
			sx={{
				px: 3,
				height: 1,
				...(filled && {
					borderRadius: 2,
					bgcolor: (theme) => {
						return alpha(theme.palette.grey[500], 0.04);
					},
					border: (theme) => {
						return `dashed 1px ${alpha(theme.palette.grey[500], 0.08)}`;
					},
				}),
				...sx,
			}}
			{...other}
		>
			<Box
				component="img"
				alt="empty content"
				src={imgUrl || '/assets/icons/empty/ic_content.svg'}
				sx={{ width: 1, maxWidth: 160 }}
			/>

			{title && (
				<Typography variant="h6" component="span" sx={{ mt: 1, color: 'text.disabled', textAlign: 'center' }}>
					{title}
				</Typography>
			)}

			{description && (
				<Typography variant="caption" sx={{ mt: 1, color: 'text.disabled', textAlign: 'center' }}>
					{description}
				</Typography>
			)}

			{action && action}
		</Stack>
	);
};

export default EmptyContent;
