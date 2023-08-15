import { z } from 'zod';

import { className, functionName } from '@aktiveo/shared/utils/constants';

import { parseFrom } from '../../utils/parse.utils';

const getAIToolsFunctionParamsSchema = z.object({
	page: z.number().optional(),
	pageSize: z.number().optional(),
});

Parse.Cloud.define(
	functionName.getAITools,
	parseFrom({
		requireUser: false,
		action: async ({ req /* , t  */ }) => {
			const { page, pageSize } = getAIToolsFunctionParamsSchema.parse(req.params);

			const defaultPageSize = 25;
			const limit = pageSize || defaultPageSize;
			const skip = ((page || 1) - 1) * (pageSize || defaultPageSize);

			const pipeline: any[] = [
				{
					$match: {},
				},
				{ $limit: limit },
				{ $skip: skip },
			];
			const aiTools = await new Parse.Query(className.AI_TOOL).aggregate(pipeline);
			return aiTools;
		},
	}),
);
