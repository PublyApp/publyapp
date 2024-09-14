import SchemaManager from '@/server/lib/parse/classes/SchemaManager';
import { className } from '@/shared/lib/constants';

type IShortUrl = {
	originalUrl: string;
};

const ShortUrlSchema = SchemaManager.defineMultiTenantSchema<IShortUrl>(className.SHORT_URL, {
	fields: {
		originalUrl: { type: 'String', required: true },
	},
});

export default ShortUrlSchema;
