import { createClasses } from '#app/lib/mui/theme/create-classes.ts';

// ----------------------------------------------------------------------

export const uploadClasses = {
	upload: createClasses('upload'),
	uploadBox: createClasses('upload__box'),
	uploadAvatar: createClasses('upload__avatar'),
	uploadSinglePreview: createClasses('upload__single__preview'),
	uploadMultiPreview: createClasses('upload__multi__preview'),
	uploadRejectionFiles: createClasses('upload__rejection__files'),
};
