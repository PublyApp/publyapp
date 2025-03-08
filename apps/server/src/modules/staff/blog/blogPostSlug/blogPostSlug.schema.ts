import { className } from '@org/shared/lib/constants';

import SchemaManager from '@/server/lib/parse/classes/SchemaManager';
import { type IBlogPostSlugWithRelations } from '@/shared/types/db/blogPostSlug.types';

const BlogPostSlugSchema = SchemaManager.defineSchema<IBlogPostSlugWithRelations>(className.BLOG_POST_SLUG, {
	fields: {
		slug: { type: 'String', required: true },
		isCurrent: { type: 'Boolean' },
		// relations
		post: { type: 'Pointer', targetClass: className.BLOG_POST },
	},
	indexes: {
		uniqueSlug: {
			keys: { slug: 1 },
			options: { unique: true },
		},
		postIndex: {
			keys: { post: 1 },
		},
	},
});

export default BlogPostSlugSchema;
