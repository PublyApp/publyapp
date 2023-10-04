import { alertClasses, type AlertProps } from '@mui/material/Alert';
import { alpha, type Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const COLORS = ['info', 'success', 'warning', 'error'] as const;

// ----------------------------------------------------------------------

export const Alert = (theme: Theme) => {
	const lightMode = theme.palette.mode === 'light';

	const rootStyles = (ownerState: AlertProps) => {
		const standardVariant = ownerState.variant === 'standard';

		const filledVariant = ownerState.variant === 'filled';

		const outlinedVariant = ownerState.variant === 'outlined';

		const colorStyle = COLORS.map((color) => {
			return {
				...(ownerState.severity === color && {
					// STANDARD
					...(standardVariant && {
						color: theme.palette[color][lightMode ? 'darker' : 'lighter'],
						backgroundColor: theme.palette[color][lightMode ? 'lighter' : 'darker'],
						[`& .${alertClasses.icon}`]: {
							color: theme.palette[color][lightMode ? 'main' : 'light'],
						},
					}),
					// FILLED
					...(filledVariant && {
						color: theme.palette[color].contrastText,
						backgroundColor: theme.palette[color].main,
					}),
					// OUTLINED
					...(outlinedVariant && {
						backgroundColor: alpha(theme.palette[color].main, 0.08),
						color: theme.palette[color][lightMode ? 'dark' : 'light'],
						border: `solid 1px ${alpha(theme.palette[color].main, 0.16)}`,
						[`& .${alertClasses.icon}`]: {
							color: theme.palette[color].main,
						},
					}),
				}),
			};
		});

		return [...colorStyle];
	};

	return {
		MuiAlert: {
			styleOverrides: {
				root: ({ ownerState }: { ownerState: AlertProps }) => {
					return rootStyles(ownerState);
				},
				icon: {
					opacity: 1,
				},
			},
		},
		MuiAlertTitle: {
			styleOverrides: {
				root: {
					marginBottom: theme.spacing(0.5),
					fontWeight: theme.typography.fontWeightSemiBold,
				},
			},
		},
	};
};
