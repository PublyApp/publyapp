import type { BaseAttributes } from 'parse';

import type ParseAppFile from '@/server/lib/parse/classes/appFile.class';
import type ParsePost from '@/server/lib/parse/classes/post.class';
import type { AppLocale } from '@/shared/lib/i18n/resources';

import type { DateType } from '../date.types';

import { type AppFile } from './appFile.types';
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

export type PostAttributes = {
	// custom fields
	slug: string;
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
	robots?: {
		index?: boolean;
		follow?: boolean;
	};
};

export type IPost = BaseAttributes &
	PostAttributes & {
		seo?: SEOAttributes;
	};

export type IPostWithRelations = IPost & {
	author: IUser;
	cover?: AppFile;
	postSeries?: IPostSeries;
	// postSeriesArray?: {
	// 	order: number;
	// 	postSeries: IPostSeries;
	// }[];
	// comments?: IComment[];
	relatedPosts?: IPost[];
};

export type IPostWithParseRelations = IPost & {
	author: IUser;
	cover?: ParseAppFile;
	// postSeries?: ParsePostSeries;
	// postSeriesArray?: {
	// 	order: number;
	// 	postSeries: IPostSeries;
	// }[];
	// comments?: ParseComment[];
	relatedPosts?: ParsePost[];
};

export type TranslatedIPostWithRelations = IPostWithRelations & PostTranslation & { locale: AppLocale };
export type TranslatedIPostWithParseRelations = PostTranslation & IPostWithParseRelations;
