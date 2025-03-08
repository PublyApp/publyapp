import { className } from '@org/shared/lib/constants';
import type { AppFileWithRelations } from '@org/shared/types/db/appFile.types';

import SchemaManager from '@/server/lib/parse/classes/SchemaManager';

const AppFileSchema = SchemaManager.defineSchema<AppFileWithRelations>(className.APP_FILE, {
	fields: {
		// ! we use cloudinary: it's more convenient
		// // ! for now we use the server's Filesystem only
		path: { type: 'String', required: true },
		name: { type: 'String', required: true },
		displayName: { type: 'String', required: true },
		mimeType: { type: 'String', required: true },
		provider: { type: 'String', required: true }, // Cloudinary or Google storage or whatever.
		folder: { type: 'Pointer', targetClass: className.APP_FILE }, // Has to be of type Folder
		size: { type: 'Number' },
		url: { type: 'String' },
		alternativeText: { type: 'String' },
		caption: { type: 'String' },
		meta: { type: 'Object' },
		// ! only for image/* types
		height: { type: 'Number' },
		width: { type: 'Number' },
		formats: { type: 'Object' },
	},
	indexes: {
		uniquePath: {
			keys: { path: 1 },
			options: { unique: true },
		},
	},
});

export default AppFileSchema;
