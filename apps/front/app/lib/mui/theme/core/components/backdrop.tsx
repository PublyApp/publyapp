import type { Theme, Components } from '@mui/material/styles';

import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

const MuiBackdrop: Components<Theme>['MuiBackdrop'] = {
	/** **************************************
	 * STYLE
	 * Metronic-inspired: bg-black/30 [backdrop-filter:blur(4px)]
	 *************************************** */
	styleOverrides: {
		root: ({ theme }) => ({
			backgroundColor: 'rgba(0, 0, 0, 0.3)', // Metronic: bg-black/30
			backdropFilter: 'blur(4px)', // Metronic: [backdrop-filter:blur(4px)]
			WebkitBackdropFilter: 'blur(4px)',
		}),
		invisible: { background: 'transparent', backdropFilter: 'none' },
	},
};

// ----------------------------------------------------------------------

export const backdrop = { MuiBackdrop };
