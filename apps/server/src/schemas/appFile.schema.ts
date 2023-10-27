import { SchemaMigrations } from 'parse-server';

import type { AppFile } from '@devist/shared/types/appFile.types';
import { className } from '@devist/shared/utils/constants';

import { DEFAULT_CLP } from '@server/utils/constants';

type AppFileWithPointers = AppFile & {
	folder: string; // or object
};

const AppFileSchema = SchemaMigrations.makeSchema<AppFileWithPointers>(className.APP_FILE, {
	fields: {
		// ! for now we use the server's Filesystem only
		name: { type: 'String', required: true },
		mimeType: { type: 'String', required: true },
		provider: { type: 'String', required: true }, // Cloudinary or Google storage or whatever.
		folder: { type: 'Pointer', targetClass: className.APP_FILE, required: true }, // Has to be of type Folder
		size: { type: 'Number' },
		url: { type: 'String' },
		alternativeText: { type: 'String' },
		caption: { type: 'String' },
		// ! only for image/* types
		height: { type: 'Number' },
		width: { type: 'Number' },
		formats: { type: 'Object' },
	},
	classLevelPermissions: DEFAULT_CLP,
	indexes: {},
});

export default AppFileSchema;
