import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/lib/constants';

import { DEFAULT_CLP } from '@/server/lib/constants';

const PostSchema = SchemaMigrations.makeSchema(className.POST, {
	fields: {
		// title: { type: 'String' },
		slug: { type: 'String' },
		translation: { type: 'Object' },
		published: { type: 'Boolean' },
		// relations
		author: { type: 'Pointer', targetClass: className.USER },
		cover: { type: 'Pointer', targetClass: className.APP_FILE },
		// ...
		// relatedArticles create a query for that
	},
	classLevelPermissions: DEFAULT_CLP,
	indexes: {},
});

export default PostSchema;
