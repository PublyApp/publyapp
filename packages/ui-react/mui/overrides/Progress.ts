import { linearProgressClasses, type LinearProgressProps } from '@mui/material/LinearProgress';
import { alpha, type Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'] as const;

// ----------------------------------------------------------------------

export const Progress = (theme: Theme) => {
	const rootStyles = (ownerState: LinearProgressProps) => {
		const bufferVariant = ownerState.variant === 'buffer';

		const defaultStyle = {
			borderRadius: 4,
			[`& .${linearProgressClasses.bar}`]: {
				borderRadius: 4,
			},
			...(bufferVariant && {
				backgroundColor: 'transparent',
			}),
		};

		const colorStyle = COLORS.map((color) => {
			return {
				...(ownerState.color === color && {
					backgroundColor: alpha(theme.palette[color].main, 0.24),
				}),
			};
		});

		return [defaultStyle, ...colorStyle];
	};

	return {
		MuiLinearProgress: {
			styleOverrides: {
				root: ({ ownerState }: { ownerState: LinearProgressProps }) => {
					return rootStyles(ownerState);
				},
			},
		},
	};
};
