import type { Components, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

const MuiBackdrop: Components<Theme>['MuiBackdrop'] = {
	/** **************************************
	 * STYLE
	 * Metronic-inspired: bg-black/30 [backdrop-filter:blur(4px)]
	 *************************************** */
	styleOverrides: {
		root: () => ({
			backgroundColor: 'rgba(0, 0, 0, 0.3)', // Metronic: bg-black/30
			backdropFilter: 'blur(4px)', // Metronic: [backdrop-filter:blur(4px)]
			WebkitBackdropFilter: 'blur(4px)',
		}),
		invisible: { background: 'transparent', backdropFilter: 'none' },
	},
};

// ----------------------------------------------------------------------

export const backdrop = { MuiBackdrop };
