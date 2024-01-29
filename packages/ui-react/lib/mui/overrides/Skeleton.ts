import type { Theme } from '@mui/material';

export const Skeleton = (theme: Theme) => {
	return {
		MuiSkeleton: {
			defaultProps: {
				animation: 'wave',
			},
			styleOverrides: {
				root: {
					backgroundColor: theme.palette.background.neutral,
				},
			},
		},
	};
};
