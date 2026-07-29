import { createClasses } from '#app/lib/mui/theme/create-classes.ts';

// ----------------------------------------------------------------------

export const imageClasses = {
	root: createClasses('image__root'),
	img: createClasses('image__img'),
	overlay: createClasses('image__overlay'),
	placeholder: createClasses('image__placeholder'),
	state: {
		loaded: '--loaded',
	},
};
