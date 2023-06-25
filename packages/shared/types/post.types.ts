import { BaseAttributes } from 'parse';

import { AppLocale } from '../i18n/resources';

type PostTranslation = {
	title: string;
	summary: string;
	content: string;
};

export type PostAttributes = {
	// custom fields
	slug: string;
	// cover: Media;
	cover: string; // TODO: DO some research: what is the best fo images. but for now we use the url of the image.
	translation: Record<AppLocale, PostTranslation>;
};

export type IPost = BaseAttributes & PostAttributes;
