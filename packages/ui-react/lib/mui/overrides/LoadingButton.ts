import { loadingButtonClasses, type LoadingButtonProps } from '@mui/lab/LoadingButton';

// import type { Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export const LoadingButton = (/* theme: Theme */) => {
	return {
		MuiLoadingButton: {
			styleOverrides: {
				root: ({ ownerState }: { ownerState: LoadingButtonProps }) => {
					return {
						...(ownerState.variant === 'soft' && {
							[`& .${loadingButtonClasses.loadingIndicatorStart}`]: {
								left: 10,
							},
							[`& .${loadingButtonClasses.loadingIndicatorEnd}`]: {
								right: 14,
							},
							...(ownerState.size === 'small' && {
								[`& .${loadingButtonClasses.loadingIndicatorStart}`]: {
									left: 10,
								},
								[`& .${loadingButtonClasses.loadingIndicatorEnd}`]: {
									right: 10,
								},
							}),
						}),
					};
				},
			},
		},
	};
};
