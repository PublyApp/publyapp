import type { BaseAttributes } from 'parse';

// import type ParseBlogPost from '@/server/modules/staff/blog/blogPost/blogPost.class';

// import type { IBlogPost } from './blogPost.types';

export type BlogPostTagAttributes = {
	name: string;
	postsCount: number;
};

export type IBlogPostTag = BaseAttributes & BlogPostTagAttributes;

// export type IBlogPostTagWithRelations = IBlogPostTag & {
// 	posts?: IBlogPost[];
// };

// export type IBlogPostTagWithParseRelations = IBlogPostTag & {
// 	posts?: ParseBlogPost[];
// };
