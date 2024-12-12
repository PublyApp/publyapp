import { style } from '@vanilla-extract/css';

import { vars } from '../../theme.css';

export const styles = style({
	["&[data-variant='primary']" as never]: {
		background: 'red',
		color: vars.colors.white,
		borderWidth: 0,
	},
});
