import type { BaseAttributes } from 'parse';

import type ParseBlogPost from '@/server/resources/blog/blogPost/blogPost.class';
import type ParseBlogPostSlug from '@/server/resources/blog/blogPostSlug/blogPostSlug.class';
import type ParseAppFile from '@/server/resources/file-manager/appFile/appFile.class';
import type { AppLocale } from '@/shared/lib/i18n/resources';

import type { DateType } from '../date.types';

import { type AppFile } from './appFile.types';
import type { IBlogPostSlug } from './blogPostSlug.types';
import type { IPostSeries } from './postSeries.types';
import type { IUser } from './user.types';

export const postContentTypes = ['mdx', 'other'] as const;

// export type PostContent =
// 	| {
// 			type: 'mdx';
// 			value: string;
// 	  }
// 	| {
// 			type: 'other';
// 			value: unknown;
// 	  };

type PostTranslation = {
	title: string;
	description: string;
	content: string;
};

export type BlogPostAttributes = {
	// custom fields
	// slug: string;
	url?: string;
	published?: boolean;
	// cover: Media;
	// cover: string; // cover is a Pointer to parse AppFile
	translation: Partial<Record<AppLocale, PostTranslation>>;
	//
	tags?: string[];
	noIndex?: boolean;
	publishDate?: DateType;
	updateDate?: DateType;
	viewCount?: number;
	commentCount?: number;
	coverUrl?: string;
	postSeriesOrder?: number;
};

type SEOAttributes = {
	title?: string;
	description?: string;
	canonicalUrl?: string;
	index?: boolean;
	follow?: boolean;
	// robots?: {
	// 	index?: boolean;
	// 	follow?: boolean;
	// };
};

export type IBlogPost = BaseAttributes &
	BlogPostAttributes & {
		seo?: SEOAttributes;
	};

export type IBlogPostWithRelations = IBlogPost & {
	author: IUser;
	cover?: AppFile;
	postSeries?: IPostSeries;
	// postSeriesArray?: {
	// 	order: number;
	// 	postSeries: IPostSeries;
	// }[];
	// comments?: IComment[];
	relatedPosts?: IBlogPost[];
	currentSlug?: IBlogPostSlug;
	slugs?: IBlogPostSlug[];
	fetchedSlug?: string;
};

export type IBlogPostWithParseRelations = IBlogPost & {
	author: IUser;
	cover?: ParseAppFile;
	// postSeries?: ParsePostSeries;
	// postSeriesArray?: {
	// 	order: number;
	// 	postSeries: IPostSeries;
	// }[];
	// comments?: ParseComment[];
	relatedPosts?: ParseBlogPost[];
	currentSlug?: ParseBlogPostSlug;
	slugs?: ParseBlogPostSlug[];
	fetchedSlug?: string;
};

export type TranslatedIBlogPostWithRelations = IBlogPostWithRelations & PostTranslation & { locale: AppLocale };
export type TranslatedIPostWithParseRelations = PostTranslation & IBlogPostWithParseRelations;
