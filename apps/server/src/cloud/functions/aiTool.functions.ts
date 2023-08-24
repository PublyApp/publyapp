import _ from 'lodash';
import { z } from 'zod';

import { className, DEFAULT_PAGE_SIZE, functionName, RolesEnum } from '@aktiveo/shared/utils/constants';
import { createAIToolInputSchema } from '@aktiveo/shared/validations/aiTool.validations';

import { parseFrom } from '../../utils/parse.utils';

const getAIToolsFunctionParamsSchema = z.object({
	page: z.number().optional(),
	pageSize: z.number().optional(),
	sorting: z
		.object({
			id: z.string(),
			desc: z.boolean(),
		})
		.array()
		.optional(),
});

Parse.Cloud.define(
	functionName.getAITools,
	parseFrom({
		requireUser: false,
		action: async ({ req /* , t  */ }) => {
			const { page, pageSize, sorting } = getAIToolsFunctionParamsSchema.parse(req.params);

			const limit = pageSize || DEFAULT_PAGE_SIZE;
			const skip = ((page || 1) - 1) * (pageSize || DEFAULT_PAGE_SIZE);

			const sortingOperations: Record<string, 1 | -1> = {};

			if (sorting && !_.isEmpty(sorting)) {
				// eslint-disable-next-line no-restricted-syntax
				for (const element of sorting) {
					sortingOperations[element.id] = element.desc ? -1 : 1;
				}
			}

			const pipeline: any[] = [
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

			const idsToParseObjects = new Map();
			iAiTools.forEach((iAiTool) => {
				idsToParseObjects.set(iAiTool.id, iAiTool);
			});

			const orderedAiTools = ids.map((id) => {
				return idsToParseObjects.get(id);
			});

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
		allowedRoles: [RolesEnum.ADMIN],
		action: async ({ req }) => {
			const reqParams = createAIToolInputSchema.parse(req.params);

			const newAITool = new Parse.Object(className.AI_TOOL, reqParams);
			const savedAITool = await newAITool.save();

			return savedAITool;
		},
	}),
);
