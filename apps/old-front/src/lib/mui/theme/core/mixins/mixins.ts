import type { CSSObject, MixinsOptions } from '@mui/material/styles';

import { bgBlur, bgGradient } from './background';
import { borderGradient } from './border';
import { menuItemStyles, paperStyles } from './global-styles-components';
import { maxLine, textGradient } from './text';

// ----------------------------------------------------------------------

export type * from './background';
export type * from './border';
export type * from './global-styles-components';
export type * from './text';

export type MixinsExtend = {
	hideScrollX: CSSObject;
	hideScrollY: CSSObject;
	bgBlur: typeof bgBlur;
	maxLine: typeof maxLine;
	bgGradient: typeof bgGradient;
	paperStyles: typeof paperStyles;
	textGradient: typeof textGradient;
	borderGradient: typeof borderGradient;
	menuItemStyles: typeof menuItemStyles;
};

/**
 * TypeScript (type definition and extension)
 * @to {@link file://./../../extend-theme-types.d.ts}
 */

export const mixins: MixinsOptions = {
	hideScrollX: {
		msOverflowStyle: 'none',
		scrollbarWidth: 'none',
		overflowX: 'auto',
		'&::-webkit-scrollbar': { display: 'none' },
	},
	hideScrollY: {
		msOverflowStyle: 'none',
		scrollbarWidth: 'none',
		overflowY: 'auto',
		'&::-webkit-scrollbar': { display: 'none' },
	},
	borderGradient,
	bgGradient,
	bgBlur,
	textGradient,
	paperStyles,
	menuItemStyles,
	maxLine,
};
