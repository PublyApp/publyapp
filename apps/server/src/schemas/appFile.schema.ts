import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/lib/constants';
import type { AppFileWithPointers } from '@devist/shared/types/appFile.types';

import { DEFAULT_CLP } from '@/server/lib/constants';

const AppFileSchema = SchemaMigrations.makeSchema<AppFileWithPointers>(className.APP_FILE, {
	fields: {
		// ! for now we use the server's Filesystem only
		path: { type: 'String', required: true },
		name: { type: 'String', required: true },
		mimeType: { type: 'String', required: true },
		provider: { type: 'String', required: true }, // Cloudinary or Google storage or whatever.
		folder: { type: 'Pointer', targetClass: className.APP_FILE }, // Has to be of type Folder
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
	indexes: {
		// uniquePath: { path: }
	},
});

export default AppFileSchema;
