import SchemaManager from '@/server/lib/parse/classes/SchemaManager';
import { className } from '@/shared/lib/constants';
import type { IPostSeries } from '@/shared/types/db/postSeries.types';

const PostSeriesSchema = SchemaManager.defineSchema<IPostSeries>(className.BLOG_POST_SERIES, {
	fields: {
		translation: {
			type: 'Object',
		},
		published: {
			type: 'Boolean',
		},
		// test: {
		// 	type: 'Number',
		// 	defaultValue: 12,
		// 	required: true,
		// },
		// title: {
		// 	type: 'String',
		// 	required: true,
		// },
		// description: {
		// 	type: 'String',
		// 	required: true,
		// },
	},
	// indexes: {
	// 	test: {
	// 		keys: {
	// 			'imaginary.nested.test': 1,
	// 		},
	// 		options: {
	// 			unique: true,
	// 		},
	// 	},
	// },
});

export default PostSeriesSchema;
