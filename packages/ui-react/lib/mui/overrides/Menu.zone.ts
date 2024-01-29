import type { Components, Theme } from '@mui/material';

type Return = Pick<Components, 'MuiMenuItem'>;

export const Menu = (theme: Theme): Return => {
	return {
		MuiMenuItem: {
			styleOverrides: {
				root: {
					...theme.typography.body2,
					padding: theme.spacing(1),
					borderRadius: theme.shape.borderRadius,
					'&.Mui-selected': {
						backgroundColor: theme.palette.action.selected,
						'&:hover': {
							backgroundColor: theme.palette.action.hover,
						},
					},
				},
			},
		},
	};
};
