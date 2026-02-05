import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const MuiDialog: Components<Theme>['MuiDialog'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: {
		/**
		 * TODO: Should be removed in MUI next.
		 * @see https://github.com/mui/material-ui/issues/43106
		 */
		closeAfterTransition: false,
	},
	/** **************************************
	 * STYLE
	 * Metronic-inspired: borderRadius * 1.5
	 *************************************** */
	styleOverrides: {
		paper: ({ ownerState, theme }) => ({
			boxShadow: theme.vars.customShadows.dialog,
			borderRadius: Number(theme.shape.borderRadius) * 1.5, // 9px - sharper
			padding: 0,
			backgroundImage: 'none',
			border: `1px solid ${theme.vars.palette.divider}`,
			...(!ownerState.fullScreen && { margin: theme.spacing(2) }),
		}),
		paperFullScreen: { borderRadius: 0 },
	},
};

const MuiDialogTitle: Components<Theme>['MuiDialogTitle'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			padding: theme.spacing(2),
			fontSize: theme.typography.h3.fontSize,
			fontWeight: theme.typography.h3.fontWeight,
		}),
	},
};

const MuiDialogContent: Components<Theme>['MuiDialogContent'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({ padding: theme.spacing(0, 2) }),
		dividers: ({ theme }) => ({
			borderTop: 0,
			borderBottomStyle: 'dashed',
			paddingBottom: theme.spacing(2),
		}),
	},
};

const MuiDialogActions: Components<Theme>['MuiDialogActions'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { disableSpacing: true },

	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			padding: theme.spacing(2),
			'& > :not(:first-of-type)': { marginLeft: theme.spacing(1.5) },
		}),
	},
};

// ----------------------------------------------------------------------

export const dialog = {
	MuiDialog,
	MuiDialogTitle,
	MuiDialogContent,
	MuiDialogActions,
};
