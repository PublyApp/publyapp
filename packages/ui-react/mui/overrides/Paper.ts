import type { Components } from '@mui/material';

type Return = Pick<Components, 'MuiPaper'>;

export const Paper = (): Return => {
	return {
		MuiPaper: {
			defaultProps: {
				elevation: 0,
			},
			styleOverrides: {
				root: {
					backgroundImage: 'none',
				},
			},
		},
	};
};
