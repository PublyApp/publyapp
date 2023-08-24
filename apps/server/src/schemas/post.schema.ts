import { SchemaMigrations } from 'parse-server';

import { className } from '@aktiveo/shared/utils/constants';

const PostSchema = SchemaMigrations.makeSchema(className.POST, {
	fields: {
		// title: { type: 'String' },
		author: { type: 'Pointer', targetClass: className.USER },
		translations: { type: 'Object' },
		slug: { type: 'String' },
	},
	classLevelPermissions: {
		create: {
			requiresAuthentication: true,
		},
		find: {
			'*': true,
		},
		get: {
			'*': true,
		},
		update: {
			requiresAuthentication: true,
		},
	},
	indexes: {},
});

export default PostSchema;
