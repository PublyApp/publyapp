import { BaseAttributes } from 'parse';

import type ParseBlogPost from '@/server/resources/blog/blogPost/blogPost.class';

import { IBlogPost } from './blogPost.types';

export type BlogPostSlugAttributes = {
	slug: string;
};

export type IBlogPostSlug = BaseAttributes & BlogPostSlugAttributes;

export type IBlogPostSlugWithRelations = IBlogPostSlug & {
	post?: IBlogPost;
};

export type IBlogPostSlugWithParseRelations = IBlogPostSlug & {
	post?: ParseBlogPost;
};
