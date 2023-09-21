import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/utils/constants';

import { DEFAULT_STRICT_CLP } from '@server/utils/constants';

const PostSchema = SchemaMigrations.makeSchema(className.POST, {
	fields: {
		// title: { type: 'String' },
		author: { type: 'Pointer', targetClass: className.USER },
		translations: { type: 'Object' },
		slug: { type: 'String' },
	},
	classLevelPermissions: DEFAULT_STRICT_CLP,
	indexes: {},
});

export default PostSchema;
