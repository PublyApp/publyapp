import { style } from '@vanilla-extract/css';

import { vars } from '@/front/theme/theme.css';

export const classes = {
	control: style({
		width: '200px',
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		padding: `${vars.spacing.xs} ${vars.spacing.md}`,
		borderRadius: 'var(--mantine-radius-md)',
		border: '1px solid light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-6))',
		transition: 'background-color 150ms ease',
		backgroundColor: 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))',
		selectors: {
			'&[data-expanded]': {
				backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-5))',
			},
		},
		':hover': {
			backgroundColor: 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-5))',
		},
	}),
	label: style({ fontWeight: 500, fontSize: 'var(--mantine-font-size-sm)' }),
	icon: style({
		transition: 'transform 150ms ease',
		transform: 'rotate(0deg)',
		selectors: {
			'[data-expanded] &': { transform: 'rotate(180deg)' },
		},
	}),
};
