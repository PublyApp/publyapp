import SchemaManager from '@/server/lib/parse/classes/SchemaManager';
import { className } from '@/shared/lib/constants';

SchemaManager.defineSchema(className.BLOG_AUTHOR_PROFILE, {
	fields: {
		username: { type: 'String' },
		firstName: { type: 'String' },
		lastName: { type: 'String' },
		avatarUrl: { type: 'String' },

		// relations
		avatar: { type: 'Pointer', targetClass: className.APP_FILE },
	},
});
