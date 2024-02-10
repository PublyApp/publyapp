import { SchemaMigrations } from 'parse-server';

import { className } from '@devist/shared/lib/constants';

import { DEFAULT_CLP } from '@/server/lib/constants';

const PostSchema = SchemaMigrations.makeSchema(className.POST, {
	fields: {
		// title: { type: 'String' },
		slug: { type: 'String' },
		translation: { type: 'Object' },
		published: { type: 'Boolean' },

		// ...
		tags: { type: 'Array' },
		noIndex: { type: 'Boolean' },
		publishDate: { type: 'Date' },
		updateDate: { type: 'Date' },
		views: { type: 'Number' },
		// shares: { type: 'Number' }, // TODO
		// commentCount: create PostComment collection and do a query to get that
		// relatedArticles create a query for that

		// relations
		author: { type: 'Pointer', targetClass: className.USER, required: true },
		cover: { type: 'Pointer', targetClass: className.APP_FILE },
	},
	classLevelPermissions: DEFAULT_CLP,
	indexes: {},
});

export default PostSchema;
