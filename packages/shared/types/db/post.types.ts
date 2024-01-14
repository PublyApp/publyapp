import type { BaseAttributes } from 'parse';

import type { AppLocale } from '@/shared/lib/i18n/resources';

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
	translation: Record<AppLocale, PostTranslation>;
	//
	noIndex?: boolean;
	publishDate?: DateType;
	updateDate?: DateType;
};

export type IPost = BaseAttributes & PostAttributes;

export type IPostWithRelations = IPost & {
	author: IUser;
	cover: AppFile;
};
