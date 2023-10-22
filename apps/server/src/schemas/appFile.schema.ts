import { SchemaMigrations } from 'parse-server';

import type { AppFile } from '@devist/shared/types/appFile.types';
import { className } from '@devist/shared/utils/constants';

import { DEFAULT_STRICT_CLP } from '@server/utils/constants';

const AppFileSchema = SchemaMigrations.makeSchema<AppFile>(className.APP_FILE, {
	fields: {
		// // ! for now we use cloudinary only
		// ! for now we use the server's Filesystem only
		// provider: { type: 'String' }, // Cloudinary or Google storage or whatever.
		name: { type: 'String' },
		type: { type: 'String' },
		extension: { type: 'String' },
		folder: { type: 'Pointer', targetClass: className.APP_FILE }, // Has to be of type Folder
	},
	classLevelPermissions: DEFAULT_STRICT_CLP,
	indexes: {},
});

export default AppFileSchema;
