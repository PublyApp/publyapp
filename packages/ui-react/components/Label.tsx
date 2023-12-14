/* eslint-disable @typescript-eslint/no-use-before-define */
import { forwardRef } from 'react';

import { Box } from '@mui/material';
import { type BoxProps } from '@mui/material/Box';
import { alpha, styled, useTheme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export type LabelColor = 'default' | 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error';

export type LabelVariant = 'filled' | 'outlined' | 'soft';

export interface LabelProps extends BoxProps {
	startIcon?: React.ReactElement | null;
	endIcon?: React.ReactElement | null;
	color?: LabelColor;
	variant?: LabelVariant;
}

// ----------------------------------------------------------------------

const Label = forwardRef<HTMLSpanElement, LabelProps>(
	({ children, color = 'default', variant = 'soft', startIcon, endIcon, sx, ...other }, ref) => {
		const theme = useTheme();

		const iconStyle = {
			width: 16,
			height: 16,
			'& svg, img': { width: 1, height: 1, objectFit: 'cover' },
		};

		return (
			<StyledLabel
				ref={ref}
				component="span"
				ownerState={{ color, variant }}
				sx={{
					...(startIcon && { pl: 0.75 }),
					...(endIcon && { pr: 0.75 }),
					...sx,
				}}
				theme={theme}
				{...other}
			>
				{startIcon && <Box sx={{ mr: 0.75, ...iconStyle }}> {startIcon} </Box>}

				{children}

				{endIcon && <Box sx={{ ml: 0.75, ...iconStyle }}> {endIcon} </Box>}
			</StyledLabel>
		);
	},
);

export default Label;

// ----------------------------------------------------------------------

type OwnerState = {
	color: LabelColor;
	variant: LabelVariant;
};

export const StyledLabel = styled(Box)<{ ownerState: OwnerState }>(
	(
		{ theme, ownerState } /* : {
		theme: Theme;
		ownerState: {
			color: LabelColor;
			variant: LabelVariant;
		};
	} */,
	) => {
		const isLight = theme.palette.mode === 'light';

		const filledVariant = ownerState.variant === 'filled';

		const outlinedVariant = ownerState.variant === 'outlined';

		const softVariant = ownerState.variant === 'soft';

		const defaultStyle = {
			...(ownerState.color === 'default' && {
				// FILLED
				...(filledVariant && {
					color: isLight ? theme.palette.common.white : theme.palette.grey[800],
					backgroundColor: theme.palette.text.primary,
				}),
				// OUTLINED
				...(outlinedVariant && {
					backgroundColor: 'transparent',
					color: theme.palette.text.primary,
					border: `2px solid ${theme.palette.text.primary}`,
				}),
				// SOFT
				...(softVariant && {
					color: theme.palette.text.secondary,
					backgroundColor: alpha(theme.palette.grey[500], 0.16),
				}),
			}),
		};

		const colorStyle = {
			...(ownerState.color !== 'default' && {
				// FILLED
				...(filledVariant && {
					color: theme.palette[ownerState.color].contrastText,
					backgroundColor: theme.palette[ownerState.color].main,
				}),
				// OUTLINED
				...(outlinedVariant && {
					backgroundColor: 'transparent',
					color: theme.palette[ownerState.color].main,
					border: `2px solid ${theme.palette[ownerState.color].main}`,
				}),
				// SOFT
				...(softVariant && {
					color: theme.palette[ownerState.color][isLight ? 'dark' : 'light'],
					backgroundColor: alpha(theme.palette[ownerState.color].main, 0.16),
				}),
			}),
		};

		return {
			height: 24,
			minWidth: 24,
			lineHeight: 0,
			borderRadius: 6,
			cursor: 'default',
			alignItems: 'center',
			whiteSpace: 'nowrap',
			display: 'inline-flex',
			justifyContent: 'center',
			textTransform: 'capitalize',
			padding: theme.spacing(0, 0.75),
			fontSize: theme.typography.pxToRem(12),
			fontWeight: theme.typography.fontWeightBold,
			transition: theme.transitions.create('all', {
				duration: theme.transitions.duration.shorter,
			}),
			...defaultStyle,
			...colorStyle,
		};
	},
);
