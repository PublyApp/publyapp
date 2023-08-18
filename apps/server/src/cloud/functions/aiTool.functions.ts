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

			const pipeline: any[] = [
				{
					$match: {},
				},
				{ $skip: skip },
				{ $limit: limit },
				{ $project: { _id: 1 } },
			];

			const documents: { objectId: string }[] = await new Parse.Query(className.AI_TOOL).aggregate(pipeline);

			const ids = documents.map((doc) => {
				return doc.objectId;
			});

			const [iAiTools, totalCount] = await Promise.all([
				new Parse.Query(className.AI_TOOL).containedIn('objectId', ids).find(),
				new Parse.Query(className.AI_TOOL).count(),
			]);

			const aiTools = iAiTools.map((iTool) => {
				return iTool.toJSON();
			});

			const count = iAiTools.length;

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
