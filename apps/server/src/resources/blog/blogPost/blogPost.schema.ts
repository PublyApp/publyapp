import { className } from '@devist/shared/lib/constants';

import SchemaManager from '@/server/lib/parse/classes/SchemaManager';
import type { IBlogPostWithRelations } from '@/shared/types/db/blogPost.types';

const BlogPostSchema = SchemaManager.defineSchema<IBlogPostWithRelations>(className.BLOG_POST, {
	fields: {
		// title: { type: 'String' },
		// slug: { type: 'String' },
		translation: { type: 'Object' },
		published: { type: 'Boolean' },

		// ...
		tags: { type: 'Array' },
		noIndex: { type: 'Boolean' },
		publishDate: { type: 'Date' },
		updateDate: { type: 'Date' },
		viewCount: { type: 'Number' },
		coverUrl: { type: 'String' },
		postSeriesOrder: { type: 'Number' },
		// shares: { type: 'Number' }, // TODO
		// commentCount: create PostComment collection and do a query to get that
		// relatedArticles create a query for that
		// postSeriesOrder: { type: 'Number' },
		seo: { type: 'Object' },

		// relations
		author: { type: 'Pointer', targetClass: className.USER, required: true },
		cover: { type: 'Pointer', targetClass: className.APP_FILE },
		postSeries: { type: 'Pointer', targetClass: className.BLOG_POST_SERIES },
		// postSeriesArray: { type: 'Array' },
		// postSeries: { type: 'Pointer', targetClass: className.BLOG_POST_SERIES },
		relatedPosts: { type: 'Array' },
	},
	indexes: {
		uniqueSlug: {
			keys: { slug: 1 },
			options: { unique: true },
		},
	},
});

export default BlogPostSchema;
