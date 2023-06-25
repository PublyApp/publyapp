import { AppLocale } from '../i18n/resources';

import { IAttributes } from './parse.types';

type PostTranslation = {
	title: string;
	summary: string;
	content: string;
};

export type IPost = IAttributes & {
	// custom fields
	slug: string;
	// cover: Media;
	cover: string; // TODO: DO some research: what is the best fo images. but for now we use the url of the image.
	translation: Record<AppLocale, PostTranslation>;
};
