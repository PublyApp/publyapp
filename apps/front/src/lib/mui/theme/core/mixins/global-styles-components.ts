import type { Theme, CSSObject } from '@mui/material/styles';

import { varAlpha } from 'minimal-shared/utils';

import { dividerClasses } from '@mui/material/Divider';
import { checkboxClasses } from '@mui/material/Checkbox';
import { menuItemClasses } from '@mui/material/MenuItem';
import { autocompleteClasses } from '@mui/material/Autocomplete';

// ----------------------------------------------------------------------

/**
 * Generates styles for menu items.
 * UI Foundations menu item styling
 *
 * @param {Theme} theme - The theme object.
 * @returns {CSSObject} The CSS object for menu item styles.
 *
 * @example
 * ...theme.mixins.menuItemStyles(theme)
 */
export function menuItemStyles(theme: Theme): CSSObject {
	/**
	 * UI Foundations MuiMenuItem:
	 * - dense: true
	 * - columnGap: spacing(1)
	 * - borderRadius: activeRadius.amount
	 * - paddingLeft/Right: spacing(1)
	 */
	return {
		...theme.typography.body2,
		columnGap: theme.spacing(1),
		padding: theme.spacing(0.5, 1),
		borderRadius: Number(theme.shape.borderRadius) * 0.75, // 4.5px - subtle rounding for menu items
		'&:not(:last-of-type)': {
			marginBottom: 1,
		},
		[`&.${menuItemClasses.selected}`]: {
			fontWeight: theme.typography.fontWeightMedium,
			backgroundColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.08),
			'&:hover': {
				backgroundColor: varAlpha(theme.vars.palette.primary.mainChannel, 0.12),
			},
		},
		'&:focus': {
			backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
		},
		[`& .${checkboxClasses.root}`]: {
			padding: theme.spacing(0.5),
			marginLeft: theme.spacing(-0.5),
			marginRight: theme.spacing(0.5),
		},
		[`&.${autocompleteClasses.option}[aria-selected="true"]`]: {
			backgroundColor: theme.vars.palette.action.selected,
			'&:hover': { backgroundColor: theme.vars.palette.action.hover },
		},
		[`&+.${dividerClasses.root}`]: {
			margin: theme.spacing(0.5, 0),
		},
	};
}

// ----------------------------------------------------------------------

/**
 * Generates styles for paper components.
 * Clean, minimal design - Linear/Vercel inspired
 *
 * @param {PaperStyleOptions} props - The properties for the paper styles.
 * @param {Theme} props.theme - The theme object.
 * @param {number} [props.blur] - The blur amount for backdrop filter.
 * @param {string} [props.color] - The background color.
 * @param {boolean} [props.dropdown] - Whether the paper is a dropdown.
 * @returns {CSSObject} The CSS object for paper styles.
 *
 * @example
 * ...theme.mixins.paperStyles(theme, { dropdown: true, blur: 20, color: varAlpha(theme.vars.palette.background.defaultChannel, 0.9) }),
 */
export type PaperStyleOptions = {
	blur?: number;
	color?: string;
	dropdown?: boolean;
};

export function paperStyles(
	theme: Theme,
	options?: PaperStyleOptions,
): CSSObject {
	const { blur = 0, color, dropdown } = options ?? {};

	return {
		...(blur > 0 && {
			backdropFilter: `blur(${blur}px)`,
			WebkitBackdropFilter: `blur(${blur}px)`,
		}),
		backgroundColor: color ?? theme.vars.palette.background.paper,
		borderColor: theme.vars.palette.grey[200],
		borderWidth: '0.5px',
		borderStyle: 'solid',
		...theme.applyStyles('dark', {
			borderColor: theme.vars.palette.grey[700],
		}),
		...(dropdown && {
			padding: theme.spacing(0.5),
			boxShadow: theme.vars.customShadows.dropdown,
			borderRadius: `${Number(theme.shape.borderRadius) * 1.5}px`, // 9px - consistent with cards/dialogs
		}),
	};
}
