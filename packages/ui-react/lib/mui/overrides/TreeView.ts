import type { Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export const TreeView = (theme: Theme) => {
	return {
		MuiTreeItem: {
			styleOverrides: {
				label: {
					...theme.typography.body2,
				},
				iconContainer: {
					width: 'auto',
				},
			},
		},
	};
};
