import type { BaseAttributes } from 'parse';

import type { AppLocale } from '@/shared/lib/i18n/resources';
import type { ParseAppFile } from '@/shared/lib/parse/classes/appFile.class';

import type { DateType } from './any.types';
import { type AppFile } from './appFile.types';
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
};

export type IPost = BaseAttributes & PostAttributes;

export type IPostWithRelations = IPost & {
	author: IUser;
	cover?: AppFile;
	// comments?: IComment[];
};

export type IPostWithParseRelations = IPost & {
	author: IUser;
	cover?: ParseAppFile;
	// comments?: ParseComment[];
};

export type TranslatedIPostWithRelations = IPostWithRelations & PostTranslation & { locale: AppLocale };
export type TranslatedIPostWithParseRelations = PostTranslation & IPostWithParseRelations;
