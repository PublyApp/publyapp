import type { BaseAttributes } from 'parse';

import type ParseBlogPost from '@/server/resources/blog/blogPost/blogPost.class';

import type { IBlogPost } from './blogPost.types';

export type BlogPostSlugAttributes = {
	slug: string;
	isCurrent?: boolean;
};

export type IBlogPostSlug = BaseAttributes & BlogPostSlugAttributes;

export type IBlogPostSlugWithRelations = IBlogPostSlug & {
	post?: IBlogPost;
};

export type IBlogPostSlugWithParseRelations = IBlogPostSlug & {
	post?: ParseBlogPost;
};
