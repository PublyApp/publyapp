import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/lib/constants';

import { DEFAULT_CLP } from '@/server/lib/constants';

const PostSchema = SchemaMigrations.makeSchema(className.POST, {
	fields: {
		// title: { type: 'String' },
		author: { type: 'Pointer', targetClass: className.USER },
		translations: { type: 'Object' },
		slug: { type: 'String' },
	},
	classLevelPermissions: DEFAULT_CLP,
	indexes: {},
});

export default PostSchema;
