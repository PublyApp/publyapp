import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/utils/constants';

import { DEFAULT_STRICT_CLP } from '@server/utils/constants';

const WebHostSchema = SchemaMigrations.makeSchema<AppFile>(className.APP_FILE, {
	fields: {
		// provider: { type: 'String' }, // Cloudinary or Google storage or whatever. // ! for now we use cloudinary only
		name: { type: 'String' },
		mimeType: { type: 'String' },
		extension: { type: 'String' },
		folder: { type: 'Pointer', targetClass: className.APP_FILE }, // Has to be of type Folder
	},
	classLevelPermissions: DEFAULT_STRICT_CLP,
	indexes: {},
});

export default WebHostSchema;
