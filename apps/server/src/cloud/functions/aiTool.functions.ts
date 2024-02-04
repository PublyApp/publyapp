import _ from 'lodash';
import type { PipelineStage } from 'mongoose';

import { className, DEFAULT_PAGE_SIZE, functionName, roleSet } from '@devist/shared/lib/constants';
import { createAIToolInputSchema } from '@devist/shared/validations/aiTool.validations';

import { parseFrom, reOrderObjects } from '@/server/lib/parse';
import { pageToSkip } from '@/server/utils/any.utils';
import { getListParamsSchema } from '@/server/utils/validation.utils';

const getAIToolsFunctionParamsSchema = getListParamsSchema;

Parse.Cloud.define(
	functionName.getAITools,
	parseFrom({
		requireUser: false,
		action: async ({ req /* , t  */ }) => {
			const { page, pageSize, sorting } = getAIToolsFunctionParamsSchema.parse(req.params);

			const limit = pageSize || DEFAULT_PAGE_SIZE;
			const skip = pageToSkip(page, pageSize);

			const sortingOperations: Record<string, 1 | -1> = {};

			if (sorting && !_.isEmpty(sorting)) {
				// eslint-disable-next-line no-restricted-syntax
				for (const element of sorting) {
					sortingOperations[element.id] = element.desc ? -1 : 1;
				}
			}

			const pipeline: PipelineStage[] = [
				{
					$match: {},
				},
				...(sorting && !_.isEmpty(sorting) ? [{ $sort: sortingOperations }] : []),
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

			const orderedAiTools = reOrderObjects(ids, iAiTools);

			const aiTools = orderedAiTools.map((iTool) => {
				return iTool.toJSON();
			});

			const count = iAiTools.length;
			const lastPage = Math.floor(totalCount / count);

			return {
				aiTools,
				meta: {
					totalCount,
					count,
					page,
					lastPage,
				},
			};
		},
	}),
);

Parse.Cloud.define(
	functionName.createAITool,
	parseFrom({
		requireUser: true,
		allowedRoles: roleSet.ABOVE_AUTHOR,
		action: async ({ req }) => {
			const reqParams = createAIToolInputSchema.parse(req.params);

			const newAITool = new Parse.Object(className.AI_TOOL, reqParams);
			const savedAITool = await newAITool.save();

			return savedAITool;
		},
	}),
);
