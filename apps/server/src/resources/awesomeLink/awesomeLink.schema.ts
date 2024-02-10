import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/lib/constants';

import { DEFAULT_CLP } from '@/server/lib/constants';

const AwesomeLinkSchema = SchemaMigrations.makeSchema(className.AWESOME_LINK, {
	fields: {
		url: { type: 'String', required: true },
		deleted: { type: 'Boolean' },
		meta: { type: 'Object' },
	},
	classLevelPermissions: DEFAULT_CLP,
	indexes: {},
});

export default AwesomeLinkSchema;
