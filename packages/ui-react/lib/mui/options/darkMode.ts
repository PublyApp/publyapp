import { customShadows } from '../theme/custom-shadows';
import { createPalette } from '../theme/palette';
import { createShadows } from '../theme/shadows';

// ----------------------------------------------------------------------

export const darkMode = (mode: 'light' | 'dark') => {
	const theme = {
		palette: createPalette(mode),
		shadows: createShadows(mode),
		customShadows: customShadows(mode),
	};

	return theme;
};
