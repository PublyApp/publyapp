import { className } from '@devist/shared/lib/constants';

import SchemaManager from '@/server/lib/parse/classes/SchemaManager';
import { type IBlogPost } from '@/shared/types/db/blogPost.types';

// import type { IBlogPostWithRelations } from '@/shared/types/db/blogPost.types';

type IBlogPostSlugWithRelations = {
	slug: string;
	// ==
	post: IBlogPost;
};

const BlogPostSlugSchema = SchemaManager.defineSchema<IBlogPostSlugWithRelations>(className.BLOG_POST_SLUG, {
	fields: {
		slug: { type: 'String', required: true },
		// relations
		post: { type: 'Pointer', targetClass: className.BLOG_POST },
	},
	indexes: {
		uniqueSlug: {
			keys: { slug: 1 },
			options: { unique: true },
		},
	},
});

export default BlogPostSlugSchema;
