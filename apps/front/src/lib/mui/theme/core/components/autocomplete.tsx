import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { Theme, Components } from '@mui/material/styles';

import { varAlpha } from 'minimal-shared/utils';

import SvgIcon, { svgIconClasses } from '@mui/material/SvgIcon';
import { autocompleteClasses } from '@mui/material/Autocomplete';

// ----------------------------------------------------------------------

/**
 * Icons
 */
/** https://icon-sets.iconify.design/eva/arrow-ios-downward-fill/ */
const ArrowDownIcon = (props: SvgIconProps) => (
	<SvgIcon {...props}>
		<path
			fill="currentColor"
			d="M12 16a1 1 0 0 1-.64-.23l-6-5a1 1 0 1 1 1.28-1.54L12 13.71l5.36-4.32a1 1 0 0 1 1.41.15a1 1 0 0 1-.14 1.46l-6 4.83A1 1 0 0 1 12 16"
		/>
	</SvgIcon>
);

// ----------------------------------------------------------------------

const MuiAutocomplete: Components<Theme>['MuiAutocomplete'] = {
	/** **************************************
	 * DEFAULT PROPS
	 *************************************** */
	defaultProps: { popupIcon: <ArrowDownIcon /> },

	/** **************************************
	 * STYLE
	 * UI Foundations autocomplete styling
	 *************************************** */
	styleOverrides: {
		inputRoot: {
			flexWrap: 'wrap',
			alignItems: 'flex-start',
			gap: '4px',
			paddingLeft: '12px !important',
			paddingRight: '32px !important',
			paddingTop: '6px !important',
			paddingBottom: '6px !important',
			minHeight: 'auto !important',
			height: 'auto !important',
			maxHeight: 'none !important',
			overflow: 'visible !important',
		},
		input: {
			minWidth: '30px !important',
			padding: '0 !important',
			height: 'auto !important',
		},
		root: ({ theme }) => ({
			[`& .${autocompleteClasses.inputRoot}`]: {
				flexWrap: 'wrap !important',
			},
			[`& .${autocompleteClasses.tag}`]: {
				...theme.typography.subtitle2,
				height: 24,
				minWidth: 24,
				lineHeight: '24px',
				textAlign: 'center',
				padding: theme.spacing(0, 0.75),
				margin: '0 !important',
				color: theme.vars.palette.text.secondary,
				borderRadius: theme.shape.borderRadius,
				backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.16),
			},
		}),
		paper: ({ theme }) => ({
			...theme.mixins.paperStyles(theme, { dropdown: true }),
			transform: 'translateY(4px) !important',
		}),
		listbox: ({ theme }) => ({
			padding: 0,
			display: 'flex',
			flexDirection: 'column',
			gap: '2px',
			[`& .${autocompleteClasses.option}`]: {
				...theme.mixins.menuItemStyles(theme),
				minHeight: 32,
				borderRadius: Number(theme.shape.borderRadius) * 0.75, // 4.5px - subtle rounding for items
			},
		}),
		endAdornment: { [`& .${svgIconClasses.root}`]: { width: 18, height: 18 } },
	},
};

// ----------------------------------------------------------------------

export const autocomplete = { MuiAutocomplete };
