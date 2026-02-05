import type { Components, Theme } from '@mui/material/styles';
import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

const MuiDrawer: Components<Theme>['MuiDrawer'] = {
	/** **************************************
	 * STYLE
	 * Linear/Vercel style: subtle shadows, clean borders
	 *************************************** */
	styleOverrides: {
		paper: ({ theme }) => ({
			backgroundColor: theme.vars.palette.background.paper,
			borderColor: theme.vars.palette.divider,
		}),
		paperAnchorRight: ({ ownerState, theme }) => ({
			...(ownerState.variant === 'temporary' && {
				...theme.mixins.paperStyles(theme),
				borderLeft: `1px solid ${theme.vars.palette.divider}`,
				boxShadow: `-8px 0 24px -4px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
				...theme.applyStyles('dark', {
					boxShadow: `-8px 0 24px -4px ${varAlpha(theme.vars.palette.common.blackChannel, 0.24)}`,
				}),
			}),
			...(ownerState.variant === 'permanent' && {
				borderLeft: `1px solid ${theme.vars.palette.divider}`,
			}),
		}),
		paperAnchorLeft: ({ ownerState, theme }) => ({
			...(ownerState.variant === 'temporary' && {
				...theme.mixins.paperStyles(theme),
				borderRight: `1px solid ${theme.vars.palette.divider}`,
				boxShadow: `8px 0 24px -4px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
				...theme.applyStyles('dark', {
					boxShadow: `8px 0 24px -4px ${varAlpha(theme.vars.palette.common.blackChannel, 0.24)}`,
				}),
			}),
			...(ownerState.variant === 'permanent' && {
				borderRight: `1px solid ${theme.vars.palette.divider}`,
			}),
		}),
		paperAnchorTop: ({ ownerState, theme }) => ({
			...(ownerState.variant === 'temporary' && {
				...theme.mixins.paperStyles(theme),
				borderBottom: `1px solid ${theme.vars.palette.divider}`,
				boxShadow: `0 8px 24px -4px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
				...theme.applyStyles('dark', {
					boxShadow: `0 8px 24px -4px ${varAlpha(theme.vars.palette.common.blackChannel, 0.24)}`,
				}),
			}),
		}),
		paperAnchorBottom: ({ ownerState, theme }) => ({
			...(ownerState.variant === 'temporary' && {
				...theme.mixins.paperStyles(theme),
				borderTop: `1px solid ${theme.vars.palette.divider}`,
				boxShadow: `0 -8px 24px -4px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.16)}`,
				...theme.applyStyles('dark', {
					boxShadow: `0 -8px 24px -4px ${varAlpha(theme.vars.palette.common.blackChannel, 0.24)}`,
				}),
			}),
		}),
	},
};

// ----------------------------------------------------------------------

export const drawer = { MuiDrawer };
