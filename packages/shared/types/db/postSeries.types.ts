import { type BaseAttributes } from 'parse';

import type { AppLocale } from '@/shared/lib/i18n/resources';

export type IPostSeries = BaseAttributes & {
	translation: Record<
		AppLocale,
		{
			title: string;
			description?: string;
		}
	>;
	published?: boolean;
};
