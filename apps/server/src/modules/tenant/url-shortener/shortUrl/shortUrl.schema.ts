import SchemaManager from '@/server/lib/parse/classes/SchemaManager';
import { className } from '@/shared/lib/constants';

type ShortUrl = {
	redirectUrl: string;
};

SchemaManager.defineSchema<ShortUrl>(className.SHORT_URL, {
	fields: {
		redirectUrl: { type: 'String' },
	},
});
