import { style } from '@vanilla-extract/css';

import { vars } from '../../theme.css';

export const styles = style({
	["&[data-variant='primary']" as never]: {
		background: 'linear-gradient(45deg, #4b6cb7 10%, #253b67 90%)',
		// color: 'var(--mantine-color-white)',
		color: vars.colors.white,
		borderWidth: 0,
	},
});
