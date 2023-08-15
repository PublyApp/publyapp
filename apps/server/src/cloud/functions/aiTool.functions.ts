import { z } from 'zod';

import { DEFAULT_PAGE_SIZE, className, functionName } from '@aktiveo/shared/utils/constants';

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

			const limit = pageSize || DEFAULT_PAGE_SIZE;
			const skip = ((page || 1) - 1) * (pageSize || DEFAULT_PAGE_SIZE);

			const query = [
				{
					$match: {},
				},
				{ $skip: skip },
				{ $limit: limit },
			];

			const pipeline: any[] = [
				{
					$facet: {
						aiTools: query,
						totalCount: [
							{
								$match: {},
							},
							{ $count: 'value' },
						],
					},
				},
			];

			const {
				0: {
					aiTools,
					totalCount: {
						0: { value: totalCount },
					},
				},
			} = await new Parse.Query(className.AI_TOOL).aggregate(pipeline);

			const count = (aiTools as any[]).length;

			return {
				aiTools,
				meta: {
					totalCount,
					count,
				},
			};
		},
	}),
);
