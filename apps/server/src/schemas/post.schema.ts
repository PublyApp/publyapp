import { SchemaMigrations } from 'parse-server';

import { classNames } from '@aktiveo/shared/utils/constants';

const PostSchema = SchemaMigrations.makeSchema(classNames.POST, {
	fields: {
		// title: { type: 'String' },
		author: { type: 'Pointer', targetClass: classNames.USER },
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
