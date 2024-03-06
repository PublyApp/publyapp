import { defineSchema } from '@/server/lib/parse/utils';
import { className } from '@/shared/lib/constants';
import type { IPostSeries } from '@/shared/types/db/postSeries.types';

const PostSeriesSchema = defineSchema<IPostSeries>(className.POST_SERIES, {
	fields: {
		translation: {
			type: 'Object',
		},
		published: {
			type: 'Boolean',
		},
		// title: {
		// 	type: 'String',
		// 	required: true,
		// },
		// description: {
		// 	type: 'String',
		// 	required: true,
		// },
	},
});

export default PostSeriesSchema;
