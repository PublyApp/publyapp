import { className } from '@devist/shared/lib/constants';

import SchemaManager from '@/server/lib/parse/classes/SchemaManager';
import type { IBlogPostTag } from '@/shared/types/db/blogPostTag.types';

const BlogPostTagSchema = SchemaManager.defineSchema<IBlogPostTag>(className.BLOG_POST_TAG, {
	fields: {
		name: { type: 'String', required: true },
		postsCount: { type: 'Number' },
		// relations
		// no relations for now
	},
	indexes: {
		uniqueName: {
			keys: { name: 1 },
			options: { unique: true },
		},
	},
});

export default BlogPostTagSchema;
