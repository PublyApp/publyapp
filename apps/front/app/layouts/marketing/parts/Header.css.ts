import { style } from '@vanilla-extract/css';

import { vars } from '@/front/theme/theme.css';

export const classes = {
	header: style({
		height: '60px',
		paddingLeft: vars.spacing.md,
		paddingRight: vars.spacing.md,
		borderBottom: `1px solid light-dark(${vars.colors.gray[3]}, ${vars.colors.gray[4]})`,
	}),
	link: style({
		display: 'flex',
		alignItems: 'center',
		height: '100%',
		paddingLeft: vars.spacing.md,
		paddingRight: vars.spacing.md,
		textDecoration: 'none',
		color: `light-dark(${vars.colors.black}, ${vars.colors.white})`,
		fontWeight: 500,
		fontSize: 'var(--mantine-font-size-sm)',
		'@media': {
			[vars.smallerThan(vars.breakpoints.sm)]: {
				height: '42px',
				width: '100%',
			},
		},
		':hover': {
			backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-6))',
		},
	}),
};
