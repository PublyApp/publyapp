import type { Components, Theme } from '@mui/material/styles';
import { tableCellClasses } from '@mui/material/TableCell';
import { tableRowClasses } from '@mui/material/TableRow';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

const MuiTableContainer: Components<Theme>['MuiTableContainer'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			position: 'relative',
			scrollbarWidth: 'thin',
			scrollbarColor: `${varAlpha(theme.vars.palette.text.disabledChannel, 0.4)} ${varAlpha(theme.vars.palette.text.disabledChannel, 0.08)}`,
		}),
	},
};

// ----------------------------------------------------------------------

const MuiTable: Components<Theme>['MuiTable'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			'--palette-TableCell-border': theme.vars.palette.divider,
		}),
	},
};

// ----------------------------------------------------------------------

const MuiTableRow: Components<Theme>['MuiTableRow'] = {
	/** **************************************
	 * STYLE
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			[`&.${tableRowClasses.selected}`]: {
				backgroundColor: varAlpha(theme.vars.palette.primary.darkChannel, 0.04),
				'&:hover': {
					backgroundColor: varAlpha(
						theme.vars.palette.primary.darkChannel,
						0.08,
					),
				},
			},
			'&:last-of-type': {
				[`& .${tableCellClasses.root}`]: { borderColor: 'transparent' },
			},
		}),
	},
};

// ----------------------------------------------------------------------

const MuiTableCell: Components<Theme>['MuiTableCell'] = {
	/** **************************************
	 * STYLE - Metronic-inspired compact table cells
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			borderBottomStyle: 'solid',
			borderColor: theme.vars.palette.grey[200],
			borderWidth: 0.5,
			padding: theme.spacing(1, 1.5), // Compact padding
			fontSize: theme.typography.pxToRem(13), // Smaller text
			...theme.applyStyles('dark', {
				borderColor: theme.vars.palette.grey[700],
			}),
		}),
		head: ({ theme }) => ({
			fontSize: theme.typography.pxToRem(12), // Smaller header
			color: theme.vars.palette.text.secondary,
			fontWeight: theme.typography.fontWeightSemiBold,
			backgroundColor: theme.vars.palette.background.neutral,
			padding: theme.spacing(1, 1.5),
		}),
		stickyHeader: ({ theme }) => ({
			backgroundColor: theme.vars.palette.background.paper,
			backgroundImage: `linear-gradient(to bottom, ${theme.vars.palette.background.neutral}, ${theme.vars.palette.background.neutral})`,
		}),
		paddingCheckbox: ({ theme }) => ({ paddingLeft: theme.spacing(0.5) }),
		sizeSmall: {
			padding: '4px 8px', // Even more compact for small
		},
	},
};

// ----------------------------------------------------------------------

const MuiTablePagination: Components<Theme>['MuiTablePagination'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: {
		backIconButtonProps: { size: 'small' },
		nextIconButtonProps: { size: 'small' },
		slotProps: { select: { name: 'table-pagination-select' } },
	},

	/** **************************************
	 * STYLE
	 * UI Foundations: paddingTop/Bottom: 0
	 *************************************** */
	styleOverrides: {
		root: { width: '100%' },
		toolbar: { height: 48, minHeight: 48 }, // Compact from 64
		actions: { marginRight: 8 },
		select: ({ theme }) => ({
			paddingLeft: 8,
			paddingTop: '0 !important',
			paddingBottom: 0,
			display: 'flex',
			alignItems: 'center',
			'&:focus': { borderRadius: theme.shape.borderRadius },
		}),
		selectIcon: {
			right: 4,
			width: 16,
			height: 16,
			top: 'calc(50% - 8px)',
		},
	},
};

// ----------------------------------------------------------------------

export const table = {
	MuiTable,
	MuiTableRow,
	MuiTableCell,
	MuiTableContainer,
	MuiTablePagination,
};
